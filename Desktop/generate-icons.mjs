import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const svgPath = join(__dirname, '../Mobile/src/assets/icon.svg')
const svgBuffer = readFileSync(svgPath)
const iconsDir = join(__dirname, 'src-tauri/icons')

async function gen(size, name) {
  await sharp(svgBuffer).resize(size, size).png().toFile(join(iconsDir, name))
  console.log(`✓ ${name} (${size}x${size})`)
}

async function generateIco() {
  const sizes = [16, 32, 48, 64, 128, 256]
  const pngBuffers = await Promise.all(
    sizes.map(size => sharp(svgBuffer).resize(size, size).png().toBuffer())
  )

  const numImages = sizes.length
  const headerSize = 6
  const dirEntrySize = 16
  const dirSize = headerSize + numImages * dirEntrySize

  let offset = dirSize
  const offsets = []
  for (const buf of pngBuffers) {
    offsets.push(offset)
    offset += buf.length
  }

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(numImages, 4)

  const dirEntries = Buffer.alloc(numImages * dirEntrySize)
  for (let i = 0; i < numImages; i++) {
    const size = sizes[i]
    const entry = dirEntries.subarray(i * dirEntrySize, (i + 1) * dirEntrySize)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(pngBuffers[i].length, 8)
    entry.writeUInt32LE(offsets[i], 12)
  }

  const icoBuffer = Buffer.concat([header, dirEntries, ...pngBuffers])
  writeFileSync(join(iconsDir, 'icon.ico'), icoBuffer)
  console.log(`✓ icon.ico (${sizes.join('/')}px)`)
}

async function main() {
  console.log('\n生成所有桌面版图标...\n')

  // 基础图标
  await gen(32,  '32x32.png')
  await gen(128, '128x128.png')
  await gen(256, '128x128@2x.png')
  await gen(512, 'icon.png')

  // Windows Store / 任务栏图标
  await gen(30,  'Square30x30Logo.png')
  await gen(44,  'Square44x44Logo.png')
  await gen(71,  'Square71x71Logo.png')
  await gen(89,  'Square89x89Logo.png')
  await gen(107, 'Square107x107Logo.png')
  await gen(142, 'Square142x142Logo.png')
  await gen(150, 'Square150x150Logo.png')
  await gen(284, 'Square284x284Logo.png')
  await gen(310, 'Square310x310Logo.png')
  await gen(50,  'StoreLogo.png')

  // ICO（Windows 可执行文件图标）
  await generateIco()

  console.log('\n✅ 所有图标生成完成！')
}

main().catch(console.error)
