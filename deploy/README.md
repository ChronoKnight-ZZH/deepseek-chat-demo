# chat-demo 部署文件

| 文件 | 用途 |
| --- | --- |
| `nginx-chat.conf` | `chat.shunkai-dg.cn` 静态站点：SPA 回退、`/static/` 长缓存、CSP/HSTS |

完整上线步骤（域名、证书、后端、备份、验收、回滚）见
`auth-demo/deploy/DEPLOY.md`。

构建：

```bash
npm ci
npm run build          # 生产包默认 chat. → api. 分域直连
```

产物在 `dist/`，部署到 `/srv/chat-demo/dist`。如果改成同源反代，构建前设置
`APP_ENV=production BFF_BASE=/v1 AUTH_BASE=/auth`，并调整 CSP 的 `connect-src`。
