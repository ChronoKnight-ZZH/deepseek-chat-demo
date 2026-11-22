/**
 * 运行环境读取：地址全部由构建期注入（见 config/env.ts、rspack.config.ts）。
 * 业务代码不要再写 http://127.0.0.1 或域名，切换环境只改构建配置或 .env。
 */

/** 当前构建环境名 */
export const APP_ENV = __APP_ENV__

/** 是否为生产构建 */
export const IS_PROD = APP_ENV === 'production'

/** 前端站点地址：开发 http://localhost:8090，生产 https://chat.shunkai-dg.cn */
export const WEB_ORIGIN = __WEB_ORIGIN__

/** 上游 API 地址：开发是本地后端 http://127.0.0.1:3000，生产是 https://api.shunkai-dg.cn */
export const API_ORIGIN = __API_ORIGIN__

/** fetch 的 credentials：分域部署为 include，同源为 same-origin */
export const API_CREDENTIALS = __API_CREDENTIALS__
