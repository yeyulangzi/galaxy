---
title: Galaxy · 立体知识图谱 · 设计规约
created: 2026-04-26
last_verified: 2026-04-26
expires: 永久（核心愿景文档，迭代时增量更新）
owner: 鹏哥
tags: [Galaxy, 知识图谱, AI, HitL, Knowledge Management]
status: 有效
---

# Galaxy · 立体知识图谱 · 设计规约

> **一句话定义**：Galaxy 是一个本地运行的、AI 辅助生长的个人立体知识库。它把知识表达为「网状图谱 + 节点纵深」，AI 主动+被动地提出扩展建议，所有内容入库前都需要你的人工确认。

---

## 0. 文档导航

- [1. 项目愿景与核心概念](#1-项目愿景与核心概念)
- [2. 系统架构](#2-系统架构)
- [3. 数据模型](#3-数据模型)
- [4. 核心用户流程](#4-核心用户流程)
- [5. AI 集成方案](#5-ai-集成方案)
- [6. 风险控制](#6-风险控制)
- [7. 项目结构与技术细节](#7-项目结构与技术细节)
- [8. 里程碑与交付节奏](#8-里程碑与交付节奏)
- [附录 A. 已确认的核心决策](#附录-a-已确认的核心决策)
- [附录 B. 不在 MVP 范围（明确边界）](#附录-b-不在-mvp-范围明确边界)
- [附录 C. 与现有 Agent 资产的集成](#附录-c-与现有-agent-资产的集成)

---

## 1. 项目愿景与核心概念

### 1.1 项目名

**Galaxy（星系）**

隐喻：知识如星系，节点是星，关联是引力，纵深是恒星内部。这套隐喻支撑命令行工具命名（`galaxy`、`gx add`）、目录结构（`~/galaxy/`）和未来的产品宣传语。

### 1.2 三大设计原则

1. **永不绕过 HitL**：任何 AI 产物都不会自动落库，必须经过 Inbox（待审队列）或 Deep Dive（节点深度对话）收尾确认。
2. **图谱即真理源**：所有数据以图谱（节点 + 边 + 视角）为唯一存储，无并行的 markdown 笔记体系，避免双写不一致。
3. **AI 可关停**：主动扫描、深度对话、被动建议三者各有独立开关；最坏情况下系统仍可作为纯手动知识图谱使用。

### 1.3 产品语言表

| 术语 | 英文 | 定义 |
|---|---|---|
| **节点** | Node | 知识图谱上的一个概念（如"前置仓"、"Transformer"） |
| **关联** | Edge | 两个节点之间的关系（包含/对立/案例/引用/演化自/...） |
| **视角** | Aspect | 节点的一个切面（定义/历史/争议/案例/我的思考/演化时间线/...） |
| **视角模板** | Aspect Template | 视角的类型定义（决定该视角的字段、AI prompt） |
| **种子节点** | Seed Node | 用户手动建的根节点，定义图谱主干（如"产品方法论"） |
| **投喂** | Feed | 把外部素材（粘贴文本/拖拽文件/URL）丢给系统的动作 |
| **建议** | Suggestion | AI 产出的"待入库"内容（新增节点/新增关联/补全视角内容） |
| **待审队列** | Inbox | 所有未确认建议的列表，是 HitL 的默认入口 |
| **确认** | Confirm | 用户对建议的动作：接受/拒绝/修改后接受 |
| **深度对话** | Deep Dive | 在节点详情页召唤 AI 进入对话式协作的模式 |
| **主动扫描** | Proactive Scan | 后台定时跑的 AI 任务，主动发现图谱中"缺失/可扩展"的部分 |

---

## 2. 系统架构

### 2.1 四层架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  L1 表现层 (Browser)                                          │
│  ─ Cytoscape 图谱 │ 节点详情侧栏 │ Inbox │ Deep Dive 对话框  │
└──────────────────▲──────────────────────────────────────────┘
                   │ HTTP / SSE
┌──────────────────┴──────────────────────────────────────────┐
│  L2 应用层 (Next.js API Routes)                              │
│  ─ /api/nodes  /api/edges  /api/aspects                      │
│  ─ /api/inbox  /api/deepdive  /api/feed  /api/scan           │
└──────────────────▲──────────────────────────────────────────┘
                   │ TypeScript 调用
        ┌──────────┴──────────┐
        ▼                     ▼
┌────────────────┐   ┌──────────────────────────────────────┐
│  L3 数据层      │   │  L4 AI 编排层                          │
│  SQLite        │   │  ┌────────────────────────────────┐  │
│  Drizzle ORM   │   │  │ 轻量直连：多 Provider 抽象       │  │
│  galaxy.db     │   │  └────────────────────────────────┘  │
│                │   │  ┌────────────────────────────────┐  │
│                │   │  │ 深度桥接：文件协议 → Qoder Agent │  │
│                │   │  └────────────────────────────────┘  │
│                │   │  ┌────────────────────────────────┐  │
│                │   │  │ 主动扫描：node-cron 定时任务     │  │
│                │   │  └────────────────────────────────┘  │
└────────────────┘   └──────────────────────────────────────┘
```

### 2.2 各层职责

#### L1 表现层
- **图谱画布**：Cytoscape.js，自定义布局（force-directed + 主题分区），节点支持点击/拖拽/搜索
- **节点详情侧栏**：右侧滑出，标签页切换不同视角（Aspect Tabs）
- **Inbox 待审中心**：顶部入口，显示待审计数 badge，列表 + 批量操作
- **Deep Dive 对话框**：节点详情页召唤的对话面板，流式输出 AI 响应（SSE）
- **投喂入口**：全局浮动按钮（FAB），支持粘贴/拖拽

#### L2 应用层（Next.js API Routes）

| 路由 | 方法 | 职责 |
|---|---|---|
| `/api/nodes` | GET/POST/PATCH/DELETE | 节点 CRUD |
| `/api/edges` | GET/POST/DELETE | 关联 CRUD |
| `/api/aspects` | GET/POST/PATCH | 视角内容 CRUD |
| `/api/aspect-templates` | GET | 视角模板列表（YAML 加载） |
| `/api/inbox` | GET | 待审建议列表（支持过滤、分页） |
| `/api/inbox/:id/confirm` | POST | 确认建议（接受/拒绝/修改后接受） |
| `/api/inbox/batch` | POST | 批量确认 |
| `/api/feed` | POST | 投喂内容（文本/URL/文件） |
| `/api/deepdive/:nodeId` | POST (SSE) | 启动节点深度对话 |
| `/api/deepdive/:sessionId/message` | POST (SSE) | 对话续写 |
| `/api/scan/trigger` | POST | 手动触发主动扫描 |
| `/api/scan/status` | GET | 扫描任务状态 |
| `/api/settings` | GET/PATCH | 全局开关（AI 启用、扫描频率、API key） |

#### L3 数据层
- **SQLite**：单文件 `~/galaxy/data/galaxy.db`，零运维
- **Drizzle ORM**：TypeScript schema 即文档，迁移脚本可追溯
- **配置文件**：`~/galaxy/data/aspects/*.yaml`（视角模板，支持热加载）
- **桥接目录**：`~/galaxy/bridge/qoder-tasks/{pending,processing,done,cancelled,archive}/`

#### L4 AI 编排层

三条通道，各司其职：

| 通道 | 触发场景 | 实现方式 | 延迟 | 用户感知 |
|---|---|---|---|---|
| **轻量直连** | 投喂抽取、Inbox 内的快速建议生成 | 多 Provider 抽象 + 结构化输出 | 2-30s | 同步等待 + loading |
| **深度桥接** | Deep Dive 对话模式 | 文件协议（pending → done） + Qoder Agent | 30s-数分钟 | 异步通知，可继续做其他事 |
| **主动扫描** | 定时任务（默认每日 03:00） | node-cron 触发，调用轻量直连分析图谱缺口 | 后台 | 早上打开看到新建议 |

### 2.3 关键架构决策

1. **AI 输出 ≠ 落库**：所有三条通道的产物都先进 Inbox，由用户 confirm 才写入主表
2. **桥接目录模式**：深度通道不直接调 Qoder API（无公开 HTTP API），而是用文件系统作为消息队列，简单可靠且**任何 AI 编程工具都能介入**（未来可换 Cursor/Cline）
3. **流式响应**：Deep Dive 用 SSE 流式输出，避免长等待
4. **可降级运行**：AI 服务不可用时（API 故障/网络断/key 失效），系统仍可完整使用手动建节点/连边/写视角

### 2.4 典型数据流

**场景 1：投喂一篇文章**
```
浏览器 [粘贴文本/URL]
  → POST /api/feed
  → AI 编排层（轻量直连）：抽取候选概念、关联、视角内容
  → 写入 inbox 表（status=pending）
  → 浏览器 Inbox badge +N
```

**场景 2：节点深度扩展（Bridge 模式）**
```
浏览器 [点击节点 → 召唤 AI 深度扩展 → 选 thinker]
  → POST /api/deepdive/:nodeId
  → 写入 bridge/qoder-tasks/pending/{taskId}.md（含节点上下文 + 用户 prompt）
  → SSE 保持连接，前端显示"等待 Agent 接管…"
  → 用户在 Qoder 端打开任务文件，与 thinker 对话
  → Agent 把对话结论写入 bridge/qoder-tasks/done/{taskId}.json
  → 监听器读到 done，推送到 SSE → 前端显示提案
  → 用户最终确认 → 写入 inbox 或直接落库
```

**场景 3：主动扫描**
```
node-cron [每日 03:00 触发]
  → /api/scan/trigger
  → 读取整个图谱（节点+边+视角统计）
  → AI 编排层（轻量直连）：分析 ⌈孤岛节点 / 视角空缺 / 关联缺失⌉
  → 生成建议（受配额限制，每次最多 N 条）
  → 写入 inbox 表，标记 source=proactive_scan
  → 早上你打开页面：Inbox badge 显示新建议
```

---

## 3. 数据模型

### 3.1 ER 关系图（文字版）

```
┌──────────┐       ┌──────────┐       ┌──────────┐
│  Node    │──┐ ┌──│   Edge   │       │  Aspect  │
└────┬─────┘  └─┴──└──────────┘       └────┬─────┘
     │ 1:N                            N:1   │
     └──────────────────┬───────────────────┘
                        │
              ┌─────────┴─────────┐
              │  AspectTemplate   │
              │  (YAML 文件)       │
              └───────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Suggestion  │      │  FeedItem    │      │  ScanRun     │
└──────────────┘      └──────────────┘      └──────────────┘

┌──────────────────┐      ┌──────────────────┐
│  DeepDiveSession │──┐ ┌─│  DeepDiveMessage │
└──────────────────┘      └──────────────────┘

┌──────────────┐  ┌────────────────┐  ┌──────────────────┐
│  Settings    │  │  AICallLogs    │  │  OperationLogs   │
└──────────────┘  └────────────────┘  └──────────────────┘
```

### 3.2 主表 Schema

#### `nodes` — 节点

```ts
{
  id: uuid (PK)
  title: text (NOT NULL, indexed)
  slug: text (UNIQUE)
  summary: text                           // ≤200 字
  domain: text (indexed)                  // 主题分区
  is_seed: boolean (default false)
  status: enum('active','archived')
  created_at: timestamp
  updated_at: timestamp
  created_by: enum('user','ai_feed','ai_proactive','ai_deepdive')
  ai_metadata: json                       // 来源 suggestion_id / model / prompt 摘要
}
```

#### `edges` — 关联

```ts
{
  id: uuid (PK)
  source_node_id: uuid (FK -> nodes.id)
  target_node_id: uuid (FK -> nodes.id)
  relation_type: enum                     // contains/related/opposes/instance_of/evolved_from/cites
  weight: real (default 1.0)              // 关联强度，0-1
  description: text
  created_at, updated_at, created_by, ai_metadata
  
  UNIQUE(source_node_id, target_node_id, relation_type)
}
```

预定义 relation_type（可在 YAML 配置扩展）：

| 类型 | 语义 | 视觉 |
|---|---|---|
| `contains` | A 包含 B（父子层级） | 实线箭头 |
| `related` | A 与 B 相关（弱关联） | 虚线 |
| `opposes` | A 对立于 B | 红色双向 |
| `instance_of` | A 是 B 的实例 | 点线 |
| `evolved_from` | A 由 B 演化而来 | 时间箭头 |
| `cites` | A 引用 B（案例/出处） | 灰色虚线 |

#### `aspects` — 视角内容

```ts
{
  id: uuid (PK)
  node_id: uuid (FK -> nodes.id, indexed)
  template_key: text                      // 对应 AspectTemplate.key
  title: text                             // 显示标题
  content: text                           // markdown 正文
  order: int                              // 标签顺序
  created_at, updated_at, created_by, ai_metadata
  
  UNIQUE(node_id, template_key)
}
```

#### `aspect_templates` — 视角模板（YAML 文件，不入库）

```yaml
# data/aspects/definition.yaml
key: definition
label: "📖 定义"
order: 1
required: true
ai_prompt: |
  请为「{node.title}」提供一句话定义和 3-5 句详细说明。
  上下文：{node.summary}, 所属领域：{node.domain}
  风格：客观、准确、避免循环定义。
ui_hint: "用一句话说清这是什么"
```

**MVP 内置 7 个视角模板**：
- `definition` 定义
- `history` 历史
- `controversy` 争议
- `key_players` 关键玩家
- `cases` 案例
- `my_thoughts` 我的思考
- `timeline` 演化时间线

#### `suggestions` — 待审建议（Inbox 核心表）

```ts
{
  id: uuid (PK)
  type: enum                              // 见下方 SuggestionType
  source: enum('feed','proactive_scan','deepdive')
  source_ref_id: uuid                     // FeedItem / ScanRun / DeepDiveSession 的 id
  
  payload: json                           // 按 type 不同结构不同
  
  rationale: text                         // AI 给出的"为什么建议"
  confidence: real                        // 0-1，AI 自评置信度
  
  status: enum('pending','accepted','rejected','accepted_modified','expired','paused')
  decided_at: timestamp
  decided_payload: json                   // 用户修改后的最终版
  decision_note: text                     // 拒绝/修改的原因
  
  created_at: timestamp
  expires_at: timestamp                   // 默认 30 天
  
  // Provider 标识（Section 5 多 Provider 设计）
  provider_id: text
  model: text
}
```

**SuggestionType 与 payload 结构**：

| type | payload 字段 | 含义 |
|---|---|---|
| `new_node` | `{title, summary, domain, suggested_edges:[{target, relation_type}]}` | 新增节点 + 关联 |
| `new_edge` | `{source_id, target_id, relation_type, description}` | 在已有节点间新增关联 |
| `fill_aspect` | `{node_id, template_key, content}` | 为已有节点的某视角填充内容 |
| `update_aspect` | `{aspect_id, new_content, diff_summary}` | 更新已有视角内容 |
| `merge_nodes` | `{primary_id, duplicate_id, merged_payload}` | 检测到重复节点的合并建议 |

#### `feed_items` — 投喂记录

```ts
{
  id: uuid (PK)
  type: enum('text','url','file_md','file_pdf')
  raw_content: text
  file_path: text
  source_url: text
  status: enum('processing','done','failed')
  error_message: text
  suggestions_count: int
  created_at: timestamp
}
```

#### `scan_runs` — 主动扫描批次

```ts
{
  id: uuid (PK)
  trigger: enum('cron','manual')
  status: enum('running','done','failed')
  started_at, finished_at: timestamp
  
  scope: json                             // {domains:[], node_ids:[], strategy:'islands'|'gaps'|'aging'}
  
  suggestions_count: int
  cost_tokens: int
  cost_usd: real
  
  acceptance_rate: real                   // 延迟计算
  
  error_message: text
  
  // Provider 标识
  provider_id: text
  model: text
}
```

**三种扫描策略**：
- `islands` — 找孤岛节点（无边或边极少），建议新关联
- `gaps` — 找视角缺失（required=true 但未填充），建议补内容
- `aging` — 找老化内容（last_verified > 6 月），建议更新

#### `deep_dive_sessions` 与 `deep_dive_messages`

```ts
deep_dive_sessions {
  id: uuid (PK)
  node_id: uuid (FK)
  agent_type: enum('thinker','partner','direct')
  bridge_task_path: text                  // agent_type != 'direct' 时
  status: enum('active','completed','abandoned')
  created_at, updated_at: timestamp
  final_suggestion_ids: json
  
  // Provider 标识（agent_type='direct' 时）
  provider_id: text
  model: text
}

deep_dive_messages {
  id: uuid (PK)
  session_id: uuid (FK)
  role: enum('user','ai','system')
  content: text
  created_at: timestamp
}
```

#### `settings` — 全局配置（单例）

```ts
{
  id: 1 (固定)
  
  // AI 开关
  enable_feed_ai: boolean (default true)
  enable_proactive_scan: boolean (default false)   // 默认关
  enable_deepdive: boolean (default true)
  
  // 主动扫描配置
  proactive_scan_cron: text (default '0 3 * * *')
  proactive_scan_max_suggestions: int (default 10)
  proactive_scan_strategies: json (default '["islands","gaps"]')
  
  // 多 Provider 配置（Section 5）
  default_provider: text                  // 'anthropic' | 'openai' | 'bailian' | ...
  default_model: text
  provider_credentials: json              // {anthropic:{api_key,base_url?}, ...} 加密
  task_provider_overrides: json           // {extract_from_feed:{provider,model}, ...}
  custom_providers: json                  // 自定义 OpenAI 兼容端点列表
  
  // 桥接配置
  qoder_bridge_dir: text (default '~/galaxy/bridge/qoder-tasks')
  bridge_timeout_minutes: int (default 30)
  
  // 风险控制（Section 6）
  enable_monthly_budget: boolean (default false)
  monthly_budget_usd: real (default 20.0)
  enable_acceptance_alert: boolean (default true)
  enable_auto_accept_high_confidence: boolean (default false)
  inbox_soft_limit: int (default 100)
  
  // 反馈学习
  collect_decision_notes: boolean (default true)
  
  updated_at: timestamp
}
```

#### `ai_call_logs` — AI 调用日志

```ts
{
  id: uuid (PK)
  channel: enum('direct','bridge')
  task: string                            // 'extract_from_feed' | 'scan_islands' | ...
  provider_id: text
  model: text
  base_url: text
  prompt_template: string
  context_summary: text                   // 不存全部 prompt
  input_tokens, output_tokens: int
  cost_usd: real
  duration_ms: int
  status: enum('success','failed','timeout')
  error_message: text
  created_at: timestamp
}
```

#### `operation_logs` — 操作日志（破坏性操作可撤销）

```ts
{
  id: uuid (PK)
  operation: enum('delete_node','merge_nodes','batch_reject','bulk_delete','...')
  affected_ids: json                      // 受影响的实体 id 数组
  payload_snapshot: json                  // 操作前的数据快照（用于撤销）
  user_note: text
  is_undone: boolean (default false)
  undone_at: timestamp
  created_at: timestamp
}
```

### 3.3 关键设计决策

1. **创建来源全程可追溯**：每个节点/边/视角都记录 `created_by`，便于事后审计
2. **Suggestion 不可变 + 决策快照**：原 `payload` 保留，用户修改产生 `decided_payload`，**形成训练数据**
3. **Aspect 软约束**：`UNIQUE(node_id, template_key)` 保证不重复，但允许任意视角缺失
4. **Edge 单向存储 + 视觉双向**：所有边在 DB 里都是单向，UI 渲染时根据 `relation_type` 决定显示方向
5. **Suggestion 有过期机制**：默认 30 天 → `expired`，避免 Inbox 无限堆积
6. **Settings 单例**：所有配置一个表，避免多配置混乱
7. **成本字段全程可见**：每次 AI 调用记录 token 数和美元成本

---

## 4. 核心用户流程

### 4.1 流程总览

```
4 个核心 + 1 个辅助：
  ① 投喂流程（Feed）           — 把外部素材丢进来
  ② 待审流程（Inbox）          — 处理 AI 建议（HitL 默认入口）
  ③ 深度对话流程（Deep Dive）   — 节点级 AI 协作
  ④ 主动扫描流程（Proactive）   — 后台跑，早上看建议
  ⑤ 手动建图（Manual）         — AI 不可用/不想用时的兜底
```

### 4.2 投喂流程（Feed）

**详细步骤**：
1. 用户点 FAB → 弹出投喂面板（粘贴框 / 拖拽区 / URL 输入）
2. POST `/api/feed`，立即创建 `feed_items` 记录（status=processing）
3. 后端调 AI 编排层（轻量直连），prompt 包含：投喂内容 + 当前图谱概要 + 视角模板列表
4. AI 返回结构化 JSON：`{new_nodes:[], new_edges:[], fill_aspects:[]}`
5. 后端逐条写入 `suggestions`（status=pending, source=feed）
6. 前端 SSE 收到完成通知 → Inbox badge +N → toast「✅ 抽取出 N 条建议」

**关键设计**：
- **不直接落库**：哪怕 AI 100% 确信也走 Inbox
- **附原文链路**：每条 suggestion 关联回 `feed_items`
- **批量去重**：AI prompt 中明确"相似度 >0.85 的标记为 `merge_nodes` 类型"

### 4.3 待审流程（Inbox）— HitL 默认入口

```
┌─────────────────────────────────────────────────────────────────┐
│  Inbox 顶栏：[全部 23] [来自投喂 12] [主动扫描 8] [对话 3]       │
│  操作栏：[全选] [批量接受] [批量拒绝] [按类型筛选 ▼]              │
├─────────────────────────────────────────────────────────────────┤
│  ☐ 🆕 新增节点 │ "前置仓"  [📍Anthropic / sonnet-4-5]            │
│       理由：在《即时零售底层逻辑》一文中频繁出现                    │
│       建议关联：[即时零售→包含→前置仓]                           │
│       置信度：0.92 │ 来源：投喂 #42                             │
│       [✅ 接受] [✏️ 修改后接受] [❌ 拒绝] [🔍 看原文]              │
└─────────────────────────────────────────────────────────────────┘
```

**详细交互**：
1. **进入方式**：顶部导航 `📥 Inbox (23)` badge
2. **筛选**：按 source / type / 置信度
3. **单条操作**：✅ 接受 / ✏️ 修改后接受 / ❌ 拒绝 / 🔍 看原文
4. **批量操作**：勾选 + 一键处理；置信度阈值批量
5. **键盘快捷键**：`J/K` 上下、`A` 接受、`R` 拒绝、`E` 编辑、`O` 看原文

### 4.4 深度对话流程（Deep Dive）

**详细步骤**：
1. **触发**：节点详情页右上角「🤖 深度扩展」按钮
2. **Agent 选择**：
   - 🧠 **thinker**（桥接 Qoder）— 思辨、批判性分析
   - 💼 **产品合伙人**（桥接 Qoder）— 产品/商业视角
   - ⚡ **直接问 Claude/...**（轻量直连）— 快速、不依赖特定人设
3. **桥接模式**：
   - 后端写文件 `bridge/qoder-tasks/pending/{taskId}.md`
   - UI 提示「请打开 Qoder 找到该任务，与 Agent 对话」
   - Agent 写 `bridge/qoder-tasks/done/{taskId}.json`
   - 后端 chokidar 监听 → SSE 推送 → 前端显示提案
4. **直连模式**：标准 SSE 流式对话框
5. **收尾确认**：对话结束 → 创建 `suggestions`（source=deepdive）→ 跳转 Inbox 做最终确认

### 4.5 主动扫描流程（Proactive Scan）

```
node-cron (每日 03:00)
  → 检查 enable_proactive_scan 开关
  → 选择策略（轮询：islands→gaps→aging）
  → 抽取扫描视野（受 scope 限制）
  → 调 AI（受 max_suggestions 上限）
  → 写入 suggestions（source=proactive_scan）
  → 写入 scan_runs（含成本、策略）
```

**风险控制**（在 Section 6 详述）：默认关闭、配额上限、策略可单独开关、成本透明、质量反馈循环。

### 4.6 手动建图流程（Manual）— 兜底路径

- 图谱画布右键「新建节点」→ 弹表单 → 直接落库（不走 Inbox）
- 节点详情页「编辑视角」→ 直接修改 → 直接落库
- 两节点拖拽连线 → 选 relation_type → 直接落库
- 用户手动操作 100% 不经过 Inbox（这是用户决策，无需再 confirm）
- 但 `created_by='user'` 仍然记录

---

## 5. AI 集成方案

### 5.1 三条通道总览

```
① 轻量直连（DirectChannel）
   用途：投喂抽取、主动扫描、Deep Dive 直连模式
   实现：多 Provider 抽象 + 结构化输出

② 桥接通道（BridgeChannel）
   用途：Deep Dive 中走 thinker / 产品合伙人
   实现：文件系统消息队列（pending/ → done/）

③ 调度器（Scheduler）
   用途：主动扫描的定时触发
   实现：node-cron + 策略选择 + 配额控制
```

### 5.2 多 Provider 抽象

**LLMProvider 接口**：

```typescript
export interface LLMProvider {
  readonly id: string                    // 'anthropic' | 'openai' | 'bailian' | 'volcengine' | 'deepseek' | 'custom'
  readonly displayName: string
  readonly supportedModels: ModelInfo[]
  
  invoke(req: LLMRequest): Promise<LLMResponse>
  invokeStream(req: LLMRequest): AsyncIterable<LLMStreamChunk>
  
  capabilities: {
    structured_output: boolean
    tool_use: boolean
    streaming: boolean
    max_context_tokens: number
  }
  
  estimateCost(usage: TokenUsage, model: string): number
}
```

**MVP 内置 6 家 Provider**：

| Provider | 内置模型选项 | 协议 | 默认 baseURL |
|---|---|---|---|
| **Anthropic** | claude-sonnet-4-5, claude-opus-4-5, claude-haiku-4-5 | 原生 SDK | https://api.anthropic.com |
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-5, gpt-5-mini | OpenAI SDK | https://api.openai.com/v1 |
| **阿里云百炼** | qwen-max, qwen-plus, qwen-turbo, qwen3-max | OpenAI 兼容端点 | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| **火山引擎** | doubao-1-5-pro, doubao-1-5-lite, deepseek-r1（火山托管） | OpenAI 兼容 | https://ark.cn-beijing.volces.com/api/v3 |
| **DeepSeek** | deepseek-chat, deepseek-reasoner | OpenAI 兼容 | https://api.deepseek.com/v1 |
| **Custom OpenAI 兼容** | 用户自定义 | OpenAI 兼容 | 用户提供 |

所有 Provider 的 baseURL 均允许用户在 Settings 覆盖（应对私有部署、代理、变更）。

**自定义 Provider 覆盖范围**：Moonshot、智谱、零一万物、Together、Groq、本地 vllm/ollama 等所有 OpenAI 兼容服务。

### 5.3 结构化输出策略

**优先级顺序**（按 capabilities 自动选择）：
1. **原生 Tool Use / Function Call** → 直接拿到结构化对象（Anthropic、OpenAI、百炼、火山、DeepSeek）
2. **JSON Mode** → 强制返回 JSON 字符串，解析
3. **Prompt 工程兜底** → prompt 强约束 + jsonrepair 修复

**所有任务的输出 schema 用 Zod 定义**：

```typescript
const FeedExtractionSchema = z.object({
  new_nodes: z.array(z.object({
    title: z.string().max(50),
    summary: z.string().max(200),
    domain: z.string(),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
    suggested_edges: z.array(z.object({
      target_node_id: z.string().nullable(),
      target_title: z.string().nullable(),
      relation_type: z.enum(['contains', 'related', ...]),
    })),
  })),
  new_edges: z.array(/* ... */),
  fill_aspects: z.array(/* ... */),
})
```

### 5.4 Prompt 模板系统

**模板格式**：Markdown + Handlebars 占位符 `{{variable}}`

**目录结构**：
```
data/prompts/
├── extract-from-feed.md
├── scan-islands.md
├── scan-gaps.md
├── scan-aging.md
├── deepdive-direct.md
└── _shared/
    ├── output-format.md       # 按 provider 自动注入
    ├── graph-context.md
    └── style-guide.md
```

**热加载**：chokidar 监听 `.md` 文件变化，运行时重新读取，无需重启。

**模板示例**：

```markdown
<!-- data/prompts/extract-from-feed.md -->

# 任务：从投喂内容中抽取候选概念

## 上下文
当前图谱已有节点（按领域分组）：
{{graph_summary}}

可用视角模板：
{{aspect_templates}}

## 输入
{{feed_content}}

## 你的任务
分析上述输入，识别可作为知识节点的候选概念...

{{!-- 由系统按 provider 自动注入 --}}
{{output_format_instruction}}
```

### 5.5 上下文注入策略

| 任务 | 注入的上下文 | 估算 token |
|---|---|---|
| 投喂抽取 | 节点标题清单（按 domain 分组）+ 视角模板列表 | 2-5k |
| 主动扫描-islands | 孤岛节点的完整信息 + 同 domain 邻居节点摘要 | 3-8k |
| 主动扫描-gaps | 目标节点完整信息 + 视角模板定义 | 1-3k |
| Deep Dive 直连 | 目标节点完整信息 + 1 跳邻居 + 历史对话 | 5-15k |

### 5.6 桥接通道协议

**任务文件（输入）**：

```
~/galaxy/bridge/qoder-tasks/pending/{taskId}.md

---
task_id: abc-123-def
task_type: deepdive
agent_target: thinker          # thinker | partner
created_at: 2026-04-26T22:48:00+08:00
node_id: node-xxx
session_id: session-yyy
expected_output: ~/galaxy/bridge/qoder-tasks/done/abc-123-def.json
output_schema: |
  {
    "suggestions": [
      { "type": "new_node" | "new_edge" | "fill_aspect" | "update_aspect",
        "payload": { ... },
        "rationale": "string",
        "confidence": 0-1 }
    ],
    "summary": "对话核心结论的一句话总结"
  }
---

# 用户希望深度扩展节点

## 节点信息
- **标题**：前置仓
- **领域**：即时零售
- **摘要**：...
- **现有视角**：[定义 ✓] [历史 ✗] [争议 ✗] ...

## 邻居节点（1 跳）
- 即时零售（contains→ 当前节点）
- 履约成本（related）

## 用户的扩展意图
"我想深度理解前置仓的商业模式和它和云仓的本质区别"

## 你的任务
1. 与用户在此 Qoder 会话中深度对话
2. 对话结束后，把最终建议写入 expected_output 路径
3. 严格遵守 output_schema 格式
```

**产出文件（输出）**：见 Section 5 详述（标准 JSON 格式）。

**失败/超时处理**：
- 默认 30 分钟无 done 文件 → 标记 session.status='abandoned'
- 用户可手动取消 → pending 文件移到 `cancelled/`
- 重试 → 复制旧 task 文件生成新 taskId

### 5.7 调度器（主动扫描）

**策略轮询**：每次扫描随机选一个启用的策略，避免每次都跑同一个

**配额控制**：
- 每次产出上限：默认 10 条，Settings 可调
- 单次 token 预算：默认 100k
- 月度预算：默认 $20，可启用上限

---

## 6. 风险控制

### 6.1 风险地图

| 编号 | 风险 | 严重度 | 影响 |
|---|---|---|---|
| R1 | AI 建议质量低 | 高 | 用户疲劳 → 放弃 |
| R2 | Inbox 堆积淹没 | 高 | 处理不过来 → 放弃 |
| R3 | 多 Provider 质量差异 | 中 | 切换后体验崩塌 |
| R4 | 主动扫描成本失控 | 中 | 月底账单震惊 |
| R5 | HitL 流程过重 | 中 | 用户绕过手动建图 |
| R6 | 重复节点泛滥 | 低 | 图谱混乱 |
| R7 | 数据丢失 | 低 | 心血付之东流 |
| R8 | Bridge 任务卡死 | 低 | Deep Dive 不可用 |

### 6.2 R1：AI 建议质量低 → 三层防御

#### 防御 1：Confidence 门控 + 排序
- AI 必须给每条 suggestion 自评 `confidence ∈ [0,1]`
- Inbox 默认按 confidence 降序排列
- 提供「隐藏 confidence < 0.5 的建议」开关

#### 防御 2：质量反馈循环（最关键）
- 每条 suggestion 的 `decided_payload`、`decision_note` 都保留
- 每个 `scan_run` 计算 `acceptance_rate`
- Settings 页展示**每个策略 + 每个 Provider 的接受率历史**
- **自动告警**：连续 3 次 scan_run 接受率 < 30% → UI 横幅提示

#### 防御 3：AI 输出的"自我审查"
- 所有扫描 prompt 末尾固定加：
  > "在输出 suggestion 前，请自检：1) 是否与已有节点重复？2) 是否过于宽泛/琐碎？3) 关联是否真实存在还是牵强附会？把不确定的项自己删除，宁缺毋滥。"

### 6.3 R2：Inbox 堆积 → 配额 + 老化 + 视觉控制

| 控制点 | 默认值 |
|---|---|
| 主动扫描每次产出上限 | 10 条 |
| 主动扫描每日触发次数 | 1 次 |
| 单次投喂产出上限 | 20 条 |
| Inbox 总条数软上限 | 100 条 |
| Suggestion 自动过期 | 30 天 |

视觉控制：
- Inbox badge 超过 50 时变红色
- 7 天内接受率 < 20% → 弹卡片建议关闭主动扫描

### 6.4 R3：多 Provider 质量差异 → 隔离 + 标识 + AB

- **Provider 标识**：每条 suggestion UI 显示 `[📍Anthropic / sonnet-4-5]`
- **任务级隔离**：Settings 支持按任务指定 Provider
- **推荐配置**：
  - Deep Dive（重质量）→ 顶配模型
  - 主动扫描（重成本）→ 中配模型
  - 投喂抽取（重速度）→ 快速模型
- **试用模式**：新 Provider 切换后，前 N 次同时走新旧两个并排展示

### 6.5 R4：主动扫描成本失控 → 预算 + 监控 + 熔断

- **月度预算**：默认 $20，达到 80% 提醒，100% 自动暂停
- **单次调用上限**：32k input / 4k output
- **熔断机制**：5 分钟内失败率 > 50% → 暂停 30 分钟
- **Provider 限流**：429 → 指数退避重试 3 次

### 6.6 R5：HitL 流程过重 → 体验优化 + 信任分级

#### 体验优化
- 键盘快捷键 J/K/A/R/E/O
- 批量操作 + 置信度阈值批量
- 快速预览（不点开就看到摘要）

#### 信任分级（高级开关，默认关）
- Settings 提供「自动接受高置信度建议」开关
- 启用后**只对 `fill_aspect` 类型** 且 `confidence > 0.95` 自动落库
- **永远不自动接受 `new_node` / `new_edge` / `merge_nodes`**（结构性变化必须把关）

### 6.7 R6：重复节点泛滥 → 检测 + 合并建议

- 创建时自动跑相似度检测（MVP 用 fuzzy match，未来升级 embedding）
- 相似度 > 0.85 → 转为 `merge_nodes` 类型建议
- 接受合并 → 边重指向 + 视角合并 + 软删除（保留 30 天可恢复）

### 6.8 R7：数据丢失 → 备份 + 导出 + 操作日志

- **自动备份**：每次启动复制 `data/galaxy.db` 到 `data/backups/`，保留最近 14 个
- **重大操作前单独备份**：批量删除、合并节点
- **导出能力**：JSON（结构化）+ Markdown（每个节点一个 .md，可用 Obsidian 打开）
- **操作日志**：破坏性操作记录到 `operation_logs`，可撤销

### 6.9 R8：Bridge 任务卡死 → 超时 + 取消 + 状态可见

- 默认 30 分钟超时
- 用户可手动取消
- Settings 「Bridge 任务监控」入口

### 6.10 风险控制总开关（Settings 顶部「🛡️ 安全模式」）

```
┌──────────────────────────────────────────┐
│  🛡️ 安全模式                              │
│                                          │
│  [✓] 严格 HitL（所有 AI 输出必须确认）     │
│  [ ] 启用月度预算上限                      │
│  [✓] 接受率告警                           │
│  [✓] 自动备份                             │
│  [ ] 自动接受高置信度建议（高级，默认关）   │
│                                          │
│  [一键关闭所有 AI 任务]  ← 紧急停止按钮    │
└──────────────────────────────────────────┘
```

「一键关闭所有 AI 任务」：立即停止 cron + 标记 pending suggestions 为 paused + 拒绝新投喂 + 可一键恢复。

---

## 7. 项目结构与技术细节

### 7.1 项目目录结构（Monorepo + pnpm workspaces）

```
~/galaxy/
├── apps/
│   └── web/                              # Next.js 14 应用
│       ├── app/
│       │   ├── (graph)/                  # 主图谱视图
│       │   ├── inbox/                    # 待审队列
│       │   ├── deepdive/[sessionId]/     # Deep Dive 对话页
│       │   ├── settings/                 # 设置（含 AI Provider、扫描、预算）
│       │   └── api/                      # 所有 API Routes
│       ├── lib/
│       │   ├── graph/                    # 图谱布局算法、search
│       │   ├── shortcuts/                # 键盘快捷键
│       │   └── sse/                      # SSE 工具函数
│       └── package.json
│
├── packages/
│   ├── db/                               # 数据层
│   │   ├── src/schema/                   # Drizzle schema
│   │   ├── src/migrations/               # SQL 迁移
│   │   └── src/seed.ts                   # 默认 settings、视角模板加载
│   │
│   ├── ai/                               # AI 编排层
│   │   ├── src/providers/                # 6 家 Provider 适配器
│   │   ├── src/adapters/                 # 结构化输出双适配器
│   │   ├── src/tasks/                    # 各任务 schema + 业务逻辑
│   │   ├── src/direct-channel.ts
│   │   ├── src/bridge-channel.ts
│   │   ├── src/scheduler.ts
│   │   └── src/budget.ts
│   │
│   └── shared/                           # 共享类型与工具
│       └── src/
│           ├── types/                    # 领域类型 + API 类型
│           └── utils/                    # slug、加密、markdown
│
├── data/                                 # 用户数据（git ignored，自动备份）
│   ├── galaxy.db                         # SQLite 主库
│   ├── galaxy.db-wal
│   ├── galaxy.db-shm
│   ├── backups/                          # 自动备份
│   ├── aspects/                          # 视角模板（YAML，热加载）
│   │   ├── definition.yaml
│   │   ├── history.yaml
│   │   ├── controversy.yaml
│   │   ├── key-players.yaml
│   │   ├── cases.yaml
│   │   ├── my-thoughts.yaml
│   │   └── timeline.yaml
│   └── prompts/                          # AI Prompt 模板（Markdown，热加载）
│       ├── extract-from-feed.md
│       ├── scan-islands.md
│       ├── scan-gaps.md
│       ├── scan-aging.md
│       ├── deepdive-direct.md
│       └── _shared/
│
├── bridge/
│   └── qoder-tasks/
│       ├── pending/                      # 待 Agent 处理
│       ├── done/                         # Agent 已完成
│       ├── cancelled/                    # 用户取消
│       └── archive/                      # 历史归档
│
├── docs/
│   ├── superpowers/specs/
│   │   └── 2026-04-26-galaxy-design.md   # 本设计文档
│   └── README.md
│
├── scripts/
│   ├── dev.sh                            # 开发启动（含 db migrate）
│   ├── backup.sh                         # 手动备份
│   └── export.ts                         # 数据导出工具
│
├── .env.example                          # 环境变量样板（不含 secret）
├── .gitignore                            # 忽略 data/ bridge/ .env
├── pnpm-workspace.yaml
├── package.json
├── turbo.json
└── README.md
```

### 7.2 核心依赖清单

#### 工具链（根目录）
| 依赖 | 用途 | 版本 |
|---|---|---|
| pnpm | 包管理 | ≥ 9 |
| turbo | Monorepo 构建编排（可选） | ≥ 2 |
| typescript | TS 编译 | ≥ 5.4 |
| tsx | 运行 TS 脚本 | latest |

#### apps/web
| 依赖 | 用途 |
|---|---|
| next | Next.js 14（App Router） |
| react / react-dom | 18 |
| tailwindcss | 样式 |
| @radix-ui/* + shadcn/ui | UI 组件库 |
| lucide-react | 图标 |
| cytoscape | 图谱渲染核心 |
| cytoscape-fcose | force-directed 布局插件 |
| cytoscape-cola | 备选布局算法 |
| zustand | 客户端状态管理 |
| swr | 数据获取 + revalidation |
| zod | API 入参校验 |
| @uiw/react-md-editor | 视角内容编辑 |
| sonner | Toast 通知 |
| cmdk | 命令面板（搜索节点） |

#### packages/db
| 依赖 | 用途 |
|---|---|
| drizzle-orm | TypeScript ORM |
| drizzle-kit | 迁移工具 |
| better-sqlite3 | SQLite 驱动（同步、性能好） |
| yaml | 视角模板 YAML 解析 |

#### packages/ai
| 依赖 | 用途 |
|---|---|
| @anthropic-ai/sdk | Anthropic 适配器 |
| openai | OpenAI + DeepSeek + 火山 + 百炼（兼容协议） + 自定义 |
| node-cron | 定时任务 |
| chokidar | 文件监听（Bridge done 目录、模板热加载） |
| jsonrepair | 不支持 Tool Use 时修复破损 JSON |
| handlebars | Prompt 模板渲染 |
| pdf-parse | PDF 投喂解析 |
| jsdom + @mozilla/readability | URL 投喂的正文抽取 |

### 7.3 关键技术细节

#### 7.3.1 数据库初始化与迁移

```typescript
// packages/db/src/client.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'
import os from 'node:os'

const DB_PATH = process.env.GALAXY_DB_PATH || path.join(os.homedir(), 'galaxy/data/galaxy.db')

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')          // 并发友好
sqlite.pragma('foreign_keys = ON')           // 启用外键
sqlite.pragma('synchronous = NORMAL')        // 性能与可靠性平衡

export const db = drizzle(sqlite, { schema })

export function initDb() {
  migrate(db, { migrationsFolder: path.join(__dirname, '../migrations') })
}
```

#### 7.3.2 视角模板与 Prompt 模板热加载

chokidar 监听 `data/aspects/*.yaml` 和 `data/prompts/**/*.md`，文件变化时重新读取 → 内存缓存更新 → 下一次调用立即生效，无需重启。

#### 7.3.3 SSE 实现（Deep Dive 流式）

```typescript
// app/api/deepdive/[sessionId]/message/route.ts
export async function POST(req: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (data: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))

      const provider = await resolveProvider('deepdive')

      for await (const chunk of provider.invokeStream({...})) {
        send({ type: 'chunk', delta: chunk })
      }

      send({ type: 'done' })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
}
```

#### 7.3.4 API Key 加密存储

AES-256-GCM 加密，master key 由 `GALAXY_MASTER_PASSWORD` 派生（用户首次启动可选设置）。加密内容存储在 `settings.provider_credentials` JSON 字段，绝不写入日志。

#### 7.3.5 Cytoscape 图谱配置要点

- 布局：`fcose`（force-directed，节点排斥 4500，理想边长 100）
- 节点样式：种子节点紫色 60px + 边框；普通节点按 domain 着色
- 边样式：按 `relation_type` 区分（contains 实线箭头、related 虚线、opposes 红色双向、cites 灰虚线）
- 交互：`wheelSensitivity: 0.2`、`cmdk` 命令面板搜索 + 聚焦

#### 7.3.6 启动脚本

```typescript
// scripts/dev.ts
import { initDb } from '@galaxy/db'
import { startScheduler, startBridgeWatcher } from '@galaxy/ai'

await initDb()                    // 自动 migrate + seed 默认 settings
await loadAspectTemplates()       // 加载视角模板 YAML
await loadPromptTemplates()       // 加载 Prompt 模板 markdown
startBridgeWatcher()              // chokidar 监听 bridge/qoder-tasks/done/
startScheduler()                  // node-cron 启动主动扫描

spawn('pnpm', ['--filter', '@galaxy/web', 'dev'], { stdio: 'inherit' })
```

### 7.4 数据隐私与安全

| 项目 | 措施 |
|---|---|
| API Key | AES-256-GCM 加密存储，不写入日志 |
| 数据库文件 | 用户家目录，仅当前用户可读写（chmod 600） |
| Bridge 文件 | 同上，只在本地文件系统流转 |
| 投喂内容 | 默认存原文 + 抽取摘要；用户可在 Settings 选「不存原文」 |
| 网络出站 | 仅向用户配置的 Provider endpoint 发请求；可配置代理 |
| 本地 Web 端口 | 默认绑定 127.0.0.1（不暴露到局域网），用户可改 |

### 7.5 性能预算

| 指标 | 目标 |
|---|---|
| 图谱节点数支持 | 1000 节点流畅交互（Cytoscape 实测可到 5000+） |
| 首屏加载 | < 2s |
| 节点详情打开 | < 200ms |
| 投喂抽取响应 | 5-15s（取决于 Provider） |
| 主动扫描单次耗时 | < 60s |
| SQLite 单库大小 | 100MB 内（约 5000 节点 + 视角内容）无性能问题 |

---

## 8. 里程碑与交付节奏

### 8.1 总体节奏

**目标**：5 周内交付方案 3 完整 MVP（含主动扫描），但**每周末都有可演示版本**。

```
Week 1   ▰▱▱▱▱  M1: 骨架可运行（数据 + 图谱 + 手动建图）
Week 2   ▰▰▱▱▱  M2: 投喂 + Inbox（核心 HitL 跑通）
Week 3   ▰▰▰▱▱  M3: 多 Provider + 视角系统
Week 4   ▰▰▰▰▱  M4: Deep Dive（双轨：直连 + Bridge）
Week 5   ▰▰▰▰▰  M5: 主动扫描 + 风险控制 + 数据安全
```

### 8.2 M1 · Week 1：骨架可运行

**交付内容**：
- Monorepo 初始化（pnpm workspaces + turborepo）
- `packages/db` 完整：Drizzle schema 全部表 + 迁移脚本 + seed
- `packages/shared` 基础类型
- `apps/web` 框架：Next.js 14 + Tailwind + shadcn/ui 初始化
- 路由 `/api/nodes`、`/api/edges` CRUD
- 主图谱页：Cytoscape 渲染 + force-directed 布局
- 节点详情侧栏（仅展示+编辑标题/摘要/领域）
- 右键空白处「新建节点」、双节点拖拽连线
- 启动脚本：`pnpm dev`

**演示标准**：
- ✅ `pnpm dev` 一键启动
- ✅ 能手动建 10 个节点 + 10 条边，图谱显示无问题
- ✅ 节点可拖拽、缩放、搜索（cmdk 命令面板）
- ✅ 数据持久化到 `data/galaxy.db`，重启后还在

**风险点**：
- Cytoscape 在 Next.js App Router 下需要 `'use client'` + 动态导入，避免 SSR 报错
- better-sqlite3 是原生模块，需要在 dev 时确保正确编译

### 8.3 M2 · Week 2：投喂 + Inbox（核心 HitL 跑通）

**交付内容**：
- `packages/ai` 基础：先只实现 **Anthropic 一家 Provider**（多 Provider 留到 M3）
- DirectChannel + 结构化输出（Zod + Tool Use）
- Prompt 模板系统（Markdown + Handlebars + chokidar 热加载）
- `extract-from-feed` 任务完整实现
- `/api/feed` 投喂接口（支持文本粘贴 + URL）
- 全局 FAB 投喂面板
- `/api/inbox` + Inbox 主视图
- Suggestion 卡片：单条接受/拒绝/修改后接受
- 批量操作：勾选 + 批量接受/拒绝
- 键盘快捷键：J/K/A/R/E
- Inbox 顶部 badge

**演示标准**：
- ✅ 粘贴一篇文章 → 30 秒内 Inbox 出现 5-15 条建议
- ✅ 接受其中若干条，图谱实时新增节点和关联
- ✅ 修改后接受：能编辑节点标题、关联类型再落库
- ✅ 重启后所有数据完整

**风险点**：
- AI 输出结构化解析失败的兜底（jsonrepair 备用）
- 投喂大文本（>50k token）需要前端分块或后端拒绝并提示

### 8.4 M3 · Week 3：多 Provider + 视角系统

**交付内容**：
- `packages/ai/providers/` 完整 6 家适配器
- ProviderRegistry + 任务级 Provider 路由
- 结构化输出双适配器（Tool Use + Prompt + jsonrepair 兜底）
- Settings 页 - AI Provider 配置面板（凭证管理 + 测试连接）
- API Key 加密存储（AES-256-GCM）
- 视角模板系统：`data/aspects/` 7 个 YAML + 加载器 + 热加载
- 节点详情页 Aspect Tabs（视角标签页）
- Markdown 编辑器
- AI 抽取支持 `fill_aspect` 类型建议
- ai_call_logs 表 + 成本统计

**演示标准**：
- ✅ Settings 配置 Anthropic + DeepSeek + 阿里百炼 三家，「测试连接」全绿
- ✅ 切换 Provider 后投喂，正常出建议（结构化输出兼容）
- ✅ 节点详情页显示 7 个视角标签，可手动编辑
- ✅ AI 投喂能产出 `fill_aspect` 建议，接受后视角内容入库
- ✅ Settings 页显示「本月 AI 花费 $X.XX」

**风险点**：
- 不同 Provider 的 OpenAI 兼容协议细节差异（tool_choice、stream 格式）
- 阿里百炼若用 OpenAI 兼容端点最简单，原生 SDK 可作为备选不在 MVP 内

### 8.5 M4 · Week 4：Deep Dive（双轨）

**交付内容**：
- `/api/deepdive/:nodeId` SSE 流式接口
- Deep Dive UI 对话框
- Agent 选择弹窗（thinker / 产品合伙人 / 直接问 Claude）
- 直连模式：流式对话 + 多轮 + 收尾产出 suggestions
- Bridge 模式完整实现：
  - 桥接文件协议（pending/done/cancelled/archive 四目录）
  - 任务文件渲染
  - chokidar 监听 `done/`，推送 SSE 通知
  - 超时机制 + 用户取消
- Settings 「Bridge 任务监控」入口
- Deep Dive 产出回流到 Inbox 二次确认
- 节点详情页「历史对话 (N)」入口

**演示标准**：
- ✅ 节点详情页召唤 thinker → 在 Qoder 中收到任务文件
- ✅ 在 Qoder 完成对话 → Galaxy 自动收到结果 → 落入 Inbox
- ✅ 直连模式：Web 内对话流畅，AI 输出实时显示
- ✅ Bridge 任务超时正常处理，可取消

**风险点**：
- chokidar 在 macOS 偶发延迟（默认 polling 间隔可调）
- thinker / 合伙人 Agent 需要更新 system prompt，告知如何识别 bridge 任务文件

### 8.6 M5 · Week 5：主动扫描 + 风险控制 + 收尾

**交付内容**：
- `packages/ai/scheduler.ts`：node-cron 主动扫描调度器
- 三种扫描策略实现：islands / gaps / aging
- `/api/scan/trigger` 手动触发 + `/api/scan/status` 查询
- Settings 主动扫描配置（cron + 上限 + 策略多选）
- **风险控制全集**（Section 6）：
  - Confidence 排序 + 隐藏低置信度
  - 接受率统计 + 自动告警
  - 月度预算 + 单次熔断
  - Inbox 软上限 + 老化机制
  - 重复节点检测 + merge_nodes 建议
- **数据安全全集**：
  - 启动时自动备份（保留最近 14 个）
  - 数据导出（JSON + Markdown 双格式）
  - operation_logs 表 + 撤销入口
- 「🛡️ 安全模式」全局面板 + 「一键关闭所有 AI 任务」按钮
- README + 快速上手文档

**演示标准**：
- ✅ 启用主动扫描 + 手动触发一次 → 5 分钟内产出 10 条建议入 Inbox
- ✅ Settings 看到「策略 islands × Anthropic 接受率 78%」类似数据
- ✅ 故意把建议全拒绝 3 次 → UI 出现「质量偏低告警」横幅
- ✅ 「一键关闭所有 AI」立即停止所有任务
- ✅ 「导出全部数据」产出可读的 JSON + Markdown 包
- ✅ 模拟数据库损坏 → 从 backups/ 恢复成功

**风险点**：
- 主动扫描的 prompt 调优是 M5 最大不确定性，预留 2-3 天给 prompt 迭代
- 接受率统计需要等用户至少处理 30 条建议后才有意义，可用 mock 数据先把 UI 做好

### 8.7 通用工程要求（贯穿 5 周）

#### 测试策略
- **DB 层**：Drizzle schema + 迁移要有冒烟测试（vitest，每个表 CRUD 一遍）
- **AI 层**：Provider 适配器要有基础调通测试（实际打 API，需要 .env，CI 跳过）
- **业务逻辑**：Suggestion 落库逻辑、合并节点、配额控制必须有单测
- **E2E**：M2 之后每个里程碑加一个端到端测试（Playwright），覆盖核心 happy path

#### 提交规范
- Conventional Commits：`feat:` / `fix:` / `refactor:` / `test:` / `docs:` / `chore:`
- 每个里程碑结束打 git tag：`m1-skeleton` / `m2-inbox` / `m3-providers` / `m4-deepdive` / `m5-proactive`

#### 文档维护
- `docs/superpowers/specs/2026-04-26-galaxy-design.md`：本设计文档（M0 产出）
- `docs/superpowers/plans/`：每个里程碑的实施计划（writing-plans skill 产出）
- `README.md`：5 周末更新到完整版

### 8.8 时间投入预估

| 里程碑 | AI 编码时间 | 用户协作 + 验收 | 总计 |
|---|---|---|---|
| M1 | 4-6h | 1-2h | 1-2 天 |
| M2 | 8-12h | 2-3h | 2-3 天 |
| M3 | 10-15h | 3-5h | 3-4 天 |
| M4 | 8-12h | 3-5h | 2-4 天 |
| M5 | 12-18h | 5-8h | 4-6 天 |
| **合计** | **42-63h** | **14-23h** | **12-19 天**（2.5-4 周日历） |

按每天 2-3 小时投入，5 周（35 天）日历周期是宽松且现实的。

---

## 附录 A. 已确认的核心决策

| # | 决策项 | 用户选择 | 记录时间 |
|---|---|---|---|
| 1 | 产品形态 | A · 个人本地 Web App | 2026-04-26 |
| 2 | 纵深结构 | E · 平面网状 + 节点多视角 | 2026-04-26 |
| 3 | HitL 模式 | D · 待审队列 + 节点深度对话 双轨 | 2026-04-26 |
| 4 | 知识来源 | C · 种子根节点 + 持续投喂 + AI 主动扫描 | 2026-04-26 |
| 5 | 技术栈 | A+B 混合 · Next.js + shadcn + Cytoscape + SQLite + 多 Provider + 文件桥接 | 2026-04-26 |
| 6 | MVP 范围 | 方案 3 · Full Vision（含主动扫描） | 2026-04-26 |
| 7 | Prompt 模板 | Markdown 格式 | 2026-04-26 |
| 8 | Provider | 内置 6 家（Anthropic / OpenAI / 阿里百炼 / 火山引擎 / DeepSeek / 自定义 OpenAI 兼容） | 2026-04-26 |
| 9 | 项目名 | Galaxy（星系） | 2026-04-26 |
| 10 | 项目根路径 | `~/galaxy/` | 2026-04-26 |

## 附录 B. 不在 MVP 范围（明确边界）

避免 scope creep，以下功能**明确不在 5 周 MVP 范围内**，作为 V2+ 候选：

- ❌ 多用户 / 权限系统
- ❌ 云同步 / 多设备同步（保留 SQLite → libsql 迁移可能性）
- ❌ 浏览器扩展投喂（V2 候选）
- ❌ 移动端 UI（仅桌面 Web）
- ❌ Obsidian 插件形态（V2 候选）
- ❌ Embedding 检索（M5 重复检测先用 fuzzy match，V2 升级）
- ❌ 知识图谱算法（PageRank、社区检测等，V2+）
- ❌ 协作编辑、评论
- ❌ 公开发布 / 多租户 SaaS
- ❌ 阿里百炼原生 DashScope SDK（用 OpenAI 兼容端点已足够）
- ❌ 主动扫描的"基于历史决策训练"功能（先收集数据，V2 才训练）
- ❌ Provider 的灰度切换"试用模式"实现（M5 设计上预留，但实现下放 V2）

## 附录 C. 与现有 Agent 资产的集成

Galaxy 项目独立于现有 `~/qoder/曹鹏的工作区/`，但通过 Bridge 通道复用以下资产：

| 资产 | 路径 | Galaxy 中的角色 |
|---|---|---|
| **thinker Agent** | `~/qoder/曹鹏的工作区/agents/thinker/system_prompt.md` | Deep Dive 桥接模式的「思辨型扩展」Agent |
| **产品合伙人 Agent** | `~/.qoder/agents/product-partner.md` | Deep Dive 桥接模式的「产品/商业视角扩展」Agent |
| **superpowers skills** | `~/.aone_copilot/plugins/cache/git/obra-superpowers/` | 本项目开发流程：brainstorming（已用）、writing-plans（下一步）、TDD、verification-before-completion |
| **设计 skills** | `~/.claude/skills/` | 前端实现阶段：impeccable、frontend-design、shape、layout、polish、critique |

**Bridge 集成约定**：thinker 和产品合伙人 Agent 的 system prompt 在 M4 之前需要补一段说明：「当你在 `~/galaxy/bridge/qoder-tasks/pending/` 目录下看到 `task_type: deepdive` 的任务文件时，遵守该文件中 `output_schema` 描述的格式，把对话最终结论写入 `expected_output` 路径」。该补丁不在 Galaxy 仓库内，需要在 M4 阶段单独处理。

---

*— 本设计规约由 brainstorming skill 引导产出，全部 8 章经鹏哥逐节确认 ✅*
