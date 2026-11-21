-- Manage Wallet: shared groups schema (Supabase / Postgres).
-- Run once in Supabase Dashboard -> SQL Editor (safe to re-run: everything is idempotent).
--
-- Model
--   groups        one row per shared group (local-only groups never reach the server)
--   group_users   which app users belong to a group, with role admin|member
--   people        the people money is split between (the existing "members"; not all have the app)
--   expenses      one row per expense; splits stored as jsonb [{memberId, share}]
--   settlements   one row per "A paid B"
--   push_subscriptions  Web Push endpoints per user/device
-- Ids of people/expenses/settlements are generated on the client (same ids as in localStorage),
-- so offline edits can be queued and replayed. Rows are soft-deleted (deleted = true) so that
-- deletions travel through Realtime under the same row-level security as everything else.
-- All amounts are integer paise, exactly like the client.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

create or replace function public.new_invite_code() returns text
language sql volatile set search_path = '' as $$
  -- 8 chars from a 32-char alphabet without look-alikes (0/O, 1/I): 40 bits.
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '')
  from (select extensions.gen_random_bytes(8) as b) s, generate_series(0, 7) as i
$$;

-- Splits must be [{memberId: text, share: int >= 0}, ...] and add up exactly to the amount.
create or replace function public.splits_valid(splits jsonb, amount bigint) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(splits) = 'array'
     and jsonb_array_length(splits) between 1 and 50
     and not exists (
       select 1 from jsonb_array_elements(splits) s
       where jsonb_typeof(s -> 'memberId') <> 'string'
          or jsonb_typeof(s -> 'share') <> 'number'
          or (s ->> 'share') !~ '^[0-9]+$'
     )
     and (select coalesce(sum((s ->> 'share')::bigint), 0) from jsonb_array_elements(splits) s) = amount
$$;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id text primary key check (char_length(id) between 1 and 64),
  name text not null check (char_length(name) between 1 and 40),
  invite_code text not null unique default public.new_invite_code(),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_users (
  group_id text not null references public.groups on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  member_id text check (member_id is null or char_length(member_id) <= 64), -- which person this user is
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_users_user_idx on public.group_users (user_id);

create table if not exists public.people (
  group_id text not null references public.groups on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  name text not null check (char_length(name) between 1 and 30),
  upi_id text check (upi_id is null or (char_length(upi_id) <= 60 and upi_id ~ '^[A-Za-z0-9_.-]{2,}@[A-Za-z][A-Za-z0-9]+$')),
  deleted boolean not null default false,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, id)
);

create table if not exists public.expenses (
  group_id text not null references public.groups on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  description text not null check (char_length(description) between 1 and 80),
  amount bigint not null check (amount > 0 and amount <= 9007199254740991),
  paid_by text not null,
  splits jsonb not null,
  date date not null,
  source text not null default 'manual' check (source in ('manual', 'pasted')),
  split_mode text check (split_mode in ('equal', 'exact', 'percent')),
  deleted boolean not null default false,
  notified boolean not null default false,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, id),
  foreign key (group_id, paid_by) references public.people (group_id, id),
  constraint expenses_splits_valid check (public.splits_valid(splits, amount))
);

create table if not exists public.settlements (
  group_id text not null references public.groups on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  from_id text not null,
  to_id text not null,
  amount bigint not null check (amount > 0 and amount <= 9007199254740991),
  date date not null,
  deleted boolean not null default false,
  notified boolean not null default false,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, id),
  foreign key (group_id, from_id) references public.people (group_id, id),
  foreign key (group_id, to_id) references public.people (group_id, id),
  check (from_id <> to_id)
);

create table if not exists public.push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  user_id uuid not null references auth.users on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------------------------
-- Triggers: authorship and timestamps can't be forged or rewritten by clients
-- ---------------------------------------------------------------------------------------------

create or replace function public.touch_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := least(coalesce(new.created_at, now()), now()); -- clients may backdate (keeps order on first upload)
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.group_id := old.group_id;
  end if;
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['people', 'expenses', 'settlements'] loop
    execute format('drop trigger if exists touch_row on public.%I', t);
    execute format('create trigger touch_row before insert or update on public.%I for each row execute function public.touch_row()', t);
  end loop;
end $$;

-- Every new auth user gets a profile; display name defaults to the part of the email before "@".
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(split_part(coalesce(new.email, ''), '@', 1), 40))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

create or replace function public.is_group_member(gid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_users where group_id = gid and user_id = (select auth.uid()))
$$;

create or replace function public.is_group_admin(gid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_users where group_id = gid and user_id = (select auth.uid()) and role = 'admin')
$$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_users enable row level security;
alter table public.people enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles: see yourself and people you share a group with; edit only yourself.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (
    select 1 from public.group_users a join public.group_users b on a.group_id = b.group_id
    where a.user_id = (select auth.uid()) and b.user_id = profiles.id
  )
);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- groups: members read; admins rename. Creating/deleting/joining go through the RPCs below.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated using (public.is_group_member(id));
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));

-- group_users: members can see who else is in the group. All changes go through RPCs.
drop policy if exists group_users_select on public.group_users;
create policy group_users_select on public.group_users for select to authenticated using (public.is_group_member(group_id));

-- people: members read and add (e.g. "add me" when joining); only admins edit or remove.
drop policy if exists people_select on public.people;
create policy people_select on public.people for select to authenticated using (public.is_group_member(group_id));
drop policy if exists people_insert on public.people;
create policy people_insert on public.people for insert to authenticated with check (public.is_group_member(group_id));
drop policy if exists people_update on public.people;
create policy people_update on public.people for update to authenticated
  using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

-- expenses & settlements: any member can add, edit and (soft-)delete, like the single-device app.
do $$
declare t text;
begin
  foreach t in array array['expenses', 'settlements'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_group_member(group_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_group_member(group_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_group_member(group_id)) with check (public.is_group_member(group_id))', t || '_update', t);
  end loop;
end $$;

-- push_subscriptions: only your own (writes go through save_push_subscription).
drop policy if exists push_select on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists push_delete on public.push_subscriptions;
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- RPCs (security definer: each one checks the caller's rights itself)
-- ---------------------------------------------------------------------------------------------

create or replace function public.create_shared_group(p_id text, p_name text, p_member_id text)
returns public.groups language plpgsql security definer set search_path = '' as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.groups (id, name, created_by) values (p_id, p_name, auth.uid()) returning * into g;
  insert into public.group_users (group_id, user_id, role, member_id) values (p_id, auth.uid(), 'admin', p_member_id);
  return g;
end $$;

-- What the join screen shows before joining. Reveals only the group name and head-count.
create or replace function public.preview_invite(p_code text)
returns table (group_id text, name text, people integer, already_member boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name,
         (select count(*)::int from public.people p where p.group_id = g.id and not p.deleted),
         exists (select 1 from public.group_users u where u.group_id = g.id and u.user_id = auth.uid())
  from public.groups g
  where auth.uid() is not null and g.invite_code = upper(trim(p_code))
$$;

create or replace function public.join_group(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare gid text;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select id into gid from public.groups where invite_code = upper(trim(p_code));
  if gid is null then raise exception 'invalid invite code' using errcode = 'P0002'; end if;
  insert into public.group_users (group_id, user_id, role) values (gid, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;
  return gid;
end $$;

create or replace function public.claim_person(p_group text, p_member_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.people where group_id = p_group and id = p_member_id and not deleted) then
    raise exception 'unknown person' using errcode = 'P0002';
  end if;
  update public.group_users set member_id = p_member_id where group_id = p_group and user_id = auth.uid();
  if not found then raise exception 'not a member' using errcode = '42501'; end if;
end $$;

-- Leaving: the last user out deletes the group; the last admin out promotes the longest-standing member.
create or replace function public.leave_group(p_group text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.group_users where group_id = p_group and user_id = auth.uid();
  if not found then return; end if;
  if not exists (select 1 from public.group_users where group_id = p_group) then
    delete from public.groups where id = p_group;
  elsif not exists (select 1 from public.group_users where group_id = p_group and role = 'admin') then
    update public.group_users set role = 'admin'
    where (group_id, user_id) = (select group_id, user_id from public.group_users where group_id = p_group order by joined_at limit 1);
  end if;
end $$;

create or replace function public.set_member_role(p_group text, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_group_admin(p_group) then raise exception 'admins only' using errcode = '42501'; end if;
  if p_role not in ('admin', 'member') then raise exception 'bad role' using errcode = '22023'; end if;
  if p_role = 'member' and (select count(*) from public.group_users where group_id = p_group and role = 'admin' and user_id <> p_user) = 0 then
    raise exception 'a group needs at least one admin' using errcode = '22023';
  end if;
  update public.group_users set role = p_role where group_id = p_group and user_id = p_user;
end $$;

create or replace function public.remove_member(p_group text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_group_admin(p_group) then raise exception 'admins only' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'use leave_group to leave' using errcode = '22023'; end if;
  delete from public.group_users where group_id = p_group and user_id = p_user;
end $$;

create or replace function public.rotate_invite_code(p_group text) returns text
language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  if not public.is_group_admin(p_group) then raise exception 'admins only' using errcode = '42501'; end if;
  update public.groups set invite_code = public.new_invite_code(), updated_at = now() where id = p_group returning invite_code into code;
  return code;
end $$;

create or replace function public.delete_shared_group(p_group text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_group_admin(p_group) then raise exception 'admins only' using errcode = '42501'; end if;
  delete from public.groups where id = p_group;
end $$;

create or replace function public.list_group_users(p_group text)
returns table (user_id uuid, role text, member_id text, display_name text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.user_id, u.role, u.member_id, coalesce(p.display_name, ''), u.joined_at
  from public.group_users u left join public.profiles p on p.id = u.user_id
  where u.group_id = p_group and public.is_group_member(p_group)
  order by u.joined_at
$$;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

-- RPCs are for signed-in users only.
do $$
declare f text;
begin
  foreach f in array array[
    'create_shared_group(text, text, text)', 'preview_invite(text)', 'join_group(text)', 'claim_person(text, text)',
    'leave_group(text)', 'set_member_role(text, uuid, text)', 'remove_member(text, uuid)', 'rotate_invite_code(text)',
    'delete_shared_group(text)', 'list_group_users(text)', 'save_push_subscription(text, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Realtime: stream row changes (Realtime applies the RLS policies above per subscriber)
-- ---------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['groups', 'group_users', 'people', 'expenses', 'settlements'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
