# AGENTS.md — 给 AI 编码助手的改造指南

本文件面向被要求「部署 / 修改 / 扩展」本项目的 AI 编码代理（Kimi、Claude Code、Cursor 等）。人也可以读。

## 这是什么

自托管的团队工时与待办工作台（律师/咨询团队向）。刻意保持极简架构：

```
浏览器 (React SPA)  ──HTTP──▶  Node 零依赖服务器 (server/index.mjs)
                                    │
                                    ▼
                     data/worklog-data.json  （全部团队数据，单文件 + .bak 备份）
```

- **前端**：React 19 + TypeScript + Vite + Tailwind + shadcn/ui，页面在 `src/pages/`，状态层 `src/store/worklog.tsx`，数据模型 `src/types/index.ts`
- **后端**：`server/index.mjs`（静态文件 + SPA 回退）+ `server/worklog-api.mjs`（全部 API）。**没有任何 npm 运行时依赖**，只用 Node 内置模块（fs/http/crypto），约 400 行
- **数据**：单个 JSON 文件，原子写入（先写 .tmp 再 rename），写入前自动备份 .bak
- **认证**：成员名 + 密码（scrypt 哈希存盘），令牌存 `data/worklog-auth.json`，30 天过期；连续失败 5 次锁 10 分钟
- **权限**：管理员（`isAdmin`）可见全量；普通成员 GET 只返回自己的 entries/todos/notes，POST 只能覆盖自己的切片（服务端 `mergeInto` 强制）

## API 一览（全部挂 /api/ 前缀）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | /members | 公开 | 成员列表（脱敏）+ teamName + initialized + demoHint（设置了 DEMO_PASSWORD 时） |
| POST | /setup | 公开 | 首次初始化（创建团队 + 管理员）。仅数据为空时可用 |
| POST | /login | 公开 | 成员登录；成员无密码时为「首次登录设密码」 |
| POST | /logout | token | 吊销令牌 |
| POST | /reset-password | admin | 重置成员密码（成员下次登录重设） |
| GET | /worklog-data | token | 拉取数据（按权限切片） |
| POST | /worklog-data | token | 按条合并写入（LWW by updatedAt + 删除墓碑，防旧标签页整片覆盖；案件/成员列表有防缩水护栏） |

## 数据模型（src/types/index.ts）

- `Member`：id/name/role/color/joinedAt/isAdmin + `pw`（服务端哈希，永不下发，客户端只见 `hasPassword`）
- `Matter`（案件）：feeType fixed/hourly、fixedFee、rates（按成员费率）、memberIds（参与成员，空=全员）、budgetHours、internal（非计费）
- `TimeEntry`：date/memberId/matterId(可空=非计费)/category/description/minutes/billable
- `Todo`：四板块分类（legal/biz/ai/life）、tags（重要/紧急）、ddl、完成时生成关联 TimeEntry、participants、assignedBy
- `ScratchNote`：富文本随记
- 顶层还有 teamName / teamSubtitle / targetRate

## 改造惯例（请遵守）

1. **不要引入数据库**。单 JSON 文件是这个产品的核心承诺（数据主权、零运维）。团队规模 <50 人时完全够用
2. **不要引入后端框架**（Express/Fastify 等）。服务器保持零依赖；API 加在 `worklog-api.mjs` 的 `handle()` 里即可
3. **密码哈希、isAdmin 判定必须在服务端完成**，客户端传来的一律不信
4. **前端改动**集中在 `src/`，UI 组件用现成的 shadcn（`src/components/ui/`），别装新 UI 库
5. **所有文案保持中文为主**（目标用户是中国律师团队）；新增字段做向后兼容迁移（参考 `src/store/worklog.tsx` 的 `migrate()` 和服务端的 `normalize()`）
6. **测试**：`npm ci && npm run build` 通过 + 手动跑 `npm start` 走一遍 setup → 添加成员 → 记工时 → 导出 流程

## 常见定制需求怎么做

- **换品牌**：teamName/teamSubtitle 已可在初始化向导设置；配色在 `src/index.css` 和 Tailwind 类里的 `#1C1917` / `#FAF7F1` 等字面量
- **加导出格式**：`src/lib/exporters.ts`
- **加非计费分类**：`src/types/index.ts` 的 `NON_BILLABLE_CATEGORIES`
- **改待办板块**：`TODO_CATEGORIES`（注意同步 `guessCategoryForMatter` 的推断逻辑）
- **部署到子路径**（如 /worklog/）：`vite base` 已是 `./`，直接反代即可
- **Cherry Studio 小程序**：`src/lib/platform.ts` 有适配层，构建时注入 `VITE_API_BASE`（绝对地址）

## 部署清单（AI 代部署时照此执行）

1. 克隆 → `npm ci` → `npm run build`
2. Docker：`docker compose up -d`；裸机：`npm start`
3. 确认 `data/` 目录权限与备份策略
4. 公网必须套 HTTPS（Nginx/Caddy 反代到 7100）
5. 首次打开完成初始化向导，验证登录/添加成员/记工时/导出

## 明确不要做的事

- 不要把 `data/` 目录提交进 git（.gitignore 已排除，请勿改动这条）
- 不要在代码或文档里写死任何真实客户名/团队名
- 不要把 demo 种子（`npm run seed:demo`）跑到有真实数据的实例上
