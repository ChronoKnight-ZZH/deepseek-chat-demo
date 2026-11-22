declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css' {}

/** 构建环境名：development 本地地址 / production 域名 */
declare const __APP_ENV__: 'development' | 'production'

/** 前端站点地址，如 https://chat.shunkai-dg.cn；见 config/env.ts */
declare const __WEB_ORIGIN__: string

/** 公开 API 的地址，见 rspack.config.ts 的 createConfig */
declare const __API_ORIGIN__: string

/** 认证接口前缀：开发同源 /auth，生产 https://api.shunkai-dg.cn/auth */
declare const __AUTH_BASE__: string

/** BFF 接口前缀：开发同源 /v1，生产 https://api.shunkai-dg.cn/v1 */
declare const __BFF_BASE__: string

/** 跨域部署时为 include，同源时为 same-origin；传给 fetch 的 credentials */
declare const __API_CREDENTIALS__: 'same-origin' | 'include'

/** Prism 语言包通过副作用注册到全局 Prism */
declare module 'prismjs/components/*' {}

/** KaTeX 化学公式扩展通过副作用注册到 KaTeX */
declare module 'katex/contrib/mhchem' {}
