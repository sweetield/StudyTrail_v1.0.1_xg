# StudyTrail 学习轨迹

面向班级/小组的学习任务管理平台：管理员发布带步骤的学习任务，学员按步骤推进并提交，导师评分点评，全程留痕可追溯。

运行在 [Cloudflare Workers](https://developers.cloudflare.com/workers/) 上，数据存储于 [Cloudflare D1](https://developers.cloudflare.com/d1/)，免费额度即可满足中小规模团队使用。

## 功能概览

**学员端（`/app`）**

- 任务列表：卡片 / 列表视图切换，按状态、技术方向、日期筛选与分组
- 任务详情：逐步勾选步骤、填写进度、提交审核、撤回提交
- 作品文件：上传截图、压缩包、文档等，随任务一起提交审核
- 学习日志：记录每日学习内容与时长，支持图片 / 文件附件，图表展示学习趋势
- 个人头像：在账号页上传、更换或删除头像，导航栏与列表统一显示
- Markdown 导出：勾选一个或多个任务，导出完整学习进度
- 站内通知：任务发布、审核结果、辅导员答疑等实时提醒

**管理端（`/admin`）**

- 概览看板：完成率、待审核数量、学习时长统计
- 任务管理：创建 / 编辑 / 复制 / 删除任务，可同时发布到多个班级，并排除指定学员
- 审核中心：星级评分与点评，查看完整进度与审核历史，可删除不合规作品附件
- 学员与班级：单个或批量导入学员、分班、重置密码、停用账号
- 学习日志管理：查看学员日志与附件，编辑 / 删除日志，直接回复答疑
- 进度矩阵：学员 × 任务的完成情况一览
- Markdown 导出：按任务、班级或学员导出完整学习进度
- 团队与审计：管理员成员管理，关键操作审计日志
- 数据备份：一键导出 / 导入全部数据（JSON）；文件内容与头像图片本身不包含在 JSON 中，请另行保留 R2 / KV 数据

**安全与文件存储**

- 密码使用 PBKDF2 加盐哈希，会话令牌仅以哈希形式存储
- HttpOnly + Secure Cookie，CSRF 校验，连续登录失败自动锁定
- 所有上传文件（日志附件、作品文件、头像）统一使用 AES-256-GCM 加密保存
- 文件内容默认存入 R2，也可仅绑定 KV 或通过 `FILE_STORAGE=kv` 切换到 KV
- 每日定时清理过期会话、旧通知、审计日志与未绑定的草稿附件

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19、React Router、SWR、Tailwind CSS 4 |
| 后端 | Hono（运行于 Cloudflare Workers） |
| 数据库 | Cloudflare D1（SQLite） |
| 构建 | Vite + [@cloudflare/vite-plugin](https://developers.cloudflare.com/workers/vite-plugin/) |

## 目录结构

```
├── migrations/        数据库迁移 SQL（按文件名顺序自动执行）
├── src/               前端（页面、组件、hooks）
├── worker/            后端 API
│   ├── routes/        各业务路由
│   └── lib/           会话、加密、校验、自动迁移等
└── wrangler.jsonc     Workers 配置（不含任何账号 ID 或密钥）
```

## 部署

仓库中**没有**任何需要按环境修改的内容（数据库 ID、账号 ID、密钥等）：

- **数据库自动创建**：`wrangler.jsonc` 只声明了 D1 绑定 `DB`，首次部署时 Cloudflare 会[自动创建数据库](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning)并绑定，之后的部署沿用同一个数据库。
- **存储桶自动创建**：`wrangler.jsonc` 声明了 R2 绑定 `FILES`，首次部署时自动创建存储桶，用于保存加密后的附件与头像。
- **表结构自动迁移**：Worker 收到首个请求时会自动执行 `migrations/` 中尚未执行的 SQL，部署流程中无需任何迁移步骤。
- **无需配置环境变量或密钥**：文件加密密钥会在首次上传时自动生成并保存到 D1；同一数据库的多个实例共享同一密钥。

### 文件存储：R2 或 KV（可选）

默认使用 R2 保存文件内容。如果希望改用 KV（例如账号未开通 R2）：

1. 在 `wrangler.jsonc` 中注释或删除 `r2_buckets`；
2. 执行 `npx wrangler kv namespace create FILE_KV`，把返回的 namespace id 填入 `kv_namespaces`；
3. 重新部署即可。

也可以同时绑定 R2 与 KV，通过 `vars.FILE_STORAGE = "kv"` 指定使用 KV；未设置时优先使用 R2。KV 单个 value 上限为 25 MiB，文件本身仍限制在 20 MB 以内。

如需固定加密密钥（例如多环境共享），可在 `wrangler.jsonc` 的 `vars` 中设置 `FILE_ENCRYPTION_KEY`，支持 Base64、64 位十六进制或 32 字符原始密钥。更换密钥会导致旧文件无法解密，请谨慎操作。

### 准备

1. 注册 Cloudflare 账号：[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. 将本仓库放到你自己的 GitHub / GitLab 账号下（Fork 或推送副本均可）

### 方式一：连接 Git 仓库自动部署（推荐）

推送到主分支即自动部署，不需要在本地安装任何工具。

1. 打开 [Workers 和 Pages → 创建应用](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create)，选择 **导入存储库（Import a repository）**
2. 首次使用需授权 GitHub / GitLab 访问，然后选择本仓库
3. 填写构建设置：

   | 设置项 | 值 |
   | --- | --- |
   | 项目名称 | `study-trail`（必须与 `wrangler.jsonc` 中的 `name` 一致） |
   | 构建命令 | `pnpm run build` |
   | 部署命令 | `npx wrangler deploy` |
   | 根目录 | `/`（保持默认） |

4. 点击 **部署**，等待构建完成
5. 部署成功后访问 `https://study-trail.<你的子域>.workers.dev`

之后每次推送到主分支都会自动重新部署。构建记录可在 Worker 的 **部署（Deployments）** 页查看，详见 [Workers Builds 文档](https://developers.cloudflare.com/workers/ci-cd/builds/)。

### 方式二：一键部署按钮

> 仅适用于**公开**仓库；私有仓库请使用方式一。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MyPrivateShare/StudyTrail)

点击后按页面提示登录 Cloudflare 并授权 GitHub，Cloudflare 会把仓库复制到你的账号、创建数据库并完成部署，同时自动配置好后续的推送部署。

### 方式三：本地命令行部署

需要 [Node.js 20+](https://nodejs.org/zh-cn/download) 与 [pnpm](https://pnpm.io/zh/installation)。

```bash
pnpm install
npx wrangler login     # 浏览器中授权 Cloudflare 账号
pnpm run deploy        # 构建并部署
```

> 首次通过命令行部署时，Wrangler 可能会把新建数据库的 ID 写回本地 `wrangler.jsonc`。该改动**不需要提交**，执行 `git checkout wrangler.jsonc` 还原即可，后续部署会自动沿用已绑定的数据库。
>
> 在 CI 中使用命令行部署时，可用 [API 令牌](https://dash.cloudflare.com/profile/api-tokens)（模板「编辑 Cloudflare Workers」，并追加 D1 编辑权限）代替 `wrangler login`，通过环境变量 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID` 提供。

### 首次使用

1. 访问部署后的网址，系统检测到尚无管理员时会自动进入 **初始化** 页面（`/setup`）
2. 创建第一个管理员账号
3. 在管理端创建班级、导入学员、发布任务即可开始使用

### 绑定自定义域名（可选）

进入 [Workers 和 Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) → 选择 `study-trail` → **设置 → 域和路由 → 添加 → 自定义域**，输入已托管在 Cloudflare 的域名即可，证书自动签发。详见 [自定义域文档](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

## 更新

- **方式一 / 方式二**：拉取上游更新并推送到主分支，自动部署。
- **方式三**：`git pull` 后再次执行 `pnpm run deploy`。

新版本若包含数据库变更，部署后会在首个请求时自动迁移，数据完整保留。

## 运维

| 事项 | 入口 |
| --- | --- |
| 实时日志 | [Workers 和 Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) → `study-trail` → **日志** |
| 数据库查询 | [D1 控制台](https://dash.cloudflare.com/?to=/:account/workers/d1) → 选择数据库 → **控制台** |
| 数据备份 | 管理端 **数据** 页导出 JSON；或使用 D1 自带的 [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) 恢复到 30 天内任意时间点 |
| 定时任务 | 每天北京时间 03:00 清理过期数据，可在 `wrangler.jsonc` 的 `triggers` 中调整 |

## 本地开发

```bash
pnpm install
pnpm dev               # http://localhost:3000
```

本地开发使用 Wrangler 模拟的 D1 数据库（存放于 `.wrangler/`），首次启动自动建表，无需登录 Cloudflare。

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 构建前端与 Worker |
| `pnpm preview` | 本地预览构建产物 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm cf-typegen` | 根据配置生成 Workers 类型 |

### 修改数据库结构

在 `migrations/` 中新增按序号命名的 SQL 文件（如 `0004_xxx.sql`），本地重启开发服务器、线上部署后都会自动执行。已发布的迁移文件不要再修改。
