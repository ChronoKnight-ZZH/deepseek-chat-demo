# 认证接口契约（与 auth-demo 后端一致）

本契约对应当前实际运行的 `auth-demo` 后端（`D:\aksa\aska\github\auth-demo`）。
前端只接入登录所需的两步：

1. `GET /auth/public-key`
2. `POST /auth/login`

本期**不调用** `/auth/me`。登录后前端从响应体拿到 Opaque Bearer Token，
放在 `sessionStorage`，关闭标签页即失效。

> 早期冻结稿里的 `httpOnly Cookie + CSRF + keyId` 方案目前后端尚未实现，
> 不在本次接入范围内；本文以实际后端为准。

## 1. 通用约定

### 1.1 同源与传输

- 生产环境由同一 Nginx 反代 `/auth`；开发环境由 rspack devServer 代理到
  `http://127.0.0.1:3000`。
- 认证请求使用 `credentials: 'same-origin'`、`cache: 'no-store'`。
- 认证响应不得被缓存：`Cache-Control: no-store`。
- 认证方式：`Authorization: Bearer <token>`。

### 1.2 加密

- 算法：`RSA-OAEP`，OAEP 摘要由 `/auth/public-key` 的 `oaepHash` 决定，
  当前为 `sha256`（前端归一化为 WebCrypto 的 `SHA-256`）。
- 公钥格式：SPKI PEM。
- 登录 payload（UTF-8，长度前缀协议）：

  ```text
  "v1\n" + byteLength(username) + "\n" + username + password
  ```

  `byteLength(username)` 是 username 的 UTF-8 字节数，不是字符数。

- 改密 payload（UTF-8，长度前缀协议）：

  ```text
  "v2\n" + byteLength(username) + "\n" + username +
  byteLength(oldPassword) + "\n" + oldPassword + newPassword
  ```

- 整个 payload 的 UTF-8 字节数必须 `<= maxPlaintextBytes`（当前 190）。
- 加密结果使用标准 Base64，不带 PEM 头。
- 前端必须使用 WebCrypto，不能用 JSEncrypt：后者按 UTF-16 码元处理，
  中文和 emoji 会被破坏。

### 1.3 错误响应

后端错误体为扁平结构：

```json
{
  "code": "INVALID_CREDENTIALS",
  "message": "账号或密码错误"
}
```

- `retryAfter` 可选，单位秒；也可能通过响应头 `Retry-After`
  （秒数或 HTTP 日期）返回。
- 401 的账号不存在与密码错误返回完全相同的响应体。
- 503 不得返回 401。

稳定错误码：

| code                        | HTTP | 含义                                  |
| --------------------------- | ---- | ------------------------------------- |
| `INVALID_CREDENTIALS`       | 401  | 账号或密码错误                        |
| `INVALID_INPUT`             | 400  | 输入无效                              |
| `TOKEN_MISSING`             | 401  | 缺少凭证                              |
| `TOKEN_INVALID`             | 401  | 凭证无效                              |
| `TOKEN_EXPIRED`             | 401  | 凭证已过期                            |
| `ACCOUNT_LOCKED`            | 403  | 账号已被锁定                          |
| `TOO_MANY_ATTEMPTS`         | 429  | 尝试过于频繁                          |
| `AUTH_BUSY`                 | 429  | 服务繁忙，请稍后重试                  |
| `SESSION_WRITE_FAILED`      | 503  | 会话写入失败                          |
| `SESSION_STORE_UNAVAILABLE` | 503  | 会话存储不可用                        |
| `FILE_TOKEN_INVALID`        | 403  | 文件票据非法、被篡改或已过期          |
| `FILE_ACCESS_DENIED`        | 404  | 文件/会话越权或已删除（与不存在统一） |
| `FILES_DISABLED`            | 503  | 服务端未启用原件存储                  |
| `INTERNAL`                  | 500  | 服务器内部错误                        |

## 2. 接口

### 2.1 `GET /auth/public-key`

响应 `200`：

```json
{
  "publicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
  "algorithm": "RSA-OAEP",
  "oaepHash": "sha256",
  "maxPlaintextBytes": 190
}
```

- 前端缓存公钥与 `maxPlaintextBytes`，登录前重新读取一次。
- 该接口没有 `keyId`；登录请求也不携带 `keyId`。
  密钥轮换后，旧公钥加密的请求会以统一 401 失败，前端不做自动重试。

### 2.2 `POST /auth/login`

请求：

```json
{
  "encrypted": "base64..."
}
```

响应 `200`：

```json
{
  "token": "opaque-token",
  "expiresAt": 1760000000000
}
```

- `token` 是不透明字符串，前端不解码。
- `expiresAt` 为 epoch 毫秒，表示会话绝对过期时间；缺失或为 0 时前端不自行判定过期。
- 错误码：`INVALID_CREDENTIALS`、`INVALID_INPUT`、`TOO_MANY_ATTEMPTS`、
  `AUTH_BUSY`、`ACCOUNT_LOCKED`、`SESSION_WRITE_FAILED`、
  `SESSION_STORE_UNAVAILABLE`。

### 2.3 `POST /auth/logout`

- 请求头：`Authorization: Bearer <token>`
- 成功：`200 { "ok": true }`
- 幂等：Token 已失效时仍按成功处理。
- 前端即使请求失败也清除本地登录状态。

### 2.4 `POST /auth/change-password`

请求：

```json
{
  "encrypted": "base64..."
}
```

- 密文内容是 §1.2 的 `v2` 改密 payload。
- 成功：`200 { "credentialVersion": 2 }`
- 成功后后端递增 `credential_version`，该用户全部旧 Token 立即失效。
- 前端收到成功后直接回登录页。
- 错误码：`INVALID_CREDENTIALS`（旧密码错误）、`INVALID_INPUT`、
  `SESSION_WRITE_FAILED`、`ACCOUNT_LOCKED`、`TOKEN_INVALID`。

### 2.5 `GET /auth/me`（本期不使用）

后端保留该接口用于凭证验证 Demo：

```json
{ "userId": 1 }
```

前端登录流程不调用它，因此无法在启动时发现服务端已撤销的 Token。
撤销与锁定要等下一次受保护请求返回 401/403 时才能感知。

## 3. 前端处理矩阵

| 状态                            | 前端行为                                                       |
| ------------------------------- | -------------------------------------------------------------- |
| 启动                            | 从 `sessionStorage` 恢复会话；`expiresAt` 已过期则视为未登录   |
| 登录 401                        | 统一提示“账号或密码错误”                                       |
| 登录 429                        | 读取 `Retry-After` 或响应体 `retryAfter`，倒计时结束前禁用提交 |
| 登录 403 `ACCOUNT_LOCKED`       | 提示账号已锁定                                                 |
| 登录 503 / 网络错误             | 提示服务暂不可用，保留输入                                     |
| 任意受保护请求 401              | 单飞处理，清除本地会话并切到登录页                             |
| 登出                            | 尽力调用后端，本地始终清除会话                                 |
| 改密成功                        | 清除本地会话，提示“密码已修改，请重新登录”                     |
| 改密 503 `SESSION_WRITE_FAILED` | 提示“密码可能已修改但会话撤销失败”，要求用户退出后重新登录确认 |

## 4. 聊天 / 文件 / 语音 BFF

浏览器不再直连 DeepSeek，所有上游请求都经过同源 BFF；`UPSTREAM_API_KEY` 只存在服务端。

### 4.1 `POST /v1/chat/stream`

请求头：

```text
Authorization: Bearer <token>
Content-Type: application/json
Accept: text/event-stream
X-Request-Id: <8-64 位 [A-Za-z0-9_-]>
```

请求体为 Anthropic 兼容 Messages 请求（`model`、`messages`、`system`、`thinking`、
`tools`、`safety_check`、`title` 等）。

响应为 SSE：

```text
event: relay_meta
data: {"requestId":"...","cursor":0,"resumed":false,"cached":false}

id: 1
event: message_start
data: {...}

id: 2
event: content_block_delta
data: {...}

event: relay_end
data: {"requestId":"...","status":"done","finishReason":"end_turn","code":null}
```

- 内容帧带单调递增 `id`；`relay_meta` / `relay_end` 不带 `id`。
- 首帧之前失败返回普通 HTTP 状态码；已开始推流后失败用 `relay_end` 的 `code`。
- 停止后 `relay_end.status = "error"`，`code = "ABORTED"`。

### 4.2 `GET /v1/chat/stream?requestId=&cursor=`

断线续推。也可以改用 `Last-Event-ID` 请求头。只读缓冲，不再打上游。

### 4.3 `POST /v1/chat/stop`

```json
{ "requestId": "..." }
```

只允许停止当前用户自己的流；返回 `{ "ok": true, "stopped": true|false }`。

### 4.4 `POST /v1/files` / `DELETE /v1/files/:fileId`

- `POST`：multipart 原样转发到上游 Files API；服务端注入 Key 与
  `anthropic-beta: files-api-2025-04-14`。
- `DELETE`：删除上游文件。
- 单文件上限 64MB。
- 这是**对话上下文**所需的上游副本；跨设备可读的服务端归档见 §4.5。

### 4.5 附件原件归档

`POST /v1/files/originals`

- `Authorization: Bearer <token>`，请求体就是文件字节（不是 multipart）。
- `X-File-Name` / `X-File-Mime` 为 `encodeURIComponent` 后的值；MIME 最终以文件头嗅探为准。
- 成功 `201`：

  ```json
  {
    "fileId": "uuid",
    "id": "uuid",
    "sha256": "64 位 hex",
    "size": 12345,
    "mime": "image/png",
    "name": "图片.png",
    "isImage": true
  }
  ```

- 会话消息的 `files[]` 增加 `storageId`（即这里的 `fileId`），随会话 JSON 一起保存。
- 单文件默认 64 MiB；超限 `413 PAYLOAD_TOO_LARGE`。

`GET /v1/files/originals/:fileId/url?sessionId=`

- 要求 Bearer；文件与会话必须属于当前用户，否则统一 `404 FILE_ACCESS_DENIED`。
- 成功：

  ```json
  {
    "urls": { "t": "ticket", "p": "ticket", "r": "ticket" },
    "expiresAt": 1760000000000,
    "mime": "image/png",
    "name": "图片.png",
    "isImage": true
  }
  ```

- `p` = 图片内联、`r` = 下载、`t` = 预留缩略图（当前回退为原图）。
- 票据默认 30 分钟，不写入会话 JSON；前端只在内存缓存，过期后重签一次。

`GET /v1/files/content?file_id=&state=&ty=`

- **不需要** `Authorization`：`<img src>` 无法携带 Bearer，`state` 票据就是能力凭据。
- 服务端仍会回查文件归属与会话存活；删除会话后立即 `404`。
- 图片内联返回原始 MIME + `inline`；其他文件统一 `application/octet-stream` +
  `attachment`，并带 `nosniff` / `CSP: sandbox`。
- 支持 `Range`（206）与 `ETag` / `If-None-Match`（304）。

`DELETE /v1/files/originals/:fileId`

- 仅软删除元数据；物理 blob 由后续 GC 任务回收。

前端策略：图片优先读本地 IndexedDB 原件；本地缺失且消息带 `storageId` 时，
用上述接口换短期地址显示/下载，避免浏览器保存任何上游 Key。

### 4.6 `POST /v1/tools/asr` / `POST /v1/tools/tts`

- ASR：multipart 原样转发，上限 8MB。
- TTS：JSON 请求，二进制音频流原样返回。
- 两者都要求 Bearer Token，不再接受浏览器 API Key。

### 4.7 错误映射

| 场景                | BFF 返回                    |
| ------------------- | --------------------------- |
| 未登录 / Token 失效 | `401 TOKEN_*`               |
| 上游 401/403        | `502 UPSTREAM_REJECTED`     |
| 上游 429            | `429 UPSTREAM_RATE_LIMITED` |
| 上游 5xx / 网络错误 | `502 UPSTREAM_ERROR`        |
| 上游超时            | `504 UPSTREAM_TIMEOUT`      |
| 请求体过大          | `413 PAYLOAD_TOO_LARGE`     |

### 4.8 会话持久化

`chat_sessions` 表以 JSON 保存整条会话（消息、分支、版本、思考块、工具块、引用、
错误信息），会话按 `user_id` 隔离：

- `GET /v1/sessions`：摘要列表，按 `updated_at` 倒序
- `GET /v1/sessions?full=1`：全部消息，供搜索/导出
- `GET /v1/sessions/:id`：单条会话
- `POST /v1/sessions` / `PUT /v1/sessions/:id`：upsert
- `PATCH /v1/sessions/:id`：重命名
- `DELETE /v1/sessions/:id` / `DELETE /v1/sessions`：软删除 / 清空

前端以服务端为准，IndexedDB 只作为本地缓存。浏览器端不再提供历史导入，
历史只能由云端 CLI 导入。

### 4.9 下一阶段

- 历史 ZIP 的云端 CLI 导入
- 服务端缩略图、物理 blob GC、病毒扫描
