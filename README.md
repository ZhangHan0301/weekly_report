# 工作留迹

个人工作记录工具，分为两个一级模块：

- **项目**：长期记录项目状态、整体进度、关键节点和按时间追加的进展。
- **周报**：按自然周独立归档，可关联零个、一个或多个项目；支持每天填写工作记录，再一键整理生成周报，也可直接填写和修改周报正文。

前端可部署到 GitHub Pages，Cloudflare Worker 负责登录与 GitHub 私有仓库读写；本地运行则完全不依赖 GitHub。

## 本地运行

需要 Node.js 22.13 或更高版本。

本地运行不需要 GitHub，也不需要手工创建配置文件。打开两个终端：

1. 启动本地数据服务：`npm run worker:dev`。
2. 启动前端：`npm run dev`。
3. 打开 `http://localhost:3000`，直接在网页中设置用户名和密码。

本地账号和工作记录保存在项目的 `.local-data/` 目录中，该目录已被 Git 忽略。停止或重新启动程序不会丢失数据。

## Cloudflare Worker

以下配置仅在发布 Cloudflare Worker 时需要，本地运行无需填写。可以参考 `worker/.dev.vars.example`：

在 Cloudflare 中创建 Worker，并把以下值作为 Secret 或环境变量配置：

- `GITHUB_TOKEN`（仅授予目标私有仓库 Contents 读写权限）
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `ALLOWED_ORIGIN`（完整 GitHub Pages Origin，不带末尾斜杠）

会话 Cookie 使用 `SameSite=Strict`。因此正式环境需要把 GitHub Pages 和 Worker 放在同一可注册域名下，例如 `work.example.com` 与 `api.example.com`；若分别使用默认的 `github.io` 和 `workers.dev` 域名，浏览器不会在跨站 API 请求中携带 Strict/Lax Cookie。

运行 `npm run worker:deploy` 发布。不要提交 `.dev.vars`、`.env.local` 或任何令牌。

首次打开正式网站时会显示“创建管理员账号”。密码由 Worker 使用 PBKDF2-SHA256 生成强哈希后保存到私有仓库的 `data/system/auth.json`，不会保存明文。初始化完成后，这个页面会自动变为普通登录页。

## GitHub Pages

1. 将本项目推送到 GitHub。
2. 在仓库 Settings → Pages 中选择 GitHub Actions。
3. 在 Actions variables 中添加 `NEXT_PUBLIC_API_BASE`，值为 Worker 的 HTTPS 地址。
4. 推送到 `main` 后，`.github/workflows/pages.yml` 会构建并发布静态站点。

数据仓库建议保持私有且独立。Worker 会自动创建项目索引 `data/index.json`、项目详情 `data/projects/<项目 ID>.json` 和周报 `data/weekly/<周一日期>.json`；每次保存和删除都会形成正常 Git 提交。

旧版按项目存储的周报仍可读取。打开对应周次并再次保存后，会自动写入新的独立周报路径。

## 安全说明

- 登录会话使用 HMAC-SHA256 签名，签名密钥由 Worker Secret 中的 GitHub Token 派生；Cookie 带 `HttpOnly`、`Secure`、`SameSite=Strict`。
- 密码在网页首次设置，Worker 使用 PBKDF2-SHA256（600,000 次）哈希后写入私有仓库；登录按来源 IP 做基础频率限制。
- Worker 校验 Origin、会话、Content-Type、请求体大小、路径及字段长度。
- 富文本在浏览器保存前和 Worker 入库前双重过滤，只保留指定标签及文本对齐样式。
- 更新和删除必须携带 GitHub 文件 SHA；远端变化会返回冲突，不会静默覆盖。
