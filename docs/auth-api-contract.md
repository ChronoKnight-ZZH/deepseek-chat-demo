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

| code | HTTP | 含义 |
| --- | --- | --- |
| `INVALID_CREDENTIALS` | 401 | 账号或密码错误 |
| `INVALID_INPUT` | 400 | 输入无效 |
| `TOKEN_MISSING` | 401 | 缺少凭证 |
| `TOKEN_INVALID` | 401 | 凭证无效 |
| `TOKEN_EXPIRED` | 401 | 凭证已过期 |
| `ACCOUNT_LOCKED` | 403 | 账号已被锁定 |
| `TOO_MANY_ATTEMPTS` | 429 | 尝试过于频繁 |
| `AUTH_BUSY` | 429 | 服务繁忙，请稍后重试 |
| `SESSION_WRITE_FAILED` | 503 | 会话写入失败 |
| `SESSION_STORE_UNAVAILABLE` | 503 | 会话存储不可用 |
| `INTERNAL` | 500 | 服务器内部错误 |

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

| 状态 | 前端行为 |
| --- | --- |
| 启动 | 从 `sessionStorage` 恢复会话；`expiresAt` 已过期则视为未登录 |
| 登录 401 | 统一提示“账号或密码错误” |
| 登录 429 | 读取 `Retry-After` 或响应体 `retryAfter`，倒计时结束前禁用提交 |
| 登录 403 `ACCOUNT_LOCKED` | 提示账号已锁定 |
| 登录 503 / 网络错误 | 提示服务暂不可用，保留输入 |
| 任意受保护请求 401 | 单飞处理，清除本地会话并切到登录页 |
| 登出 | 尽力调用后端，本地始终清除会话 |
| 改密成功 | 清除本地会话，提示“密码已修改，请重新登录” |
| 改密 503 `SESSION_WRITE_FAILED` | 提示“密码可能已修改但会话撤销失败”，要求用户退出后重新登录确认 |

## 4. 聊天代理（下一阶段，占位）

聊天代理与本地 IndexedDB 双写使用以下约定，后端未就绪前前端不切换：

- `POST /api/runs`：`{ sessionId, input, attachments, options }` → `{ runId }`
- `GET /api/runs/:runId/events`：SSE，事件带 `id: <seq>`；断线用 `Last-Event-ID` 续传
- `POST /api/runs/:runId/stop`：停止生成
- 前端按 `seq` 去重，Redis Stream 保留窗口外返回 `409 RUN_EXPIRED`
- 附件由服务端对象存储保存，前端只发送本地附件 ID/类型/元数据
- 受保护请求统一携带 `Authorization: Bearer <token>`
