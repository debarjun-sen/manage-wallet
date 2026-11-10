// Generates PNG app icons (no dependencies) matching public/icon.svg.
import { writeFileSync } from 'node:fs'
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

function icon(size) {
  const s = size / 512
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const X = x / s, Y = y / s
      let px = [124, 58, 237, 255] // violet background (full bleed for maskable)
      if (inRoundRect(X, Y, 96, 150, 320, 230, 40)) px = [255, 255, 255, 255]
      if (inRoundRect(X, Y, 290, 225, 126, 80, 24)) px = [221, 214, 254, 255]
      if ((X - 330) ** 2 + (Y - 265) ** 2 <= 18 * 18) px = [124, 58, 237, 255]
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = px[0]; raw[o + 1] = px[1]; raw[o + 2] = px[2]; raw[o + 3] = px[3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), icon(size))
console.log('icons written')
