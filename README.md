# 工作留迹

个人工作记录工具：周报、日报、项目便签和项目管理。前端部署到 GitHub Pages，Cloudflare Worker 负责登录与 GitHub 私有仓库读写。

## 本地运行

需要 Node.js 22.13 或更高版本。

1. 复制 `.env.example` 为 `.env.local`，填写本地 Worker 地址。
2. 复制 `worker/.dev.vars.example` 为 `worker/.dev.vars`，填写开发环境秘密变量。
3. 生成密码哈希：`npm run hash-password -- "你的高强度密码"`。
4. 启动 Worker：`npm run worker:dev`。
5. 启动前端：`npm run dev`。

## Cloudflare Worker

在 Cloudflare 中创建 Worker，并把以下值作为 Secret 或环境变量配置：

- `APP_USERNAME`
- `APP_PASSWORD_HASH`
- `SESSION_SECRET`（至少 32 个随机字符）
- `GITHUB_TOKEN`（仅授予目标私有仓库 Contents 读写权限）
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `ALLOWED_ORIGIN`（完整 GitHub Pages Origin，不带末尾斜杠）

会话 Cookie 使用 `SameSite=Strict`。因此正式环境需要把 GitHub Pages 和 Worker 放在同一可注册域名下，例如 `work.example.com` 与 `api.example.com`；若分别使用默认的 `github.io` 和 `workers.dev` 域名，浏览器不会在跨站 API 请求中携带 Strict/Lax Cookie。

运行 `npm run worker:deploy` 发布。不要提交 `.dev.vars`、`.env.local` 或任何令牌。

## GitHub Pages

1. 将本项目推送到 GitHub。
2. 在仓库 Settings → Pages 中选择 GitHub Actions。
3. 在 Actions variables 中添加 `NEXT_PUBLIC_API_BASE`，值为 Worker 的 HTTPS 地址。
4. 推送到 `main` 后，`.github/workflows/pages.yml` 会构建并发布静态站点。

数据仓库建议保持私有且独立。Worker 会自动创建 `data/index.json` 以及 `weekly`、`daily`、`notes` 下的 JSON 文件；每次保存和删除都会形成正常 Git 提交。

## 安全说明

- 登录会话使用 HMAC-SHA256 签名，Cookie 带 `HttpOnly`、`Secure`、`SameSite=Strict`。
- 密码使用 PBKDF2-SHA256（600,000 次）哈希；登录按来源 IP 做基础频率限制。
- Worker 校验 Origin、会话、Content-Type、请求体大小、路径及字段长度。
- 富文本在浏览器保存前和 Worker 入库前双重过滤，只保留指定标签及文本对齐样式。
- 更新和删除必须携带 GitHub 文件 SHA；远端变化会返回冲突，不会静默覆盖。
