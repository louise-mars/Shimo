import sharp from 'sharp'
import { readFileSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const svgPath = join(__dirname, 'src/assets/icon.svg')
const svgBuffer = readFileSync(svgPath)

// 前景层 SVG — 无圆角，内容居中，留出安全区域（内容在72%区域内）
// 自适应图标前景层需要 108dp，内容在中间72dp内
const foregroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bg" cx="40%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#2A2218"/>
      <stop offset="100%" stop-color="#0E0C08"/>
    </radialGradient>
    <radialGradient id="redGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#B5341A" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#B5341A" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- 背景填满，无圆角 -->
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="#F7F3EC" opacity="0.025"/>

  <!-- 朱砂红光晕 -->
  <ellipse cx="720" cy="720" rx="280" ry="280" fill="url(#redGlow)"/>

  <!-- 「墨」字 — 内容在中间72%区域，即 x:143-881, y:143-881 -->
  <!-- 上横 -->
  <rect x="330" y="220" width="364" height="44" rx="8" fill="white"/>
  <!-- 中竖 -->
  <rect x="494" y="220" width="44" height="110" rx="6" fill="white"/>
  <!-- 口字框 -->
  <rect x="374" y="318" width="276" height="120" rx="8" fill="none" stroke="white" stroke-width="38"/>
  <!-- 下横 -->
  <rect x="308" y="458" width="408" height="42" rx="8" fill="white"/>

  <!-- 土字底 -->
  <!-- 上横 -->
  <rect x="374" y="534" width="276" height="36" rx="7" fill="white"/>
  <!-- 中竖 -->
  <rect x="494" y="534" width="44" height="164" rx="6" fill="white"/>
  <!-- 底横 -->
  <rect x="288" y="698" width="448" height="50" rx="10" fill="white"/>

  <!-- 朱砂红印章 -->
  <rect x="648" y="770" width="110" height="110" rx="10" fill="#B5341A" opacity="0.9"/>
  <path d="M 682 798 L 703 828 L 724 798" stroke="white" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9"/>
  <line x1="703" y1="828" x2="703" y2="856" stroke="white" stroke-width="7" stroke-linecap="round" opacity="0.9"/>
  <rect x="683" y="858" width="40" height="26" rx="3" stroke="white" stroke-width="6" fill="none" opacity="0.9"/>

  <!-- 左侧装饰线 -->
  <line x1="220" y1="220" x2="220" y2="808" stroke="#B5341A" stroke-width="3" opacity="0.4"/>
</svg>`

const foregroundBuffer = Buffer.from(foregroundSvg)

// Android 图标尺寸
const androidSizes = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
]

// 前景层尺寸（比图标大 1.5x，因为自适应图标是 108dp，显示区域是 72dp）
const foregroundSizes = [
  { dir: 'mipmap-mdpi',    size: 108 },
  { dir: 'mipmap-hdpi',    size: 162 },
  { dir: 'mipmap-xhdpi',   size: 216 },
  { dir: 'mipmap-xxhdpi',  size: 324 },
  { dir: 'mipmap-xxxhdpi', size: 432 },
]

const androidBase = join(__dirname, 'android/app/src/main/res')
const webBase = join(__dirname, 'public')

async function gen(buf, outPath, size, round = false) {
  let p = sharp(buf).resize(size, size)
  if (round) {
    const circle = Buffer.from(`<svg><circle cx="${size/2}" cy="${size/2}" r="${size/2}"/></svg>`)
    p = p.composite([{ input: circle, blend: 'dest-in' }])
  }
  await p.png().toFile(outPath)
  console.log(`✓ ${outPath.split('\\').pop()} (${size}x${size})`)
}

async function main() {
  console.log('\n生成 Android 图标...')
  for (const { dir, size } of androidSizes) {
    await gen(svgBuffer, join(androidBase, dir, 'ic_launcher.png'), size)
    await gen(svgBuffer, join(androidBase, dir, 'ic_launcher_round.png'), size, true)
  }

  console.log('\n生成自适应图标前景层...')
  for (const { dir, size } of foregroundSizes) {
    await gen(foregroundBuffer, join(androidBase, dir, 'ic_launcher_foreground.png'), size)
  }

  console.log('\n生成 Web 图标...')
  await gen(svgBuffer, join(webBase, 'favicon-16.png'), 16)
  await gen(svgBuffer, join(webBase, 'favicon-32.png'), 32)
  await gen(svgBuffer, join(webBase, 'icon-192.png'), 192)
  await gen(svgBuffer, join(webBase, 'icon-512.png'), 512)
  copyFileSync(svgPath, join(webBase, 'favicon.svg'))
  console.log('✓ favicon.svg')

  console.log('\n✅ 所有图标生成完成！')
}

main().catch(console.error)
