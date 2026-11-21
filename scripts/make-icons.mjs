// Generates PNG app icons (no dependencies) matching public/icon.svg.
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

const inRoundRect = (x, y, rx, ry, w, h, r) => {
  if (x < rx || y < ry || x >= rx + w || y >= ry + h) return false
  const cx = Math.min(Math.max(x, rx + r), rx + w - r)
  const cy = Math.min(Math.max(y, ry + r), ry + h - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

// Colour of the icon artwork at (X, Y) in the 512x512 icon space, or null outside the artwork.
function art(X, Y) {
  let px = null
  if (inRoundRect(X, Y, 96, 150, 320, 230, 40)) px = [255, 255, 255, 255]
  if (inRoundRect(X, Y, 290, 225, 126, 80, 24)) px = [221, 214, 254, 255]
  if ((X - 330) ** 2 + (Y - 265) ** 2 <= 18 * 18) px = [124, 58, 237, 255]
  return px
}

const VIOLET = [124, 58, 237, 255]
const SLATE = [15, 23, 42, 255] // manifest background_color #0f172a

function png(width, height, pixel) {
  const stride = width * 4 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < width; x++) {
      const px = pixel(x, y)
      const o = y * stride + 1 + x * 4
      raw[o] = px[0]; raw[o + 1] = px[1]; raw[o + 2] = px[2]; raw[o + 3] = px[3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Full-bleed square icon (violet background; maskable-safe and what iOS expects for apple-touch-icon).
function icon(size) {
  const s = size / 512
  return png(size, size, (x, y) => art(x / s, y / s) ?? VIOLET)
}

// iOS launch screen: dark background with the rounded app icon centred (iOS ignores the manifest for splash).
function splash(width, height) {
  const side = Math.round(Math.min(width, height) * 0.3)
  const left = Math.round((width - side) / 2)
  const top = Math.round((height - side) / 2)
  const s = side / 512
  return png(width, height, (x, y) => {
    if (x < left || y < top || x >= left + side || y >= top + side) return SLATE
    const X = (x - left) / s, Y = (y - top) / s
    if (!inRoundRect(X, Y, 0, 0, 512, 512, 112)) return SLATE
    return art(X, Y) ?? VIOLET
  })
}

// Portrait iPhone launch images: [pixel width, pixel height, CSS device width, CSS device height, pixel ratio]
export const SPLASH = [
  [1320, 2868, 440, 956, 3], // 16 Pro Max
  [1206, 2622, 402, 874, 3], // 16 Pro
  [1290, 2796, 430, 932, 3], // 14 Pro Max, 15/16 Plus, 15 Pro Max
  [1179, 2556, 393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [1284, 2778, 428, 926, 3], // 12/13 Pro Max, 14 Plus
  [1170, 2532, 390, 844, 3], // 12, 13, 14, 12/13 Pro
  [1125, 2436, 375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [1242, 2688, 414, 896, 3], // XS Max, 11 Pro Max
  [828, 1792, 414, 896, 2], // XR, 11
  [1242, 2208, 414, 736, 3], // 6/7/8 Plus
  [750, 1334, 375, 667, 2], // 6/7/8, SE 2nd/3rd gen
]

const out = (name) => new URL(`../public/${name}`, import.meta.url)
for (const size of [192, 512]) writeFileSync(out(`icon-${size}.png`), icon(size))
writeFileSync(out('apple-touch-icon.png'), icon(180))
mkdirSync(out('splash'), { recursive: true })
for (const [w, h] of SPLASH) writeFileSync(out(`splash/splash-${w}x${h}.png`), splash(w, h))

// The <link rel="apple-touch-startup-image"> tags for index.html.
const tags = SPLASH.map(
  ([w, h, dw, dh, r]) =>
    `    <link rel="apple-touch-startup-image" media="(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)" href="/splash/splash-${w}x${h}.png" />`,
).join('\n')
console.log('icons and splash screens written. Startup-image tags:\n' + tags)
