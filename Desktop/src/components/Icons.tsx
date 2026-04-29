// 侧边栏 SVG 图标，克制风格，线条粗细 1.5px
const defaultSize = 18

interface IconProps {
  size?: number
  style?: React.CSSProperties
}

function svg(props: IconProps, children: React.ReactNode) {
  const s = props.size || defaultSize
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round"
      style={props.style}
    >
      {children}
    </svg>
  )
}

export function IconClock(p: IconProps = {}) {
  return svg(p, <>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </>)
}

export function IconStar(p: IconProps = {}) {
  return svg(p, <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />)
}