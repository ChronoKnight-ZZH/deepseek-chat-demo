/**
 * 输入框开关图标的动画：
 * - 智能搜索来自 deepseek.com 首页的 Lottie 关键帧，转换为 SVG SMIL，
 *   开启时正向播放、关闭时反向播放，时长控制在 300ms 内；
 * - 模型切换使用专属的微交互动画，风格与前者一致；
 * - 动画结束后卸载 SMIL 节点，只保留静态图标，避免动画实例常驻。
 * 深度思考的轨道动画是独立的实现，见 ThinkingIcon.tsx。
 */

import { useLayoutEffect, useRef, useState } from 'react'

export type AnimationRun = { id: number; direction: 'forward' | 'reverse' }

const TOGGLE_DURATION = 280
const MODEL_DURATION = 300

type Spec = { values: string[]; times: number[] }

/** 反向播放：倒序取值，并把关键时间点对称翻转到 0–1 */
const reverseSpec = ({ values, times }: Spec): Spec => ({
  values: [...values].reverse(),
  times: times.map((time) => 1 - time).reverse(),
})

const playback = (spec: Spec, direction: AnimationRun['direction']) =>
  direction === 'forward' ? spec : reverseSpec(spec)

const splines = (valueCount: number) =>
  Array.from({ length: Math.max(valueCount - 1, 0) }, () => '0.42 0 0.58 1').join(';')

const enabledDirection = (enabled: boolean) =>
  enabled ? ('forward' as const) : ('reverse' as const)

/**
 * 状态变化时播放一次动画：以真实状态为触发源，避免点击与开关不同步。
 * 定时器在状态再次变化或组件卸载时清理，动画结束即回到静态图标。
 */
const useChangeAnimation = (
  value: unknown,
  duration: number,
  direction: AnimationRun['direction']
) => {
  const previous = useRef(value)
  const [run, setRun] = useState<AnimationRun | null>(null)
  useLayoutEffect(() => {
    if (Object.is(previous.current, value)) {
      return
    }
    previous.current = value
    setRun((current) => ({ id: (current?.id ?? 0) + 1, direction }))
    const timer = window.setTimeout(() => setRun(null), duration)
    return () => window.clearTimeout(timer)
  }, [value, duration, direction])
  return run
}

export const useToggleAnimation = (enabled: boolean) =>
  useChangeAnimation(enabled, TOGGLE_DURATION, enabledDirection(enabled))

export const useModelAnimation = (model: string) =>
  useChangeAnimation(model, MODEL_DURATION, 'forward')

/** 经线弧的控制点比例，与圆周四分之一弧一致 */
const MERIDIAN_CONTROL = 0.5523

/** 固定表圈 */
const SEARCH_RIM =
  'M7.9996 14.8492C11.7824 14.8492 14.8487 11.7828 14.8487 8C14.8487 4.2172 11.7824 1.1509 7.9996 1.1509C4.2168 1.1509 1.1504 4.2172 1.1504 8C1.1504 11.7828 4.2168 14.8492 7.9996 14.8492Z'

/** 固定赤道 */
const SEARCH_EQUATOR = 'M1.64 8H14.36'

/** 经线：经过 middle 的半个椭圆弧，控制点随椭圆半径缩放 */
const meridianPath = (middle: number) => {
  const control = 8 + (middle - 8) * MERIDIAN_CONTROL
  return `M7.9996 14.8492C${control} 14.8492 ${middle} 11.7828 ${middle} 8C${middle} 4.2172 ${control} 1.1509 7.9996 1.1509`
}

/**
 * 智能搜索：赤道与表圈固定，三根经线开启时从左向右扫过，关闭时反向扫回。
 * 静止态取终点帧，与站点导出的 SVG 一致。
 */
const SEARCH_MERIDIANS: { start: string; end: string; fade?: string[] }[] = [
  { start: meridianPath(1.1504), end: meridianPath(5.0968), fade: ['0', '1'] },
  { start: meridianPath(5.105), end: meridianPath(10.8878) },
  { start: meridianPath(10.8941), end: meridianPath(14.8487) },
]

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const pathAnimation = (spec: Spec, direction: AnimationRun['direction']) => {
  const { values, times } = playback(spec, direction)
  return {
    attributeName: 'd',
    dur: `${TOGGLE_DURATION}ms`,
    calcMode: 'spline',
    keyTimes: times.join(';'),
    keySplines: splines(values.length),
    values: values.join(';'),
    fill: 'freeze',
  }
}

const numberAnimation = (
  attributeName: string,
  spec: Spec,
  direction: AnimationRun['direction'],
  duration: number
) => {
  const { values, times } = playback(spec, direction)
  return {
    attributeName,
    dur: `${duration}ms`,
    calcMode: 'spline',
    keyTimes: times.join(';'),
    keySplines: splines(values.length),
    values: values.join(';'),
    fill: 'freeze',
  }
}

export const SearchToggleIcon = ({ run }: { run: AnimationRun | null }) => (
  <svg key={run?.id ?? 'idle'} width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d={SEARCH_RIM} {...stroke} />
    <path d={SEARCH_EQUATOR} {...stroke} />
    {SEARCH_MERIDIANS.map((meridian) => (
      <path key={meridian.end} d={meridian.end} {...stroke}>
        {run ? (
          <>
            <animate
              {...pathAnimation(
                { values: [meridian.start, meridian.end], times: [0, 1] },
                run.direction
              )}
            />
            {meridian.fade ? (
              <animate
                {...numberAnimation(
                  'opacity',
                  { values: meridian.fade, times: [0, 1] },
                  run.direction,
                  TOGGLE_DURATION
                )}
              />
            ) : null}
          </>
        ) : null}
      </path>
    ))}
  </svg>
)

const BIG_SPARKLE =
  'M6.2 1.6C6.6 4.2 7.9 5.5 10.5 5.9C7.9 6.3 6.6 7.6 6.2 10.2C5.8 7.6 4.5 6.3 1.9 5.9C4.5 5.5 5.8 4.2 6.2 1.6Z'
const SMALL_SPARKLE =
  'M11 8.6C11.2 9.9 11.9 10.6 13.2 10.8C11.9 11 11.2 11.7 11 13C10.8 11.7 10.1 11 8.8 10.8C10.1 10.6 10.8 9.9 11 8.6Z'

/** 模型切换：整体轻微回正放大，大星点淡入、小星点弹入 */
export const ModelToggleIcon = ({ run }: { run: AnimationRun | null }) => (
  <svg key={run?.id ?? 'idle'} width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
    <g>
      {run ? (
        <animateTransform
          attributeName="transform"
          type="rotate"
          values="-24 7 7;0 7 7"
          dur={`${MODEL_DURATION}ms`}
          calcMode="spline"
          keyTimes="0;1"
          keySplines="0.22 1 0.36 1"
          fill="freeze"
        />
      ) : null}
      <g transform="translate(7 7)">
        <g>
          {run ? (
            <animateTransform
              attributeName="transform"
              type="scale"
              values="0.86;1.04;1"
              dur={`${MODEL_DURATION}ms`}
              calcMode="spline"
              keyTimes="0;0.7;1"
              keySplines="0.22 1 0.36 1;0.34 1 0.64 1"
              fill="freeze"
            />
          ) : null}
          <g transform="translate(-7 -7)">
            <path d={BIG_SPARKLE} fill="currentColor">
              {run ? (
                <animate
                  attributeName="opacity"
                  values="0.35;1"
                  dur={`${MODEL_DURATION}ms`}
                  fill="freeze"
                />
              ) : null}
            </path>
            <g transform="translate(11 10.8)">
              <g>
                {run ? (
                  <animateTransform
                    attributeName="transform"
                    type="scale"
                    values="0.35;1.25;1"
                    dur={`${MODEL_DURATION}ms`}
                    calcMode="spline"
                    keyTimes="0;0.6;1"
                    keySplines="0.22 1 0.36 1;0.34 1 0.64 1"
                    fill="freeze"
                  />
                ) : null}
                <path transform="translate(-11 -10.8)" d={SMALL_SPARKLE} fill="currentColor" />
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  </svg>
)
