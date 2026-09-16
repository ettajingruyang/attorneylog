# EttaLog · 团队工时日志

[English](#english) below

自托管的**团队工时与待办工作台**，为律师/咨询等专业服务团队设计，也为任何按小时工作的团队而生。

**核心卖点：你的数据就是一个 JSON 文件，部署在你自己的服务器上。** 没有第三方平台、没有账号体系、没有数据出境——备份即拷贝，迁移即搬家，不被任何平台锁定。

## 功能

- **四板块待办**：法律工作 / 事务性 / AI 与自媒体 / 个人生活；重要/紧急标签 + DDL 自动排序；未完成待办自动顺延到今天
- **打勾即记工时**：完成待办时登记实际用时，自动生成工时记录
- **案件管理**：固定费用（Cap）/ 按小时计费、按成员费率、预算工时、内部非计费项目
- **月度复盘**：按成员/案件维度的工时与计费率统计
- **小时单导出**：一键导出 docx / xlsx 小时单，用于客户结算
- **随记本**：电话记录、客户指示、临时想法
- **多人协作 + 权限**：成员只看得到自己的数据；管理员可看全员、分配待办、管理案件与成员
- **手机适配**：响应式布局，平板/手机可用

## 三种部署方式

### 方式一：Docker（推荐）

```bash
git clone <repo-url> && cd ettalog
docker compose up -d
```

打开 `http://你的服务器IP:7100/`，按向导初始化团队。数据持久化在 `./data/` 目录。

### 方式二：裸机 Node.js

要求 Node.js ≥ 18。

```bash
git clone <repo-url> && cd ettalog
npm ci
npm run build
npm start          # 默认 0.0.0.0:7100，数据在 ./data/
```

环境变量：`PORT`（默认 7100）、`HOST`（默认 0.0.0.0）、`DATA_DIR`（默认 ./data）

### 方式三：让你的 AI 部署（最省事）

把本仓库地址发给你的 AI 编码助手（Kimi / Claude Code / Cursor 等），说：

> 帮我把这个仓库部署到我的服务器上，并用 Docker 跑起来。

仓库里的 `AGENTS.md` 是为 AI 写的完整改造指南，AI 读完就能接手。

## 首次使用

1. 打开网页 → 自动进入**初始化向导**：填团队名 + 管理员姓名和密码
2. 管理员在「团队」页添加其他成员（成员无需密码，首次登录自行设置）
3. 在「案件」页录入你们的案件/项目
4. 开始记工时

## 安全建议（公网部署必读）

- 前置 Nginx/Caddy 套 **HTTPS**（律师团队尤其应当如此）
- 登录已内置：scrypt 密码哈希、连续失败 5 次锁定 10 分钟、令牌 30 天过期
- 数据目录（`./data/`）请设置好文件权限，并纳入定期备份

## Demo 数据

想先看看效果？`npm run seed:demo` 生成一套虚构成员/案件/工时的演示数据（成员密码统一为 `demo123`）。**注意会覆盖已有数据文件。**

### 搭建公开试用实例

给访客自助试看的组合拳：

```bash
npm run seed:demo                  # 虚构数据（林律师/王律师/陈助理，密码 demo123）
DEMO_PASSWORD=demo123 npm start    # 开启演示模式
```

设置了 `DEMO_PASSWORD` 后，登录页会自动显示「演示环境：任选一位成员，密码 demo123」的提示条，访客无需注册即可进入体验。生产建议再配个 cron 定期重跑 `seed:demo` 重置数据。

## 许可

MIT — 随便用，随便改。改造成你自己律所的品牌、流程、导出格式都行。

---

# English

A **self-hosted team worklog & todo workbench** built for law firms and other professional-service teams that bill by the hour.

**The point: your data is a single JSON file on your own server.** No third-party platform, no vendor lock-in. Backup = copy the file. Migration = move the file.

## Features

- **Four-bucket todos** (legal / admin / AI & content / personal) with important/urgent tags, DDL-driven auto-sorting, and automatic daily rollover of unfinished items
- **Tick-to-log**: completing a todo records actual minutes as a time entry
- **Matter management**: fixed-fee (cap) or hourly, per-member rates, budget hours, internal non-billable projects
- **Monthly review**: hours and billable-ratio stats per member/matter
- **Timesheet export** to docx / xlsx for client billing
- **Scratch notes** for calls, client instructions, and quick thoughts
- **Multi-user with permissions**: members see only their own data; the admin sees everything, assigns todos, manages matters and members
- **Mobile-friendly** responsive layout

## Deploy

**Docker (recommended):**

```bash
git clone <repo-url> && cd ettalog
docker compose up -d
```

**Bare Node.js (≥18):**

```bash
npm ci && npm run build && npm start
```

**Let your AI do it:** point your AI coding agent (Kimi / Claude Code / Cursor) at this repo and ask it to deploy — see `AGENTS.md`.

Open `http://your-server:7100/` and walk through the first-run setup wizard.

For public deployments, put HTTPS (Nginx/Caddy) in front. Auth includes scrypt password hashing, brute-force lockout (5 fails → 10 min), and 30-day token expiry.

## License

MIT
