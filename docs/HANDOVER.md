# Galaxy — 项目交接文档

> **最后更新**：2026-05-01（含 05-01 bug 修复 + 操作日志 + 文档更新）  
> **项目定位**：个人立体知识库 — AI 辅助扩展知识边界，人工确认所有入图  
> **一句话介绍**：用户投喂内容（文本/URL/PDF）→ AI 抽取概念级知识节点与关联 → 人审校 → 知识图谱可视化

---

## 目录

1. [快速上手](#1-快速上手)
2. [Monorepo 架构总览](#2-monorepo-架构总览)
3. [技术栈与依赖版本](#3-技术栈与依赖版本)
4. [目录结构详解](#4-目录结构详解)
5. [数据库 Schema](#5-数据库-schema)
6. [API 路由完整清单](#6-api-路由完整清单)
7. [AI 系统架构](#7-ai-系统架构)
8. [前端架构](#8-前端架构)
9. [设计系统 (Clay Design System)](#9-设计系统-clay-design-system)
10. [核心业务流程](#10-核心业务流程)
11. [常见开发场景指南](#11-常见开发场景指南)
12. [已知问题与技术债务](#12-已知问题与技术债务)
13. [里程碑路线图](#13-里程碑路线图)

---

## 1. 快速上手

### 环境要求

| 依赖 | 最低版本 |
|------|---------|
| Node.js | >= 20.10 |
| pnpm | >= 9.0.0 |

### 启动步骤

```bash
# 1. 克隆仓库
git clone <repo-url> && cd galaxy

# 2. 安装依赖
pnpm install

# 3. 生成数据库迁移（首次或 schema 变更后）
pnpm db:generate

# 4. 启动开发服务器（自动初始化 DB + 启动 Next.js）
pnpm dev

# 5. 浏览器访问
open http://localhost:3000
```

### 全部命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 初始化 DB + 启动 Next.js 开发模式 |
| `pnpm build` | 构建 Web 应用 |
| `pnpm test` | 运行 Vitest 测试 |
| `pnpm test:watch` | Vitest watch 模式 |
| `pnpm typecheck` | 全包 TypeScript 类型检查 |
| `pnpm db:generate` | 由 schema 生成 SQL 迁移文件 |
| `pnpm db:studio` | 打开 Drizzle Studio 浏览数据 |

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `GALAXY_DB_PATH` | SQLite 数据库文件路径 | `~/galaxy/data/galaxy.db` |
| `GALAXY_ENCRYPTION_KEY` | API Key 加密密钥（可选） | 自动从机器指纹派生 |

> AI Provider 的 API Key 通过 Settings 页面配置，存入数据库 `settings` 表（AES-256-GCM 加密）。

---

## 2. Monorepo 架构总览

```
galaxy (root)
├── apps/
│   └── web (@galaxy/web)          ← Next.js 14 Web 应用（主入口）
├── packages/
│   ├── ai (@galaxy/ai)            ← AI 能力层（LLM 调用、任务编排）
│   ├── db (@galaxy/db)            ← 数据库层（SQLite + Drizzle ORM）
│   └── shared (@galaxy/shared)    ← 共享类型与工具函数
├── data/                          ← 运行时数据（DB 文件、Prompt 模板等）
├── docs/                          ← 文档
└── scripts/                       ← 开发脚本
```

### 包依赖关系

```
@galaxy/shared  ←── @galaxy/db  ←── @galaxy/ai
      ↑                ↑                ↑
      └────────────────┼────────────────┘
                       ↓
                  @galaxy/web
```

| 包名 | 路径 | 职责 |
|------|------|------|
| **`@galaxy/web`** | `apps/web` | Next.js 14 前端应用，图谱画布 + CRUD 界面 + API 路由 |
| **`@galaxy/ai`** | `packages/ai` | AI 能力封装：多 Provider 适配、任务编排、结构化输出、调度器 |
| **`@galaxy/db`** | `packages/db` | SQLite 数据库：schema 定义、迁移、种子数据、连接管理 |
| **`@galaxy/shared`** | `packages/shared` | 共享领域类型（`domain.ts`）、ID 生成（nanoid）、slug 工具 |

---

## 3. 技术栈与依赖版本

| 类别 | 技术 | 版本 |
|------|------|------|
| **语言** | TypeScript | ^5.4.5 |
| **前端框架** | Next.js (App Router) | 14.2.3 |
| **UI** | React | 18.3.1 |
| **样式** | Tailwind CSS | ^3.4.3 |
| **组件库** | Radix UI | 各 ^1.x/^2.x |
| **图谱可视化** | D3-force + Canvas 2D 自绘 | ^3.0.0 (d3-force) |
| **状态管理** | Zustand | ^4.5.2 |
| **命令面板** | cmdk | ^1.0.0 |
| **数据库** | SQLite (better-sqlite3) | ^11.0.0 |
| **ORM** | Drizzle ORM | ^0.30.0 |
| **AI - OpenAI** | openai SDK | ^4.50.0 |
| **AI - Anthropic** | @anthropic-ai/sdk | ^0.30.0 |
| **模板引擎** | Handlebars | ^4.7.8 |
| **校验** | Zod | ^3.23.0 |
| **测试** | Vitest | ^1.6.0 |
| **通知** | Sonner | ^1.4.41 |
| **图标** | lucide-react | ^0.378.0 |
| **内容提取** | @extractus/article-extractor / pdf-parse | ^8.0.20 / ^2.4.5 |

---

## 4. 目录结构详解

```
galaxy/
├── apps/web/                          # Next.js Web 应用
│   ├── app/
│   │   ├── page.tsx                   # 图谱主页（Cytoscape 画布）
│   │   ├── inbox/page.tsx             # 待审队列（AI 建议审核）
│   │   ├── settings/page.tsx          # 设置页面（Provider/成本/扫描/备份）
│   │   ├── layout.tsx                 # 全局布局
│   │   ├── globals.css                # Clay 设计系统 CSS 变量
│   │   ├── _components/              # 核心 UI 组件
│   │   │   ├── graph-canvas-v2.tsx     # D3-force + Canvas 2D 图谱画布
│   │   │   ├── node-detail-panel.tsx  # 节点详情面板（编辑/切面/联结/Deep Dive）
│   │   │   ├── deep-dive-dialog.tsx   # AI 深度对话弹窗
│   │   │   ├── global-chat-dialog.tsx # 全局聊天弹窗
│   │   │   ├── feed-fab.tsx           # 投喂浮动按钮
│   │   │   ├── inbox-card.tsx         # 建议卡片
│   │   │   ├── inbox-confirm-dialog.tsx # 修改后确认弹窗
│   │   │   ├── command-palette.tsx    # ⌘K 命令面板
│   │   │   ├── new-node-dialog.tsx    # 新建节点弹窗（领域可搜索下拉）
│   │   │   ├── nav-bar.tsx            # 顶部导航栏
│   │   │   ├── graph-overview.tsx     # 图谱概览面板
│   │   │   ├── graph-filter-panel.tsx # 图谱过滤面板
│   │   │   ├── graph-control-panel.tsx # 物理引擎调参面板
│   │   │   ├── graph-minimap.tsx      # 小地图
│   │   │   ├── operation-log-viewer.tsx # 操作日志弹窗（实时滚动+撤销）
│   │   │   ├── thought-diff-viewer.tsx # 思考版本差异查看器
│   │   │   ├── safety-panel.tsx       # 安全面板
│   │   │   ├── bridge-monitor.tsx     # Bridge 任务监控
│   │   │   ├── tool-call-card.tsx     # 工具调用卡片
│   │   │   └── chat/                  # 聊天子组件目录
│   │   └── api/                       # API 路由（28 个文件）
│   │       ├── nodes/                 # 节点 CRUD + aspects + sessions + summaries
│   │       ├── edges/                 # 边 CRUD + regenerate
│   │       ├── feed/                  # 内容投喂
│   │       ├── inbox/                 # 建议审核 + 批量操作
│   │       ├── deepdive/              # 深度对话 + Bridge
│   │       ├── scan/                  # 主动扫描
│   │       ├── settings/              # 设置 + 连接测试 + 成本统计
│   │       ├── data/                  # 备份/导出
│   │       ├── risk/                  # 风控面板
│   │       └── safety/               # AI 紧急停止
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts             # 前端 API Client（34 个方法）
│   │   │   ├── schemas.ts            # Zod 请求校验 Schema
│   │   │   └── ensure-db.ts          # DB 惰性初始化
│   │   └── store/
│   │       ├── graph-store.ts         # 图谱状态（Zustand）
│   │       ├── inbox-store.ts         # 待审队列状态
│   │       └── settings-store.ts      # 设置状态
│   └── components/ui/                 # shadcn/ui 基础组件
│
├── packages/ai/src/                   # AI 能力层
│   ├── index.ts                       # 统一导出入口
│   ├── providers/                     # LLM Provider 抽象层
│   │   ├── types.ts                   # 核心接口（LLMProvider, LLMRequest, LLMResponse）
│   │   ├── registry.ts               # ProviderRegistry 注册表
│   │   ├── openai.ts                  # OpenAI 适配器
│   │   ├── anthropic.ts              # Anthropic Claude 适配器
│   │   └── openai-compat.ts          # OpenAI 兼容适配器（百炼/火山/DeepSeek/自定义）
│   ├── tasks/                         # AI 任务（7 个核心任务）
│   │   ├── schemas.ts                 # Zod 数据模型
│   │   ├── extract-from-feed.ts       # 投喂抽取
│   │   ├── deep-dive.ts              # 深度对话
│   │   ├── summarize-conversation.ts  # 对话总结
│   │   ├── extract-aspects.ts         # 切面提取
│   │   ├── generate-edge-description.ts # 边描述生成
│   │   ├── scan-strategies.ts         # 扫描策略（Islands/Gaps/Aging）
│   │   └── run-scan.ts               # 扫描执行引擎
│   ├── structured-output/             # 结构化输出策略
│   │   ├── strategy.ts               # Tool Use → JSON Mode → Prompt 三级降级
│   │   └── json-repair.ts            # JSON 修复
│   ├── context/                       # 上下文构建
│   │   ├── graph-summary.ts           # 图谱概要（按 domain 分组）
│   │   ├── prompt-loader.ts           # Handlebars 模板加载器
│   │   └── aspect-templates.ts        # YAML 切面模板加载器
│   ├── bridge/                        # Bridge 文件协议（跨进程 AI 通信）
│   │   ├── protocol.ts               # 任务文件 CRUD
│   │   └── watcher.ts                # 文件系统监听器
│   ├── feedback/                      # 反馈循环模块
│   │   ├── collector.ts              # FeedbackCollector — 收集用户反馈
│   │   ├── calibrator.ts             # ConfidenceCalibrator — 置信度自校准
│   │   ├── strategy-adjuster.ts      # StrategyAdjuster — 策略动态调整
│   │   ├── personalizer.ts           # PersonalizationEngine — 用户偏好学习
│   │   └── prompt-injector.ts        # FeedbackPromptInjector — 反馈注入 Prompt
│   ├── direct-channel.ts             # 直连调用通道
│   ├── budget.ts                      # 月度预算控制
│   ├── scheduler.ts                   # Cron 定时扫描 + 每日校准/偏好学习
│   └── crypto.ts                      # AES-256-GCM 加密
│
├── packages/db/src/                   # 数据库层
│   ├── client.ts                      # 连接管理（getDb/initDb/closeDb）
│   ├── schema/                        # 15 张表的 Drizzle 定义
│   │   ├── nodes.ts                   # 知识节点
│   │   ├── edges.ts                   # 节点间关联
│   │   ├── aspects.ts                 # 节点多维切面
│   │   ├── node-thought-versions.ts   # 思考版本快照
│   │   ├── node-attachments.ts        # 节点附件
│   │   ├── suggestions.ts            # AI 建议（Inbox）
│   │   ├── feed-items.ts             # 投喂记录
│   │   ├── deep-dive.ts              # 深度对话（sessions + messages）
│   │   ├── scan-runs.ts              # 扫描运行记录
│   │   ├── ai-call-logs.ts           # AI 调用日志
│   │   ├── operation-logs.ts         # 操作日志
│   │   ├── settings.ts               # 全局设置（单行）
│   │   ├── feedback-stats.ts         # 反馈统计（按维度聚合）
│   │   └── user-preferences.ts       # 用户偏好（AI 学习结果）
│   └── drizzle/                       # 生成的 SQL 迁移文件
│
├── packages/shared/src/              # 共享包
│   ├── types/domain.ts                # 6 个领域类型 + 枚举
│   └── utils/
│       ├── id.ts                      # generateId(prefix) — nanoid
│       └── slug.ts                    # slugify() — 中英文友好
│
├── data/                              # 运行时数据
│   ├── galaxy.db                      # SQLite 主数据库
│   ├── aspects/                       # 7 个切面模板 YAML
│   ├── prompts/                       # Prompt 模板
│   │   ├── extract-from-feed.md       # 投喂抽取主模板
│   │   └── _shared/output-format.md   # 共享输出格式
│   └── summaries/                     # AI 生成的总结文件
│
└── scripts/
    └── dev.ts                         # 开发启动脚本
```

---

## 5. 数据库 Schema

数据库使用 **SQLite (better-sqlite3) + Drizzle ORM**，WAL 模式，外键约束开启。

### 5.1 `nodes` — 知识节点

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | text | **PK** | 格式：`n_{12位nanoid}` |
| `title` | text | NOT NULL | 概念名（2-10 字精炼名词） |
| `slug` | text | NOT NULL, **UNIQUE** | URL-friendly 标识 |
| `summary` | text | nullable | 概念定义 |
| `domain` | text | nullable | 领域分类 |
| `is_seed` | integer(boolean) | default `false` | 是否种子节点 |
| `status` | text | default `'active'` | `active` / `archived` |
| `node_type` | text | NOT NULL, default `'concept'` | `concept` / `claim` / `case` / `resource` |
| `channel` | text | NOT NULL, default `'light'` | `core`（核心知识） / `light`（轻量知识） |
| `internalization_status` | text | NOT NULL, default `'draft'` | `draft` / `linked` / `dialogued` / `mastered` |
| `my_thoughts` | text | nullable | 用户的个人思考笔记 |
| `last_accessed_at` | text | nullable | 最后访问时间 |
| `created_at` | text | default NOW | ISO 时间戳 |
| `updated_at` | text | default NOW | |
| `created_by` | text | default `'user'` | `user` / `ai_feed` / `ai_proactive` / `ai_deepdive` |
| `ai_metadata` | text(json) | nullable | AI 元信息 |

**索引**：`idx_nodes_title`、`idx_nodes_domain`、`uq_nodes_slug` (UNIQUE)

### 5.2 `edges` — 节点间关联

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | text | **PK** | 格式：`e_{12位nanoid}` |
| `source_node_id` | text | NOT NULL, **FK** → nodes (cascade) | 源节点 |
| `target_node_id` | text | NOT NULL, **FK** → nodes (cascade) | 目标节点 |
| `relation_type` | text | NOT NULL | `contains` / `related` / `opposes` / `instance_of` / `evolved_from` / `cites` / `evidence_for` / `evidence_against` / `refines` |
| `origin` | text | NOT NULL, default `'manual'` | `manual` / `ai_suggested` / `ai_confirmed` |
| `weight` | real | default `1.0` | 关联系数 0~1 |
| `description` | text | nullable | AI 生成的关联描述 |
| `created_at` | text | default NOW | |
| `updated_at` | text | default NOW | |
| `created_by` | text | default `'user'` | |
| `ai_metadata` | text(json) | nullable | |

**索引**：`uq_edges_triple`(source, target, relation_type UNIQUE)、`idx_edges_source`、`idx_edges_target`

### 5.3 `aspects` — 节点多维切面

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | text | **PK** | |
| `node_id` | text | NOT NULL, **FK** → nodes (cascade) | |
| `title` | text | NOT NULL | 维度标题（原 template_key 已废弃） |
| `content` | text | default `''` | 正文 |
| `source_type` | text | NOT NULL, default `'manual'` | `dialogue` / `attachment` / `manual` |
| `source_id` | text | nullable | 来源引用 ID |
| `order` | integer | default `0` | 排序 |
| `created_at` | text | default NOW | |
| `updated_at` | text | default NOW | |
| `created_by` | text | default `'user'` | |
| `ai_metadata` | text(json) | nullable | |

**索引**：`uq_aspects_node_title`(node_id, title UNIQUE)

### 5.3a `node_thought_versions` — 思考版本快照

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | text | **PK** | 格式：`d_{12位nanoid}` |
| `node_id` | text | NOT NULL, **FK** → nodes (cascade) | |
| `content` | text | NOT NULL | 快照内容 |
| `version_label` | text | nullable | 版本标签 |
| `saved_at` | text | default NOW | |

### 5.3b `node_attachments` — 节点附件

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | text | **PK** | |
| `node_id` | text | NOT NULL, **FK** → nodes (cascade) | |
| `type` | text | NOT NULL | `md` / `link` |
| `title` | text | NOT NULL | 附件标题 |
| `content_or_url` | text | NOT NULL | 内容（md 时为正文，link 时为 URL） |
| `created_at` | text | default NOW | |

### 5.4 `suggestions` — AI 建议 (Inbox)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | **PK** |
| `type` | text | `new_node` / `new_edge` / `fill_aspect` / `update_aspect` / `merge_nodes` |
| `source` | text | `feed` / `proactive_scan` / `deepdive` |
| `payload` | text(json) | 建议的具体数据 |
| `rationale` | text | AI 推理说明 |
| `confidence` | real | 置信度 0~1 |
| `status` | text | `pending` / `accepted` / `rejected` / `accepted_modified` / `expired` / `paused` |
| `decided_at` | text | 决策时间 |
| `decided_payload` | text(json) | 修改后的 payload（accept_modified 时存储） |
| `decision_note` | text | 用户决策备注 |
| `provider_id` / `model` | text | 生成该建议的 AI |
| `calibrated_confidence` | real | 校准后的置信度 |
| `feedback_processed` | integer(boolean) | 反馈是否已处理，default `false` |

### 5.5 `feed_items` — 投喂记录

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | **PK** |
| `type` | text | `text` / `url` / `file_md` / `file_pdf` |
| `raw_content` | text | 原始内容 |
| `parsed_content` | text | 解析后内容 |
| `status` | text | `processing` / `done` / `failed` |
| `suggestions_count` | integer | 生成建议数 |

### 5.6 `deep_dive_sessions` + `deep_dive_messages` — 深度对话

- **sessions**：`id`, `node_id`(FK), `agent_type`(thinker/partner/direct), `status`(active/completed/abandoned)
- **messages**：`id`, `session_id`(FK), `role`(user/ai/system), `content`

### 5.7 `scan_runs` — 主动扫描记录

记录每次扫描的 `trigger`(cron/manual)、`status`、`suggestions_count`、`cost_tokens`、`cost_usd`。

### 5.8 `ai_call_logs` — AI 调用日志

记录每次 AI 调用的 `channel`(direct/bridge)、`task`、`provider_id`、`model`、`input_tokens`、`output_tokens`、`cost_usd`、`duration_ms`、`status`。

### 5.9a `feedback_stats` — 反馈统计

按 (suggestion_type × source × strategy) 维度聚合的反馈统计，用于置信度校准和策略调整。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | **PK** |
| `dimension_key` | text | **UNIQUE**，维度组合键 |
| `suggestion_type` | text | 建议类型 |
| `source` | text | 来源 |
| `strategy` | text | 扫描策略（nullable） |
| `total_count` | integer | 总数 |
| `accepted_count` | integer | 接受数 |
| `rejected_count` | integer | 拒绝数 |
| `modified_count` | integer | 修改后接受数 |
| `avg_confidence` | real | 平均置信度 |
| `avg_accepted_confidence` | real | 被接受建议的平均置信度 |
| `avg_rejected_confidence` | real | 被拒绝建议的平均置信度 |
| `window_start` | text | 窗口起始时间 |
| `updated_at` | text | default NOW |

### 5.9b `user_preferences` — 用户偏好

AI 通过分析历史反馈学习到的用户偏好，用于个性化推荐。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | **PK** |
| `preference_key` | text | **UNIQUE**，偏好键名（如 `min_confidence_threshold`、`type_preferences`、`title_length_preference`、`relation_type_preferences`） |
| `preference_value` | text | JSON 格式的偏好值 |
| `source` | text | 来源，default `'learned'` |
| `evidence_count` | integer | 支撑该偏好的样本数 |
| `learned_at` | text | 学习时间 |
| `updated_at` | text | default NOW |

### 5.10 `settings` — 全局设置（单行表，id=1）

| 字段组 | 关键字段 |
|--------|---------|
| **AI 开关** | `enable_feed_ai`、`enable_proactive_scan`、`enable_deepdive` |
| **扫描配置** | `proactive_scan_cron`(默认 `0 3 * * *`)、`proactive_scan_strategies`、`proactive_scan_max_suggestions` |
| **Provider 配置** | `default_provider`、`default_model`、`provider_credentials`(加密JSON)、`custom_providers` |
| **预算** | `enable_monthly_budget`、`monthly_budget_usd`(默认20)、`current_month_cost_usd` |
| **Bridge** | `qoder_bridge_dir`、`bridge_timeout_minutes`(默认30) |

### 修改 Schema 的步骤

```bash
# 1. 修改 packages/db/src/schema/ 中的表定义
# 2. 生成迁移文件
pnpm db:generate
# 3. 重启开发服务器（自动执行迁移）
pnpm dev
```

---

## 6. API 路由完整清单

所有 API 统一响应格式：`{ data: T }` 或 `{ error: E }`。

### 6.1 Nodes — 节点管理

| HTTP | 路径 | 说明 |
|------|------|------|
| GET | `/api/nodes` | 列出全部节点 |
| POST | `/api/nodes` | 创建节点（title 必填） |
| GET | `/api/nodes/[id]` | 获取单个节点 |
| PATCH | `/api/nodes/[id]` | 更新节点字段 |
| DELETE | `/api/nodes/[id]` | 删除节点（级联） |
| GET | `/api/nodes/[id]/aspects` | 获取节点的切面内容 |
| POST | `/api/nodes/[id]/aspects` | 创建新切面 |
| PATCH | `/api/nodes/[id]/aspects` | 更新切面内容 |
| DELETE | `/api/nodes/[id]/aspects?aspectId=xxx` | 删除切面 |
| GET | `/api/nodes/[id]/thoughts` | 获取思考版本列表 |
| POST | `/api/nodes/[id]/thoughts` | 保存当前思考为新版本快照 |
| GET | `/api/nodes/[id]/attachments` | 获取附件列表 |
| POST | `/api/nodes/[id]/attachments` | 创建附件 |
| DELETE | `/api/nodes/[id]/attachments?attachmentId=xxx` | 删除附件 |
| GET | `/api/nodes/[id]/sessions` | 获取节点的 Deep Dive 会话列表 |
| GET | `/api/nodes/[id]/summaries` | 列出节点的 md 总结文件 |
| GET | `/api/nodes/[id]/summaries/[fileName]` | 读取单个总结文件 |

### 6.2 Edges — 边管理

| HTTP | 路径 | 说明 |
|------|------|------|
| GET | `/api/edges` | 列出全部边 |
| POST | `/api/edges` | 创建边（异步 AI 生成 description + weight） |
| DELETE | `/api/edges/[id]` | 删除边 |
| POST | `/api/edges/regenerate` | AI 重新生成所有边的描述和权重 |

### 6.3 Feed — 投喂

| HTTP | 路径 | 说明 |
|------|------|------|
| POST | `/api/feed` | 投喂内容（text/url/file_md/file_pdf），AI 抽取并生成 suggestions |

### 6.4 Inbox — 建议审核

| HTTP | 路径 | 说明 |
|------|------|------|
| GET | `/api/inbox` | 分页查询待审建议（支持 status/source/type/confidence 过滤） |
| POST | `/api/inbox/[id]/confirm` | 单条确认（accept/reject/accept_modified） |
| POST | `/api/inbox/batch` | 批量确认（前端自动按 50 条分批） |

### 6.5 Settings — 设置

| HTTP | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings` | 获取设置（API Key 脱敏） |
| PATCH | `/api/settings` | 更新设置 |
| POST | `/api/settings/test-connection` | 测试 Provider 连接 |
| GET | `/api/settings/cost-stats` | AI 调用成本统计 |

### 6.6 Deep Dive — 深度对话

| HTTP | 路径 | 说明 |
|------|------|------|
| POST | `/api/deepdive` | 创建新会话 |
| GET | `/api/deepdive/[sessionId]` | 获取会话 + 消息 |
| POST | `/api/deepdive/[sessionId]/message` | 发送消息（**SSE 流式回复**） |
| POST | `/api/deepdive/[sessionId]/complete` | 从对话提取知识建议 |
| POST | `/api/deepdive/[sessionId]/summarize` | 对话总结（feed/aspect/extract-aspects 三种模式） |
| POST/GET/DELETE | `/api/deepdive/[sessionId]/bridge` | Bridge 任务管理 |

### 6.7 Scan — 主动扫描

| HTTP | 路径 | 说明 |
|------|------|------|
| POST | `/api/scan/trigger` | 手动触发扫描 |
| GET | `/api/scan/status` | 最近 10 条扫描记录 |

### 6.8 其他

| HTTP | 路径 | 说明 |
|------|------|------|
| POST | `/api/data/backup` | 数据库备份（保留最近 14 份） |
| GET | `/api/data/export` | 导出数据（JSON/Markdown） |
| GET | `/api/risk` | 风控面板（接受率/积压/重复节点检测/校准曲线/偏好/类型趋势） |
| POST | `/api/safety/kill-all` | 一键关闭所有 AI 功能 |

---

## 7. AI 系统架构

### 7.1 模块架构

```
用户投喂 / 定时触发 / 手动操作
        │
        ▼
  DirectChannel / Scheduler
        │
        ├── checkBudget() → budget.ts（月度限额）
        │
        ▼
  ProviderRegistry.getOrThrow()
        │
        ▼
  Task 执行 → invokeStructured()
        │           └─ 策略: Tool Use → JSON Mode → Prompt+jsonrepair
        │
        ▼
  结果写入 DB → addCost() 累加消费
```

### 7.2 LLM Provider 支持

| Provider | 模型 | 接入方式 |
|----------|------|---------|
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, o3-mini | OpenAI SDK |
| **Anthropic** | claude-sonnet-4-5, claude-haiku-4-5, claude-opus-4 | Anthropic SDK |
| **百炼 (阿里云)** | qwen-max, qwen-plus, qwen-turbo, qwen3-235b-a22b | OpenAI 兼容 |
| **火山引擎** | doubao-1-5-pro-256k, doubao-1-5-lite-32k | OpenAI 兼容 |
| **DeepSeek** | deepseek-chat (V3), deepseek-reasoner (R1) | OpenAI 兼容 |
| **自定义** | 用户配置 | OpenAI 兼容 |

**新增 Provider 的方式**：

- **内置 Provider**：在 `packages/ai/src/providers/openai-compat.ts` 的 `BUILT_IN_PROVIDERS` 中添加配置
- **自定义 Provider**：通过 `ProviderRegistry.registerCustom()` 动态注册

### 7.3 AI 任务清单

| 任务 | 文件 | 用途 | 温度 |
|------|------|------|------|
| **extractFromFeed** | `extract-from-feed.ts` | 从投喂内容抽取节点/边/切面 | 0.3 |
| **buildDeepDiveSystemPrompt** | `deep-dive.ts` | 构建对话系统提示词 | — |
| **extractSuggestionsFromConversation** | `deep-dive.ts` | 从对话中提取知识建议 | 0.2 |
| **summarizeConversation** | `summarize-conversation.ts` | 对话全面总结 | 0.3 |
| **extractAspectsFromConversation** | `extract-aspects.ts` | 按切面模板归类对话内容 | 0.3 |
| **generateEdgeDescription** | `generate-edge-description.ts` | 生成两节点的关联描述和权重 | 0.4 |
| **runScan** | `run-scan.ts` | 执行完整图谱扫描 | 0.4 |

### 7.4 结构化输出三级降级

| 优先级 | 策略 | 条件 |
|--------|------|------|
| 1 | **Tool Use** | provider 支持 `toolUse` |
| 2 | **JSON Mode** | provider 支持 `structuredOutput` |
| 3 | **Prompt + jsonrepair** | 兜底方案 |

### 7.5 Prompt 模板

- **模板引擎**：Handlebars，支持 `_shared/` 下的 Partial 模板
- **模板变量**：`{{graph_summary}}`（图谱概要）、`{{feed_content}}`（投喂内容）、`{{output_format_instruction}}`（输出格式）
- **模板目录**：`data/prompts/`
- **核心原则**：节点 = 概念/名词（2-10 字），不是主题总结

### 7.6 预算控制

- 按月度滚动，通过 settings 表配置 `enable_monthly_budget` 和 `monthly_budget_usd`
- 每次 AI 调用前 `checkBudget()`，调用后 `addCost()`
- 新月份自动重置累计

### 7.7 定时扫描调度器

- `setInterval` 每 30 秒检查一次
- 支持标准 cron 五段表达式（默认 `0 3 * * *` = 每天凌晨 3 点）
- 三种扫描策略：**Islands**（孤立节点）、**Gaps**（同域无直连）、**Aging**（30 天未更新）
- **每日 04:00**：自动执行置信度重校准（`recalibrateAllPending`）
- **每日 04:30**：自动执行用户偏好学习（`learnPreferences`）

### 7.8a 反馈循环模块

```
用户 accept / reject / accept_modified
        │
        ▼
  FeedbackCollector（collector.ts）
        │── 更新 feedbackStats 聚合统计
        │── 标记 suggestion.feedback_processed = true
        │
        ▼
  ConfidenceCalibrator（calibrator.ts）
        │── 基于 feedbackStats 计算校准系数
        │── 重校准所有 pending suggestions 的 calibrated_confidence
        │
        ▼
  StrategyAdjuster（strategy-adjuster.ts）
        │── 根据各维度接受率动态调整扫描策略权重
        │
        ▼
  PersonalizationEngine（personalizer.ts）
        │── 学习四个偏好维度：
        │   ├── min_confidence_threshold（最低置信度阈值）
        │   ├── type_preferences（偏好/回避的建议类型）
        │   ├── title_length_preference（标题长度偏好）
        │   └── relation_type_preferences（关系类型偏好）
        │
        ▼
  FeedbackPromptInjector（prompt-injector.ts）
        └── 将偏好注入 AI Prompt，提升后续建议质量
```

### 7.8 Bridge 文件协议

基于文件系统的跨进程 AI 任务通信，用于与外部 Agent（如 Cursor/Claude）协作：

```
bridge/
├── pending/     # 待处理任务
├── done/        # 已完成结果
├── cancelled/   # 已取消任务
└── archive/     # 已归档任务
```

---

## 8. 前端架构

### 8.1 页面路由

| 路径 | 功能 |
|------|------|
| `/` | **图谱主页** — Cytoscape 知识图谱画布 + 节点详情面板 + 投喂 FAB + ⌘K 搜索 |
| `/inbox` | **待审队列** — AI 建议列表，支持单条/批量接受拒绝，快捷键 A/R/E |
| `/settings` | **设置** — Provider 管理、连接测试、成本统计、主动扫描配置、风险面板、数据备份、AI 紧急停止 |

### 8.2 核心组件

| 组件 | Props | 功能 |
|------|-------|------|
| `graph-canvas-v2.tsx` | nodes, edges, onSelectNode, onCreateEdge, onSelectEdge, physicsConfig, communityMap, colorMap | D3-force + Canvas 2D 自绘图谱画布，力导向布局，节点按 node_type 差异化形状（⬤/◆/▢/⬡），按 channel 差异化描边（实线/虚线），按 internalization_status 差异化描边色，edge 按 origin 差异化线型 |
| `node-detail-panel.tsx` | — (读 store) | 节点编辑、切面标签页、联结管理、Deep Dive 入口、附件管理 |
| `deep-dive-dialog.tsx` | open, onOpenChange, nodeId, nodeTitle | AI 对话弹窗，多种 Agent 人格，SSE 流式回复 |
| `global-chat-dialog.tsx` | open, onOpenChange | 全局聊天弹窗，跨节点 AI 对话，工具调用支持 |
| `feed-fab.tsx` | — | 右下角投喂按钮，支持文本/URL |
| `inbox-card.tsx` | suggestion, selected, onToggleSelect, onAccept, onReject, onEdit | 建议卡片 |
| `command-palette.tsx` | open, onOpenChange | ⌘K 全局搜索 |
| `new-node-dialog.tsx` | open, onOpenChange | 新建节点弹窗，领域字段支持搜索已有领域或新建 |
| `nav-bar.tsx` | — | 导航栏 + 未审数 badge |
| `graph-overview.tsx` | nodeCount, edgeCount, domainStats | 图谱统计概览 |
| `graph-filter-panel.tsx` | nodes | 图谱过滤面板（按领域/来源/节点类型/通道/内化状态/连线强度过滤） |
| `graph-control-panel.tsx` | — | 物理引擎调参面板（斥力/边距/衰减等） |
| `graph-minimap.tsx` | — | 小地图（缩略全图 + 视口矩形） |
| `operation-log-viewer.tsx` | open, onOpenChange | 操作日志弹窗，实时轮询刷新，支持即时撤销 |
| `thought-diff-viewer.tsx` | — | 思考版本差异查看器（diff 模式） |
| `safety-panel.tsx` | inboxBacklog, budget | 安全/风控面板 |
| `bridge-monitor.tsx` | — | Bridge 任务监控 |
| `tool-call-card.tsx` | toolCall | 工具调用结果展示卡片 |

### 8.3 Zustand Stores

#### `graph-store.ts`

| State | Action |
|-------|--------|
| `nodes`, `edges`, `selectedNodeId`, `loading`, `error` | `loadAll()`, `selectNode()`, `addNode()`, `patchNode()`, `removeNode()`, `addEdge()`, `removeEdge()` |

#### `inbox-store.ts`

| State | Action |
|-------|--------|
| `suggestions`, `total`, `page`, `loading`, `selectedIds` | `loadInbox()`, `confirmOne()`, `batchConfirm()`(每批 50 条), `toggleSelect()`, `selectAll()`, `clearSelection()` |

#### `settings-store.ts`

| State | Action |
|-------|--------|
| `settings`, `loading` | `loadSettings()`, `updateSettings()` |

#### `graph-view-store.ts`（持久化到 localStorage）

| State | Action |
|-------|--------|
| `physics`(PhysicsConfig), `labelMinZoom`, `summaryMinZoom`, `linkWidthMultiplier`, `enableCommunityColor`, `showMinimap`, `filter`(GraphFilter) | `updatePhysics()`, `updateView()`, `updateFilter()`, `resetAll()` |

`GraphFilter` 包含：`domains`、`hiddenCreators`、`nodeTypes`、`channels`、`statuses`、`weightRange`（连线强度区间 `[min, max]`）、`minConfidence`、`hideIsolated`

### 8.4 前端 API Client

`apps/web/lib/api/client.ts` 导出 `api` 对象，封装 40+ 个方法。所有 GET 请求返回 `{ data: T }`，错误时 throw Error。

关键方法：`listNodes`, `createNode`, `updateNode`, `deleteNode`, `listEdges`, `createEdge`, `deleteEdge`, `confirmNodeEdges`, `regenerateEdges`, `submitFeed`, `listInbox`, `confirmSuggestion`, `batchConfirm`, `getSettings`, `updateSettings`, `testConnection`, `getCostStats`, `createDeepDiveSession`, `sendDeepDiveMessage`, `completeDeepDive`, `summarizeConversation`, `triggerScan`, `getRiskData`, `triggerBackup`, `exportData`, `killAllAI`, `listAspects`, `createAspect`, `updateAspect`, `deleteAspect`, `listThoughtVersions`, `saveThoughtVersion`, `listAttachments`, `createAttachment`, `deleteAttachment`, `startBridgeTask`, `pollBridgeResult`, `cancelBridgeTask`

### 8.5 图谱渲染架构

图谱从 Cytoscape.js 迁移为 **D3-force + Canvas 2D 自绘**，核心模块：

| 模块 | 文件 | 职责 |
|------|------|------|
| **物理引擎** | `lib/graph/physics.ts` | D3-force 封装，`PhysicsNode`/`PhysicsLink` 接口定义，力场配置 |
| **渲染器** | `lib/graph/renderer.ts` | Canvas 2D 每帧绘制：节点形状差异化（圆/菱形/方/六边形）、边线型差异化、标签裁剪 |
| **社区检测** | `page.tsx`（内联 `useMemo`） | 按二级领域分组着色（固定颜色映射，不再使用 Louvain） |
| **画布组件** | `_components/graph-canvas-v2.tsx` | React 组件封装：zoom/pan/drag/click 交互，数据桥接 |
| **控制面板** | `_components/graph-control-panel.tsx` | 物理引擎实时调参 UI |
| **过滤面板** | `_components/graph-filter-panel.tsx` | 按领域/来源/node_type/channel/内化进度/连线强度区间过滤 |
| **小地图** | `_components/graph-minimap.tsx` | 缩略全图 + 视口矩形 |
| **状态管理** | `lib/store/graph-view-store.ts` | Zustand + localStorage 持久化 |

**节点视觉编码**：
- **形状**：concept=⬤（圆） / claim=◆（菱形） / case=▢（圆角方） / resource=⬡（六边形）
- **描边**：channel=core 实线 / channel=light 虚线
- **描边色**：按 internalization_status 差异化（draft=灰 / linked=绿 / dialogued=深绿 / mastered=墨绿）
- **填充色**：concept=#5db8a6 / claim=#d4915e / case=#7a9ec4 / resource=#a0a0a0（社区着色优先）
- **边线型**：origin=ai_suggested 虚线中灰（#9b8e7e） / 其他实线
- **边箭头**：所有边在 target 端绘制三角形箭头，表示关联方向
- **边粗细**：按 weight 映射（0.3→0.5, 0.5→1.5, 0.7→2.5, 1.0→4.0），保底 0.5px 始终可见
- **边透明度**：按 weight 映射（0.2+weight×0.5），保底 0.2 始终可见
- **Hover 卡片**：节点 hover 时显示 HTML 浮动卡片（领域标签+标题+摘要），CSS 淡入/上滑动画
- **联结面板**：节点详情联结部分按 weight 降序排列，显示联结强度数值，提供"全部确认"按钮（将 ai_suggested 边转为 manual）

---

## 9. 设计系统 (Clay Design System)

### 核心色板

| Token | 值 | 语义 |
|-------|-----|------|
| `--clay-canvas` | `#faf9f5` | 主背景（奶油白） |
| `--clay-primary` | `#cc785c` | 主色（珊瑚色） |
| `--clay-primary-active` | `#a9583e` | 主色 hover |
| `--clay-ink` | `#141413` | 标题文字 |
| `--clay-body` | `#3d3d3a` | 正文文字 |
| `--clay-muted` | `#6c6a64` | 次要文字 |
| `--clay-hairline` | `#e6dfd8` | 分割线 |
| `--clay-surface-card` | `#efe9de` | 卡片背景 |

### 品牌强调色

| Token | 值 | 用途 |
|-------|-----|------|
| `--clay-teal` | `#5db8a6` | 图谱节点 |
| `--clay-lavender` | `#b8a4ed` | 关联标签 |
| `--clay-peach` | `#ffb084` | 更新类型 |
| `--clay-ochre` | `#e8a55a` | 填充类型 |
| `--clay-mint` | `#a4d4c5` | 新节点类型 |
| `--clay-coral` | `#cc785c` | Badge/CTA |
| `--clay-pink` | `#ff4d8b` | 合并类型 |

### 排版

| 用途 | 字体 | 示例类名 |
|------|------|---------|
| 页面标题 | Cormorant Garamond (serif) | `.text-display-xl/lg/md/sm` |
| 区块标题 | Inter (sans) | `.text-title-lg/md/sm` |
| 正文 | Inter | `.text-body-md/sm` |
| 辅助 | Inter | `.text-caption` |
| 代码 | JetBrains Mono | `.text-code` |

### 间距

`--space-xxs`(4) → `--space-xs`(8) → `--space-sm`(12) → `--space-md`(16) → `--space-lg`(24) → `--space-xl`(32) → `--space-section`(96)

### 圆角

`--radius-xs`(4) → `--radius-sm`(6) → `--radius-md`(8) → `--radius-lg`(12) → `--radius-xl`(16) → `--radius-pill`(9999)

### 组件类

- **`.clay-card`**：奶油底 + 柔和投影卡片
- **`.clay-button`**：珊瑚色主按钮（40px 高度）
- **`.clay-input`**：带聚焦光晕输入框
- **`.clay-badge`**：胶囊标签
- **`.clay-tab`**：分类切换标签

---

## 10. 核心业务流程

### 10.1 投喂 → 审核 → 入图（主流程）

```
用户投喂（文本/URL/PDF）
        │
        ▼
  POST /api/feed
        │
        ├── 内容解析（URL 提取 / PDF 解析 / 原文）
        ├── 构建 Prompt（graph_summary + feed_content + output_format）
        ├── AI 调用 → extractFromFeed()
        │       └── invokeStructured() → 三级降级
        │
        ▼
  生成 suggestions（status=pending, 30 天过期）
        │
        ▼
  用户在 /inbox 审核
        │
        ├── 接受 → 创建 node/edge 实体 → 入图
        ├── 修改后接受 → 调整 title/summary 后创建
        └── 拒绝 → 仅标记状态
```

### 10.2 Deep Dive 对话

```
选中节点 → 点击"Deep Dive"
        │
        ├── 选择 Agent（Direct / Thinker / Partner）
        ├── 创建 session → buildDeepDiveSystemPrompt()
        │
        ▼
  用户 ↔ AI 多轮对话（SSE 流式）
        │
        ├── "结束并提取" → extractSuggestionsFromConversation()
        ├── "总结为投喂" → summarizeConversation() → 再投喂
        └── "提取切面" → extractAspectsFromConversation() → upsert aspects
```

### 10.3 主动扫描

```
定时触发（cron 0 3 * * *）或手动触发
        │
        ├── checkBudget()
        ├── collectTargets()
        │       ├── findIslands() — 孤立节点
        │       ├── findGaps() — 同域无直连
        │       └── findAgingNodes() — 30 天未更新
        │
        ▼
  AI 分析 → runScan() → 生成 suggestions → 进入 Inbox
```

---

## 11. 常见开发场景指南

### 新增一个 AI Provider

1. 如果是 OpenAI 兼容接口，在 `packages/ai/src/providers/openai-compat.ts` 的 `BUILT_IN_PROVIDERS` 中添加配置
2. 如果是全新协议，创建新的 Provider 类实现 `LLMProvider` 接口
3. 在 `apps/web/app/settings/page.tsx` 中添加 Provider 的 UI 配置项

### 新增一个 AI 任务

1. 在 `packages/ai/src/tasks/` 下创建新文件
2. 定义 Zod Schema（输入输出）
3. 使用 `invokeStructured()` 调用 LLM
4. 在 `packages/ai/src/index.ts` 中导出
5. 在 API 路由中调用

### 新增数据库表

1. 在 `packages/db/src/schema/` 下创建新文件
2. 在 `packages/db/src/schema/index.ts` 中导出
3. 在 `packages/shared/src/types/domain.ts` 中添加对应的 TypeScript 类型
4. 运行 `pnpm db:generate` 生成迁移
5. 重启 `pnpm dev`

### 新增 API 路由

1. 在 `apps/web/app/api/` 下创建目录和 `route.ts`
2. 如需请求校验，在 `apps/web/lib/api/schemas.ts` 中添加 Zod Schema
3. 路由开头调用 `ensureDb()` 初始化数据库
4. 在 `apps/web/lib/api/client.ts` 中添加前端调用方法

### 新增前端页面

1. 在 `apps/web/app/` 下创建 `<route>/page.tsx`
2. 如需状态管理，在 `apps/web/lib/store/` 下创建 Zustand store
3. 在 `apps/web/app/_components/nav-bar.tsx` 中添加导航入口

### 新增 Prompt 模板

1. 在 `data/prompts/` 下创建 `.md` 文件
2. 使用 Handlebars 语法（`{{变量}}`、`{{> partial名}}`）
3. 共享 Partial 放在 `data/prompts/_shared/` 下
4. 在 AI 任务中使用 `loadPromptTemplate()` 加载

### 修改节点定义规则

- 节点抽取规则在 `data/prompts/extract-from-feed.md` 中
- 输出格式在 `data/prompts/_shared/output-format.md` 中
- Zod Schema 限制在 `packages/ai/src/tasks/schemas.ts` 中（title max 20 字）

---

## 12. 已知问题与技术债务

| 问题 | 文件 | 说明 |
|------|------|------|
| **Settings 页面体积大** | `apps/web/app/settings/page.tsx` (1200+ 行) | 包含 Provider 管理 + 成本统计 + 风险面板 + 扫描配置 + 备份 + 操作日志入口，应拆分为子组件 |
| **Node Detail 体积大** | `apps/web/app/_components/node-detail-panel.tsx` (1000+ 行) | 包含编辑 + 切面 + 联结 + Deep Dive 入口 + 附件，应拆分 |
| **Deep Dive Dialog 体积大** | `apps/web/app/_components/deep-dive-dialog.tsx` (500+ 行) | 包含对话 + SSE + 总结 + Bridge，应拆分 |
| **无单元测试覆盖** | — | AI 任务和 API 路由缺少测试 |
| **snake_case 命名** | 全局 | 有意为之（与 SQLite 列名一致），但在 TypeScript 中不符合惯例 |
| **Error 边界缺失** | 前端全局 | 缺少 React Error Boundary，组件异常会白屏 |

### 已修复的历史问题

| 问题 | 修复位置 | 说明 |
|------|----------|------|
| **slug 冲突导致创建失败** | `apps/web/app/api/nodes/route.ts` | 已删除节点的 slug 残留，再创建同名节点时 UNIQUE 冲突 409。**修复**：slug 冲突时自动追加 ID 后缀 |
| **DELETE 节点字段名错误** | `apps/web/app/api/nodes/[id]/route.ts` | DELETE handler 中用了不存在的 `edges.source_id` / `edges.target_id`，应为 `edges.source_node_id` / `edges.target_node_id`。导致删除节点时关联边快照为空，撤销后边无法恢复。**已修复** |
| **ai_suggested 边不可见** | `apps/web/lib/graph/renderer.ts` | 边线宽公式 `0.6 + (weight - 0.7) * 11` 在 weight < 0.7 时接近 0，边几乎不可见。**修复**：保底 0.5px，颜色从 #c4b5a0 调深至 #9b8e7e |

---

## 13. 里程碑路线图

| 里程碑 | 状态 | 内容 |
|--------|------|------|
| **M1 — 骨架可运行** | ✅ 已完成 | 节点/边手动 CRUD、Cytoscape 图谱可视化、基本页面布局 |
| **M2 — Feed + Inbox** | ✅ 已完成 | 内容投喂 → AI 抽取 → 待审队列 → 入图闭环 |
| **M3 — Deep Dive + Bridge** | ✅ 已完成 | 深度对话 + Bridge 文件协议 + bridge-consumer.ts 脚本 + Bridge UI（bridge-task-panel.tsx） |
| **M2a — 基座改造** | ✅ 已完成 | nodes 扩展 node_type/channel/internalization_status/my_thoughts/last_accessed_at；edges 扩展 origin + 3 新 relation_type；aspects 废弃 template_key 改为 title+source_type；新增 node_thought_versions/node_attachments 表；AI 抽取层全链路适配；图谱渲染差异化（形状/颜色/线型） |
| **M4 — 主动扫描** | ✅ 已完成 | 扫描策略 + Cron 调度 + 反馈收集 + 风控面板增强 |
| **M5 — 反馈循环 + 自进化** | ✅ 已完成 | FeedbackCollector + ConfidenceCalibrator + StrategyAdjuster + PersonalizationEngine + FeedbackPromptInjector；feedback_stats / user_preferences 表；suggestions 新增 calibrated_confidence / feedback_processed 字段；风控 API 增加校准曲线/偏好/类型趋势；confirm route 支持 update_aspect / merge_nodes |

---

## 附录：共享类型速查

### 领域类型 (`@galaxy/shared`)

```typescript
// 核心实体
type Node = { id, title, slug, summary?, domain?, is_seed, status, node_type, channel, internalization_status, my_thoughts?, last_accessed_at?, created_by, ... }
type Edge = { id, source_node_id, target_node_id, relation_type, origin, weight, description?, created_by, ... }
type Aspect = { id, node_id, title, content, source_type, source_id?, order, created_by, ... }
type ThoughtVersion = { id, node_id, content, version_label?, saved_at }
type Attachment = { id, node_id, type, title, content_or_url, created_at }
type Suggestion = { id, type, source, payload, rationale?, confidence, status, ... }
type FeedItem = { id, type, raw_content?, parsed_content?, status, ... }
type AiCallLog = { id, channel, task, provider_id?, model?, input_tokens, output_tokens, cost_usd, ... }

// 枚举
type NodeType = 'concept' | 'claim' | 'case' | 'resource'
type Channel = 'core' | 'light'
type InternalizationStatus = 'draft' | 'linked' | 'dialogued' | 'mastered'
type EdgeOrigin = 'manual' | 'ai_suggested' | 'ai_confirmed'
type AspectSourceType = 'dialogue' | 'attachment' | 'manual'
type RelationType = 'contains' | 'related' | 'opposes' | 'instance_of' | 'evolved_from' | 'cites' | 'evidence_for' | 'evidence_against' | 'refines'
type SuggestionType = 'new_node' | 'new_edge' | 'fill_aspect' | 'update_aspect' | 'merge_nodes'
type SuggestionSource = 'feed' | 'proactive_scan' | 'deepdive'
type Author = 'user' | 'ai_feed' | 'ai_proactive' | 'ai_deepdive'
```

### 工具函数

```typescript
generateId(prefix: string): string  // 生成 '{prefix}_{12位nanoid}'
nowIso(): string                     // ISO-8601 UTC 时间
slugify(input: string): string       // 中英文 URL-safe slug
```
