# chat-demo

[English](README.md) | 简体中文

基于 DeepSeek API 的聊天示例，所有请求经同源 BFF（`auth-demo`）转发。浏览器不持有 DeepSeek API Key：登录后使用 Bearer Token，聊天、文件和语音请求统一走 `/v1`。

本地开发时，先在 `http://127.0.0.1:3000` 启动 `auth-demo`，再启动前端；开发服务器会把 `/auth`、`/v1` 代理到该后端。不要再直接双击 `dist/index.html`：现在必须通过 BFF，并且需要 HTTPS 或 localhost 安全上下文。

## 运行

准备 Node.js 22.12+ 和 pnpm：

```sh
git clone https://github.com/deepseek-ai/chat-demo.git
cd chat-demo
pnpm install
pnpm dev
```

打开 http://localhost:8090 。

生成静态产物：

```sh
pnpm build
```

产物位于 `dist/`，可部署到静态服务器，也可直接打开 `dist/index.html`。直接打开时，浏览器和 API 服务需允许 `file://` 页面的存储与跨域请求。

## 会话地址

当前会话会体现在地址栏里：`/chat/<会话 id>`，欢迎页（新对话）是站点根路径。切换会话、在欢迎页发出第一条消息都会同步更新地址，浏览器前进后退也会切换会话；地址使用 `replaceState` 写入，不会在历史记录里堆积。打开 `/chat/<id>` 可以直接进入该会话，会话已删除或不属于本机时回到欢迎页。

会话地址是真实路径，部署时需让服务端把该路径回退到 `index.html`，否则直接访问或刷新会 404：

```nginx
# nginx：/chat/ 下找不到文件时交给 index.html
location / {
  try_files $uri $uri/ /index.html;
}
```

```text
# Caddy
try_files {path} /index.html
```

站点部署在子目录（如 `https://example.com/app/`）时无需额外配置：`src/index.html` 中的内联脚本会按当前地址推断应用根目录并写入 `<base>`，资源照常按子目录加载，会话地址形如 `/app/chat/<id>`。

## 功能

- 多会话、自动标题、重命名与删除；编辑提问、重新生成和切换消息分支。
- 流式回答，可在 DeepSeek Flash 与 DeepSeek V4 Pro 模型间切换；支持深度思考、智能搜索、链接阅读与来源引用，以及停止和符合条件的继续生成。
- 附件上传、粘贴与拖拽，语音输入和回复朗读；移动端录音时输入框首行显示实时频谱。
- Markdown、代码高亮、KaTeX 公式和 Mermaid 图表。
- 简体中文与英文、浅色与深色主题、移动端布局、位置设置、历史导出。

## 数据

设置仍保存在浏览器 localStorage。会话和消息通过 BFF 保存到 MySQL；IndexedDB 只作为本地缓存与附件原件存储。API Key 不再保存到浏览器，只存在于 BFF 服务端环境变量。

设置中的导出会从服务端会话与本地可用图片生成 ZIP。浏览器端不再提供历史导入，历史统一由服务器 CLI 导入；导出不包含设置或非图片附件原件。格式与保留范围见[历史导入导出](src/services/chat/history/README.md)。

设置 → 数据管理 → 删除所有对话，会在确认后删除服务端全部会话并清空本地缓存，停止正在生成的回复并回到新对话。应用设置保留，已经通过 BFF 上传的文件不受影响。

## 开发

| 命令          | 用途                |
| ------------- | ------------------- |
| `pnpm dev`    | 启动开发服务器      |
| `pnpm build`  | 构建到 `dist/`      |
| `pnpm type`   | TypeScript 类型检查 |
| `pnpm lint`   | oxlint 检查         |
| `pnpm format` | oxfmt 格式化        |

[rspack.config.ts](rspack.config.ts) 默认 `__AUTH_BASE__ = /auth`、`__BFF_BASE__ = /v1`，均为同源路径。`createConfig({ authBase, bffBase, devServer })` 支持自定义；开发服务器把 `/auth`、`/v1`、`/api` 代理到 `http://127.0.0.1:3000`。

聊天默认使用 `deepseek-flash`，通过 Anthropic 兼容的 Messages / Files API 通信；语音使用 ASR / TTS 接口。请求使用搜索、链接阅读、标题和 `latest_reminder` 等扩展，接入服务需支持相应能力。附件实际支持的格式以服务端校验为准。

```text
src/
  app/                 应用布局、主题与全局样式
  components/          聊天、设置、Markdown 等界面组件
  i18n/                中英文文案
  services/
    api/               API 请求、SSE 与协议类型
    chat/              会话、消息分支、本地存储与历史导入导出
    markdown/          Markdown 解析、代码高亮与图表
    speech/            录音与朗读
  utils/               通用工具
```

## 许可证

[MIT](LICENSE)。构建会将许可证复制到 `dist/LICENSE`，分发时请一并保留；第三方依赖遵循各自的许可证。
