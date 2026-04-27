---
title: Galaxy M2 · 被动投喂 + AI 抽取 + Inbox 待审 · 设计规约
created: 2026-04-27
last_verified: 2026-04-27
expires: 永久
owner: 鹏哥
tags: [Galaxy, M2, AI, Feed, Inbox, HitL, Multi-Provider]
status: 有效
parent_spec: docs/superpowers/specs/2026-04-26-galaxy-design.md
---

# Galaxy M2 · 被动投喂 + AI 抽取 + Inbox 待审

> **一句话定义**：用户把文本 / URL / 文件丢给 Galaxy，AI 自动抽取候选节点和关联，放入 Inbox 待审队列；用户在 Inbox 中逐条或批量确认，通过后写入图谱。

---

## 0. 前置条件

M1 骨架已完成：
- `nodes` / `edges` CRUD（API + 前端）
- Cytoscape 图谱画布
- Zustand store（graph-store）
- SQLite + Drizzle ORM（`packages/db`）
- pnpm monorepo（`apps/web` + `packages/db` + `packages/shared`）

---

## 1. 功能范围

### 1.1 包含

| 编号 | 功能 | 说明 |
|---|---|---|
| F1 | 多 Provider 抽象（`packages/ai`） | 6 家 Provider 适配器 + ProviderRegistry + 结构化输出策略 |
| F2 | 投喂入口（Feed） | FAB 按钮 → 投喂面板（纯文本 / URL / Markdown / PDF） |
| F3 | AI 抽取管线 | 投喂内容 → Prompt 模板 + 图谱上下文 → AI 结构化输出 → Zod 校验 → 写入 suggestions |
| F4 | Inbox 页面 | 列表 + 筛选 + 单条操作 + 批量操作 + 键盘快捷键 |
| F5 | 确认入图 | accept → 创建 nodes/edges/aspects；reject → 标记拒绝；modify → 编辑后接受 |
| F6 | Settings 页面 | Provider 配置 + AI 开关 + 预算设置 |
| F7 | AI 调用日志 | 每次 AI 调用记录 provider/model/tokens/cost/duration |
| F8 | DB Schema 扩展 | suggestions / feed_items / settings / ai_call_logs 4 张表 |

### 1.2 不包含（M3+）

- Deep Dive 对话
- Bridge 桥接通道（Qoder Agent）
- 主动扫描（Proactive Scan）
- Aspect 视角系统
- 操作日志与撤销

---

## 2. 系统架构

### 2.1 M2 数据流

```
用户投喂 (text/url/md/pdf)
  ↓
POST /api/feed
  ↓
┌─────────────────────────────┐
│  Feed Pipeline              │
│  1. 解析原始内容            │
│     - text: 直接使用        │
│     - url: article-extractor│
│     - md: 读取文件          │
│     - pdf: pdf-parse        │
│  2. 写入 feed_items         │
│  3. 构建 prompt             │
│     - 加载模板              │
│     - 注入图谱上下文        │
│  4. 调用 LLM Provider       │
│  5. Zod 校验输出            │
│  6. 写入 suggestions        │
│  7. 写入 ai_call_logs       │
│  8. 返回结果                │
└─────────────────────────────┘
  ↓
前端 Inbox badge +N
  ↓
用户在 Inbox 逐条/批量确认
  ↓
POST /api/inbox/:id/confirm
  ↓
┌─────────────────────────────┐
│  Confirm Pipeline           │
│  - accept: 写入 nodes/edges │
│  - reject: 标记拒绝         │
│  - accept_modified: 用修改  │
│    后的 payload 写入        │
└─────────────────────────────┘
```

### 2.2 新增包：`packages/ai`

```
packages/ai/
├── src/
│   ├── providers/
│   │   ├── types.ts              # LLMProvider 接口 + LLMRequest/Response 类型
│   │   ├── registry.ts           # ProviderRegistry（注册/获取/切换）
│   │   ├── anthropic.ts          # Anthropic 适配器（原生 SDK）
│   │   ├── openai.ts             # OpenAI 适配器（原生 SDK）
│   │   ├── openai-compat.ts      # OpenAI 兼容适配器（百炼/火山/DeepSeek/Custom）
│   │   └── index.ts
│   ├── structured-output/
│   │   ├── strategy.ts           # 结构化输出策略选择器
│   │   └── json-repair.ts        # JSON 修复兜底
│   ├── tasks/
│   │   ├── extract-from-feed.ts  # 投喂抽取任务（schema + 业务逻辑）
│   │   └── types.ts              # 任务类型定义
│   ├── context/
│   │   ├── graph-summary.ts      # 图谱上下文构建器
│   │   └── prompt-loader.ts      # Prompt 模板加载器（Handlebars）
│   ├── budget.ts                 # 预算追踪 + 熔断
│   ├── direct-channel.ts         # 轻量直连封装
│   └── index.ts
├── package.json
└── tsconfig.json
```

---

## 3. DB Schema 扩展

### 3.1 `suggestions` 表

```ts
export const suggestions = sqliteTable('suggestions', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),                    // new_node | new_edge | fill_aspect | update_aspect | merge_nodes
  source: text('source').notNull(),                // feed | proactive_scan | deepdive
  source_ref_id: text('source_ref_id'),            // feed_items.id / scan_runs.id / deep_dive_sessions.id

  payload: text('payload').notNull(),              // JSON 字符串
  rationale: text('rationale'),
  confidence: real('confidence'),                  // 0-1

  status: text('status').notNull().default('pending'),  // pending | accepted | rejected | accepted_modified | expired | paused
  decided_at: text('decided_at'),
  decided_payload: text('decided_payload'),        // JSON 字符串（修改后的版本）
  decision_note: text('decision_note'),

  provider_id: text('provider_id'),
  model: text('model'),

  created_at: text('created_at').notNull(),
  expires_at: text('expires_at'),
})
```

### 3.2 `feed_items` 表

```ts
export const feedItems = sqliteTable('feed_items', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),                    // text | url | file_md | file_pdf
  raw_content: text('raw_content'),
  parsed_content: text('parsed_content'),          // URL/PDF 解析后的正文
  file_path: text('file_path'),
  source_url: text('source_url'),
  status: text('status').notNull().default('processing'),  // processing | done | failed
  error_message: text('error_message'),
  suggestions_count: integer('suggestions_count').default(0),
  created_at: text('created_at').notNull(),
})
```

### 3.3 `settings` 表

```ts
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey().default(1),

  // AI 开关
  enable_feed_ai: integer('enable_feed_ai', { mode: 'boolean' }).default(true),
  enable_proactive_scan: integer('enable_proactive_scan', { mode: 'boolean' }).default(false),
  enable_deepdive: integer('enable_deepdive', { mode: 'boolean' }).default(true),

  // Provider 配置
  default_provider: text('default_provider').default('openai'),
  default_model: text('default_model').default('gpt-4o'),
  provider_credentials: text('provider_credentials'),      // 加密 JSON
  task_provider_overrides: text('task_provider_overrides'), // JSON
  custom_providers: text('custom_providers'),               // JSON

  // 风险控制
  enable_monthly_budget: integer('enable_monthly_budget', { mode: 'boolean' }).default(false),
  monthly_budget_usd: real('monthly_budget_usd').default(20.0),
  inbox_soft_limit: integer('inbox_soft_limit').default(100),

  updated_at: text('updated_at'),
})
```

### 3.4 `ai_call_logs` 表

```ts
export const aiCallLogs = sqliteTable('ai_call_logs', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(),              // direct | bridge
  task: text('task').notNull(),                    // extract_from_feed | scan_islands | ...
  provider_id: text('provider_id').notNull(),
  model: text('model').notNull(),
  base_url: text('base_url'),
  input_tokens: integer('input_tokens'),
  output_tokens: integer('output_tokens'),
  cost_usd: real('cost_usd'),
  duration_ms: integer('duration_ms'),
  status: text('status').notNull(),                // success | failed | timeout
  error_message: text('error_message'),
  created_at: text('created_at').notNull(),
})
```

---

## 4. API Routes

### 4.1 `POST /api/feed`

**请求**：
```ts
// multipart/form-data 或 application/json
{
  type: 'text' | 'url' | 'file_md' | 'file_pdf'
  content?: string        // type=text 时的文本内容
  url?: string            // type=url 时的 URL
  file?: File             // type=file_md|file_pdf 时的文件
}
```

**响应**：
```ts
{
  data: {
    feed_item_id: string
    suggestions_count: number
    suggestions: Suggestion[]
  }
}
```

**流程**：
1. 校验输入（Zod）
2. 解析内容：text 直接用 / url 用 article-extractor / md 读文件 / pdf 用 pdf-parse
3. 写入 `feed_items`（status=processing）
4. 读取 Settings 获取 Provider 配置
5. 构建 prompt（模板 + 图谱上下文）
6. 调用 LLM Provider
7. Zod 校验 AI 输出
8. 逐条写入 `suggestions`
9. 更新 `feed_items`（status=done, suggestions_count=N）
10. 写入 `ai_call_logs`
11. 返回结果

### 4.2 `GET /api/inbox`

**查询参数**：
```
?source=feed|proactive_scan|deepdive
&type=new_node|new_edge|fill_aspect|...
&status=pending                         // 默认只看 pending
&min_confidence=0.5
&page=1&limit=20
&sort=confidence_desc|created_at_desc
```

**响应**：
```ts
{
  data: Suggestion[]
  meta: { total: number, page: number, limit: number }
}
```

### 4.3 `POST /api/inbox/:id/confirm`

**请求**：
```ts
{
  action: 'accept' | 'reject' | 'accept_modified'
  modified_payload?: object     // action=accept_modified 时
  decision_note?: string        // 拒绝/修改原因
}
```

**流程（accept）**：
- `type=new_node` → 创建 node + 关联的 edges
- `type=new_edge` → 创建 edge
- `type=fill_aspect` → 创建 aspect（M3 实现，M2 先占位）
- 更新 suggestion（status=accepted, decided_at）

### 4.4 `POST /api/inbox/batch`

**请求**：
```ts
{
  ids: string[]
  action: 'accept' | 'reject'
  decision_note?: string
}
```

### 4.5 `GET/PATCH /api/settings`

读取和更新全局配置。PATCH 支持部分更新。

---

## 5. 多 Provider 抽象

### 5.1 LLMProvider 接口

```ts
export interface LLMProvider {
  readonly id: string
  readonly displayName: string
  readonly supportedModels: ModelInfo[]

  invoke(request: LLMRequest): Promise<LLMResponse>
  estimateCost(usage: TokenUsage, model: string): number

  capabilities: {
    structured_output: boolean
    tool_use: boolean
    streaming: boolean
  }
}

export interface LLMRequest {
  model: string
  messages: Message[]
  tools?: ToolDefinition[]        // Tool Use 模式
  response_format?: { type: 'json_object' }  // JSON Mode
  max_tokens?: number
  temperature?: number
}

export interface LLMResponse {
  content: string
  tool_calls?: ToolCall[]
  usage: TokenUsage
  model: string
  provider_id: string
}
```

### 5.2 Provider 实现

| Provider | 适配器 | SDK | 结构化输出 |
|---|---|---|---|
| Anthropic | `AnthropicProvider` | `@anthropic-ai/sdk` | Tool Use |
| OpenAI | `OpenAIProvider` | `openai` | Tool Use / JSON Mode |
| 百炼 | `OpenAICompatProvider` | `openai` (baseURL 切换) | Tool Use |
| 火山引擎 | `OpenAICompatProvider` | `openai` (baseURL 切换) | Tool Use |
| DeepSeek | `OpenAICompatProvider` | `openai` (baseURL 切换) | JSON Mode |
| Custom | `OpenAICompatProvider` | `openai` (baseURL 切换) | Prompt 兜底 |

### 5.3 结构化输出策略

```
优先级：Tool Use → JSON Mode → Prompt 兜底 + jsonrepair
按 provider.capabilities 自动选择
```

### 5.4 API Key 配置

双通道：
1. `.env` 文件（优先）：`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DASHSCOPE_API_KEY`, `ARK_API_KEY`, `DEEPSEEK_API_KEY`
2. Settings UI 覆盖：加密存储在 `settings.provider_credentials`（AES-256-GCM，密钥用环境变量 `GALAXY_ENCRYPT_KEY`）

---

## 6. Prompt 模板

### 6.1 投喂抽取模板

```
data/prompts/extract-from-feed.md

模板变量：
- {{graph_summary}} — 当前图谱节点标题列表（按 domain 分组）
- {{feed_content}} — 投喂的原始内容
- {{output_format_instruction}} — 按 provider 自动注入的输出格式指令
```

### 6.2 输出 Schema（Zod）

```ts
const FeedExtractionSchema = z.object({
  new_nodes: z.array(z.object({
    title: z.string().max(50),
    summary: z.string().max(200),
    domain: z.string(),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
    suggested_edges: z.array(z.object({
      target_node_title: z.string(),
      relation_type: z.enum(['contains', 'related', 'opposes', 'instance_of', 'evolved_from', 'cites']),
    })),
  })),
  new_edges: z.array(z.object({
    source_title: z.string(),
    target_title: z.string(),
    relation_type: z.enum(['contains', 'related', 'opposes', 'instance_of', 'evolved_from', 'cites']),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  })),
})
```

---

## 7. 前端

### 7.1 路由结构

```
app/
├── page.tsx                    # 主图谱（已有）
├── inbox/
│   └── page.tsx                # Inbox 列表页
├── settings/
│   └── page.tsx                # Settings 页
└── _components/
    ├── graph-canvas.tsx        # 已有
    ├── new-node-dialog.tsx     # 已有
    ├── feed-fab.tsx            # 投喂浮动按钮
    ├── feed-dialog.tsx         # 投喂面板
    ├── inbox-list.tsx          # Inbox 列表
    ├── inbox-card.tsx          # 单条 suggestion 卡片
    ├── inbox-confirm-dialog.tsx # 修改后接受的编辑弹窗
    └── nav-bar.tsx             # 顶部导航（含 Inbox badge）
```

### 7.2 Zustand Stores

- **`inbox-store.ts`** — suggestions 列表、筛选、批量操作
- **`feed-store.ts`** — 投喂状态
- **`settings-store.ts`** — 全局配置

### 7.3 键盘快捷键

| 按键 | 动作 |
|---|---|
| `J` / `K` | Inbox 上下导航 |
| `A` | 接受当前 |
| `R` | 拒绝当前 |
| `E` | 修改后接受 |
| `O` | 查看原文 |
| `⌘K` | 搜索面板（已有） |

---

## 8. 依赖清单

### packages/ai

| 依赖 | 版本 | 用途 |
|---|---|---|
| `@anthropic-ai/sdk` | ^0.30 | Anthropic Provider |
| `openai` | ^4.50 | OpenAI + 4 家兼容 Provider |
| `zod` | ^3.23 | 输出 schema 校验 |
| `handlebars` | ^4.7 | Prompt 模板引擎 |
| `jsonrepair` | ^3.8 | 非标准 JSON 修复 |

### apps/web（新增）

| 依赖 | 版本 | 用途 |
|---|---|---|
| `@extractus/article-extractor` | ^8 | URL 正文提取 |
| `pdf-parse` | ^1.1 | PDF 文件解析 |

---

## 9. 风险控制（M2 范围内）

| 控制点 | 实现 |
|---|---|
| 预算追踪 | `ai_call_logs` 记录每次调用成本；Settings 支持月度预算上限 |
| Inbox 堆积 | 单次投喂上限 20 条 suggestion；30 天自动过期 |
| AI 输出校验 | Zod schema 严格校验；不合格的字段丢弃而非报错 |
| Provider 故障 | try-catch + 写入 ai_call_logs(status=failed)；前端显示错误 |
| API Key 安全 | AES-256-GCM 加密存储；.env 优先级高于 DB |

---

## 10. 已确认的设计决策

1. **完整 M2 scope**：投喂 4 种类型（text/url/md/pdf）+ Inbox 全套 + 6 家 Provider + Settings UI
2. **6 家 Provider**：Anthropic, OpenAI, 百炼, 火山, DeepSeek, Custom OpenAI 兼容
3. **API Key 双通道**：`.env` 优先 + Settings UI 可覆盖
4. **同步投喂**：POST /api/feed 同步等待 AI 返回（2-30s），不走 SSE/队列
5. **Suggestion 不可变**：原 payload 保留，修改后接受写入 decided_payload
6. **手动操作不走 Inbox**：用户手动建节点/连边直接落库
