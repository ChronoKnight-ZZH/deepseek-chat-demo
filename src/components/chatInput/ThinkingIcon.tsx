/**
 * 深度思考开关图标：一个中心点 + 两条 ±45° 交叉椭圆轨道 + 外层流星环。
 *
 * 动画策略（与页面其它开关一致：不常驻动画）：
 * - 切换等级：进度 p 用一次 420ms 缓动跑到目标值，轨道依次画出 / 收回、外层流星环淡入淡出，
 *   播完即停，静止时只有静态帧，不占 CPU；
 * - 再次点击当前等级：两条轨道依次收窄再展开，中心圆点短暂缩小，同样只播一次；
 * - 开启“减少动态效果”时两处动画都直接跳到终态。
 *
 * 所有视觉属性都由 p（以及动画期间的收窄量、旋转角）推导，
 * 和 demo/think-icon.js 的画法保持一致，只是把常驻 rAF 换成了按需触发的短动画。
 */

import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ThinkingLevel } from '../../services/settings.js'
import styles from './ThinkingIcon.module.css'

/** 各等级的进度：Low 画完轨道 A，High 画完轨道 B，Max 才出现流星环 */
const LEVEL_PROGRESS: Record<ThinkingLevel, number> = {
  off: 0,
  low: 0.33,
  high: 0.66,
  max: 1,
}

const CX = 12
const CY = 12
const RX = 8
const RY = 4

/** 两条轨道画完的进度分界 */
const DRAW_A_END = 0.33
const DRAW_B_END = 0.66

/** 流星环：轨道外侧的固定圆轨道，半径取视口的一半，任何尺寸下都完整可见 */
const METEOR_R = 11
const METEOR_LEN = 2 * Math.PI * METEOR_R

/** 切换等级的一次性过渡时长 */
const TRANSITION_MS = 420
/** 重复点击时“收窄再展开”的时长 */
const NUDGE_MS = 320

/** 椭圆周长（Ramanujan 近似），作为 stroke-dasharray 的全长 */
const RING_LEN = (() => {
  const h = (RX - RY) ** 2 / (RX + RY) ** 2
  return Math.PI * (RX + RY) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
})()

/** 两条等尺寸椭圆各倾斜 ±45° 时交点落在坐标轴上 */
const INTERSECT_R = Math.sqrt(2 / (1 / (RX * RX) + 1 / (RY * RY)))
const PARTICLES: readonly (readonly [number, number])[] = [
  [CX + INTERSECT_R, CY],
  [CX - INTERSECT_R, CY],
  [CX, CY + INTERSECT_R],
  [CX, CY - INTERSECT_R],
]

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3

/** 三角形脉冲：从 start 线性升到 peak 再降回 end，区间外为 0 */
const pulse = (progress: number, start: number, peak: number, end: number) => {
  if (progress <= start || progress >= end) {
    return 0
  }
  return progress < peak
    ? (progress - start) / (peak - start)
    : 1 - (progress - peak) / (end - peak)
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 动画帧：静止时只有 p 有意义，其余为中性值 */
type Visual = {
  p: number
  /** 轨道 A / B 的收窄量，0 为原状，1 为完全收窄 */
  squeezeA: number
  squeezeB: number
  /** 中心点的缩放系数，1 为原状 */
  core: number
  /** 轨道累计旋转角；静止时不变，同时充当闪烁与呼吸的时间轴 */
  rot: number
  /** 流星环的虚线相位 */
  halo: number
}

const restVisual = (p: number): Visual => ({
  p,
  squeezeA: 0,
  squeezeB: 0,
  core: 1,
  rot: 0,
  halo: 0,
})

/** 椭圆参数方程 + 旋转矩阵，用来把电子摆到轨道上 */
const onEllipse = (paramDeg: number, rotationDeg: number): readonly [number, number] => {
  const param = (paramDeg * Math.PI) / 180
  const rotation = (rotationDeg * Math.PI) / 180
  const x = RX * Math.cos(param)
  const y = RY * Math.sin(param)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return [CX + x * cos - y * sin, CY + x * sin + y * cos]
}

/** 纯展示层：给定一帧视觉参数画出整枚图标 */
export const ThinkingGlyph = ({
  visual,
  size,
  className,
}: {
  visual: Visual
  size: number
  className?: string
}) => {
  const { p, squeezeA, squeezeB, core, rot, halo } = visual
  const drawA = clamp01(p / DRAW_A_END)
  const drawB = clamp01((p - DRAW_A_END) / (DRAW_B_END - DRAW_A_END))
  const spark = clamp01((p - DRAW_B_END) / (1 - DRAW_B_END))
  const scaleA = 1 - 0.42 * squeezeA
  const scaleB = 1 - 0.42 * squeezeB
  const breathe = p * 0.18 * Math.sin(rot * 0.12)
  const electronA = onEllipse(40, 45 + rot)
  const electronB = onEllipse(210, -45 + rot)
  const glowRadius = (0.4 + size * 0.05) * spark
  const glow = glowRadius > 0.01 ? `drop-shadow(0 0 ${glowRadius.toFixed(2)}px currentColor)` : null
  const scale = (1 + 0.05 * p).toFixed(3)

  // 绕中心先转（含倾斜角）再按收窄量缩放；同一套变换同时用于轨道与幽灵轮廓
  const ringTransform = (tilt: number, squeeze: number) =>
    `rotate(${tilt} ${CX} ${CY}) rotate(${rot} ${CX} ${CY}) ` +
    `translate(${CX} ${CY}) scale(${squeeze.toFixed(3)}) translate(${-CX} ${-CY})`

  return (
    <svg
      className={clsx(styles.icon, className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={glow ? { filter: glow } : undefined}
    >
      <g transform={`translate(${CX} ${CY}) scale(${scale}) translate(${-CX} ${-CY})`}>
        {/* 流星环：圆环固定，只推移虚线相位，两层反向 */}
        <circle
          className={styles.meteorTrail}
          cx={CX}
          cy={CY}
          r={METEOR_R}
          strokeDasharray="20 40"
          strokeDashoffset={-(halo % METEOR_LEN)}
          opacity={0.5 * spark}
        />
        <circle
          className={styles.meteorDots}
          cx={CX}
          cy={CY}
          r={METEOR_R}
          strokeDasharray="2 10"
          strokeDashoffset={halo % METEOR_LEN}
          opacity={0.95 * spark}
        />
        {/* 轨道没画出时的幽灵轮廓 */}
        <ellipse
          className={styles.ghost}
          cx={CX}
          cy={CY}
          rx={RX}
          ry={RY}
          transform={ringTransform(45, scaleA)}
          opacity={0.2 * (1 - drawA)}
        />
        <ellipse
          className={styles.ghost}
          cx={CX}
          cy={CY}
          rx={RX}
          ry={RY}
          transform={ringTransform(-45, scaleB)}
          opacity={0.2 * (1 - drawB)}
        />
        <ellipse
          className={styles.ring}
          cx={CX}
          cy={CY}
          rx={RX}
          ry={RY}
          transform={ringTransform(45, scaleA)}
          strokeDasharray={RING_LEN}
          strokeDashoffset={RING_LEN * (1 - drawA)}
          opacity={drawA}
        />
        <ellipse
          className={styles.ring}
          cx={CX}
          cy={CY}
          rx={RX}
          ry={RY}
          transform={ringTransform(-45, scaleB)}
          strokeDasharray={RING_LEN}
          strokeDashoffset={RING_LEN * (1 - drawB)}
          opacity={drawB}
        />
        <circle
          className={styles.electron}
          cx={electronA[0]}
          cy={electronA[1]}
          r={0.75}
          opacity={0.85 * drawA}
        />
        <circle
          className={styles.electron}
          cx={electronB[0]}
          cy={electronB[1]}
          r={0.75}
          opacity={0.85 * drawB}
        />
        {PARTICLES.map(([x, y], index) => (
          <circle
            key={index}
            className={styles.particle}
            cx={x}
            cy={y}
            r={0.62}
            opacity={
              spark * clamp01(0.55 + 0.45 * Math.sin(rot * 0.14 + index * 1.7)) * 0.95
            }
          />
        ))}
        <circle
          className={styles.core}
          cx={CX}
          cy={CY}
          r={(1.75 + 0.5 * p + breathe) * core}
          opacity={0.32 + 0.68 * p}
        />
      </g>
    </svg>
  )
}

/**
 * 带一次性动画的图标：level 变化播过渡，nudge 自增播“收窄再展开”。
 * 两个动画共用一条 rAF，结束后不再排队，静止时不产生任何定时器。
 */
export const ThinkingIcon = ({
  level,
  nudge = 0,
  size = 16,
  className,
}: {
  level: ThinkingLevel
  /** 每次递增触发一次重复点击动画；0 表示不触发 */
  nudge?: number
  size?: number
  className?: string
}) => {
  const [visual, setVisual] = useState<Visual>(() => restVisual(LEVEL_PROGRESS[level]))
  const latest = useRef(visual)
  const frame = useRef(0)

  const animate = useCallback(
    (duration: number, next: (base: Visual, progress: number) => Visual) => {
      window.cancelAnimationFrame(frame.current)
      const base = latest.current
      const start = performance.now()
      const tick = (now: number) => {
        const progress = clamp01((now - start) / duration)
        const value = next(base, progress)
        latest.current = value
        setVisual(value)
        if (progress < 1) {
          frame.current = window.requestAnimationFrame(tick)
        }
      }
      frame.current = window.requestAnimationFrame(tick)
    },
    []
  )

  // 等级变化：从当前帧缓动到目标帧
  useEffect(() => {
    const target = LEVEL_PROGRESS[level]
    const base = latest.current
    if (base.p === target && base.squeezeA === 0 && base.squeezeB === 0 && base.core === 1) {
      return
    }
    if (prefersReducedMotion()) {
      const settled = { ...base, p: target, squeezeA: 0, squeezeB: 0, core: 1 }
      latest.current = settled
      setVisual(settled)
      return
    }
    animate(TRANSITION_MS, (from, progress) => {
      const eased = easeOutCubic(progress)
      return {
        p: from.p + (target - from.p) * eased,
        squeezeA: 0,
        squeezeB: 0,
        core: 1,
        rot: from.rot + 150 * eased,
        halo: from.halo + 34 * eased,
      }
    })
  }, [animate, level])

  // 重复点击当前等级：两条轨道依次收窄再展开，中心点短暂缩小
  const lastNudge = useRef(nudge)
  useEffect(() => {
    if (nudge === lastNudge.current) {
      return
    }
    lastNudge.current = nudge
    if (prefersReducedMotion()) {
      return
    }
    animate(NUDGE_MS, (from, progress) => ({
      ...from,
      squeezeA: pulse(progress, 0, 0.45, 0.9),
      // B 晚一拍收窄，两条环依次收缩而不是同时缩
      squeezeB: pulse(progress, 0.25, 0.62, 1),
      core: 1 - 0.45 * pulse(progress, 0, 0.4, 0.7),
    }))
  }, [animate, nudge])

  useEffect(() => () => window.cancelAnimationFrame(frame.current), [])

  return <ThinkingGlyph visual={visual} size={size} className={className} />
}
