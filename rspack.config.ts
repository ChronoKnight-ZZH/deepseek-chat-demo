import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@rspack/cli'
import { rspack, type Configuration } from '@rspack/core'
import { describeEnvConfig, resolveEnvConfig, type EnvConfig } from './config/env.js'

/** 当前构建使用的运行环境：开发走本地地址，生产走 chat./api. 域名 */
const envConfig = resolveEnvConfig()
const targets = ['chrome >= 105', 'edge >= 105', 'safari >= 16', 'firefox >= 110']
const root = path.dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string }

const cssLoader = {
  loader: 'builtin:lightningcss-loader',
  options: { targets },
}

type ConfigOptions = {
  /** 覆盖 config/env.ts 解析出来的运行环境（测试或特殊部署用） */
  env?: Partial<EnvConfig>
  /** 部署目录，如 '/app/'；用于在认不出的地址下兜底解析资源，须以 / 开头和结尾 */
  basePath?: string
  /** 开发服务器额外配置，可与本地接口代理合并 */
  devServer?: Configuration['devServer']
}

/** 创建构建配置：按 APP_ENV / .env 注入各环境地址与开发服务器代理 */
export const createConfig = ({ env, basePath, devServer }: ConfigOptions = {}): Configuration => {
  const cfg: EnvConfig = { ...envConfig, ...env }
  cfg.basePath = basePath ?? cfg.basePath
  const dev = cfg.appEnv !== 'production'
  // 开启 HTTPS 后站点地址同步改成 https，分享链接、OAuth 回调才与实际地址一致
  if (cfg.devHttps) {
    cfg.webOrigin = cfg.webOrigin.replace(/^http:\/\//, 'https://')
  }

  // 打印本次构建生效的地址（含 CLI --env 覆盖），避免部署到错误环境却看不出来
  // eslint-disable-next-line no-console
  console.info(`[env] ${describeEnvConfig(cfg)}`)

  return {
    mode: dev ? 'development' : 'production',
    entry: './src/main.tsx',
    output: {
      path: path.resolve(root, 'dist'),
      // 运行时按当前脚本地址推导资源路径，file:// 下异步 chunk、字体都按相对位置加载
      publicPath: 'auto',
      filename: 'static/js/[name].[contenthash:8].js',
      chunkFilename: 'static/js/async/[name].[contenthash:8].js',
      cssFilename: 'static/css/[name].[contenthash:8].css',
      cssChunkFilename: 'static/css/async/[name].[contenthash:8].css',
      assetModuleFilename: 'static/media/[name].[contenthash:8][ext]',
      clean: true,
    },
    devtool: dev ? 'cheap-module-source-map' : false,
    // 开发模式预编译异步模块，保持首次加载代码高亮和公式时的页面状态
    lazyCompilation: false,
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      // 将 .js 导入路径解析到同名 .ts、.tsx 或 .js 文件
      extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
    },
    module: {
      // CSS Modules 使用默认导出：`import styles from './x.module.css'`
      parser: { 'css/module': { namedExports: false } },
      generator: { 'css/module': { localIdentName: '[local]-[hash:6]' } },
      rules: [
        { test: /\.module\.css$/, type: 'css/module', use: [cssLoader] },
        { test: /\.css$/, exclude: /\.module\.css$/, type: 'css', use: [cssLoader] },
        {
          test: /\.(j|t)sx?$/,
          exclude: /[\\/]node_modules[\\/]/,
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: { syntax: 'typescript', tsx: true },
              transform: { react: { runtime: 'automatic', development: dev } },
              externalHelpers: true,
            },
            env: { targets },
          },
          type: 'javascript/auto',
        },
        { test: /\.(woff2?|ttf)$/, type: 'asset/resource' },
      ],
    },
    plugins: [
      // 经典 defer 脚本支持 file:// 页面的资源加载
      new rspack.HtmlRspackPlugin({
        template: './src/index.html',
        scriptLoading: 'defer',
        meta: { 'application-version': version },
        // 内联脚本据此兜底推断应用根目录（见 src/index.html）
        templateParameters: { appBasePath: cfg.basePath },
      }),
      new rspack.DefinePlugin({
        __APP_ENV__: JSON.stringify(cfg.appEnv),
        __WEB_ORIGIN__: JSON.stringify(cfg.webOrigin),
        __API_ORIGIN__: JSON.stringify(cfg.apiOrigin),
        __AUTH_BASE__: JSON.stringify(cfg.authBase),
        __BFF_BASE__: JSON.stringify(cfg.bffBase),
        __API_CREDENTIALS__: JSON.stringify(cfg.credentials),
      }),
      new rspack.CopyRspackPlugin({
        patterns: [
          { from: path.resolve(root, 'LICENSE'), to: 'LICENSE', toType: 'file' },
          // 文档随产物一起打包，便于分发和离线查阅
          { from: path.resolve(root, 'README.md'), to: 'README.md', toType: 'file' },
          { from: path.resolve(root, 'README.zh-CN.md'), to: 'README.zh-CN.md', toType: 'file' },
        ],
      }),
    ],
    performance: { hints: false },
    // 会话地址是真实路径（/chat/<id>），刷新和直链都要回退到 index.html
    devServer: {
      port: cfg.devPort,
      // 自签证书由 @rspack/dev-server 借助 selfsigned 自动生成，首次访问需在浏览器信任
      server: cfg.devHttps ? 'https' : undefined,
      historyApiFallback: true,
      // 开发环境把同源接口前缀代理到本地后端；生产环境由 Nginx 反代 api 子域名
      proxy: dev
  ? [{ context: proxyContexts(cfg), target: cfg.devProxyTarget, changeOrigin: true, secure: false }]
  : undefined,
      ...devServer,
    },
  }
}

/** 只有相对路径前缀需要代理；生产配置是完整域名，devServer 用不到 */
const proxyContexts = (cfg: EnvConfig): string[] => {
  const contexts = [cfg.authBase, cfg.bffBase].filter((base) => base.startsWith('/'))
  if (contexts.length === 0) {
    // .env.development 把接口写成完整域名时，仍保留默认前缀方便本地直连后端调试
    return ['/auth', '/v1', '/api']
  }
  return [...new Set([...contexts, '/api'])]
}

/** CLI 的 `--env DEV_HTTPS=true`（npm run dev）请求强制开启开发 HTTPS */
const wantsDevHttps = (cliEnv?: Record<string, unknown>): boolean =>
  cliEnv?.DEV_HTTPS === true || cliEnv?.DEV_HTTPS === 'true'

// eslint-disable-next-line import/no-default-export
export default defineConfig((cliEnv) =>
  createConfig(wantsDevHttps(cliEnv) ? { env: { devHttps: true } } : undefined)
)
