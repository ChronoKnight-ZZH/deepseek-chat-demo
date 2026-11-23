# chat-demo

English | [简体中文](README.zh-CN.md)

A static chat demo powered by the DeepSeek API. No application backend is required: the browser connects directly to the configured API service.

You can [try the app online](https://deepseek-ai.github.io/chat-demo/) or download the archive from [Releases](https://github.com/deepseek-ai/deepseek-chat-demo/releases), extract it, and double-click `index.html` to use it locally without installation or a build. Enter your API key in Settings before your first chat.

## Getting started

Install Node.js 22.12+ and pnpm, then run:

```sh
git clone https://github.com/deepseek-ai/chat-demo.git
cd chat-demo
pnpm install
pnpm dev
```

Open http://localhost:8090.

To build the static site:

```sh
pnpm build
```

The output is written to `dist/`. Deploy it to a static web server or open `dist/index.html` directly. Opening the file directly requires browser support for storage on `file://` pages and an API service that permits their cross-origin requests.

## Conversation URLs

The active conversation is reflected in the address bar as `/chat/<conversation id>`; the welcome screen (new chat) is the site root. Switching conversations and sending the first message from the welcome screen both update the address, and browser back and forward move between conversations. Addresses are written with `replaceState`, so they do not pile up in browser history. Opening `/chat/<id>` goes straight to that conversation; if it was deleted or belongs to another browser, you land on the welcome screen.

Conversation URLs are real paths, so the server must fall back to `index.html` or opening and reloading one returns 404:

```nginx
# nginx: serve index.html when no file exists under /chat/
location / {
  try_files $uri $uri/ /index.html;
}
```

```text
# Caddy
try_files {path} /index.html
```

Deploying under a subdirectory (such as `https://example.com/app/`) needs no extra configuration: the inline script in `src/index.html` derives the app root from the current address and writes it to `<base>`, so assets still load from the subdirectory and conversation URLs become `/app/chat/<id>`.

## Features

- Simulated sign-in: verification code, password, and WeChat QR quick sign-in. Any non-empty input gets you in; there is no real authentication. The method and time are stored in browser localStorage, so sign-in survives reloads, and you can sign out in Settings.
- Pinned conversations: pin or unpin from the conversation menu. Pinned conversations get their own group at the top of the sidebar; the rest are grouped into today, yesterday, last 7 days, last 30 days, and by month.
- Model selection: switch between DeepSeek Flash and DeepSeek V4 Pro from the input box, with each model's strengths shown in the menu. The choice is saved locally.
- Conversation search: click the search button in the sidebar or press Ctrl/Cmd + K to search all local conversations with highlighted keywords; use the arrow keys to select a hit and Enter to jump to the message. Search waits for a pause in typing instead of scanning on every keystroke.
- Multiple conversations with automatic titles, renaming, and deletion; edit prompts, regenerate replies, and switch between message branches.
- Streaming replies with deep thinking, smart search, link reading, and source citations; stop generation or continue eligible replies.
- Upload, paste, or drag and drop attachments; use voice input and read replies aloud. A live audio spectrum appears in the first row of the input area while recording on mobile.
- Markdown, syntax highlighting, and KaTeX math.
- Simplified Chinese and English, light and dark themes, mobile layouts, location settings, and chat history import and export.

## Experience refinements

- Lottie animations: the deep-thinking, smart-search, and model-switch icons use SVG SMIL animations converted from Lottie keyframes. They play forward when enabled and in reverse when disabled, run for about 300ms, and unmount their animation nodes afterwards, leaving only the static icon.
- Chart display: Mermaid diagrams render while a reply streams. Incomplete syntax only draws the lines that are already complete, and the last valid diagram is kept. Diagrams support chart/code switching, zooming and dragging, PNG, SVG, or code download, and a render log. They re-render for light and dark themes.

## Data and storage

Your API key and settings are stored in the browser's localStorage. Conversations and original attachments are stored in IndexedDB. Local data is isolated by browser profile and site origin. Sending messages, uploading attachments, and using speech features sends the relevant content to the configured API service.

History import and export in Settings use ZIP archives. After confirmation and successful validation, importing replaces all local conversations and attachments. Exports include conversations and locally available original images, but exclude API keys, settings, and original non-image attachments. See the [history import/export documentation (Chinese)](src/services/chat/history/README.md) for the archive format and preservation details.

Settings → Data → Delete all chats clears all local conversations, original attachments, and unsent drafts after confirmation. It stops ongoing replies and returns to a new chat. Your API key and settings are preserved; files already uploaded to the API service are not deleted.

## Development

| Command       | Description                  |
| ------------- | ---------------------------- |
| `pnpm dev`    | Start the development server |
| `pnpm build`  | Build into `dist/`           |
| `pnpm type`   | Run TypeScript type checks   |
| `pnpm lint`   | Lint with oxlint             |
| `pnpm format` | Format with oxfmt            |

[rspack.config.ts](rspack.config.ts) uses `https://api.deepseek.com` by default. Use `createConfig({ apiOrigin, devServer })` to customize the API origin and development server proxy.

`pnpm build` copies `README.md`, `README.zh-CN.md`, and `LICENSE` into `dist/`, so the build ships with its documentation; keep them when distributing the app.

Chat uses `deepseek-flash` by default through Anthropic-compatible Messages / Files APIs. Speech features use ASR / TTS endpoints. Requests include extensions for search, link reading, titles, and `latest_reminder`, so the configured service must support the corresponding capabilities. Supported attachment formats are determined by server-side validation.

```text
src/
  app/                 Application layout, themes, and global styles
  components/          Chat, settings, Markdown, and other UI components
  i18n/                English and Chinese translations
  services/
    api/               API requests, SSE, and protocol types
    chat/              Conversations, message branches, storage, and history import/export
    markdown/          Markdown parsing, syntax highlighting, and diagrams
    speech/            Audio recording and read-aloud playback
  utils/               Shared utilities
```

## License

[MIT](LICENSE). The build copies the license to `dist/LICENSE`; include it when distributing the app. Third-party dependencies are subject to their own licenses.
