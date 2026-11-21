/** 登录/改密密文允许的最大明文字节数，与后端 RSA_CONFIG.maxPlaintextBytes 保持一致 */
export const MAX_AUTH_PLAINTEXT_BYTES = 190

/** payload 超出长度上限；UI 按 key 映射成本地化文案 */
export class AuthPayloadError extends Error {
  readonly code = 'PAYLOAD_TOO_LONG'

  constructor(
    readonly actualBytes: number,
    readonly limit: number = MAX_AUTH_PLAINTEXT_BYTES
  ) {
    super(`Auth payload is ${actualBytes} bytes, limit is ${limit}`)
    this.name = 'AuthPayloadError'
  }
}

const encoder = new TextEncoder()

export const countUtf8Bytes = (value: string): number => encoder.encode(value).length

/**
 * 后端下发的是 OpenSSL 风格摘要名（`sha256`），WebCrypto 需要 `SHA-256`。
 * 兼容 `SHA256`、`SHA-1` 等写法；缺省按 RSA-OAEP-SHA256 处理。
 */
export const normalizeOaepHash = (raw?: string): string => {
  const digits = String(raw ?? '').replace(/\D/g, '')
  switch (digits) {
    case '1':
      return 'SHA-1'
    case '384':
      return 'SHA-384'
    case '512':
      return 'SHA-512'
    case '256':
    default:
      return 'SHA-256'
  }
}

const assertWithinLimit = (payload: string, limit: number): string => {
  const bytes = countUtf8Bytes(payload)
  if (bytes > limit) {
    throw new AuthPayloadError(bytes, limit)
  }
  return payload
}

/**
 * 登录明文：`v1\n<username 的 UTF-8 字节数>\n<username><password>`。
 * 中文、emoji 都按 UTF-8 字节计算，和后端逐字节一致。
 */
export const encodeLoginPayload = (
  username: string,
  password: string,
  limit: number = MAX_AUTH_PLAINTEXT_BYTES
): string => {
  const usernameBytes = countUtf8Bytes(username)
  return assertWithinLimit(`v1\n${usernameBytes}\n${username}${password}`, limit)
}

/**
 * 改密明文：`v2\n<ulen>\n<username><olen>\n<oldPassword><newPassword>`。
 * 旧、新密码在同一条密文里，两个变长字段都用长度前缀，解析无歧义。
 */
export const encodeChangePasswordPayload = (
  username: string,
  oldPassword: string,
  newPassword: string,
  limit: number = MAX_AUTH_PLAINTEXT_BYTES
): string => {
  const usernameBytes = countUtf8Bytes(username)
  const oldBytes = countUtf8Bytes(oldPassword)
  return assertWithinLimit(
    `v2\n${usernameBytes}\n${username}${oldBytes}\n${oldPassword}${newPassword}`,
    limit
  )
}

const base64FromBytes = (bytes: Uint8Array): string => {
  let binary = ''
  // 分块避免 String.fromCharCode 的参数数量上限
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

/** PEM 只保留 Base64 内容；兼容带换行和头尾标记的公钥 */
const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '')
  if (!body) {
    throw new Error('Public key is empty')
  }
  const binary = atob(body)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return buffer
}

/** WebCrypto 在非安全上下文不可用；localhost 属于安全上下文 */
export const isWebCryptoAvailable = (): boolean =>
  typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'

/**
 * 使用 RSA-OAEP 加密 UTF-8 明文，返回标准 Base64。
 * 摘要由后端 /auth/public-key 的 oaepHash 决定，默认 SHA-256。
 * 不用 JSEncrypt：它的 OAEP 填充按 UTF-16 码元截断，中文/emoji 会被破坏。
 */
export const encryptAuthPayload = async (
  publicKeyPem: string,
  payload: string,
  oaepHash: string = 'SHA-256'
): Promise<string> => {
  if (!isWebCryptoAvailable()) {
    throw new Error('WebCrypto is not available')
  }
  const key = await crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(publicKeyPem),
    { name: 'RSA-OAEP', hash: oaepHash },
    false,
    ['encrypt']
  )
  const bytes = encoder.encode(payload)
  const buffer = new ArrayBuffer(bytes.length)
  new Uint8Array(buffer).set(bytes)
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, buffer)
  return base64FromBytes(new Uint8Array(encrypted))
}
