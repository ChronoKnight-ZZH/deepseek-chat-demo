/** 用固定规则生成的占位二维码，仅用于展示扫码登录面板。 */

const SIZE = 25
const FINDER_ORIGINS = [
  [0, 0],
  [SIZE - 7, 0],
  [0, SIZE - 7],
] as const
const ALIGNMENT_ORIGIN = 16

const inRect = (x: number, y: number, rx: number, ry: number, rw: number, rh: number) =>
  x >= rx && x < rx + rw && y >= ry && y < ry + rh

const reserved = (x: number, y: number) =>
  inRect(x, y, 0, 0, 8, 8) ||
  inRect(x, y, SIZE - 8, 0, 8, 8) ||
  inRect(x, y, 0, SIZE - 8, 8, 8) ||
  inRect(x, y, ALIGNMENT_ORIGIN - 1, ALIGNMENT_ORIGIN - 1, 6, 6)

/** 位置相关的伪随机值，保证每次渲染图案一致 */
const noise = (x: number, y: number) => {
  let hash = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return (hash ^ (hash >>> 16)) >>> 0
}

const modules: { x: number; y: number }[] = []
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    if (reserved(x, y)) {
      continue
    }
    // 定位图形之间的时序线
    if (y === 6 && x > 7 && x < SIZE - 8) {
      if (x % 2 === 0) {
        modules.push({ x, y })
      }
      continue
    }
    if (x === 6 && y > 7 && y < SIZE - 8) {
      if (y % 2 === 0) {
        modules.push({ x, y })
      }
      continue
    }
    if (noise(x, y) % 100 < 46) {
      modules.push({ x, y })
    }
  }
}

export const QrPlaceholder = () => (
  <svg
    viewBox={`0 0 ${SIZE} ${SIZE}`}
    shapeRendering="crispEdges"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect width={SIZE} height={SIZE} fill="#ffffff" />
    {modules.map(({ x, y }) => (
      <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#111111" />
    ))}
    {FINDER_ORIGINS.map(([x, y]) => (
      <g key={`${x}-${y}`}>
        <rect x={x} y={y} width={7} height={7} fill="#111111" />
        <rect x={x + 1} y={y + 1} width={5} height={5} fill="#ffffff" />
        <rect x={x + 2} y={y + 2} width={3} height={3} fill="#111111" />
      </g>
    ))}
    <g>
      <rect x={ALIGNMENT_ORIGIN} y={ALIGNMENT_ORIGIN} width={5} height={5} fill="#111111" />
      <rect x={ALIGNMENT_ORIGIN + 1} y={ALIGNMENT_ORIGIN + 1} width={3} height={3} fill="#ffffff" />
      <rect x={ALIGNMENT_ORIGIN + 2} y={ALIGNMENT_ORIGIN + 2} width={1} height={1} fill="#111111" />
    </g>
  </svg>
)
