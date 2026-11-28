# AGENTS.md

## Project shape

- Static SPA chat demo for the DeepSeek API. There is no application backend: the browser calls the configured API origin directly, stores settings/API key in `localStorage`, and chats/attachments in IndexedDB.
- React 18 + Zustand 4 + TypeScript, bundled by rspack/SWC. Entry: `src/main.tsx` → `src/app/App.tsx`. UI is grouped by feature in `src/components`; state, API, persistence, markdown, and speech live in `src/services`.
- Sign-in is simulated (any non-empty input); the API key is entered in Settings.

## Commands

- `pnpm install` — install deps (pnpm lockfile only; CI uses `--frozen-lockfile`).
- `pnpm dev` — rspack dev server at http://localhost:8090.
- `pnpm build` — production build into `dist/`.
- `pnpm type` — `tsc` type check.
- `pnpm lint` — oxlint over `src` and `rspack.config.ts` (not a formatter check).
- `pnpm format` — oxfmt write over the repo.
- There is no test runner or test suite. Verify changes with `pnpm type` and `pnpm lint`; run `pnpm build` for config, asset, or bundling changes. CI only builds on `v*` tags, so nothing else is checked remotely.

## Build and deployment

- `rspack.config.ts` exports `createConfig({ apiOrigin, basePath, devServer })`. Default API origin is `https://api.deepseek.com`, injected as the global `__API_ORIGIN__` (declared in `src/env.d.ts`).
- Besides `NODE_ENV` (dev vs production mode), the only environment variable the build reads is `BASE_PATH` (for subdirectory deployment). There is no dotenv loading; local `.env` values such as `WEB_ORIGIN` or `DEV_API_TARGET` have no effect on the build. GitHub Pages builds with `BASE_PATH=/dschat/demo/`.
- Conversation URLs are real paths (`/chat/<id>`); production hosting needs an SPA fallback to `index.html`. The dev server uses `historyApiFallback`.
- The build copies `README.md`, `README.zh-CN.md`, and `LICENSE` into `dist/` on purpose.
- `dist/` is generated; never edit it.
- `publicPath: 'auto'` plus the `<base>` script in `src/index.html` keep builds working from `file://` and subdirectories. Avoid introducing absolute `/` asset URLs.

## Code conventions (lint/tsconfig enforced)

- Relative imports always use an explicit `.js` extension, even for `.ts`/`.tsx` files: `import { App } from './app/App.js'`. This comes from `module: NodeNext` plus rspack's `extensionAlias`.
- Source modules use named exports; `import/no-default-export` is an error (the `export default` in `src/env.d.ts` is only the CSS-module type declaration). `rspack.config.ts` is the one runtime default export and carries a lint-disable comment.
- oxfmt style: 2 spaces, no semicolons, single quotes, `trailingComma: "es5"`, 100-column width.
- Lint forbids `console`, `any`, non-null assertions (`!`), import cycles, and requires braces on every block. TypeScript suppression comments require descriptions (`ban-ts-comment`), and hook dependencies are checked (`exhaustive-deps`).
- All UI strings go through i18n. `src/i18n/zh.ts` defines `TranslationKey`; add the same key to both `zh.ts` and `en.ts` (English is type-checked against Chinese keys). Components use `useTranslate()`; non-React modules read the current locale via `translate()`.
- Source comments and the internal docs under `src/` are Simplified Chinese. Keep new comments in Chinese; user-facing docs are English in `README.md` with a Chinese counterpart.
- CSS Modules are default imports (`import styles from './X.module.css'`), typed in `src/env.d.ts`. Plain `.css` files are global/theme styles imported for side effects (e.g. `src/app/global.css`, `src/components/markdown/markdown.css`).

## Architecture notes

- Chat state, streaming, and persistence are centralized in `src/services/chat/store.ts`. IndexedDB access is in `chat/db.ts` (`DB_VERSION` currently 11); bump it when changing stores/indexes. The upgrade only creates missing stores/indexes, with no migration of old messages.
- Sessions are message trees with branches (`parentId`/`current_message_id`); `chat/branches.ts` derives the visible list. Request/context shaping and SSE event application live in `chat/reply.ts`; see `chat/types.ts` for the message model.
- There is no router dependency. `chat/route.ts` syncs `activeId` with `/chat/<id>` using `replaceState`. The literal `chat` route segment appears both there and in the inline `<base>` script in `src/index.html`; keep the two in sync.
- History import/export is ZIP format version 3. The format, validation, and preservation rules are documented in `src/services/chat/history/README.md`; there is no legacy-format migration.
- API code is Anthropic-compatible Messages/Files (`${origin}/anthropic/v1`) plus DeepSeek extensions; SSE parsing is in `services/api/sse.ts` and `parseEvent.ts`. Speech (ASR/TTS) uses separate endpoints in `services/api/speech.ts`.
- Markdown rendering (`services/markdown`) supports GFM, KaTeX, Mermaid, and Prism highlighting; Prism language packs are lazy-loaded chunks.
