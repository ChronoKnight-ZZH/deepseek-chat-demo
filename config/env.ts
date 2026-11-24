/**
 * 项目运行环境 / 开发环境配置。
 *
 * 一套代码，两种环境地址：
 * - development（`pnpm dev`）：前端 http://localhost:8090，后端 http://127.0.0.1:3000，
 *   接口写成同源相对路径（/auth、/v1），由 devServer 代理到本地后端，浏览器看不到跨域。
 * - production（`pnpm build`）：前端 https://chat.shunkai-dg.cn，
 *   后端 https://api.shunkai-dg.cn，接口写成完整域名，浏览器直连 API 域名。
 *
 * 所有值都可以用环境变量或 `.env` 文件覆盖，优先级（低 → 高）：
 * 内置默认值 → `.env` → `.env.local` → `.env.<APP_ENV>` → `.env.<APP_ENV>.local` → 真实环境变量。
 * 这样本地调试可以把代理目标临时改成自己的后端端口，而不必改代码。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 构建环境名，与 `mode` 一起决定注入到前端的常量 */
export type AppEnv = 'development' | 'production'

export type EnvConfig = {
  /** 环境名，注入为 __APP_ENV__ */
  appEnv: AppEnv
  /** 前端站点地址，注入为 __WEB_ORIGIN__；用于分享链接、OAuth 回调等需要自身地址的场景 */
  webOrigin: string
  /** 认证接口前缀，注入为 __AUTH_BASE__ */
  authBase: string
  /** BFF 接口前缀，注入为 __BFF_BASE__ */
  bffBase: string
  /** 上游模型 API 地址，注入为 __API_ORIGIN__（仅在直连演示模式下被前端使用） */
  apiOrigin: string
  /**
   * fetch 的 credentials 取值，注入为 __API_CREDENTIALS__。
   * 同源部署用 same-origin（不带跨站 Cookie）；前后端分域部署用 include，
   * 后端必须回 Access-Control-Allow-Credentials 且 Origin 不能是 *。
   */
  credentials: 'same-origin' | 'include'
  /** 部署子目录，如 '/app/'；用于 index.html 里推导资源根目录 */
  basePath: string
  /** devServer 代理目标（本地后端地址）；生产构建不使用 */
  devProxyTarget: string
  /** devServer 端口 */
  devPort: number
  /** 本地开发是否启用 HTTPS（自签证书）；仅 devServer 使用 */
  devHttps: boolean
}

/** 两个环境的默认地址。改域名/端口只动这里，或直接在 `.env.production` 里覆盖。 */
const PROFILES: Record<AppEnv, EnvConfig> = {
  development: {
    appEnv: 'development',
    webOrigin: 'http://localhost:8090',
    // 同源相对路径：浏览器请求 /auth、/v1，devServer 代理到 devProxyTarget
    authBase: '/auth',
    bffBase: '/v1',
    apiOrigin: 'http://127.0.0.1:3000',
    credentials: 'same-origin',
    basePath: '/',
    devProxyTarget: 'http://127.0.0.1:3000',
    devPort: 8090,
    devHttps: false,
  },
  production: {
    appEnv: 'production',
    // 前端生产域名
    webOrigin: 'https://chat.shunkai-dg.cn',
    // 后端生产域名：认证与 BFF 都挂在 api 子域名下
    authBase: 'https://api.shunkai-dg.cn/auth',
    bffBase: 'https://api.shunkai-dg.cn/v1',
    apiOrigin: 'https://api.shunkai-dg.cn',
    // 分域部署：Cookie / 会话票据需要跨站携带
    credentials: 'include',
    basePath: '/',
    devProxyTarget: 'http://127.0.0.1:3000',
    devPort: 8090,
    devHttps: false,
  },
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/** 解析 `KEY=VALUE` 形式的 .env 文本，支持注释、export 前缀和成对引号 */
const parseDotenv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0) {
      continue
    }
    const key = line
      .slice(0, eq)
      .replace(/^export\s+/, '')
      .trim()
    let value = line.slice(eq + 1).trim()
    const quote = value.charAt(0)
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1)
    } else {
      // 未加引号时去掉行尾注释
      value = value.replace(/\s+#.*$/, '').trim()
    }
    if (key) {
      out[key] = value
    }
  }
  return out
}

/** 按给定顺序合并 .env 文件；真实进程环境变量始终最优先 */
const loadFileVars = (files: string[]): Record<string, string> => {
  const merged: Record<string, string> = {}
  for (const file of files) {
    const target = path.resolve(root, file)
    if (!existsSync(target)) {
      continue
    }
    Object.assign(merged, parseDotenv(readFileSync(target, 'utf8')))
  }
  return merged
}

/** 与环境无关的文件：先读它们才能知道本次要用哪个环境 */
const BASE_FILES = ['.env', '.env.local']

/** 环境相关文件，后面的覆盖前面的 */
const envFiles = (appEnv: AppEnv): string[] => [
  ...BASE_FILES,
  `.env.${appEnv}`,
  `.env.${appEnv}.local`,
]

const pick = (
  env: NodeJS.ProcessEnv,
  fileVars: Record<string, string>,
  names: string[]
): string | undefined => {
  for (const name of names) {
    const value = env[name] ?? fileVars[name]
    if (value !== undefined && value !== '') {
      return value
    }
  }
  return undefined
}

const withOrigin = (value: string): string => value.replace(/\/+$/, '')

/** 去掉前缀里的重复斜杠，并保证不带结尾斜杠（拼接时由调用方补 /path） */
const normalizeBase = (value: string): string => withOrigin(value).replace(/([^:]\/)\/+/g, '$1')

/** 本机/内网地址用 http 补全 scheme，公网域名用 https */
const LOCAL_HOST_RE = /^(localhost|127\.|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i

/**
 * 把不带 scheme 的值当主机名解析：必须有点分域名或 localhost，可带端口和路径。
 * 返回补全 scheme 的完整地址；不像主机名时返回 null（按路径段处理）。
 */
const asHostUrl = (value: string): string | null => {
  let url: URL
  try {
    url = new URL(`https://${value}`)
  } catch {
    return null
  }
  const host = url.hostname
  if (!host.includes('.') && host !== 'localhost') {
    // v1 / auth 这类单段是路径段，不是域名
    return null
  }
  const scheme = LOCAL_HOST_RE.test(host) ? 'http' : 'https'
  const port = url.port ? `:${url.port}` : ''
  const pathname = url.pathname.replace(/\/+$/, '')
  return `${scheme}://${host}${port}${pathname}`
}

/**
 * 把接口前缀归一化成最终注入值：
 * - `https://api.x.cn/auth` → 原样（跨域直连）
 * - `/auth` → 原样（同源，由 devServer 代理或 Nginx 反代）
 * - `api.x.cn` / `api.x.cn:8080/auth` / `localhost:3000` → 裸主机，按内外网补 scheme
 * - `v1` / `auth` → 路径段，拼到 API_ORIGIN 之后
 */
const resolveBase = (value: string, apiOrigin: string): string => {
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) {
    return normalizeBase(value)
  }
  const asHost = asHostUrl(value)
  if (asHost) {
    return normalizeBase(asHost)
  }
  return normalizeBase(`${withOrigin(apiOrigin)}/${value}`)
}

/** 站点/后端根地址：接受完整地址或裸主机，兜底值本身已是完整地址 */
const resolveOrigin = (value: string, fallback: string): string => {
  if (/^https?:\/\//i.test(value)) {
    return normalizeBase(value)
  }
  return asHostUrl(value) ?? normalizeBase(fallback)
}

/**
 * 解析当前构建使用的配置。
 * 环境名优先级：`process.env.APP_ENV` → `process.env.NODE_ENV`（rspack CLI 在加载配置前
 * 写好：serve=development、build=production）→ `.env` / `.env.local` 里的 `APP_ENV` → development。
 * 只有显式 production 才用生产域名，其余值都按开发环境处理。
 */
export const resolveEnvConfig = (env: NodeJS.ProcessEnv = process.env): EnvConfig => {
  const baseVars = loadFileVars(BASE_FILES)
  const requested = String(env.APP_ENV ?? env.NODE_ENV ?? baseVars.APP_ENV ?? 'development')
    .trim()
    .toLowerCase()
  const appEnv: AppEnv = requested === 'production' ? 'production' : 'development'
  const profile = PROFILES[appEnv]
  const fileVars = loadFileVars(envFiles(appEnv))

  const webOrigin = resolveOrigin(
    pick(env, fileVars, ['WEB_ORIGIN', 'PUBLIC_WEB_ORIGIN']) ?? profile.webOrigin,
    profile.webOrigin
  )
  const apiOrigin = resolveOrigin(
    pick(env, fileVars, ['API_ORIGIN', 'BACKEND_ORIGIN']) ?? profile.apiOrigin,
    profile.apiOrigin
  )
  const authBase = pick(env, fileVars, ['AUTH_BASE']) ?? profile.authBase
  const bffBase = pick(env, fileVars, ['BFF_BASE']) ?? profile.bffBase
  const credentialsOverride = pick(env, fileVars, ['API_CREDENTIALS'])
  const basePathValue = pick(env, fileVars, ['BASE_PATH']) ?? profile.basePath
  const devProxyTarget =
    pick(env, fileVars, ['DEV_API_TARGET', 'DEV_PROXY_TARGET']) ?? profile.devProxyTarget
  const devPort = Number(pick(env, fileVars, ['DEV_PORT']) ?? profile.devPort)

  const resolvedAuthBase = resolveBase(authBase, apiOrigin)
  const resolvedBffBase = resolveBase(bffBase, apiOrigin)
  // 接口前缀是完整域名且与站点不同源时才需要 include；相对路径一定同源
  const needsCredentials =
    isCrossOrigin(webOrigin, resolvedBffBase) || isCrossOrigin(webOrigin, resolvedAuthBase)

  return {
    appEnv,
    webOrigin,
    apiOrigin,
    authBase: resolvedAuthBase,
    bffBase: resolvedBffBase,
    // 分域部署要带 Cookie / 票据，同域保持保守的 same-origin
    credentials:
      credentialsOverride === 'include' || credentialsOverride === 'same-origin'
        ? credentialsOverride
        : needsCredentials
          ? 'include'
          : 'same-origin',
    basePath: toBasePath(basePathValue),
    devProxyTarget: resolveOrigin(devProxyTarget, profile.devProxyTarget),
    devPort: Number.isSafeInteger(devPort) && devPort > 0 ? devPort : profile.devPort,
    devHttps: (pick(env, fileVars, ['DEV_HTTPS']) ?? String(profile.devHttps)) === 'true',
  }
}

/** 接口前缀是否指向与站点不同的源 */
export const isCrossOrigin = (webOrigin: string, base: string): boolean => {
  if (!/^https?:\/\//i.test(base)) {
    return false
  }
  try {
    return new URL(base).origin !== new URL(webOrigin).origin
  } catch {
    return false
  }
}

/** 部署子目录必须是 `/xxx/` 形式，供 index.html 兜底推导资源根目录 */
export const toBasePath = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '/') {
    return '/'
  }
  const withSlashes = `/${trimmed.replace(/^\/+|\/+$/g, '')}/`
  return withSlashes.replace(/\/{2,}/g, '/')
}

/** 供配置打印使用，避免把整个对象序列化到日志 */
export const describeEnvConfig = (config: EnvConfig): string => {
  const cross = isCrossOrigin(config.webOrigin, config.bffBase)
  const crossAuth = isCrossOrigin(config.webOrigin, config.authBase)
  const notes = cross || crossAuth ? ' (cross-origin api)' : ' (same-origin api)'
  return (
    `APP_ENV=${config.appEnv} ` +
    `WEB_ORIGIN=${config.webOrigin} ` +
    `AUTH_BASE=${config.authBase} ` +
    `BFF_BASE=${config.bffBase} ` +
    `API_ORIGIN=${config.apiOrigin} ` +
    `credentials=${config.credentials}${notes}`
  )
}
