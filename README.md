# Galaxy

个人立体知识库。AI 辅助扩展知识边界，人工确认所有入图。

## 当前阶段：M5 ✅（全部里程碑完成）

### 核心能力

- **知识图谱**：D3-force + Canvas 2D 自绘图谱，节点/边/切面/附件/思考版本完整 CRUD
- **AI 投喂 → 审核 → 入图**：被动投喂 + AI 抽取候选 → 待审 Inbox → 人工确认入图
- **Deep Dive 深度对话**：SSE 流式，多 Agent 人格，对话历史管理
- **全局聊天**：跨节点 AI 对话，支持自定义 Agent 和工具调用
- **主动扫描**：Islands / Gaps / Aging 三种策略 + Cron 定时调度
- **反馈循环自进化**：置信度校准 + 策略调整 + 用户偏好学习
- **Bridge 文件协议**：跨进程 AI 通信（Qoder 联动）
- **多维切面 (Aspects)**：节点纵深视角，AI 自动提取 + 手动编辑
- **操作日志 & 撤销**：全操作记录，支持快照恢复
- **安全模式**：一键关闭所有 AI，预算控制，风控面板

### 技术栈

| 层 | 技术 |
|---|---|
| **前端** | Next.js 14 · React 18 · Tailwind CSS · Radix UI · Zustand · D3-force |
| **后端** | Next.js API Routes · SQLite (better-sqlite3) · Drizzle ORM |
| **AI** | OpenAI / Anthropic / 阿里云百炼 / 火山引擎 / DeepSeek · 结构化输出三级降级 |
| **工程** | pnpm Monorepo · TypeScript · Vitest · Zod |

### Monorepo 结构

```
galaxy/
├── apps/web/          # Next.js 14 前端应用（28 个组件，40+ API 端点）
├── packages/ai/       # AI 能力层（Provider 抽象、任务编排、反馈循环）
├── packages/db/       # 数据库层（SQLite + Drizzle ORM，15 张表）
└── packages/shared/   # 共享类型、ID 生成、slug 工具
```

## 环境要求

- Node.js >= 20.10
- pnpm >= 9
- macOS / Linux（Windows 未验证）

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 生成数据库迁移（首次或 schema 变更后）
pnpm db:generate

# 3. 启动开发服务器（自动初始化 DB + 启动 Next.js）
pnpm dev
```

打开 http://localhost:3000 。

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动开发模式（initDb + next dev） |
| `pnpm build` | 构建 Web 应用 |
| `pnpm test` | 运行所有 Vitest 测试 |
| `pnpm typecheck` | 全包 TypeScript 类型检查 |
| `pnpm db:generate` | 由 schema 生成 SQL 迁移文件 |
| `pnpm db:studio` | 打开 Drizzle Studio 浏览数据 |

## 数据位置

- 数据库：`~/galaxy/data/galaxy.db`（可通过环境变量 `GALAXY_DB_PATH` 覆盖）
- 桥接目录：`~/galaxy/bridge/`
- 数据库备份：`~/galaxy/data/backups/`

## 操作指南

- **新建节点**：右上角「新建节点」按钮，领域支持搜索已有领域或新建
- **编辑节点**：点击图谱中的节点，右侧滑出详情面板
- **删除节点**：在详情面板点击「删除」（同时删除相关边，支持撤销）
- **连线**：在源节点上**右键** → 再点击目标节点
- **搜索**：⌘K（macOS）/ Ctrl+K（其他）打开命令面板
- **投喂内容**：右下角浮动按钮，粘贴文章/笔记，AI 自动抽取知识节点
- **待审队列**：导航栏「Inbox」，逐条或批量确认/拒绝 AI 建议
- **Deep Dive**：节点详情面板内发起深度对话
- **全局聊天**：导航栏聊天入口，跨节点 AI 对话
- **设置**：API Key 配置、安全模式、操作日志查看、数据导入导出

## 里程碑

- ~~M1：骨架可运行~~ ✅
- ~~M2：被动投喂 + AI 抽取候选 + 待审 Inbox~~ ✅
- ~~M3：节点深度对话（Deep Dive）+ 文件桥接~~ ✅
- ~~M4：AI 主动扫描（每周巡检）+ 反馈循环~~ ✅
- ~~M5：节点纵深视角（多面切片）+ 演化历史~~ ✅

## 文档

- **交接文档**：[`docs/HANDOVER.md`](docs/HANDOVER.md) — 完整的架构、Schema、API、开发指南
- **能力清单**：[`docs/CAPABILITIES.md`](docs/CAPABILITIES.md) — 核心产品能力与完成进展

## 许可

[MIT License](LICENSE)
