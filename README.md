# 工作留迹

个人工作记录工具，包含项目进度、关键节点、每日记录和周报。进入应用时可以选择两套相互独立的存储：

- **本机存储**：数据保存在当前电脑的 `.local-data/`。
- **Cloudflare 云端**：数据保存在 D1，可从多台设备访问。

## 本地运行

需要 Node.js 22.13 或更高版本。本机模式不需要 GitHub 或 Cloudflare 账号。

打开两个终端：

1. 运行 `npm run worker:dev` 启动本机数据服务。
2. 运行 `npm run dev` 启动网页。
3. 打开 `http://localhost:3000`，选择“保存到本机”。

首次进入会要求在网页内创建用户名和密码。账号和记录都保存在 `.local-data/`，该目录已被 Git 忽略。

## Cloudflare D1 部署

云端模式需要一个 Cloudflare 账号，免费方案足够个人使用。

1. 登录：

   ```bash
   npx wrangler login
   ```

2. 创建数据库：

   ```bash
   npx wrangler d1 create work-trace-data
   ```

3. 把命令返回的 `database_id` 填入 `worker/wrangler.toml`，替换 `REPLACE_WITH_D1_DATABASE_ID`。

4. 初始化数据库：

   ```bash
   npx wrangler d1 migrations apply work-trace-data --remote --config worker/wrangler.toml
   ```

5. 设置不少于 32 位的会话密钥：

   ```bash
   openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET --config worker/wrangler.toml
   ```

6. 设置允许访问 API 的网页 Origin，例如 GitHub Pages 默认地址填写 `https://zhanghan0301.github.io`，不要包含仓库路径或末尾斜杠：

   ```bash
   npx wrangler secret put ALLOWED_ORIGIN --config worker/wrangler.toml
   ```

7. 发布 Worker：

   ```bash
   npm run worker:deploy
   ```

首次打开云端模式时会在网页内创建独立的云端管理员账号。密码使用 PBKDF2-SHA256 强哈希后保存到 D1，不保存明文。

## GitHub Pages

1. 在仓库 Settings → Pages 中选择 GitHub Actions。
2. 推送到 `main` 后，`Deploy GitHub Pages` 工作流会自动构建并发布。

当前工作流已经配置云端接口 `https://work-trace-api.1281311575.workers.dev`，无需再填写 GitHub Actions 变量。

构建完成后，网页中的“保存到 Cloudflare”按钮会启用。默认 `github.io` 与 `workers.dev` 部署使用带 `Secure` 和 `Partitioned` 属性的跨站会话 Cookie；也可以为网页和 Worker 配置同一主域下的自定义域名。

## 数据与安全

- 本机和云端拥有独立账号及数据，不会自动互相覆盖。
- 本机草稿与云端草稿使用不同浏览器存储键。
- Worker 校验 Origin、登录会话、Content-Type、请求体大小、路径和字段长度。
- 富文本在浏览器保存前和 Worker 入库前双重过滤。
- 云端更新使用 D1 版本号做并发检查，远端变化不会被静默覆盖。
- `SESSION_SECRET`、`.dev.vars`、`.env.local` 和 `.local-data/` 均不得提交到 Git。
