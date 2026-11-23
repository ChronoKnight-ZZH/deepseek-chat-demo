# chat-demo

[English](README.md) | 简体中文

基于 DeepSeek API 的静态聊天示例修改，添加更多功能，更加还原。无需应用后端，浏览器直接请求配置的 API 服务。

点击 [在线体验](https://deepseek-ai.github.io/chat-demo/) 即可使用，也可以前往 [Releases](https://github.com/deepseek-ai/deepseek-chat-demo/releases) 下载压缩包，解压后双击 `index.html` 在本地使用，无需安装或构建。首次使用时，请在设置中填写 API Key。

## 运行

准备 Node.js 22.12+ 和 pnpm：

```sh
git clone https://github.com/deepseek-ai/chat-demo.git
cd chat-demo
pnpm install
pnpm dev
```

打开 <http://localhost:8090> 。

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

- 模拟登录：支持验证码、密码和微信扫码快捷登录，填写任意非空内容即可进入，不做真实鉴权；登录方式与时间保存在浏览器 localStorage，刷新后保持登录，可在设置中退出登录。
- 会话置顶：在会话菜单中置顶或取消置顶，置顶对话在侧栏顶部单独成组，其余按今天、昨天、7 天内、30 天内和月份分组。
- 选择模型：在输入框内切换 DeepSeek Flash 与 DeepSeek V4 Pro，菜单中展示各模型特点，选择结果保存在本机。
- 对话搜索：点击侧栏搜索按钮或按 Ctrl/Cmd + K 打开搜索框，检索全部本地对话并高亮关键词，支持方向键选择、回车跳转到对应消息；输入停顿后再检索，避免逐字扫描。
- 多会话、自动标题、重命名与删除；编辑提问、重新生成和切换消息分支。
- 流式回答，支持深度思考、智能搜索、链接阅读与来源引用，以及停止和符合条件的继续生成。
- 附件上传、粘贴与拖拽，语音输入和回复朗读；移动端录音时输入框首行显示实时频谱。
- Markdown、代码高亮与 KaTeX 公式。
- 简体中文与英文、浅色与深色主题、移动端布局、位置设置、历史导入导出。

## 体验优化

- Lottie 动画：深度思考、智能搜索和模型切换图标使用由 Lottie 关键帧转换的 SVG SMIL 动画，开启时正向播放、关闭时反向播放，时长约 300ms；动画结束即卸载动画节点，只保留静态图标。
- 图表显示：Mermaid 图表在流式回答中边生成边绘制，未完成的语法只渲染已完整的部分并保留上次有效图；支持图表与代码切换、缩放和拖动，可下载 PNG、SVG 或代码，并可查看渲染日志。图表随浅色/深色主题重新渲染。

## 数据

API Key 和设置保存在浏览器 localStorage，会话及附件原件保存在 IndexedDB，本地数据按浏览器用户配置和站点源（origin）隔离。发送对话、上传附件和使用语音功能时，相应内容会提交给配置的 API 服务。

设置中的历史导入导出使用 ZIP 格式。导入会在确认并校验成功后替换全部本地会话和附件；导出包含会话与本地可用的图片原件，不包含 API Key、设置或非图片附件原件。格式与保留范围见[历史导入导出](src/services/chat/history/README.md)。

设置 → 数据管理 → 删除所有对话，会在确认后清空全部本地会话、附件原件和未发送的草稿，停止正在生成的回复并回到新对话。API Key 和其他设置保留，已上传到 API 服务的文件不受影响。

## 开发

| 命令            | 用途              |
| ------------- | --------------- |
| `pnpm dev`    | 启动开发服务器         |
| `pnpm build`  | 构建到 `dist/`     |
| `pnpm type`   | TypeScript 类型检查 |
| `pnpm lint`   | oxlint 检查       |
| `pnpm format` | oxfmt 格式化       |

[rspack.config.ts](rspack.config.ts) 默认连接 `https://api.deepseek.com`。`createConfig({ apiOrigin, devServer })` 支持自定义 API 地址和开发服务器代理。

`pnpm build` 会把 `README.md`、`README.zh-CN.md` 和 `LICENSE` 一并复制到 `dist/`，产物自带文档，分发时请保留。

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
