# Code Wiki — chat-demo

> 基于 DeepSeek API 的纯静态聊天应用。浏览器直连配置的 API 服务，无需应用后端；会话与附件保存在本地（IndexedDB / localStorage）。

- 项目名：`chat-demo`，版本 `0.1.1`，协议 MIT
- 技术栈：React 18 + TypeScript（strict）+ Rspack 2 + Zustand 4
- 默认入口 API：`https://api.deepseek.com`（可在构建时通过 `createConfig({ apiOrigin })` 覆盖）

---

## 目录

1. [项目概览](#1-项目概览)
2. [整体架构](#2-整体架构)
3. [目录结构总览](#3-目录结构总览)
4. [应用入口与应用层](#4-应用入口与应用层)
5. [状态管理](#5-状态管理)
6. [services 层](#6-services-层)
7. [components 层](#7-components-层)
8. [i18n 与 utils](#8-i18n-与-utils)
9. [关键类与函数](#9-关键类与函数)
10. [依赖关系](#10-依赖关系)
11. [构建与运行](#11-构建与运行)
12. [数据与存储](#12-数据与存储)
13. [核心请求链路](#13-核心请求链路)

---

## 1. 项目概览

一个无需后端的静态聊天 Demo，核心能力：

- 多会话管理：自动标题、重命名、删除；编辑提问、重新生成、切换消息分支（版本树）。
- 流式回复：DeepSeek Flash / V4 Pro 模型；深度思考、智能搜索（含边想边搜 / 图搜）、阅读链接、来源引用角标；可停止生成或对符合条件的回复续写。
- 附件：上传 / 粘贴 / 拖拽；语音输入（ASR）与朗读（TTS）；移动端录音时显示实时音频频谱。
- 富文本渲染：Markdown、语法高亮（Prism）、KaTeX 公式、Mermaid 图表。
- 体验：中 / 英双语，亮 / 暗 / 跟随系统主题，移动端布局，位置设置，聊天历史导入 / 导出（ZIP）。

部署形态：构建产物为纯静态文件，可直接双击 `dist/index.html` 使用，也可部署到任意静态服务器（需配置 SPA 回退）。

---

## 2. 整体架构

应用采用「**视图组件（components）→ 业务服务（services）→ 本地存储（IndexedDB/localStorage）→ 远端 API**」的分层结构，所有跨组件共享状态通过 **Zustand store** 持有，组件以 selector 订阅最小切片，避免无关重渲染。

### 2.1 分层图

```
┌───────────────────────────────────────────────────────────────┐
│  src/index.html  (内联脚本推导应用根目录，写入 <base href>)     │
│  src/main.tsx    (挂载根组件，初始化主题 / KaTeX)               │
└───────────────────────────┬───────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────┐
│  app/  App.tsx — 根组件：登录态判定、布局装配、全局副作用绑定    │
│        theme.ts / viewport.ts — 主题与移动端视口基础设施       │
└───────────────────────────┬───────────────────────────────────┘
                            ▼ (订阅 store，派发 action)
┌───────────────────────────────────────────────────────────────┐
│  components/  纯展示与交互组件，按功能域分目录                   │
│   session / sider / messages / chatInput / markdown /          │
│   search / settings / login / files / htmlPreview /            │
│   messageSearch / base                                         │
└───────────────────────────┬───────────────────────────────────┘
                            ▼ (调用)
┌───────────────────────────────────────────────────────────────┐
│  services/  业务逻辑层（无 UI 依赖，可被组件与其他 service 调用）│
│  ├ api/        协议类型、HTTP/SSE 客户端、错误分类、语音接口    │
│  ├ chat/       会话领域核心：状态、流合并、分支、存储、路由、备份│
│  ├ markdown/   Markdown 解析、高亮、公式、图表                 │
│  ├ speech/     录音 / 朗读播放                                │
│  └ settings/auth/attachments/location  跨领域服务             │
└───────────┬───────────────────────────────────┬───────────────┘
            ▼                                   ▼
   ┌────────────────┐                ┌──────────────────────┐
   │ IndexedDB (idb)│                │ DeepSeek API (fetch) │
   │ 会话/附件/暂存  │                │ Messages / Files /   │
   └────────────────┘                │ ASR / TTS            │
   ┌────────────────┐                └──────────────────────┘
   │ localStorage   │
   │ 设置/登录态     │
   └────────────────┘
```

### 2.2 关键设计原则

- **离线优先**：所有会话数据与附件原件落盘 IndexedDB；设置与登录态存 localStorage。远端不可用时界面仍可浏览历史。
- **纯函数归并**：流式事件通过 `reply.ts` 的纯函数合并到 `AssistantMessage`，UI 只订阅消息对象，不直接处理协议。
- **不可变更新 + 帧节流**：store 用 `set` 生成新对象；流式正文按 `requestAnimationFrame` 批量 flush，页面隐藏时立即 flush 保证落盘。
- **分支消息树**：会话消息以 `parentId` / `selectedChildId` 构成树，展示与请求上下文都走「当前选中路径」，编辑 / 重新生成会新增兄弟版本而非覆盖。
- **地址即会话**：`/chat/<id>` 真实路径与当前会话双向同步（`replaceState`，不堆积历史），支持深链接与浏览器前进后退。

---

## 3. 目录结构总览

```
src/
├ main.tsx                  应用入口
├ index.html                HTML 模板（含应用根目录推导内联脚本）
├ env.d.ts                  全局类型声明（构建注入变量 __API_ORIGIN__）
├ app/                      应用布局、主题、全局样式、移动端视口
├ components/               UI 组件（按功能域分目录，见第 7 节）
├ i18n/                     中英翻译（index.ts 运行时，en.ts / zh.ts 词条）
├ services/                 业务逻辑层
│  ├ api/                   API 协议与请求
│  ├ chat/                  会话领域（状态/流/分支/存储/路由/备份）
│  ├ markdown/              Markdown 解析与渲染支撑
│  ├ speech/                录音与朗读
│  ├ settings.ts            设置 store（localStorage 持久化）
│  ├ auth.ts                登录态 store（localStorage 持久化）
│  ├ attachments.ts         附件上传任务 store 与校验
│  ├ location.ts            位置数据模型与归一化
│  ├ locationData.ts        国家 / 省市静态数据
│  └ uploadExts.ts          允许上传的扩展名白名单
└ utils/                    通用工具（clipboard/download/format/html/id）
```

---

## 4. 应用入口与应用层

### 4.1 `src/index.html`

HTML 模板，关键是 `<head>` 中的内联脚本：

- 部署在子目录（如 `/app/`）或深链 `/chat/<id>` 下，相对资源路径会被拼到会话段后导致 404；脚本按当前地址推算应用根目录并写入 `<base href>`，让静态资源始终从根目录解析。
- `file://` 协议下跳过（直接打开时按文件相对位置加载）。
- 识别规则：以 `/` 结尾 → 当前即根；`.../chat/<id>` 或 `.../chat` → 截掉会话段；访问 `index.html` → 去掉文件名；其余 → 用构建时 `basePath`（`<%= appBasePath %>`）兜底。
- 会话路由段常量 `chat` 须与 `services/chat/route.ts` 保持一致。

### 4.2 `src/main.tsx`

```
ensureKatex()      // 预加载 KaTeX（异步 chunk 就绪后再渲染公式）
setupTheme()       // 首屏渲染前同步一次主题
createRoot(...).render(<App />)
```
先初始化主题再挂载，避免首屏闪烁；引入 `theme.css` / `global.css` 全局样式。

### 4.3 `src/app/App.tsx`（根组件）

职责：
1. **登录态分流**：未登录渲染 `<LoginPage/>`；已登录进入主布局。
2. **布局装配**：桌面端 `<DesktopSider>` + `<main>`；移动端根据宽度在 `<PushSider>`（推开式）与 `<MobileSider>`（抽屉）间切换；主区依次渲染 `SessionView` / `Welcome` / 加载态 / 保存失败提示条。
3. **全局浮层**：统一挂载 `<SettingsDialog>`、`<MessageSearch>`、`<MermaidLogDialog>`、`<ImageViewer>`、`<Toast>`、`<SearchPanel>`、`<HtmlPreviewPanel>`。
4. **全局副作用**（`useEffect`）：
   - `bindChatPersistence` — 页面隐藏 / 关闭前 flush 流式增量并落盘。
   - `bindSessionUrl` — 会话与地址栏双向同步。
   - `onUploadNotice(showToast)` — 上传配额超限转 toast。
   - `Ctrl/Cmd+K` → 打开全文搜索。
   - 切换会话时关闭搜索面板 / HTML 预览 / 停止朗读 / 收起移动抽屉。
   - 登录后 `initChat()` 加载会话列表，并 `ensureApiKey()` 引导首次输入 API Key。

订阅的 store 切片：`useAuth.user`、`useSettings.locale/siderCollapsed`、`useChatStore` 的 `ready/activeId/sessionCache/streaming/...`。

### 4.4 `src/app/theme.ts`

- `Theme = 'light' | 'dark'`；`ThemePreference = 'light'|'dark'|'system'`。
- `useTheme()`：手动选择优先，`system` 时用 `useSyncExternalStore` 订阅系统 `prefers-color-scheme`。
- `setupTheme()`：首屏同步一次，之后订阅 `useSettings` 与系统媒体查询变化；切换时给 body 加 `change-theme` 类禁用过渡帧，同步 `color-scheme`、`theme-color` 与根画布背景。

### 4.5 `src/app/viewport.ts`

移动端布局基础设施：
- `useIsMobile()`：窄于 768px 判定为移动端（`useSyncExternalStore` 订阅媒体查询）。
- `usePushSider()`：宽于 610px 时侧边栏用推开式布局，否则抽屉浮层。
- `usePreventPageScroll(enabled)`：阻止移动端整页触摸滚动，保留内部可滚动区域与双指缩放。
- `useMobileViewport(enabled)`：返回 `frameRef`；监听 `visualViewport` / focus 变化，通过 CSS 变量 `--app-viewport-height` / `--app-viewport-top` 让键盘弹出后顶栏与输入框留在可见区域（适配 Safari 键盘动画）。

### 4.6 样式文件

- `global.css`：全局 reset 与基础排版。
- `theme.css`：亮 / 暗主题 CSS 变量（通过 body 上的 `light` / `dark` 类切换）。
- `App.module.css`：根布局栅格（桌面侧边栏 + 主区，移动端推开 / 抽屉偏移）。

---

## 5. 状态管理

全部使用 **Zustand**。store 之间通过 `getState()` / `setState()` 直接互调（不引入中间件），组件用 selector 订阅。

| Store | 文件 | 持久化 | 核心职责 |
|---|---|---|---|
| `useChatStore` | `services/chat/store.ts` | IndexedDB | 会话领域全部状态（列表、缓存、当前会话、流式控制器、错误标志） |
| `useSettings` | `services/settings.ts` | localStorage | API Key、语言、主题、位置、音色、模型、思考 / 搜索开关、侧边栏收起、系统提示词 |
| `useAuth` | `services/auth.ts` | localStorage | 登录用户（account / method / loggedAt），当前仅记录来源不做真实鉴权 |
| `useUploads` | `services/attachments.ts` | 内存 | 附件上传任务表（按本地附件 id 登记，状态 uploading/done/error） |

此外各组件目录下的 `*State.ts` 是**轻量外部 store**（同样基于 `useSyncExternalStore` 或事件订阅），用于驱动无需进入领域 store 的 UI 浮层：

- `components/base/toastState.ts` — 全局 toast 队列
- `components/base/imageViewerState.ts` — 图片查看器
- `components/search/searchPanelState.ts` — 右侧搜索来源面板
- `components/htmlPreview/htmlPreviewState.ts` — HTML 预览面板
- `components/settings/settingsDialogState.ts` — 设置对话框开关与 API Key 引导
- `components/sider/mobileSiderState.ts` — 移动端抽屉开合
- `components/messageSearch/messageSearchState.ts` — 全文搜索弹层

---

## 6. services 层

### 6.1 `services/api/` — API 协议与请求

#### `types.ts`
Messages API（Anthropic 兼容格式）协议类型，只声明应用用到的子集。关键类型：
- `ChatModel = 'deepseek-flash' | 'deepseek-v4-pro'`
- **请求**：`CreateMessageRequest`（model / system / messages / thinking / tools / safety_check / title?）；`MessageParam` 支持 `latest_reminder` / `user` / `assistant` 三种角色；工具声明 `deepseek_web_search` 与 `deepseek_read_url`。
- **响应内容块**：`TextBlock`（带 `citations`）、`ThinkingBlock`（带签名）、`ServerToolUseBlock` / `WebSearchToolResultBlock` / `WebFetchToolResultBlock`（搜索 / 阅读链接的调用与结果）。
- **流式事件**：`MessageStreamEvent` = `message_start` | `content_block_start` | `content_block_delta` | `content_block_stop` | `message_delta` | `message_stop` | `ping`。
- 附件：`FilePurpose = 'rich_layout_recognition' | 'user_data'`、`FileObject`、`ApiErrorBody`。

#### `client.ts`
HTTP / 流式请求客户端。
- `API_ORIGIN`：构建期注入（`DefinePlugin` 的 `__API_ORIGIN__`），默认 `https://api.deepseek.com`；`ANTHROPIC_BASE_URL = ${API_ORIGIN}/anthropic/v1`。
- `ApiError` 类：`kind`（`http` / `stream` / `network` / `interrupted` / `protocol`）+ `message`（字符串或可翻译的 `TranslationMessage`）+ `status`。
- `request(url, init)`：统一 fetch 封装，非 2xx 抛出 `ApiError`，网络失败归类 `network`，中止透传原错误。
- `verifyApiKey`：`GET /models` 校验 Key（不产生费用）。
- `uploadFile` / `deleteFile`：`POST/DELETE /anthropic/v1/files`，附件引用时携带 `anthropic-beta: files-api-2025-04-14`。
- `streamMessage(apiKey, body, signal)`：`POST /anthropic/v1/messages`（`stream:true`）的 **AsyncGenerator**，逐个产出 `MessageStreamEvent`；校验 `Content-Type: text/event-stream`，解析每帧，遇到 `message_stop` 结束，流提前结束抛 `interrupted`。

#### `sse.ts`
WHATWG 规范的 SSE 解析器，不依赖 `EventSource`（因为需要自定义 header 与中止）。
- `ServerSentEventDecoder`：增量解码，按 CRLF/LF/CR 切行，累积 `data`（多行以 `\n` 连接）/ `event` / `id`，空行派发；忽略注释行（保活）。
- `readServerSentEvents(stream, signal)`：字节流 → `TextDecoder(stream:true 防多字节截断)` → decoder → 逐个 `yield`；中止时 `reader.cancel()` 释放连接。

#### `parseEvent.ts`
`readMessageEvent(value)`：对原始 JSON 做**防御式校验**后转换为 `MessageStreamEvent`。未识别 / 字段不合法的事件静默丢弃（不影响后续有效内容）；只校验消费所需字段，签名等保持原样。`readBlock` / `readDelta` 分别校验内容块与增量。

#### `errors.ts`
错误分类（不生成文案，文案由各场景自行匹配）：
- `classifyStatus(status)` / `classifyApiError(error)` → `ApiErrorCondition`（unauthorized / insufficientBalance / tooLarge / rateLimited / serverBusy / network / other）。
- `isRetryableApiError`：网络 / 限流 / 服务端繁忙可重试。
- `getFileErrorCode` / `extractFileIds`：识别 400 中「附件 file_id 失效」（`fileIdMissing` / `fileDataMissing` / `invalidFileId`），并从文案提取 `file-api-*` id，用于失效补传。
- `getUploadErrorInfo`：识别上传 400（文件数上限 / 存储上限 / 解析失败）。

#### `speech.ts`
语音接口：
- `transcribe(apiKey, audio, signal)`：`POST /v1/tools/asr`，上传 WAV/Ogg Opus → 返回全文。
- `synthesize(apiKey, text, voice, signal)`：`POST /v1/tools/tts`，返回裸 PCM 字节流（24kHz 单声道 16-bit 小端，`TTS_SAMPLE_RATE`）；`TtsVoice = 'stella' | 'tide'`；服务端默认过滤代码块 / 表格 / 引用 / 长公式。

### 6.2 `services/chat/` — 会话领域核心

#### `types.ts`（数据模型）
- `FileAttachment`：`id`（本地主键，IndexedDB files 表）/ `serverId`（Files API 的 file_id，可为 null）/ `name` / `size` / `isImage` / `mimeType`。
- `MessageBranch`：`parentId?` / `selectedChildId?`，缺省按线性列表处理。
- `UserMessage`：content + files + createdAt。
- `AssistantMessage`：model / thinking / search / latestReminder 快照 / `prefix`（可否作续写前缀）/ `status`（`pending|streaming|done|stopped|error`）/ `blocks`（`ThinkingPart|TextPart|ServerToolBlock`）/ stopReason / stopDetails / usage / error。
- `Session`：id / title / 时间戳 / `messages`（含所有分支）/ `rootMessageId`（`undefined`=线性，`null`=空）。
- `SessionSummary` + `toSessionSummary`：列表只取元数据，避免把完整消息带进列表。

#### `store.ts`（1045 行，领域中枢）
基于 Zustand 的 `ChatState`：
```
ready / initError / importingHistory
sessions: SessionSummary[]          // 仅元数据，按 updatedAt 降序
sessionCache: Record<id, Session>   // 已打开详情，LRU 淘汰（上限 5）
sessionLoadErrors / sessionSaveErrors
activeId: string | null             // null = 欢迎页
streaming: Record<id, AbortController>
```
模块级变量维护：`sessionAccess`（LRU 时间戳）、`unsavedSessions`、`pendingFiles`（保存失败时保留原件）、`deletingSessions` / `deletionTasks`、`streamFlushes`、`historyEpoch`（导入 / 删除期间的并发屏障）、`sessionLoads`（同会话并发读取合并）。

核心导出（action）：
- `initChat()`：加载会话摘要列表，幂等（复用进行中的 `initTask`）。
- `selectSession(id)` / `newChat()`：切换 / 新建，触发详情异步加载。
- `ensureSessionLoaded(id)`：合并并发读取，读取后 `normalizeSession` + `settleInterrupted`（把中断的 pending/streaming 回复按 stopped 收尾）。
- `sendMessage(targetSessionId)`：取草稿 → 新建会话（若 null）→ 构造 user 消息 + 空 assistant 回复 → `appendBranch` 挂到分支 → `persist` → `streamReply`。
- `regenerateReply` / `editMessage` / `selectMessageVersion` / `continueReply` / `retryUpload`：分支操作族，均新增兄弟版本或在原块续写，不覆盖历史。
- `stopReply(id)`：abort 控制器。
- `renameSession` / `removeSession`：删除时等本会话流收尾，清理无引用的本地原件（远端不删）。
- `replaceHistory(write)`：导入 / 全部删除的原子替换入口——停止生成 → `historyEpoch+1` 屏障 → 写暂存 → `commitStaging` → 重置内存态；失败回滚。
- `bindChatPersistence()`：页面隐藏 / `pagehide` 时 flush 并落盘。
- `retrySaveSessions()`：保存失败后重试。
- `trimSessionCache()`：LRU 淘汰，保留当前 / 生成中 / 未保存 / 删除中的会话。

内部关键流程 `streamReply`（见 [13.3](#133-流式回复-streamreply)）：补齐附件 serverId → 构造请求 → 消费流 → 帧节流 flush → 结束 / 失败落盘；含附件失效自动补传重试（`FILE_RETRY_LIMIT=2`，指数退避）。

#### `reply.ts`（流式归并与请求构造，纯函数）
- `applyEvent(reply, event, now, blockIndexes)`：把一个 SSE 事件合并进回复。`content_block_start` 追加可识别块（跳过 `tool_use` 等不展示块并置 `prefix:false`）；`content_block_delta` 按临时索引映射累加 text / thinking / signature / citations；`message_delta` 更新 stopReason 与累计 usage。
- `settleReply(reply, status, now, error?)`：回复结束收尾；未结束思考块补 `endedAt`；`refusal` 时丢弃已下发的思考与正文（协议要求），只保留工具块。
- `getReplyText(reply)`：所有文本块拼接（复制 / 判断有无回答）。
- `canContinueReply(reply)`：判定可否续写——须 `prefix` 且非 refusal/tool_use、不含服务端工具块 / 模板，状态为 stopped 或（done 且 max_tokens）。
- `getContextRounds(history)`：筛选「提问 + 有可用回答」成对的历史轮次（失败 / 拒绝 / 空回答不进上下文）。
- `toRequestMessages(history, question, prefix?, thinking?, latestReminder?)`：把本地消息树转成 API 的 `MessageParam[]`。规则：历史思考不回传（续写保留本轮思考）、文本块去 citations 并合并、只回传 `read_link` 工具调用与结果（保留 signature 供服务端解密恢复网页）、按变化插入 `latest_reminder` 快照、续写末尾带 assistant prefix（空内容则不发避免空 Prefill）。
- `getThinkingSeconds(startedAt, endedAt)`：思考用时，至少 1 秒。

#### `view.ts`（回复 → 展示视图，纯计算）
`buildReplyView(reply, streaming)` 把内容块推导成界面结构 `ReplyView`：
- `steps`：时间线步骤——`thinking`（相邻思考块合并）、`search`（普通搜索按 kind 聚合，边想边搜只合并相邻同类）、`open` / `find` / `read_link`（工具调用）、`text`（工具前说明文字）。
- `answer`：最后一个思考 / 工具块后的正文，markdown 中在引用处插入 `[citation:N]`。
- `sources`：全部可引用来源（`SourceRegistry` 按 URL 去重编号，先出现先编号，后续结果补齐元数据）。
- `searchResults`：去重后的搜索网页，供底部汇总与搜索列表面板。
另有 `getTotalThinkingSeconds`（思考总用时）、`getAreaTitle`（折叠区标题文案，随流式状态变化）、`isDeepSearchKind` / `isImageSearchKind` 等辅助。

#### `branches.ts`（消息分支树）
- `normalizeSession`：把线性列表规范化为单分支（补 `parentId` / `selectedChildId` / `rootMessageId`）。
- `getVisibleMessages(session)`：沿 `selectedChildId` 取当前选中路径。
- `buildMessageVersions(session, previous)`：一次遍历收集每个节点的兄弟版本列表，未变化时复用旧对象避免流式更新重绘历史。
- `appendBranch(session, parentId, messages)`：新消息挂到父节点下并选中新分支，原节点与后续对话保持不变。
- `selectVersion(session, messageId)`：切换当前路径上某节点的兄弟版本，恢复该版本已选中的后续分支。

#### `db.ts`（IndexedDB，idb 封装）
`ChatDB` schema（`DB_VERSION=11`）：
- `sessions`（key: id，完整会话）、`sessionSummaries`（key: id，含 `fileIds` 多值索引）、`files`（key: id，`StoredFile{id,blob}` 原件）。
- `sessionsStaging` / `filesStaging`：导入暂存区，校验通过后同事务替换正式数据。
导出：`loadSessionSummaries` / `loadSession` / `loadAllSessions` / `saveSession`（同事务写会话+摘要+原件）/ `renameSession` / `deleteSession`（仅清理无引用原件）/ `saveFiles` / `loadFile` / 暂存系列（`clearStaging` / `addStagingSession` / `saveStagingFiles` / `updateStagingFileTypes` / `commitStaging`）/ `reportStorageError`。
设计：每操作拿连接后立即建事务；写入失败显式 `abortTransaction` 保证原子回滚。

#### `route.ts`（会话地址同步）
- `getSessionUrl(id)`：`<根目录>chat/<id>`。
- `readSessionRoute()`：解析当前地址为 home / session / unknown。
- `bindSessionUrl()`：返回取消函数。地址 ↔ 会话双向同步：store `ready` 后按地址还原会话（`selectSession` 或回收到 `newChat`）；会话变化时 `replaceState` 写回地址（用 replaceState 不堆积历史）；监听 `popstate` 支持前进后退。`file://` 下不接管路由。

#### `drafts.ts`
按会话维护未发送草稿（文本 + 附件引用），`getDraft` / `clearDraft` / `clearSentDraft` / `prepareDraftMessage`（从草稿与上传任务组装出可发送的 `{text, files}`，含原件 blob）。

#### `describe.ts`
`describeReply(reply)`：把出错 / 未正常结束 / 模板回复转成界面提示 `Notice`（text + 可选 presentation/action）。按错误 kind 与 status 分类映射到翻译 key，附带 `apiKey` / `topUp` 操作引导；`refusal` 与模板用正文样式展示。

#### `latestReminder.ts`
`createLatestReminder({locale, location}, now)`：生成模型约定的五项信息快照（日期、星期、位置、`Web`、语言），作为 `latest_reminder` 角色消息随请求发送，各回答版本独立保存。

#### `searchMessages.ts`
跨会话全文搜索：遍历 IndexedDB 全部会话正文（`loadAllSessions`），匹配后返回命中会话与消息定位。

#### `sessionGroups.ts`
会话列表按时间分组（今天 / 昨天 / 近 7 天 / 更早），供侧边栏分组展示。

#### `backup.ts`
导入 / 导出 / 全部删除的**串行队列**入口（`backupQueue`），避免读取归档时数据被清空或两个替换事务交错：
- `exportHistory()` → 动态 import `history/exportArchive`，读取全部会话（已打开的用缓存快照，未打开的逐条读 DB），生成 ZIP。
- `importHistory(file)` → 先 `checkArchiveFormat` 校验版本，再 `replaceHistory(() => importArchive(file))`。
- `clearHistory()` → `replaceHistory` 空写入。

#### `history/`（历史导入导出子系统）
详见 [src/services/chat/history/README.md](file:///d:/ZZH/aska/github/deepseek-chat-demo/src/services/chat/history/README.md)。使用 `export_format_version: 3` 的 ZIP：
- `format.ts` / `schema.ts`：归档类型与字段校验。
- `toLocal.ts` / `toArchive.ts`：归档片段 ↔ 本地消息转换（状态映射、模板、思考用时、工具结果、read_link 签名等）。
- `importArchive.ts` / `exportArchive.ts`：条目读取、暂存写入与归档组装。
- `zipReader.ts` / `zipWriter.ts`：基于 `fflate` 的 ZIP 读写，含路径 / 大小 / CRC 校验；支持 ZIP32 STORE / DEFLATE，导出用 STORE。
- `errors.ts`：`BackupError`。

### 6.3 `services/markdown/` — Markdown 渲染支撑

| 文件 | 职责 |
|---|---|
| `parse.ts` | `toMdast(markdown)`：用 `mdast-util-from-markdown` + GFM / 数学扩展解析为 AST；处理 citation 角标（`[citation:N]` 转为可点击引用节点）、链接、删除线等转换 |
| `highlight.ts` | Prism 语法高亮封装 |
| `katex.ts` | `ensureKatex()` 异步加载 KaTeX 样式与字体（main.tsx 首屏调用），公式渲染懒加载 |
| `mermaid.ts` / `mermaidExport.ts` | Mermaid 图表渲染与导出 PNG |
| `mermaidLog.ts` | Mermaid 渲染错误日志收集（供 `MermaidLogDialog` 展示） |

### 6.4 `services/speech/`

- `recorder.ts`：基于 `MediaRecorder` 录音，输出 WAV（单声道 16-bit PCM）或 Ogg Opus；提供 `AnalyserNode` 供实时频谱。
- `readAloud.ts`：调用 `synthesize` 拿 PCM 流 → `AudioContext` 播放；支持停止；切换会话时 `stopReadAloud`。

### 6.5 其他服务

- `settings.ts`（见第 5 节）：`DEFAULT_SYSTEM_PROMPT = '该助手为DeepSeek，由深度求索公司创造。'`；语言默认跟随浏览器 `navigator.language`；所有 setter 双写 localStorage 与 store。
- `auth.ts`：`signIn(account, method)` / `signOut`；`LoginMethod = 'sms'|'password'|'wechat'|'apple'`，当前仅记录来源。
- `attachments.ts`：附件上传任务管理（见第 5 节 `useUploads`）+ 校验：`ACCEPT_FILE_EXTS` 白名单、单文件上限 64MB（user_data 类 32MB）、最多 50 个、并发 3；`getUploadPurpose` 决定 purpose（图片不传 / PDF·Word·PPT 版面解析 / 其余 user_data）；`validateFiles` 整批校验；`describeUploadError` / `describeUploadQuota` 文案；`resolveMimeType` 按扩展名补 MIME。
- `location.ts` / `locationData.ts`：`UserLocation`（region + 可选 province/city）模型与归一化；中国省市静态数据；`getRegionName`。
- `uploadExts.ts`：允许上传扩展名清单（图片、文档、纯文本、代码、表格、电子书等）。

---

## 7. components 层

按功能域分目录，组件为函数组件，大量使用 `memo` 避免流式更新引发的无关重渲染；样式使用 **CSS Modules**（`*.module.css`，`localIdentName: [local]-[hash:6]`）。

### 7.1 `components/base/` — 基础 UI 原子件
| 文件 | 职责 / 关键导出 |
|---|---|
| `Button.tsx` | `Button`：统一 variant（solid/outlined/...）/ size（s/m）/ block 样式与原生 button 渲染 |
| `IconButton.tsx` | `IconButton`：图标按钮，含 tooltip / 加载态 |
| `Modal.tsx` | `Modal`：模态框（遮罩 + 居中 + 关闭） |
| `Menu.tsx` | `Menu` + `MenuOption`：下拉菜单 |
| `Select.tsx` | `Select`：下拉选择 |
| `Tooltip.tsx` | `Tooltip`：悬浮提示 |
| `Toast.tsx` / `toastState.ts` | 全局 toast 渲染与状态（`showToast`） |
| `ImageViewer.tsx` / `imageViewerState.ts` | 图片全屏查看器（缩放 / 翻页）与状态 |
| `anchored.ts` | 浮动元素定位工具（锚定计算，供菜单 / 搜索面板） |
| `usePresence.ts` | `usePresence` Hook：关闭动画期间保持挂载，避免退出动画被提前卸载 |
| `icons.tsx` | 全部内联 SVG 图标（`IconXxx` 系列） |

### 7.2 `components/chatInput/` — 输入区
- `ChatInput.tsx`：聊天输入主组件，按 `sessionId` 切换复用输入状态；整合附件、模型选择、语音、发送。
- `DraftAttachments.tsx`：草稿附件卡片展示（上传进度 / 失败重试 / 删除）。
- `DragMask.tsx`：拖拽文件进入时的遮罩提示。
- `ModelSelect.tsx`：模型选择（Flash / V4 Pro）。
- `VoiceButton.tsx` + `useVoiceInput.ts`：语音输入按钮与录音逻辑（按住说话，调用 ASR）。
- `Spectrum.tsx`：实时音频频谱可视化（`AnalyserNode`）。

### 7.3 `components/messages/` — 消息渲染
- `MessageList.tsx`：消息列表容器，虚拟/懒加载无关，管理滚动定位与 `scrollContext`。
- `UserMessage.tsx`：用户消息（正文 + 附件 + 编辑入口）。
- `AssistantMessage.tsx`：助手消息主组件，组合思考折叠区、工具步骤时间线、正文 Markdown、引用角标、错误提示。
- `ReplyArea.tsx`：回复正文区（Markdown + 来源汇总 + 复制 / 重新生成 / 续写操作）。
- `BranchSwitcher.tsx`：同节点多版本切换器（`← →` 切换兄弟版本）。
- `CopyButton.tsx`：复制回复文本。
- `ReadAloudButton.tsx` + `ReadingBars.tsx`：朗读按钮与朗读中动画条。
- `PromptNavigator.tsx`：历史提问快速跳转导航。
- `MessageFile.tsx`：消息内附件卡片。
- `scrollContext.ts`：消息滚动上下文（避免子组件 prop drilling）。
- `useReplyView.ts`：调用 `buildReplyView` 的 Hook，带流式刷新节流。

### 7.4 `components/session/` — 会话主视图
- `SessionView.tsx`：当前会话主区（消息列表 + 输入区）。
- `Welcome.tsx`：新对话欢迎页（功能入口 / 示例提问）。
- `MobileHeader.tsx`：移动端顶栏（菜单 + 标题）。

### 7.5 `components/sider/` — 侧边栏
- `Sider.tsx`：导出 `Sider`（基础列表）/ `DesktopSider` / `MobileSider` / `PushSider` 三种形态；含搜索、新建、会话列表、设置入口。
- `CollapsedSider.tsx`：桌面端收起态的窄条（仅图标）。
- `SessionItem.tsx`：单个会话条目（标题 / 时间 / 重命名 / 删除菜单），`memo`。
- `mobileSiderState.ts`：移动端抽屉开合状态。

### 7.6 `components/markdown/` — Markdown 渲染
- `Markdown.tsx`：入口，`useThrottleMarkdownRender` 节流解析 AST 后交渲染器（避免流式高频重解析卡顿）。
- `MarkdownAstRenderer.tsx`：AST → React 节点，按节点类型分发（段落 / 列表 / 代码 / 表格 / 引用 / 链接 / 图片 / 公式 / Mermaid / citation）。
- `CodeBlock.tsx`：代码块（Prism 高亮 + 复制 + `useFloatingCodeBanner` 浮动复制条 + 语言标签）。
- `MathFormula.tsx`：`MathBlock` / `InlineMath`（KaTeX）。
- `MermaidDiagram.tsx`：Mermaid 图表渲染（错误时收集日志）。
- `Link.tsx`：链接（外部新窗口、citation 特殊处理）。
- `MermaidLogDialog.tsx`：Mermaid 渲染错误日志对话框。
- `useThrottleMarkdownRender.ts` / `useFloatingCodeBanner.ts`：渲染节流 / 代码块浮动条 Hook。

### 7.7 `components/search/` — 联网搜索展示
- `SearchPanel.tsx` + `searchPanelState.ts`：右侧搜索结果来源面板与状态。
- `SourceCard.tsx`：单个来源卡片（标题 / 站点 / 摘要 / 图标 / 时间）。
- `CitationLink.tsx`：正文中的引用角标 `[N]`。
- `HoverCard.tsx`：引用悬浮预览卡片。
- `SiteLogo.tsx`：站点图标 / 缩略图（`SiteLogo` / `SiteThumbnails`）。
- `FallbackImage.tsx`：图片加载失败占位。

### 7.8 `components/settings/`
- `SettingsDialog.tsx`：设置对话框（API Key、语言、主题、位置、模型、思考 / 搜索开关、朗读音色、系统提示词、历史导入导出、全部删除）。
- `ApiKeyField.tsx`：`useApiKeyEditor` + `ApiKeyField` + `ApiKeyConfirm`，API Key 输入 / 校验 / 确认。
- `useApiKeyForm.ts`：API Key 表单逻辑（含 `verifyApiKey` 校验）。
- `settingsDialogState.ts`：对话框开关 + `ensureApiKey`（首次使用引导输入 Key）。

### 7.9 其他组件目录
- `login/`：`LoginPage` 登录页 + `LoginIcons`（DeepSeek / 微信 Logo）+ `QrPlaceholder` 二维码占位。
- `files/`：`FileCard` 附件卡片 + `FileIcon` 按扩展名显示文件类型图标。
- `htmlPreview/`：`HtmlPreviewPanel` HTML 预览面板 + `htmlPreviewState`（用于预览模型生成的 HTML 内容）。
- `messageSearch/`：`MessageSearch` 跨会话全文搜索弹层（Ctrl/Cmd+K）+ `messageSearchState`。

---

## 8. i18n 与 utils

### 8.1 `i18n/`
- `index.ts`：以 `zh.ts` 的 key 为 `TranslationKey` 类型来源（键齐全性由 TS 保证）；`createTranslate` 用 `{name}` 占位符替换；`useTranslate()` 返回当前语言翻译函数（订阅 `useSettings.locale`），`translate(key, params)` 为非 Hook 调用（读当前语言）。
- `en.ts` / `zh.ts`：英 / 中文词条表。
- `TranslationMessage = { key, params? }`；`LinkedMessage` 扩展带可选 `type` 与文字 `link`（用于 toast 中的操作链接）。

### 8.2 `utils/`
| 文件 | 职责 |
|---|---|
| `id.ts` | `createId()`：生成本地唯一 id（会话 / 消息 / 附件主键） |
| `format.ts` | `formatDate` 等日期格式化 |
| `clipboard.ts` | 剪贴板写入封装 |
| `download.ts` | 触发浏览器下载（Blob → a[download]） |
| `html.ts` | HTML 处理工具（预览 / 安全过滤相关） |

---

## 9. 关键类与函数

### 9.1 流式处理链

```
streamMessage (api/client.ts)        AsyncGenerator<MessageStreamEvent>
  └ readServerSentEvents (sse.ts)    字节流 → SSE 事件
  └ readMessageEvent (parseEvent.ts) 原始 JSON → 校验后事件
        │
        ▼  在 store.streamReply 中循环消费
applyEvent (chat/reply.ts)           事件 → 合并进 AssistantMessage.blocks
        │
        ▼  requestAnimationFrame 批量 flush
updateReply → persist (chat/store.ts) 内存更新 + IndexedDB 落盘
        │
        ▼
settleReply (chat/reply.ts)          结束收尾（done/stopped/error/refusal）
```

### 9.2 关键函数速查

| 函数 | 位置 | 说明 |
|---|---|---|
| `initChat()` | `chat/store.ts` | 加载会话列表，幂等 |
| `sendMessage(targetId)` | `chat/store.ts` | 提交草稿，新建或追加会话并触发流 |
| `streamReply(sessionId, reply, request)` | `chat/store.ts`（内部） | 补齐附件 → 请求 → 消费流 → 落盘；含失效补传重试 |
| `applyEvent / settleReply` | `chat/reply.ts` | 流式归并 / 结束收尾（纯函数） |
| `toRequestMessages` | `chat/reply.ts` | 本地消息树 → API 请求 messages |
| `buildReplyView` | `chat/view.ts` | 回复内容块 → 展示视图（步骤 / 正文 / 来源） |
| `getVisibleMessages` | `chat/branches.ts` | 取当前选中分支路径 |
| `appendBranch / selectVersion` | `chat/branches.ts` | 新增分支 / 切换版本 |
| `replaceHistory(write)` | `chat/store.ts` | 原子替换全部历史（导入 / 删除） |
| `commitStaging()` | `chat/db.ts` | 暂存 → 正式数据同事务替换 |
| `bindSessionUrl()` | `chat/route.ts` | 会话 ↔ 地址栏双向同步 |
| `classifyApiError / getFileErrorCode` | `api/errors.ts` | 错误分类 / 附件失效识别 |
| `uploadAttachment / cancelUpload` | `attachments.ts` | 排队上传（并发 3）/ 取消 |
| `useChatStore` | `chat/store.ts` | 会话领域 Zustand store |
| `useTheme / setupTheme` | `app/theme.ts` | 主题 Hook 与初始化 |
| `bindChatPersistence` | `chat/store.ts` | 页面隐藏前落盘 |

### 9.3 关键类

- `ApiError`（`api/client.ts`）：统一错误对象，`kind` + `message`（可翻译）+ `status`。
- `ServerSentEventDecoder`（`api/sse.ts`）：增量 SSE 解码器。
- `SourceRegistry`（`chat/view.ts`，内部类）：来源 URL 去重编号登记器。

---

## 10. 依赖关系

### 10.1 模块依赖方向（单向，无循环）

```
components  →  services  →  api / chat / markdown / speech
                    ↓
            utils / i18n（被全层引用）
chat (store)  →  api/client, api/errors, attachments, settings, chat/{branches,db,drafts,reply,latestReminder}
chat/reply    →  api/types, chat/types   （纯函数，无 store 依赖）
chat/view     →  api/types, chat/types   （纯计算）
```

- `reply.ts` / `view.ts` / `branches.ts` 刻意保持**纯函数、无 store 依赖**，便于测试与复用。
- 组件层只通过 `useChatStore` selector + 导出 action 与领域交互，不直接访问 IndexedDB 或 fetch（除少数预览 / 下载工具）。

### 10.2 第三方依赖（package.json）

**运行时**：
- `react` / `react-dom` 18.3 — UI 框架
- `zustand` 4.4 — 状态管理
- `clsx` — className 拼接
- `idb` 8 — IndexedDB Promise 封装
- `fflate` 0.8 — ZIP 读写（历史导入导出）
- `mdast-util-from-markdown` + `micromark-extension-gfm` / `mdast-util-gfm` — Markdown → AST
- `mdast-util-math` + `micromark-extension-llm-math` — 数学公式扩展
- `mdast-util-find-and-replace` — AST 内 citation 等替换
- `katex` 0.16 — 数学公式渲染
- `mermaid` 11 — 图表渲染
- `prismjs` 1.30 — 语法高亮

**开发**：`@rspack/core` / `@rspack/cli` / `@rspack/dev-server` 2 — 构建与 dev server；`typescript` 7；`oxlint` / `oxfmt` —  lint 与格式化（配置见 `.oxlintrc.json` / `.oxfmtrc.json`）。

---

## 11. 构建与运行

### 11.1 环境与脚本

需 Node.js 22.12+ 与 pnpm。

| 命令 | 说明 |
|---|---|
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 启动 dev server（`rspack serve`），端口 8090，SPA history 回退 |
| `pnpm build` | 生产构建到 `dist/` |
| `pnpm type` | `tsc` 类型检查（`noEmit`） |
| `pnpm lint` | oxlint 检查 `src` 与配置 |
| `pnpm format` | oxfmt 格式化 |

### 11.2 `rspack.config.ts` 要点

- 导出 `createConfig({ apiOrigin?, basePath?, devServer? })` 工厂，默认导出其调用结果；可自定义 API 地址（注入 `__API_ORIGIN__`）与部署子目录 / dev server 代理。
- `entry: ./src/main.tsx`；`output.publicPath: 'auto'`（按脚本地址推导，支持 `file://` 下异步 chunk 与字体相对加载）。
- CSS Modules 用默认导出（`namedExports: false`），类名 `[local]-[hash:6]`；CSS 经 `lightningcss-loader` 按浏览器目标压缩。
- TS/TSX 用 `builtin:swc-loader`（React automatic runtime，external helpers）。
- 插件：`HtmlRspackPlugin`（`scriptLoading: 'defer'`，注入 `application-version` meta 与 `appBasePath` 模板参数）、`DefinePlugin`（`__API_ORIGIN__`）、`CopyRspackPlugin`（拷贝 LICENSE 到 dist）。
- `devtool`: dev 用 `cheap-module-source-map`，生产关闭；`lazyCompilation: false`（预编译异步模块，保持首次加载代码高亮 / 公式时的页面状态）。
- `devServer`: 端口 8090，`historyApiFallback: true`。

### 11.3 部署注意事项

- 会话地址是真实路径 `/chat/<id>`，服务器需配置回退到 `index.html`（nginx `try_files $uri $uri/ /index.html;`，Caddy `try_files {path} /index.html`），否则刷新 / 直链 404。
- 子目录部署无需额外配置：`index.html` 内联脚本会推导应用根目录写入 `<base>`，资源与会话 URL 自动加前缀。
- 直接打开 `dist/index.html`（`file://`）可用，但要求浏览器支持 `file://` 页面的存储，且 API 服务允许其跨域请求。
- 构建产物包含 `dist/LICENSE`，分发时需保留。

---

## 12. 数据与存储

### 12.1 localStorage（设置与登录态）

| Key | 内容 |
|---|---|
| `chat-demo:api-key` | API Key |
| `chat-demo:locale` | 界面语言 |
| `chat-demo:theme-preference` | 主题偏好 |
| `chat-demo:location` | 用户位置（JSON） |
| `chat-demo:tts-voice` | 朗读音色 |
| `chat-demo:model` | 默认模型 |
| `chat-demo:thinking` / `chat-demo:search` | 深度思考 / 智能搜索开关 |
| `chat-demo:sider-collapsed` | 侧边栏收起 |
| `chat-demo:system-prompt` / `chat-demo:system-prompt-enabled` | 系统提示词及开关 |
| `chat-demo:login-user` | 登录用户（JSON） |

> 数据按浏览器配置文件 + 站点 origin 隔离。API Key 与设置**不**随历史导出。

### 12.2 IndexedDB（`chat-demo` 库，v11）

| Object Store | Key | 内容 |
|---|---|---|
| `sessions` | id | 完整会话（含全部分支消息） |
| `sessionSummaries` | id | 会话元数据 + `fileIds[]`（多值索引 `fileIds`，用于删除时判断原件是否仍被引用） |
| `files` | id | 附件原件 `StoredFile{id, blob}`，所有引用同 id 的消息共用一份 |
| `sessionsStaging` | id | 导入暂存会话 |
| `filesStaging` | id | 导入暂存附件 |

---

## 13. 核心请求链路

### 13.1 发送一条消息

```
用户在 ChatInput 编辑草稿（文本 + 附件）
  → 附件选中即开始 uploadAttachment（排队并发 3），serverId 写入 useUploads
  → 点击发送 → sendMessage(targetSessionId)
       ├ 准备：prepareDraftMessage 组装 {text, files(含 blob)}
       ├ 若新会话：创建 Session，插入 sessions/sessionCache，activeId = id
       ├ 构造 UserMessage + 空 AssistantMessage(pending)
       ├ appendBranch 挂到分支树 → persist 落盘 → clearSentDraft
       └ streamReply(sessionId, reply, {history, question})
```

### 13.2 附件 serverId 补齐（`prepareFiles`）

- 本轮提问附件并行 `ensureServerId`：已有 serverId 直接用；正在上传等任务；否则读 IndexedDB 原件补传。任一失败整体失败（回复记 `upload` 错误，可重试）。
- 历史轮次（进入上下文的）中缺 serverId 的附件（多为导入图片）从最新往前逐张补传，失败静默跳过（该附件不进本次请求，下次再试）。
- 成功的 serverId 通过 `saveServerIds` 写回会话中所有引用同一附件的消息（编辑 / 重新生成共用附件）。

### 13.3 流式回复（`streamReply`）

```
for attempt in 0..FILE_RETRY_LIMIT:
  prepareFiles 补齐附件     ← 失败 → reply.error = {kind:'upload', ...}, settleReply('error')
  createLatestReminder 快照  → toRequestMessages 构造请求体
  events = streamMessage(...)  (POST /anthropic/v1/messages, stream:true)
  for await event of events:
     receivedContent |= 收到 content_block_start
     message_delta 带 title 且会话无标题 → 自动写标题
     reply = applyEvent(reply, event, now, blockIndexes)
     页面可见 → requestAnimationFrame(flush) 更新内存；隐藏 → 立即 flush
  reply = settleReply(reply, 'done')      ← 正常结束
  catch:
     aborted → settleReply('stopped')
     附件失效(getFileErrorCode) 且未收到内容块且 attempt<上限:
        reuploadInvalidatedFiles（清 serverId + 取消旧上传任务）
        waitForRetry（指数退避，停止则立即返回）→ continue 重发
     否则 settleReply('error', 原始错误)
  persist(sessionId) 落盘
```

### 13.4 请求上下文构造（`toRequestMessages`）

- 只保留「提问 + 有可用回答」成对的历史轮次（`getContextRounds`）。
- 历史思考不回传；续写时保留本轮非空白思考及其签名。
- 文本块去除 citations，相邻文本合并，被思考 / 工具隔开的用空行连接。
- 工具只回传 `kind === 'read_link'` 的调用与结果（保留 `signature`，服务端解密恢复网页）；其他历史工具块不回传。
- 按 `latestReminder` 快照变化插入 `latest_reminder` 角色消息。
- 续写末尾带上 assistant prefix；prefix 无有效正文 / 思考时不发送（避免空 Prefill 被服务端拒绝）。

### 13.5 分支与版本

- 所有消息构成以 `rootMessageId` 为根、`parentId` / `selectedChildId` 链接的树。
- `editMessage` / `regenerateReply`：在原问题下新增同父兄弟版本（新 user + 新 assistant），不覆盖旧回答与后续对话；切换版本用 `selectVersion`。
- `continueReply`：末条回复符合 `canContinueReply` 时，在原消息块后续写新流内容（不新增消息）。
- 展示与请求统一走 `getVisibleMessages` 的当前选中路径。

### 13.6 历史导入导出

- 导出：`exportHistory` 串行读取全部会话 → `exportArchive` 生成 `deepseek_data-<日期>.zip`（含 manifest、会话 JSON、索引、图片原件）。
- 导入：`checkArchiveFormat` 校验版本 → 写入 IndexedDB 暂存 → 校验完整性 → `commitStaging` 同事务替换 → 重置内存态；失败回滚保留原记录。
- 全部删除：`clearHistory` 以空历史原子替换，保留 API Key 与设置。
- 三种操作经 `backup.ts` 的串行队列互斥执行。

---

*本文档基于仓库源码静态分析生成，对应版本 `0.1.1`。协议细节以 [DeepSeek API 文档](https://api-docs.deepseek.com/) 为准。*
