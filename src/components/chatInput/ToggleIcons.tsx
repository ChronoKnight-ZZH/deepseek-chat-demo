/**
 * 深度思考 / 智能搜索开关图标，取自 deepseek.com 首页同款动画：
 * 图标本身在开、关两种状态外观一致，点击时播放一次动画作为反馈。
 * 动画数据由站点 Lottie 关键帧转换而来，用 SVG SMIL 复现，切换时靠 key 重新挂载播放。
 */

const THINK_FRAMES = 26
const SEARCH_FRAMES = 30

/** 深度思考：两条交叉的环形，宽度依次收缩再展开 */
const THINK_RINGS = [
  {
    times: [0, 10 / THINK_FRAMES, 20 / THINK_FRAMES, 1].join(';'),
    values: [
      'M10.731 5.269C13.936 8.474 15.31 12.294 13.802 13.802C12.294 15.31 8.475 13.936 5.27 10.731C2.065 7.526 0.69 3.706 2.198 2.198C3.706 0.69 7.526 2.064 10.731 5.269Z',
      'M9.3655 6.6345C12.5705 9.8395 14.556 13.048 13.802 13.802C13.048 14.556 9.8402 12.5708 6.6352 9.3658C3.4302 6.1608 1.444 2.952 2.198 2.198C2.952 1.444 6.1605 3.4295 9.3655 6.6345Z',
      'M10.731 5.269C13.936 8.474 15.31 12.294 13.802 13.802C12.294 15.31 8.475 13.936 5.27 10.731C2.065 7.526 0.69 3.706 2.198 2.198C3.706 0.69 7.526 2.064 10.731 5.269Z',
      'M10.731 5.269C13.936 8.474 15.31 12.294 13.802 13.802C12.294 15.31 8.475 13.936 5.27 10.731C2.065 7.526 0.69 3.706 2.198 2.198C3.706 0.69 7.526 2.064 10.731 5.269Z',
    ].join(';'),
  },
  {
    times: [0, 6 / THINK_FRAMES, 16 / THINK_FRAMES, 1].join(';'),
    values: [
      'M10.731 10.731C7.526 13.936 3.706 15.31 2.198 13.802C0.69 12.294 2.065 8.474 5.27 5.269C8.475 2.064 12.294 0.69 13.802 2.198C15.31 3.706 13.936 7.526 10.731 10.731Z',
      'M10.731 10.731C7.526 13.936 3.706 15.31 2.198 13.802C0.69 12.294 2.065 8.474 5.27 5.269C8.475 2.064 12.294 0.69 13.802 2.198C15.31 3.706 13.936 7.526 10.731 10.731Z',
      'M9.3655 9.3655C6.1605 12.5705 2.952 14.556 2.198 13.802C1.444 13.048 3.4302 9.8393 6.6352 6.6343C9.8402 3.4293 13.048 1.444 13.802 2.198C14.556 2.952 12.5705 6.1605 9.3655 9.3655Z',
      'M10.731 10.731C7.526 13.936 3.706 15.31 2.198 13.802C0.69 12.294 2.065 8.474 5.27 5.269C8.475 2.064 12.294 0.69 13.802 2.198C15.31 3.706 13.936 7.526 10.731 10.731Z',
    ].join(';'),
  },
]

const THINK_SPLINES = '0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1'

/** 智能搜索：三根经线依次从左扫到右，两端淡入淡出 */
const SEARCH_TIMES = [0, 3, 5, 8, 10, 13, 15, 17, 19, 22, 24, 27, 29].map(
  (frame) => frame / SEARCH_FRAMES
)
const SEARCH_KEY_TIMES = [...SEARCH_TIMES, 1].join(';')
const SEARCH_SPLINES = Array.from({ length: SEARCH_TIMES.length }, () => '0.42 0 0.58 1').join(';')

const meridians = (points: number[][]) => {
  const path = (middle: number) =>
    `M7.9996 14.8492C4.2168 14.8492 ${middle} 11.7828 ${middle} 8C${middle} 4.2172 4.2168 1.1509 7.9996 1.1509`
  const values = points.map(([middle]) => path(middle))
  // 最后一帧停到 30，重复末值填满收尾。
  return [...values, values.at(-1) ?? ''].join(';')
}

const SEARCH_MERIDIANS = [
  meridians([
    [1.1504],
    [1.1504],
    [1.1519],
    [1.1676],
    [1.2469],
    [1.5161],
    [2.223],
    [3.2583],
    [4.1074],
    [4.6725],
    [4.9752],
    [5.0887],
    [5.105],
  ]),
  meridians([
    [5.105],
    [5.1175],
    [5.2057],
    [5.4477],
    [5.9294],
    [6.7476],
    [7.9996],
    [9.2515],
    [10.0697],
    [10.5514],
    [10.7934],
    [10.8816],
    [10.8941],
  ]),
  meridians([
    [10.8941],
    [10.9104],
    [11.0239],
    [11.3266],
    [11.8917],
    [12.7408],
    [13.7761],
    [14.483],
    [14.7522],
    [14.8315],
    [14.8472],
    [14.8487],
    [14.8487],
  ]),
]

const staticMeridian = (middle: number) =>
  `M7.9996 14.8492C4.2168 14.8492 ${middle} 11.7828 ${middle} 8C${middle} 4.2172 4.2168 1.1509 7.9996 1.1509`

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** play 每次加一即重播一次动画；为 0 时不挂动画，避免首屏自播。 */
export const ThinkingToggleIcon = ({ play }: { play: number }) => (
  <svg key={play} width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden>
    {THINK_RINGS.map((ring) => (
      <path key={ring.values} d={ring.values.split(';')[0]} {...stroke}>
        {play > 0 ? (
          <animate
            attributeName="d"
            dur="0.433s"
            calcMode="spline"
            keyTimes={ring.times}
            keySplines={THINK_SPLINES}
            values={ring.values}
            fill="freeze"
          />
        ) : null}
      </path>
    ))}
    <circle cx={8} cy={8} r={1.23} fill="currentColor">
      {play > 0 ? (
        <animate
          attributeName="r"
          dur="0.433s"
          calcMode="spline"
          keyTimes={`0;${12 / THINK_FRAMES};${14 / THINK_FRAMES};1`}
          keySplines={THINK_SPLINES}
          values="1.23;0.615;0.615;1.23"
          fill="freeze"
        />
      ) : null}
    </circle>
  </svg>
)

export const SearchToggleIcon = ({ play }: { play: number }) => (
  <svg key={play} width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx={8} cy={8} r={6.849} {...stroke} />
    <path d="M1.64 8H14.36" {...stroke} />
    <path d={staticMeridian(1.1504)} opacity={0} {...stroke}>
      {play > 0 ? (
        <>
          <animate
            attributeName="d"
            dur="0.5s"
            calcMode="spline"
            keyTimes={SEARCH_KEY_TIMES}
            keySplines={SEARCH_SPLINES}
            values={SEARCH_MERIDIANS[0]}
            fill="freeze"
          />
          <animate
            attributeName="opacity"
            dur="0.5s"
            values="0;1;1"
            keyTimes="0;0.1;1"
            fill="freeze"
          />
        </>
      ) : null}
    </path>
    <path d={staticMeridian(5.105)} {...stroke}>
      {play > 0 ? (
        <animate
          attributeName="d"
          dur="0.5s"
          calcMode="spline"
          keyTimes={SEARCH_KEY_TIMES}
          keySplines={SEARCH_SPLINES}
          values={SEARCH_MERIDIANS[1]}
          fill="freeze"
        />
      ) : null}
    </path>
    <path d={staticMeridian(10.8941)} {...stroke}>
      {play > 0 ? (
        <>
          <animate
            attributeName="d"
            dur="0.5s"
            calcMode="spline"
            keyTimes={SEARCH_KEY_TIMES}
            keySplines={SEARCH_SPLINES}
            values={SEARCH_MERIDIANS[2]}
            fill="freeze"
          />
          <animate
            attributeName="opacity"
            dur="0.5s"
            values="1;1;0"
            keyTimes="0;0.9333;1"
            fill="freeze"
          />
        </>
      ) : null}
    </path>
  </svg>
)
