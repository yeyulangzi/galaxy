# Galaxy M2 · 被动投喂 + AI 抽取 + Inbox 待审 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户把文本/URL/文件丢给 Galaxy → AI 自动抽取候选节点和关联 → Inbox 待审 → 确认入图。

**Architecture:** 新建 `packages/ai` 包实现多 Provider 抽象 + 轻量直连通道。投喂内容经 AI 抽取后写入 `suggestions` 表，前端 Inbox 页面列表展示，用户确认后落库到 `nodes`/`edges`。API Key 支持 `.env` 文件 + Settings UI 双通道配置。

**Tech Stack:** TypeScript, Next.js 14 API Routes, Drizzle ORM + SQLite, `openai` SDK (覆盖 5 家 OpenAI 兼容 Provider), `@anthropic-ai/sdk`, Zod, Handlebars, Zustand, shadcn/ui, Tailwind CSS, `@extractus/article-extractor`, `pdf-parse`, `jsonrepair`

**Spec:** `docs/superpowers/specs/2026-04-27-galaxy-m2-feed-inbox-design.md`

---

## File Structure

### New files to create

```
packages/ai/                              # 新包：AI 编排层
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                          # 公开 API
    ├── providers/
    │   ├── types.ts                      # LLMProvider 接口 + Request/Response 类型
    │   ├── registry.ts                   # ProviderRegistry（注册/获取/切换）
    │   ├── anthropic.ts                  # Anthropic 适配器
    │   ├── openai.ts                     # OpenAI 适配器
    │   ├── openai-compat.ts              # OpenAI 兼容适配器（百炼/火山/DeepSeek/Custom）
    │   └── index.ts                      # 导出
    ├── structured-output/
    │   ├── strategy.ts                   # 结构化输出策略选择器
    │   └── json-repair.ts               # JSON 修复兜底
    ├── tasks/
    │   ├── extract-from-feed.ts          # 投喂抽取任务
    │   └── schemas.ts                    # Zod 输出 schema
    ├── context/
    │   ├── graph-summary.ts              # 图谱上下文构建器
    │   └── prompt-loader.ts             # Prompt 模板加载器
    ├── budget.ts                         # 预算追踪
    └── direct-channel.ts                 # 轻量直连封装

data/prompts/                             # Prompt 模板目录
├── extract-from-feed.md
└── _shared/
    ├── output-format.md
    └── graph-context.md

apps/web/app/
├── inbox/
│   └── page.tsx                          # Inbox 列表页
├── settings/
│   └── page.tsx                          # Settings 页
└── _components/
    ├── feed-fab.tsx                      # 投喂浮动按钮 + 面板
    ├── inbox-list.tsx                    # Inbox 列表组件
    ├── inbox-card.tsx                    # 单条 suggestion 卡片
    ├── inbox-confirm-dialog.tsx          # 修改后接受弹窗
    └── nav-bar.tsx                       # 顶部导航栏（含 Inbox badge）

apps/web/app/api/
├── feed/
│   └── route.ts                          # POST /api/feed
├── inbox/
│   ├── route.ts                          # GET /api/inbox
│   ├── [id]/
│   │   └── confirm/
│   │       └── route.ts                  # POST /api/inbox/:id/confirm
│   └── batch/
│       └── route.ts                      # POST /api/inbox/batch
└── settings/
    └── route.ts                          # GET/PATCH /api/settings

apps/web/lib/
├── store/
│   ├── inbox-store.ts                    # Inbox Zustand store
│   └── settings-store.ts                # Settings Zustand store
└── api/
    └── schemas.ts                        # 扩展（新增 Feed/Inbox schemas）
```

### Files to modify

```
packages/shared/src/types/domain.ts       # 新增 Suggestion / FeedItem / Settings / AiCallLog interface
packages/shared/src/index.ts              # 导出新类型
packages/db/src/schema/feed-items.ts      # 补充 parsed_content 列（spec 需要）
packages/db/src/index.ts                  # 确认导出完整
apps/web/lib/api/client.ts               # 新增 feed / inbox / settings API 方法
apps/web/app/layout.tsx                   # 改用 NavBar 组件
apps/web/app/page.tsx                     # 嵌入 FeedFab
apps/web/package.json                     # 新增 @galaxy/ai 依赖
apps/web/next.config.mjs                  # externalize openai / @anthropic-ai/sdk
package.json (根)                          # 新增 workspace 依赖
pnpm-workspace.yaml                       # 确认 packages/* 已包含
```

---

## Task 1: 创建 `packages/ai` 包骨架

**Files:**
- Create: `packages/ai/package.json`
- Create: `packages/ai/tsconfig.json`
- Create: `packages/ai/src/index.ts`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@galaxy/ai",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@galaxy/db": "workspace:*",
    "@galaxy/shared": "workspace:*",
    "@anthropic-ai/sdk": "^0.30.0",
    "openai": "^4.50.0",
    "zod": "^3.23.0",
    "handlebars": "^4.7.8",
    "jsonrepair": "^3.8.0"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 创建 src/index.ts 占位**

```ts
export { ProviderRegistry } from './providers/registry'
export { DirectChannel } from './direct-channel'
export type { LLMProvider, LLMRequest, LLMResponse } from './providers/types'
```

- [ ] **Step 4: 安装依赖**

Run: `cd /Users/eleme/galaxy && pnpm install`
Expected: 成功安装，无报错

- [ ] **Step 5: Commit**

```bash
git add packages/ai/ && git commit -m "feat(ai): scaffold packages/ai with package.json + tsconfig"
```

---

## Task 2: LLMProvider 接口与类型定义

**Files:**
- Create: `packages/ai/src/providers/types.ts`

- [ ] **Step 1: 创建 Provider 类型定义**

```ts
export interface ModelInfo {
  id: string
  displayName: string
  maxContextTokens: number
  inputPricePer1kTokens: number
  outputPricePer1kTokens: number
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface LLMRequest {
  model: string
  messages: Message[]
  tools?: ToolDefinition[]
  responseFormat?: { type: 'json_object' }
  maxTokens?: number
  temperature?: number
}

export interface LLMResponse {
  content: string
  toolCalls?: ToolCall[]
  usage: TokenUsage
  model: string
  providerId: string
}

export interface ProviderCapabilities {
  structuredOutput: boolean
  toolUse: boolean
  streaming: boolean
}

export interface LLMProvider {
  readonly id: string
  readonly displayName: string
  readonly supportedModels: ModelInfo[]
  readonly capabilities: ProviderCapabilities

  invoke(request: LLMRequest): Promise<LLMResponse>
  estimateCost(usage: TokenUsage, model: string): number
}

export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/eleme/galaxy/packages/ai && pnpm typecheck`
Expected: 通过（此文件无外部依赖）

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/providers/types.ts && git commit -m "feat(ai): define LLMProvider interface and request/response types"
```

---

## Task 3: OpenAI Provider 适配器

**Files:**
- Create: `packages/ai/src/providers/openai.ts`

- [ ] **Step 1: 实现 OpenAIProvider**

```ts
import OpenAI from 'openai'
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ModelInfo,
  ProviderCapabilities,
  ProviderConfig,
  TokenUsage,
} from './types'

const OPENAI_MODELS: ModelInfo[] = [
  { id: 'gpt-4o', displayName: 'GPT-4o', maxContextTokens: 128000, inputPricePer1kTokens: 0.0025, outputPricePer1kTokens: 0.01 },
  { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', maxContextTokens: 128000, inputPricePer1kTokens: 0.00015, outputPricePer1kTokens: 0.0006 },
  { id: 'gpt-4.1', displayName: 'GPT-4.1', maxContextTokens: 1047576, inputPricePer1kTokens: 0.002, outputPricePer1kTokens: 0.008 },
  { id: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini', maxContextTokens: 1047576, inputPricePer1kTokens: 0.0004, outputPricePer1kTokens: 0.0016 },
  { id: 'gpt-4.1-nano', displayName: 'GPT-4.1 Nano', maxContextTokens: 1047576, inputPricePer1kTokens: 0.0001, outputPricePer1kTokens: 0.0004 },
  { id: 'o3-mini', displayName: 'o3-mini', maxContextTokens: 200000, inputPricePer1kTokens: 0.0011, outputPricePer1kTokens: 0.0044 },
]

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai'
  readonly displayName = 'OpenAI'
  readonly supportedModels = OPENAI_MODELS
  readonly capabilities: ProviderCapabilities = {
    structuredOutput: true,
    toolUse: true,
    streaming: true,
  }

  private client: OpenAI

  constructor(config: ProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? 'https://api.openai.com/v1',
    })
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.3,
    }

    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
      params.tool_choice = 'auto'
    }

    if (request.responseFormat) {
      params.response_format = request.responseFormat
    }

    const completion = await this.client.chat.completions.create(params)
    const choice = completion.choices[0]
    if (!choice) throw new Error('OpenAI returned empty choices')

    const toolCalls = choice.message.tool_calls?.map((tc) => ({
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }))

    return {
      content: choice.message.content ?? '',
      toolCalls,
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      },
      model: completion.model,
      providerId: this.id,
    }
  }

  estimateCost(usage: TokenUsage, model: string): number {
    const info = this.supportedModels.find((m) => m.id === model)
    if (!info) return 0
    return (usage.inputTokens / 1000) * info.inputPricePer1kTokens + (usage.outputTokens / 1000) * info.outputPricePer1kTokens
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ai/src/providers/openai.ts && git commit -m "feat(ai): implement OpenAI provider adapter"
```

---

## Task 4: Anthropic Provider 适配器

**Files:**
- Create: `packages/ai/src/providers/anthropic.ts`

- [ ] **Step 1: 实现 AnthropicProvider**

```ts
import Anthropic from '@anthropic-ai/sdk'
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ModelInfo,
  ProviderCapabilities,
  ProviderConfig,
  TokenUsage,
} from './types'

const ANTHROPIC_MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-4-5-20250514', displayName: 'Claude Sonnet 4.5', maxContextTokens: 200000, inputPricePer1kTokens: 0.003, outputPricePer1kTokens: 0.015 },
  { id: 'claude-haiku-4-5-20250514', displayName: 'Claude Haiku 4.5', maxContextTokens: 200000, inputPricePer1kTokens: 0.0008, outputPricePer1kTokens: 0.004 },
  { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', maxContextTokens: 200000, inputPricePer1kTokens: 0.015, outputPricePer1kTokens: 0.075 },
]

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic'
  readonly displayName = 'Anthropic'
  readonly supportedModels = ANTHROPIC_MODELS
  readonly capabilities: ProviderCapabilities = {
    structuredOutput: true,
    toolUse: true,
    streaming: true,
  }

  private client: Anthropic

  constructor(config: ProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    })
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    const systemMessage = request.messages.find((m) => m.role === 'system')
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system')

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    }

    if (systemMessage) {
      params.system = systemMessage.content
    }

    if (request.temperature !== undefined) {
      params.temperature = request.temperature
    }

    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool.InputSchema,
      }))
    }

    const response = await this.client.messages.create(params)

    let content = ''
    const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = []

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        })
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
      providerId: this.id,
    }
  }

  estimateCost(usage: TokenUsage, model: string): number {
    const info = this.supportedModels.find((m) => m.id === model)
    if (!info) return 0
    return (usage.inputTokens / 1000) * info.inputPricePer1kTokens + (usage.outputTokens / 1000) * info.outputPricePer1kTokens
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ai/src/providers/anthropic.ts && git commit -m "feat(ai): implement Anthropic provider adapter"
```

---

## Task 5: OpenAI 兼容 Provider 适配器（百炼/火山/DeepSeek/Custom）

**Files:**
- Create: `packages/ai/src/providers/openai-compat.ts`

- [ ] **Step 1: 实现 OpenAICompatProvider**

```ts
import OpenAI from 'openai'
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ModelInfo,
  ProviderCapabilities,
  ProviderConfig,
  TokenUsage,
} from './types'

export interface OpenAICompatConfig extends ProviderConfig {
  providerId: string
  providerDisplayName: string
  models: ModelInfo[]
  capabilities?: Partial<ProviderCapabilities>
}

/**
 * 通用 OpenAI 兼容适配器。
 * 百炼、火山引擎、DeepSeek、Ollama 等均通过此类接入。
 */
export class OpenAICompatProvider implements LLMProvider {
  readonly id: string
  readonly displayName: string
  readonly supportedModels: ModelInfo[]
  readonly capabilities: ProviderCapabilities

  private client: OpenAI

  constructor(config: OpenAICompatConfig) {
    this.id = config.providerId
    this.displayName = config.providerDisplayName
    this.supportedModels = config.models
    this.capabilities = {
      structuredOutput: config.capabilities?.structuredOutput ?? true,
      toolUse: config.capabilities?.toolUse ?? true,
      streaming: config.capabilities?.streaming ?? true,
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    })
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.3,
    }

    if (request.tools && request.tools.length > 0 && this.capabilities.toolUse) {
      params.tools = request.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
      params.tool_choice = 'auto'
    }

    if (request.responseFormat && this.capabilities.structuredOutput) {
      params.response_format = request.responseFormat
    }

    const completion = await this.client.chat.completions.create(params)
    const choice = completion.choices[0]
    if (!choice) throw new Error(`${this.displayName} returned empty choices`)

    const toolCalls = choice.message.tool_calls?.map((tc) => ({
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }))

    return {
      content: choice.message.content ?? '',
      toolCalls,
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      },
      model: completion.model,
      providerId: this.id,
    }
  }

  estimateCost(usage: TokenUsage, model: string): number {
    const info = this.supportedModels.find((m) => m.id === model)
    if (!info) return 0
    return (usage.inputTokens / 1000) * info.inputPricePer1kTokens + (usage.outputTokens / 1000) * info.outputPricePer1kTokens
  }
}

/** 预配置的百炼 Provider */
export function createBailianProvider(config: ProviderConfig): OpenAICompatProvider {
  return new OpenAICompatProvider({
    ...config,
    baseUrl: config.baseUrl ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    providerId: 'bailian',
    providerDisplayName: '阿里云百炼',
    models: [
      { id: 'qwen-max', displayName: 'Qwen Max', maxContextTokens: 32000, inputPricePer1kTokens: 0.002, outputPricePer1kTokens: 0.006 },
      { id: 'qwen-plus', displayName: 'Qwen Plus', maxContextTokens: 131072, inputPricePer1kTokens: 0.0008, outputPricePer1kTokens: 0.002 },
      { id: 'qwen-turbo', displayName: 'Qwen Turbo', maxContextTokens: 131072, inputPricePer1kTokens: 0.0003, outputPricePer1kTokens: 0.0006 },
      { id: 'qwen3-235b-a22b', displayName: 'Qwen3 235B', maxContextTokens: 131072, inputPricePer1kTokens: 0.004, outputPricePer1kTokens: 0.012 },
    ],
  })
}

/** 预配置的火山引擎 Provider */
export function createVolcengineProvider(config: ProviderConfig): OpenAICompatProvider {
  return new OpenAICompatProvider({
    ...config,
    baseUrl: config.baseUrl ?? 'https://ark.cn-beijing.volces.com/api/v3',
    providerId: 'volcengine',
    providerDisplayName: '火山引擎',
    models: [
      { id: 'doubao-1-5-pro-256k', displayName: '豆包 1.5 Pro', maxContextTokens: 256000, inputPricePer1kTokens: 0.0008, outputPricePer1kTokens: 0.002 },
      { id: 'doubao-1-5-lite-32k', displayName: '豆包 1.5 Lite', maxContextTokens: 32000, inputPricePer1kTokens: 0.0003, outputPricePer1kTokens: 0.0006 },
    ],
  })
}

/** 预配置的 DeepSeek Provider */
export function createDeepSeekProvider(config: ProviderConfig): OpenAICompatProvider {
  return new OpenAICompatProvider({
    ...config,
    baseUrl: config.baseUrl ?? 'https://api.deepseek.com/v1',
    providerId: 'deepseek',
    providerDisplayName: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', displayName: 'DeepSeek Chat (V3)', maxContextTokens: 65536, inputPricePer1kTokens: 0.00027, outputPricePer1kTokens: 0.0011 },
      { id: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner (R1)', maxContextTokens: 65536, inputPricePer1kTokens: 0.00055, outputPricePer1kTokens: 0.0022 },
    ],
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ai/src/providers/openai-compat.ts && git commit -m "feat(ai): implement OpenAI-compatible provider (Bailian, Volcengine, DeepSeek, Custom)"
```

---

## Task 6: ProviderRegistry

**Files:**
- Create: `packages/ai/src/providers/registry.ts`
- Create: `packages/ai/src/providers/index.ts`

- [ ] **Step 1: 实现 ProviderRegistry**

```ts
import type { LLMProvider, ProviderConfig } from './types'
import { OpenAIProvider } from './openai'
import { AnthropicProvider } from './anthropic'
import {
  OpenAICompatProvider,
  type OpenAICompatConfig,
  createBailianProvider,
  createVolcengineProvider,
  createDeepSeekProvider,
} from './openai-compat'

type BuiltInProviderId = 'openai' | 'anthropic' | 'bailian' | 'volcengine' | 'deepseek'

const BUILTIN_FACTORIES: Record<BuiltInProviderId, (config: ProviderConfig) => LLMProvider> = {
  openai: (c) => new OpenAIProvider(c),
  anthropic: (c) => new AnthropicProvider(c),
  bailian: (c) => createBailianProvider(c),
  volcengine: (c) => createVolcengineProvider(c),
  deepseek: (c) => createDeepSeekProvider(c),
}

/**
 * Provider 注册表：管理所有 LLM Provider 实例的创建和获取。
 */
export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>()

  /**
   * 注册一个内置 Provider。
   * 如果 Provider 的 API Key 存在于环境变量或 Settings 中，则创建实例。
   */
  registerBuiltIn(providerId: BuiltInProviderId, config: ProviderConfig): void {
    const factory = BUILTIN_FACTORIES[providerId]
    if (!factory) throw new Error(`Unknown built-in provider: ${providerId}`)
    this.providers.set(providerId, factory(config))
  }

  /**
   * 注册一个自定义 OpenAI 兼容 Provider。
   */
  registerCustom(config: OpenAICompatConfig): void {
    this.providers.set(config.providerId, new OpenAICompatProvider(config))
  }

  /**
   * 获取指定 Provider 实例。
   */
  get(providerId: string): LLMProvider | undefined {
    return this.providers.get(providerId)
  }

  /**
   * 获取指定 Provider，不存在则抛异常。
   */
  getOrThrow(providerId: string): LLMProvider {
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error(`Provider "${providerId}" not registered. Check API key configuration.`)
    return provider
  }

  /**
   * 列出所有已注册的 Provider ID。
   */
  listRegistered(): string[] {
    return [...this.providers.keys()]
  }

  /**
   * 列出所有可用的内置 Provider ID（不管是否注册）。
   */
  listBuiltIn(): BuiltInProviderId[] {
    return Object.keys(BUILTIN_FACTORIES) as BuiltInProviderId[]
  }
}
```

- [ ] **Step 2: 创建 providers/index.ts 导出**

```ts
export { ProviderRegistry } from './registry'
export { OpenAIProvider } from './openai'
export { AnthropicProvider } from './anthropic'
export { OpenAICompatProvider, createBailianProvider, createVolcengineProvider, createDeepSeekProvider } from './openai-compat'
export type { LLMProvider, LLMRequest, LLMResponse, ModelInfo, ProviderConfig, ProviderCapabilities, TokenUsage, Message, ToolDefinition, ToolCall } from './types'
```

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/providers/ && git commit -m "feat(ai): implement ProviderRegistry with 5 built-in + custom providers"
```

---

## Task 7: 结构化输出策略 + JSON 修复

**Files:**
- Create: `packages/ai/src/structured-output/strategy.ts`
- Create: `packages/ai/src/structured-output/json-repair.ts`

- [ ] **Step 1: 实现 JSON 修复工具**

```ts
import { jsonrepair } from 'jsonrepair'

/**
 * 尝试从 AI 响应中提取并修复 JSON。
 * 1. 尝试直接 parse
 * 2. 提取 ```json ... ``` 代码块
 * 3. 使用 jsonrepair 修复
 */
export function extractAndRepairJson(raw: string): unknown {
  const trimmed = raw.trim()

  // 1. 直接解析
  try {
    return JSON.parse(trimmed)
  } catch {
    // continue
  }

  // 2. 提取 markdown 代码块
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch?.[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {
      // continue to jsonrepair
    }
  }

  // 3. jsonrepair 兜底
  const repaired = jsonrepair(codeBlockMatch?.[1]?.trim() ?? trimmed)
  return JSON.parse(repaired)
}
```

- [ ] **Step 2: 实现结构化输出策略选择器**

```ts
import type { LLMProvider, LLMRequest, LLMResponse, ToolDefinition } from '../providers/types'
import { extractAndRepairJson } from './json-repair'
import type { ZodType } from 'zod'

export interface StructuredOutputOptions<T> {
  provider: LLMProvider
  request: LLMRequest
  schema: ZodType<T>
  toolName?: string
  toolDescription?: string
}

/**
 * 按 Provider capabilities 自动选择结构化输出策略：
 * 1. Tool Use → 直接拿到结构化对象
 * 2. JSON Mode → 强制返回 JSON 字符串
 * 3. Prompt 兜底 → jsonrepair 修复
 */
export async function invokeStructured<T>(options: StructuredOutputOptions<T>): Promise<{ data: T; response: LLMResponse }> {
  const { provider, request, schema, toolName = 'extract_result', toolDescription = 'Extract structured result' } = options

  let response: LLMResponse

  if (provider.capabilities.toolUse) {
    // Strategy 1: Tool Use
    const zodJsonSchema = schemaToJsonSchema(schema)
    const tool: ToolDefinition = {
      name: toolName,
      description: toolDescription,
      parameters: zodJsonSchema,
    }
    response = await provider.invoke({ ...request, tools: [tool] })
    if (response.toolCalls && response.toolCalls.length > 0) {
      const parsed = schema.parse(response.toolCalls[0].arguments)
      return { data: parsed, response }
    }
    // Fallback: tool use requested but AI responded with text
  } else if (provider.capabilities.structuredOutput) {
    // Strategy 2: JSON Mode
    response = await provider.invoke({ ...request, responseFormat: { type: 'json_object' } })
  } else {
    // Strategy 3: Prompt 兜底
    response = await provider.invoke(request)
  }

  // Parse from text content
  response = response ?? await provider.invoke(request)
  const rawJson = extractAndRepairJson(response.content)
  const parsed = schema.parse(rawJson)
  return { data: parsed, response }
}

/**
 * 将 Zod schema 转换为 JSON Schema（简化版，覆盖常用类型）。
 * 生产环境可替换为 zod-to-json-schema 库。
 */
function schemaToJsonSchema(zodSchema: ZodType<unknown>): Record<string, unknown> {
  // 使用 zod 的 _def 获取 shape（简化实现）
  const def = (zodSchema as any)._def
  if (def.typeName === 'ZodObject') {
    const shape = def.shape()
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = schemaToJsonSchema(value as ZodType<unknown>)
      if ((value as any)._def.typeName !== 'ZodOptional') {
        required.push(key)
      }
    }
    return { type: 'object', properties, required }
  }
  if (def.typeName === 'ZodArray') {
    return { type: 'array', items: schemaToJsonSchema(def.type) }
  }
  if (def.typeName === 'ZodString') return { type: 'string' }
  if (def.typeName === 'ZodNumber') return { type: 'number' }
  if (def.typeName === 'ZodBoolean') return { type: 'boolean' }
  if (def.typeName === 'ZodEnum') return { type: 'string', enum: def.values }
  if (def.typeName === 'ZodNullable') {
    const inner = schemaToJsonSchema(def.innerType)
    return { ...inner, nullable: true }
  }
  if (def.typeName === 'ZodDefault') return schemaToJsonSchema(def.innerType)
  return { type: 'string' }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/structured-output/ && git commit -m "feat(ai): structured output strategy (tool-use → json-mode → prompt fallback + jsonrepair)"
```

---

## Task 8: Prompt 模板加载器 + 图谱上下文构建器

**Files:**
- Create: `packages/ai/src/context/prompt-loader.ts`
- Create: `packages/ai/src/context/graph-summary.ts`
- Create: `data/prompts/extract-from-feed.md`
- Create: `data/prompts/_shared/output-format.md`

- [ ] **Step 1: 实现 Prompt 模板加载器**

```ts
import fs from 'node:fs'
import path from 'node:path'
import Handlebars from 'handlebars'

const templateCache = new Map<string, HandlebarsTemplateDelegate>()

/**
 * 加载并编译 Prompt 模板。
 * 模板路径相对于 data/prompts/ 目录。
 */
export function loadPromptTemplate(templateName: string, promptsDir: string): HandlebarsTemplateDelegate {
  const cached = templateCache.get(templateName)
  if (cached) return cached

  const filePath = path.join(promptsDir, `${templateName}.md`)
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt template not found: ${filePath}`)
  }

  const source = fs.readFileSync(filePath, 'utf-8')

  // 加载 _shared/ 下的 partial 模板
  const sharedDir = path.join(promptsDir, '_shared')
  if (fs.existsSync(sharedDir)) {
    for (const file of fs.readdirSync(sharedDir)) {
      if (file.endsWith('.md')) {
        const partialName = file.replace('.md', '').replace(/-/g, '_')
        const partialSource = fs.readFileSync(path.join(sharedDir, file), 'utf-8')
        Handlebars.registerPartial(partialName, partialSource)
      }
    }
  }

  const compiled = Handlebars.compile(source)
  templateCache.set(templateName, compiled)
  return compiled
}

/**
 * 清空模板缓存（用于热加载场景）。
 */
export function clearTemplateCache(): void {
  templateCache.clear()
}
```

- [ ] **Step 2: 实现图谱上下文构建器**

```ts
import { getDb } from '@galaxy/db'
import { nodes } from '@galaxy/db/schema'

interface GraphSummaryResult {
  totalNodes: number
  domains: Array<{ domain: string; titles: string[] }>
  rawText: string
}

/**
 * 构建当前图谱的概要上下文，注入到 AI prompt 中。
 * 按 domain 分组列出所有节点标题。
 */
export function buildGraphSummary(): GraphSummaryResult {
  const db = getDb()
  const allNodes = db.select({ title: nodes.title, domain: nodes.domain }).from(nodes).all()

  const domainMap = new Map<string, string[]>()
  for (const node of allNodes) {
    const domain = node.domain ?? '未分类'
    const existing = domainMap.get(domain) ?? []
    existing.push(node.title)
    domainMap.set(domain, existing)
  }

  const domains = [...domainMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([domain, titles]) => ({ domain, titles }))

  const rawText = domains
    .map((d) => `【${d.domain}】${d.titles.join('、')}`)
    .join('\n')

  return { totalNodes: allNodes.length, domains, rawText }
}
```

- [ ] **Step 3: 创建投喂抽取 Prompt 模板**

创建 `data/prompts/extract-from-feed.md`：

```markdown
# 任务：从投喂内容中抽取候选概念

## 你的角色
你是一个知识图谱助手。用户正在构建一个个人知识库，你需要从投喂的内容中识别出可以作为知识节点的候选概念，以及它们之间的关联关系。

## 当前图谱概况
{{graph_summary}}

## 投喂内容
{{feed_content}}

## 你的任务

1. 分析上述投喂内容，识别可作为知识节点的候选概念
2. 每个候选概念需要：标题（≤50字）、摘要（≤200字）、所属领域
3. 识别候选概念与现有图谱节点之间的关联关系
4. 识别候选概念之间的关联关系
5. 给每条建议自评置信度（0-1），并说明推荐理由

## 约束

- 宁缺毋滥：只提取真正有价值的概念，不要提取过于宽泛或琐碎的内容
- 避免重复：如果候选概念与现有图谱中的节点高度相似，不要重复提取
- 关联类型只能是：contains（包含）、related（相关）、opposes（对立）、instance_of（是...的实例）、evolved_from（由...演化）、cites（引用）
- 自检清单：
  1. 是否与已有节点重复？
  2. 是否过于宽泛/琐碎？
  3. 关联是否真实存在还是牵强附会？

{{output_format_instruction}}
```

- [ ] **Step 4: 创建输出格式共享模板**

创建 `data/prompts/_shared/output-format.md`：

```markdown
请严格按以下 JSON 格式输出结果，不要输出任何其他内容：

{
  "new_nodes": [
    {
      "title": "概念名称",
      "summary": "一句话概要",
      "domain": "所属领域",
      "confidence": 0.85,
      "rationale": "推荐理由",
      "suggested_edges": [
        {
          "target_node_title": "已有或新建节点的标题",
          "relation_type": "related"
        }
      ]
    }
  ],
  "new_edges": [
    {
      "source_title": "节点A标题",
      "target_title": "节点B标题",
      "relation_type": "related",
      "confidence": 0.8,
      "rationale": "推荐理由"
    }
  ]
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/context/ data/prompts/ && git commit -m "feat(ai): prompt template loader + graph context builder + extract-from-feed template"
```

---

## Task 9: 投喂抽取任务 Schema + 业务逻辑

**Files:**
- Create: `packages/ai/src/tasks/schemas.ts`
- Create: `packages/ai/src/tasks/extract-from-feed.ts`

- [ ] **Step 1: 定义输出 Schema**

```ts
import { z } from 'zod'

const RELATION_TYPES = ['contains', 'related', 'opposes', 'instance_of', 'evolved_from', 'cites'] as const

export const SuggestedEdgeSchema = z.object({
  target_node_title: z.string(),
  relation_type: z.enum(RELATION_TYPES),
})

export const NewNodeExtractionSchema = z.object({
  title: z.string().max(50),
  summary: z.string().max(200),
  domain: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  suggested_edges: z.array(SuggestedEdgeSchema),
})

export const NewEdgeExtractionSchema = z.object({
  source_title: z.string(),
  target_title: z.string(),
  relation_type: z.enum(RELATION_TYPES),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
})

export const FeedExtractionResultSchema = z.object({
  new_nodes: z.array(NewNodeExtractionSchema),
  new_edges: z.array(NewEdgeExtractionSchema).default([]),
})

export type FeedExtractionResult = z.infer<typeof FeedExtractionResultSchema>
```

- [ ] **Step 2: 实现投喂抽取任务**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { getDb } from '@galaxy/db'
import { suggestions, feedItems, aiCallLogs } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import type { LLMProvider } from '../providers/types'
import { invokeStructured } from '../structured-output/strategy'
import { loadPromptTemplate } from '../context/prompt-loader'
import { buildGraphSummary } from '../context/graph-summary'
import { FeedExtractionResultSchema, type FeedExtractionResult } from './schemas'

export interface ExtractFromFeedInput {
  feedItemId: string
  parsedContent: string
  provider: LLMProvider
  model: string
  promptsDir: string
}

export interface ExtractFromFeedOutput {
  result: FeedExtractionResult
  suggestionsCreated: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
}

/**
 * 从 _shared/output-format.md 读取输出格式说明。
 */
function getOutputFormatInstruction(promptsDir: string): string {
  const filePath = path.join(promptsDir, '_shared', 'output-format.md')
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8')
  }
  return '请以 JSON 格式输出结果。'
}

/**
 * 投喂抽取任务：
 * 1. 构建 prompt（模板 + 图谱上下文 + 投喂内容）
 * 2. 调用 LLM 获取结构化输出
 * 3. 写入 suggestions 表
 * 4. 写入 ai_call_logs 表
 */
export async function extractFromFeed(input: ExtractFromFeedInput): Promise<ExtractFromFeedOutput> {
  const startTime = Date.now()
  const db = getDb()

  // 1. 构建 prompt（单次模板编译，output_format 直接内联）
  const graphSummary = buildGraphSummary()
  const template = loadPromptTemplate('extract-from-feed', input.promptsDir)
  const finalPrompt = template({
    graph_summary: graphSummary.totalNodes > 0
      ? `当前图谱共有 ${graphSummary.totalNodes} 个节点：\n${graphSummary.rawText}`
      : '当前图谱为空，这是第一次投喂。',
    feed_content: input.parsedContent,
    output_format_instruction: getOutputFormatInstruction(input.promptsDir),
  })

  // 2. 调用 LLM
  const { data, response } = await invokeStructured({
    provider: input.provider,
    request: {
      model: input.model,
      messages: [
        { role: 'system', content: '你是一个知识图谱助手，帮助用户从文本中抽取结构化知识。' },
        { role: 'user', content: finalPrompt },
      ],
      maxTokens: 4096,
      temperature: 0.3,
    },
    schema: FeedExtractionResultSchema,
    toolName: 'extract_knowledge',
    toolDescription: '从投喂内容中抽取候选知识节点和关联',
  })

  const durationMs = Date.now() - startTime
  const costUsd = input.provider.estimateCost(response.usage, input.model)

  // 3. 写入 suggestions
  const now = nowIso()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  let suggestionsCreated = 0

  for (const node of data.new_nodes) {
    db.insert(suggestions)
      .values({
        id: generateId('s'),
        type: 'new_node',
        source: 'feed',
        source_ref_id: input.feedItemId,
        payload: JSON.stringify(node),
        rationale: node.rationale,
        confidence: node.confidence,
        status: 'pending',
        created_at: now,
        expires_at: expiresAt,
        provider_id: input.provider.id,
        model: input.model,
      })
      .run()
    suggestionsCreated++
  }

  for (const edge of data.new_edges) {
    db.insert(suggestions)
      .values({
        id: generateId('s'),
        type: 'new_edge',
        source: 'feed',
        source_ref_id: input.feedItemId,
        payload: JSON.stringify(edge),
        rationale: edge.rationale,
        confidence: edge.confidence,
        status: 'pending',
        created_at: now,
        expires_at: expiresAt,
        provider_id: input.provider.id,
        model: input.model,
      })
      .run()
    suggestionsCreated++
  }

  // 4. 更新 feed_items
  db.update(feedItems)
    .set({ status: 'done', suggestions_count: suggestionsCreated })
    .where(eq(feedItems.id, input.feedItemId))
    .run()

  // 5. 写入 ai_call_logs
  db.insert(aiCallLogs)
    .values({
      id: generateId('l'),
      channel: 'direct',
      task: 'extract_from_feed',
      provider_id: input.provider.id,
      model: input.model,
      input_tokens: response.usage.inputTokens,
      output_tokens: response.usage.outputTokens,
      cost_usd: costUsd,
      duration_ms: durationMs,
      status: 'success',
      created_at: now,
    })
    .run()

  return {
    result: data,
    suggestionsCreated,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    costUsd,
    durationMs,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/tasks/ && git commit -m "feat(ai): feed extraction task with Zod schema + suggestion writing"
```

---

## Task 10: 预算追踪 + DirectChannel + ai 包最终导出

**Files:**
- Create: `packages/ai/src/budget.ts`
- Create: `packages/ai/src/direct-channel.ts`
- Modify: `packages/ai/src/index.ts`

- [ ] **Step 1: 实现预算追踪**

```ts
import { getDb } from '@galaxy/db'
import { settings, aiCallLogs } from '@galaxy/db/schema'
import { eq, sql } from 'drizzle-orm'

/**
 * 检查当月预算是否超限。
 * 返回 true 表示还有预算，false 表示已超限。
 */
export function checkBudget(): { withinBudget: boolean; currentCost: number; budgetLimit: number } {
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row || !row.enable_monthly_budget) {
    return { withinBudget: true, currentCost: 0, budgetLimit: Infinity }
  }

  const currentMonthKey = new Date().toISOString().slice(0, 7) // YYYY-MM

  // 如果是新月份，重置累计
  if (row.current_month_key !== currentMonthKey) {
    db.update(settings)
      .set({ current_month_key: currentMonthKey, current_month_cost_usd: 0 })
      .where(eq(settings.id, 1))
      .run()
    return { withinBudget: true, currentCost: 0, budgetLimit: row.monthly_budget_usd }
  }

  return {
    withinBudget: row.current_month_cost_usd < row.monthly_budget_usd,
    currentCost: row.current_month_cost_usd,
    budgetLimit: row.monthly_budget_usd,
  }
}

/**
 * 累加本月消费。
 */
export function addCost(costUsd: number): void {
  const db = getDb()
  const currentMonthKey = new Date().toISOString().slice(0, 7)
  db.update(settings)
    .set({
      current_month_cost_usd: sql`${settings.current_month_cost_usd} + ${costUsd}`,
      current_month_key: currentMonthKey,
    })
    .where(eq(settings.id, 1))
    .run()
}
```

- [ ] **Step 2: 实现 DirectChannel**

```ts
import { ProviderRegistry } from './providers/registry'
import { extractFromFeed, type ExtractFromFeedInput, type ExtractFromFeedOutput } from './tasks/extract-from-feed'
import { checkBudget, addCost } from './budget'

export class DirectChannel {
  constructor(
    private registry: ProviderRegistry,
    private promptsDir: string,
  ) {}

  /**
   * 执行投喂抽取。
   */
  async extractFromFeed(
    feedItemId: string,
    parsedContent: string,
    providerId: string,
    model: string,
  ): Promise<ExtractFromFeedOutput> {
    // 预算检查
    const budget = checkBudget()
    if (!budget.withinBudget) {
      throw new Error(`月度预算已达上限（$${budget.currentCost.toFixed(2)} / $${budget.budgetLimit.toFixed(2)}）`)
    }

    const provider = this.registry.getOrThrow(providerId)

    const result = await extractFromFeed({
      feedItemId,
      parsedContent,
      provider,
      model,
      promptsDir: this.promptsDir,
    })

    // 累加成本
    addCost(result.costUsd)

    return result
  }
}
```

- [ ] **Step 3: 更新 src/index.ts**

```ts
export { ProviderRegistry } from './providers/registry'
export { DirectChannel } from './direct-channel'
export { checkBudget, addCost } from './budget'
export { extractFromFeed } from './tasks/extract-from-feed'
export { FeedExtractionResultSchema } from './tasks/schemas'
export { buildGraphSummary } from './context/graph-summary'
export { loadPromptTemplate, clearTemplateCache } from './context/prompt-loader'
export type { LLMProvider, LLMRequest, LLMResponse, ProviderConfig, ModelInfo, TokenUsage } from './providers/types'
export type { ExtractFromFeedInput, ExtractFromFeedOutput } from './tasks/extract-from-feed'
```

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/ && git commit -m "feat(ai): budget tracker + DirectChannel + finalize package exports"
```

---

## Task 11: 扩展 shared types

**Files:**
- Modify: `packages/shared/src/types/domain.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 在 domain.ts 末尾追加 Suggestion / FeedItem / Settings 类型**

在文件末尾追加：

```ts
/** 建议类型 */
export const SUGGESTION_TYPES = ['new_node', 'new_edge', 'fill_aspect', 'update_aspect', 'merge_nodes'] as const
export type SuggestionType = (typeof SUGGESTION_TYPES)[number]

/** 建议来源 */
export const SUGGESTION_SOURCES = ['feed', 'proactive_scan', 'deepdive'] as const
export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number]

/** 投喂类型 */
export const FEED_ITEM_TYPES = ['text', 'url', 'file_md', 'file_pdf'] as const
export type FeedItemType = (typeof FEED_ITEM_TYPES)[number]

/** 投喂状态 */
export const FEED_ITEM_STATUSES = ['processing', 'done', 'failed'] as const
export type FeedItemStatus = (typeof FEED_ITEM_STATUSES)[number]

/**
 * 待审建议 —— `suggestions` 表的镜像。
 */
export interface Suggestion {
  id: string
  type: SuggestionType
  source: SuggestionSource
  source_ref_id: string | null
  payload: unknown
  rationale: string | null
  confidence: number
  status: SuggestionStatus
  decided_at: string | null
  decided_payload: unknown | null
  decision_note: string | null
  provider_id: string | null
  /** AI 调用时使用的模型 ID */
  model: string | null
  created_at: string
  expires_at: string | null
}

/**
 * 投喂记录 —— `feed_items` 表的镜像。
 */
export interface FeedItem {
  id: string
  type: FeedItemType
  raw_content: string | null
  file_path: string | null
  source_url: string | null
  status: FeedItemStatus
  error_message: string | null
  suggestions_count: number
  created_at: string
}

/**
 * AI 调用日志 —— `ai_call_logs` 表的镜像。
 */
export interface AiCallLog {
  id: string
  channel: 'direct' | 'bridge'
  task: string
  provider_id: string | null
  model: string | null
  base_url: string | null
  input_tokens: number
  output_tokens: number
  cost_usd: number
  duration_ms: number
  status: 'success' | 'failed' | 'timeout'
  error_message: string | null
  created_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/types/domain.ts && git commit -m "feat(shared): add Suggestion, FeedItem, AiCallLog types"
```

---

## Task 12: DB schema 补充 + 生成 Migration

**Files:**
- Modify: `packages/db/src/schema/feed-items.ts` (添加 `parsed_content` 列)
- Run: `pnpm db:generate` 生成 migration

- [ ] **Step 1: 在 feed-items.ts 的 `raw_content` 之后添加 `parsed_content` 列**

在 `raw_content: text('raw_content'),` 之后添加一行：

```ts
  parsed_content: text('parsed_content'),
```

- [ ] **Step 2: 生成 Drizzle migration**

Run: `cd /Users/eleme/galaxy && pnpm db:generate`
Expected: 在 `packages/db/drizzle/` 生成新的 migration SQL 文件

- [ ] **Step 3: Commit**

```bash
git add packages/db/ && git commit -m "feat(db): add parsed_content to feed_items + generate migration"
```

---

## Task 13: 安装 web 包新依赖 + webpack 配置

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.mjs`

- [ ] **Step 1: 在 apps/web 安装新依赖**

Run:
```bash
cd /Users/eleme/galaxy/apps/web && pnpm add @galaxy/ai@workspace:* @extractus/article-extractor pdf-parse
cd /Users/eleme/galaxy/apps/web && pnpm add -D @types/pdf-parse
```

- [ ] **Step 2: 在 next.config.mjs 的 externals 中添加 openai 和 @anthropic-ai/sdk**

在 `config.externals.push` 调用中添加：

```js
config.externals.push({
  'better-sqlite3': 'commonjs better-sqlite3',
  'openai': 'commonjs openai',
  '@anthropic-ai/sdk': 'commonjs @anthropic-ai/sdk',
})
```

并在 `serverComponentsExternalPackages` 数组中添加 `'openai'`, `'@anthropic-ai/sdk'`。

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json apps/web/next.config.mjs pnpm-lock.yaml && git commit -m "feat(web): add @galaxy/ai + content extraction deps + webpack externals"
```

---

## Task 14: API Route — POST /api/feed

**Files:**
- Create: `apps/web/app/api/feed/route.ts`
- Modify: `apps/web/lib/api/schemas.ts` (新增 FeedSchema)

- [ ] **Step 1: 在 schemas.ts 末尾追加 Feed 相关 schema**

```ts
export const FeedTextSchema = z.object({
  type: z.literal('text'),
  content: z.string().trim().min(1).max(100000),
})

export const FeedUrlSchema = z.object({
  type: z.literal('url'),
  url: z.string().url(),
})

export const FeedFileSchema = z.object({
  type: z.enum(['file_md', 'file_pdf']),
  /** Base64 编码的文件内容 */
  file_content: z.string().min(1),
  file_name: z.string().min(1),
})

export const FeedSchema = z.discriminatedUnion('type', [FeedTextSchema, FeedUrlSchema, FeedFileSchema])
export type FeedInput = z.infer<typeof FeedSchema>

export const ConfirmActionSchema = z.object({
  action: z.enum(['accept', 'reject', 'accept_modified']),
  modified_payload: z.unknown().optional(),
  decision_note: z.string().max(500).optional(),
})
export type ConfirmAction = z.infer<typeof ConfirmActionSchema>

export const BatchConfirmSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  action: z.enum(['accept', 'reject']),
  decision_note: z.string().max(500).optional(),
})
export type BatchConfirmInput = z.infer<typeof BatchConfirmSchema>
```

- [ ] **Step 2: 创建 apps/web/app/api/feed/route.ts**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { feedItems, settings } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import { eq } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'
import { FeedSchema } from '@/lib/api/schemas'
import { ProviderRegistry, DirectChannel } from '@galaxy/ai'
import path from 'node:path'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function resolvePromptsDir(): string {
  const fs = await import('node:fs')
  const candidates = [
    path.resolve(process.cwd(), 'data', 'prompts'),
    path.resolve(process.cwd(), '..', '..', 'data', 'prompts'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  throw new Error(`Cannot find data/prompts folder. Tried: ${candidates.join(', ')}`)
}

function buildRegistry(): { registry: ProviderRegistry; defaultProvider: string; defaultModel: string } {
  ensureDb()
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  const registry = new ProviderRegistry()

  // ENV 变量映射
  const envMap: Record<string, { envKey: string }> = {
    openai: { envKey: 'OPENAI_API_KEY' },
    anthropic: { envKey: 'ANTHROPIC_API_KEY' },
    bailian: { envKey: 'DASHSCOPE_API_KEY' },
    volcengine: { envKey: 'ARK_API_KEY' },
    deepseek: { envKey: 'DEEPSEEK_API_KEY' },
  }

  // 从 Settings 中获取 credentials 覆盖
  const creds = (row?.provider_credentials ?? {}) as Record<string, { api_key?: string; base_url?: string }>

  for (const [providerId, { envKey }] of Object.entries(envMap)) {
    const apiKey = process.env[envKey] ?? creds[providerId]?.api_key
    if (apiKey) {
      registry.registerBuiltIn(providerId as any, {
        apiKey,
        baseUrl: creds[providerId]?.base_url,
      })
    }
  }

  const defaultProvider = row?.default_provider ?? process.env.GALAXY_DEFAULT_PROVIDER ?? 'openai'
  const defaultModel = row?.default_model ?? process.env.GALAXY_DEFAULT_MODEL ?? 'gpt-4o-mini'

  return { registry, defaultProvider, defaultModel }
}

async function parseContent(input: Record<string, unknown>): Promise<string> {
  const type = input.type as string
  if (type === 'text') return (input.content as string) ?? ''

  if (type === 'url' && input.url) {
    const { extract } = await import('@extractus/article-extractor')
    const article = await extract(input.url as string)
    if (!article?.content) throw new Error('无法从该 URL 提取内容')
    return article.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  if (type === 'file_md' && input.file_content) {
    return Buffer.from(input.file_content as string, 'base64').toString('utf-8')
  }

  if (type === 'file_pdf' && input.file_content) {
    const pdfParse = (await import('pdf-parse')).default
    const buffer = Buffer.from(input.file_content as string, 'base64')
    const result = await pdfParse(buffer)
    return result.text
  }

  throw new Error(`不支持的投喂类型: ${type}`)
}

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = FeedSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const db = getDb()
  const feedId = generateId('f')
  const now = nowIso()

  // 1. 写入 feed_items
  db.insert(feedItems)
    .values({
      id: feedId,
      type: parsed.data.type,
      raw_content: 'content' in parsed.data ? parsed.data.content : null,
      source_url: 'url' in parsed.data ? parsed.data.url : null,
      status: 'processing',
      created_at: now,
    })
    .run()

  try {
    // 2. 解析内容
    const parsedContent = await parseContent(parsed.data)

    // 3. 检查 AI 开关
    const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()
    if (!settingsRow?.enable_feed_ai) {
      db.update(feedItems).set({ status: 'done', suggestions_count: 0 }).where(eq(feedItems.id, feedId)).run()
      return NextResponse.json({ data: { feed_item_id: feedId, suggestions_count: 0, suggestions: [] } })
    }

    // 4. 调用 AI
    const { registry, defaultProvider, defaultModel } = buildRegistry()
    const channel = new DirectChannel(registry, resolvePromptsDir())
    const result = await channel.extractFromFeed(feedId, parsedContent, defaultProvider, defaultModel)

    return NextResponse.json({
      data: {
        feed_item_id: feedId,
        suggestions_count: result.suggestionsCreated,
        cost_usd: result.costUsd,
        duration_ms: result.durationMs,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    db.update(feedItems)
      .set({ status: 'failed', error_message: message })
      .where(eq(feedItems.id, feedId))
      .run()
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/feed/ apps/web/lib/api/schemas.ts && git commit -m "feat(api): POST /api/feed — ingest content + AI extraction pipeline"
```

---

## Task 15: API Routes — Inbox (GET + confirm + batch)

**Files:**
- Create: `apps/web/app/api/inbox/route.ts`
- Create: `apps/web/app/api/inbox/[id]/confirm/route.ts`
- Create: `apps/web/app/api/inbox/batch/route.ts`

- [ ] **Step 1: 创建 GET /api/inbox**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { suggestions } from '@galaxy/db/schema'
import { eq, desc, and, gte, sql } from 'drizzle-orm'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  ensureDb()
  const db = getDb()
  const url = new URL(req.url)

  const status = url.searchParams.get('status') ?? 'pending'
  const source = url.searchParams.get('source')
  const type = url.searchParams.get('type')
  const minConfidence = url.searchParams.get('min_confidence')
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  const conditions = [eq(suggestions.status, status as any)]
  if (source) conditions.push(eq(suggestions.source, source as any))
  if (type) conditions.push(eq(suggestions.type, type as any))
  if (minConfidence) conditions.push(gte(suggestions.confidence, parseFloat(minConfidence)))

  const where = conditions.length === 1 ? conditions[0]! : and(...conditions)!

  const total = db.select({ count: sql<number>`count(*)` }).from(suggestions).where(where).get()?.count ?? 0
  const rows = db
    .select()
    .from(suggestions)
    .where(where)
    .orderBy(desc(suggestions.confidence), desc(suggestions.created_at))
    .limit(limit)
    .offset((page - 1) * limit)
    .all()

  return NextResponse.json({ data: rows, meta: { total, page, limit } })
}
```

- [ ] **Step 2: 创建 POST /api/inbox/:id/confirm**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { suggestions, nodes, edges } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { generateId, nowIso, slugify } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'
import { ConfirmActionSchema } from '@/lib/api/schemas'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = ConfirmActionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const db = getDb()
  const suggestion = db.select().from(suggestions).where(eq(suggestions.id, params.id)).get()
  if (!suggestion) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (suggestion.status !== 'pending') {
    return NextResponse.json({ error: '该建议已处理' }, { status: 409 })
  }

  const now = nowIso()
  const { action, modified_payload, decision_note } = parsed.data

  if (action === 'reject') {
    db.update(suggestions)
      .set({ status: 'rejected', decided_at: now, decision_note: decision_note ?? null })
      .where(eq(suggestions.id, params.id))
      .run()
    return NextResponse.json({ data: { id: params.id, status: 'rejected' } })
  }

  // accept or accept_modified
  const finalPayload = action === 'accept_modified' && modified_payload
    ? modified_payload
    : suggestion.payload
  const payloadObj = typeof finalPayload === 'string' ? JSON.parse(finalPayload) : finalPayload

  const createdEntities: Array<{ type: string; id: string }> = []

  if (suggestion.type === 'new_node') {
    const nodeId = generateId('n')
    db.insert(nodes)
      .values({
        id: nodeId,
        title: payloadObj.title,
        slug: slugify(payloadObj.title),
        summary: payloadObj.summary ?? null,
        domain: payloadObj.domain ?? null,
        created_by: 'ai_feed',
        ai_metadata: JSON.stringify({ suggestion_id: suggestion.id, provider: suggestion.provider_id, model: suggestion.model }),
      })
      .run()
    createdEntities.push({ type: 'node', id: nodeId })

    // 创建 suggested_edges（如果 target 节点存在）
    const suggestedEdges = payloadObj.suggested_edges ?? []
    for (const se of suggestedEdges) {
      const targetTitle = se.target_node_title
      const target = db.select().from(nodes).where(eq(nodes.title, targetTitle)).get()
      if (target) {
        const edgeId = generateId('e')
        try {
          db.insert(edges)
            .values({
              id: edgeId,
              source_node_id: nodeId,
              target_node_id: target.id,
              relation_type: se.relation_type,
              created_by: 'ai_feed',
            })
            .run()
          createdEntities.push({ type: 'edge', id: edgeId })
        } catch {
          // UNIQUE 冲突静默跳过
        }
      }
    }
  } else if (suggestion.type === 'new_edge') {
    const sourceNode = db.select().from(nodes).where(eq(nodes.title, payloadObj.source_title)).get()
    const targetNode = db.select().from(nodes).where(eq(nodes.title, payloadObj.target_title)).get()
    if (sourceNode && targetNode) {
      const edgeId = generateId('e')
      try {
        db.insert(edges)
          .values({
            id: edgeId,
            source_node_id: sourceNode.id,
            target_node_id: targetNode.id,
            relation_type: payloadObj.relation_type,
            created_by: 'ai_feed',
          })
          .run()
        createdEntities.push({ type: 'edge', id: edgeId })
      } catch {
        // UNIQUE 冲突静默跳过
      }
    }
  }

  db.update(suggestions)
    .set({
      status: action === 'accept_modified' ? 'accepted_modified' : 'accepted',
      decided_at: now,
      decided_payload: action === 'accept_modified' ? JSON.stringify(modified_payload) : null,
      decision_note: decision_note ?? null,
    })
    .where(eq(suggestions.id, params.id))
    .run()

  return NextResponse.json({ data: { id: params.id, status: action === 'accept_modified' ? 'accepted_modified' : 'accepted', created: createdEntities } })
}
```

- [ ] **Step 3: 创建 POST /api/inbox/batch**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { suggestions, nodes, edges } from '@galaxy/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { generateId, nowIso, slugify } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'
import { BatchConfirmSchema } from '@/lib/api/schemas'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = BatchConfirmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const db = getDb()
  const now = nowIso()
  const { ids, action, decision_note } = parsed.data

  // 批量 reject 直接更新
  if (action === 'reject') {
    db.update(suggestions)
      .set({ status: 'rejected', decided_at: now, decision_note: decision_note ?? null })
      .where(inArray(suggestions.id, ids))
      .run()
    return NextResponse.json({ data: { updated: ids.length, action: 'rejected' } })
  }

  // 批量 accept：逐条处理，为每条 suggestion 创建对应的 nodes/edges
  let accepted = 0
  const allCreated: Array<{ type: string; id: string }> = []

  for (const id of ids) {
    const suggestion = db.select().from(suggestions).where(eq(suggestions.id, id)).get()
    if (!suggestion || suggestion.status !== 'pending') continue

    const payloadObj = typeof suggestion.payload === 'string'
      ? JSON.parse(suggestion.payload)
      : suggestion.payload

    if (suggestion.type === 'new_node') {
      const nodeId = generateId('n')
      db.insert(nodes)
        .values({
          id: nodeId,
          title: payloadObj.title,
          slug: slugify(payloadObj.title),
          summary: payloadObj.summary ?? null,
          domain: payloadObj.domain ?? null,
          created_by: 'ai_feed',
          ai_metadata: JSON.stringify({ suggestion_id: id, provider: suggestion.provider_id, model: suggestion.model }),
        })
        .run()
      allCreated.push({ type: 'node', id: nodeId })

      for (const se of payloadObj.suggested_edges ?? []) {
        const target = db.select().from(nodes).where(eq(nodes.title, se.target_node_title)).get()
        if (target) {
          const edgeId = generateId('e')
          try {
            db.insert(edges).values({ id: edgeId, source_node_id: nodeId, target_node_id: target.id, relation_type: se.relation_type, created_by: 'ai_feed' }).run()
            allCreated.push({ type: 'edge', id: edgeId })
          } catch { /* UNIQUE 冲突跳过 */ }
        }
      }
    } else if (suggestion.type === 'new_edge') {
      const sourceNode = db.select().from(nodes).where(eq(nodes.title, payloadObj.source_title)).get()
      const targetNode = db.select().from(nodes).where(eq(nodes.title, payloadObj.target_title)).get()
      if (sourceNode && targetNode) {
        const edgeId = generateId('e')
        try {
          db.insert(edges).values({ id: edgeId, source_node_id: sourceNode.id, target_node_id: targetNode.id, relation_type: payloadObj.relation_type, created_by: 'ai_feed' }).run()
          allCreated.push({ type: 'edge', id: edgeId })
        } catch { /* UNIQUE 冲突跳过 */ }
      }
    }

    db.update(suggestions)
      .set({ status: 'accepted', decided_at: now, decision_note: decision_note ?? null })
      .where(eq(suggestions.id, id))
      .run()
    accepted++
  }

  return NextResponse.json({ data: { updated: accepted, action: 'accepted', created: allCreated } })
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/inbox/ && git commit -m "feat(api): GET /api/inbox + POST confirm + POST batch"
```

---

## Task 16: API Route — GET/PATCH /api/settings

**Files:**
- Create: `apps/web/app/api/settings/route.ts`

- [ ] **Step 1: 创建 settings route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { settings } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { nowIso } from '@galaxy/shared'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  ensureDb()
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row) return NextResponse.json({ error: 'settings not initialized' }, { status: 500 })

  // 隐藏敏感信息
  const safeRow = { ...row, provider_credentials: undefined }
  const creds = (row.provider_credentials ?? {}) as Record<string, { api_key?: string }>
  const configuredProviders = Object.entries(creds)
    .filter(([, v]) => v.api_key)
    .map(([k]) => k)

  return NextResponse.json({ data: { ...safeRow, configured_providers: configuredProviders } })
}

export async function PATCH(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const db = getDb()

  const allowedFields = [
    'enable_feed_ai', 'enable_proactive_scan', 'enable_deepdive',
    'default_provider', 'default_model',
    'provider_credentials', 'task_provider_overrides', 'custom_providers',
    'enable_monthly_budget', 'monthly_budget_usd',
  ] as const

  const patch: Record<string, unknown> = { updated_at: nowIso() }
  for (const field of allowedFields) {
    if (field in body) {
      patch[field] = body[field]
    }
  }

  db.update(settings).set(patch).where(eq(settings.id, 1)).run()
  const updated = db.select().from(settings).where(eq(settings.id, 1)).get()
  return NextResponse.json({ data: updated })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/api/settings/ && git commit -m "feat(api): GET/PATCH /api/settings"
```

---

## Task 17: 前端 API client + Zustand stores 扩展

**Files:**
- Modify: `apps/web/lib/api/client.ts`
- Create: `apps/web/lib/store/inbox-store.ts`
- Create: `apps/web/lib/store/settings-store.ts`

- [ ] **Step 1: 在 client.ts 末尾追加 feed / inbox / settings API 方法**

在 `api` 对象的 `deleteEdge` 之后追加：

```ts
  // Feed
  submitFeed: (input: { type: string; content?: string; url?: string }) =>
    fetch('/api/feed', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }).then((r) =>
      handle<{ feed_item_id: string; suggestions_count: number; cost_usd?: number; duration_ms?: number }>(r),
    ),

  // Inbox
  listInbox: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return fetch(`/api/inbox${qs}`).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = await r.json()
      return json as { data: Suggestion[]; meta: { total: number; page: number; limit: number } }
    })
  },
  confirmSuggestion: (id: string, input: { action: string; modified_payload?: unknown; decision_note?: string }) =>
    fetch(`/api/inbox/${id}/confirm`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }).then((r) =>
      handle<{ id: string; status: string; created?: Array<{ type: string; id: string }> }>(r),
    ),
  batchConfirm: (input: { ids: string[]; action: string; decision_note?: string }) =>
    fetch('/api/inbox/batch', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }).then((r) =>
      handle<{ updated: number; action: string }>(r),
    ),

  // Settings
  getSettings: () => fetch('/api/settings').then((r) => handle<Record<string, unknown>>(r)),
  updateSettings: (input: Record<string, unknown>) =>
    fetch('/api/settings', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input) }).then((r) =>
      handle<Record<string, unknown>>(r),
    ),
```

同时在文件顶部 import 中追加 `Suggestion`：

```ts
import type { Node, Edge, Suggestion } from '@galaxy/shared'
```

- [ ] **Step 2: 创建 inbox-store.ts**

```ts
import { create } from 'zustand'
import type { Suggestion } from '@galaxy/shared'
import { api } from '../api/client'

interface InboxState {
  suggestions: Suggestion[]
  total: number
  page: number
  loading: boolean
  error: string | null
  selectedIds: Set<string>

  loadInbox: (params?: Record<string, string>) => Promise<void>
  confirmOne: (id: string, action: 'accept' | 'reject' | 'accept_modified', opts?: { modified_payload?: unknown; decision_note?: string }) => Promise<void>
  batchConfirm: (action: 'accept' | 'reject') => Promise<void>
  toggleSelect: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
}

export const useInboxStore = create<InboxState>((set, get) => ({
  suggestions: [],
  total: 0,
  page: 1,
  loading: false,
  error: null,
  selectedIds: new Set(),

  async loadInbox(params) {
    set({ loading: true, error: null })
    try {
      const result = await api.listInbox(params)
      set({ suggestions: result.data, total: result.meta.total, page: result.meta.page, loading: false })
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false })
    }
  },

  async confirmOne(id, action, opts) {
    await api.confirmSuggestion(id, { action, ...opts })
    set({ suggestions: get().suggestions.filter((s) => s.id !== id), total: get().total - 1 })
  },

  async batchConfirm(action) {
    const ids = [...get().selectedIds]
    if (ids.length === 0) return
    await api.batchConfirm({ ids, action })
    set({
      suggestions: get().suggestions.filter((s) => !get().selectedIds.has(s.id)),
      total: get().total - ids.length,
      selectedIds: new Set(),
    })
  },

  toggleSelect(id) {
    const next = new Set(get().selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set({ selectedIds: next })
  },

  selectAll() {
    set({ selectedIds: new Set(get().suggestions.map((s) => s.id)) })
  },

  clearSelection() {
    set({ selectedIds: new Set() })
  },
}))
```

- [ ] **Step 3: 创建 settings-store.ts**

```ts
import { create } from 'zustand'
import { api } from '../api/client'

interface SettingsState {
  settings: Record<string, unknown> | null
  loading: boolean

  loadSettings: () => Promise<void>
  updateSettings: (patch: Record<string, unknown>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,

  async loadSettings() {
    set({ loading: true })
    try {
      const data = await api.getSettings()
      set({ settings: data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  async updateSettings(patch) {
    const data = await api.updateSettings(patch)
    set({ settings: data })
  },
}))
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/ && git commit -m "feat(web): extend api client + create inbox-store + settings-store"
```

---

## Task 18: 前端 — NavBar + FeedFab + Inbox 页面 + Settings 页面

**Files:**
- Create: `apps/web/app/_components/nav-bar.tsx`
- Create: `apps/web/app/_components/feed-fab.tsx`
- Create: `apps/web/app/_components/inbox-card.tsx`
- Create: `apps/web/app/inbox/page.tsx`
- Create: `apps/web/app/settings/page.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: 创建 nav-bar.tsx**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { Inbox, Settings, Network } from 'lucide-react'
import { useInboxStore } from '@/lib/store/inbox-store'
import { cn } from '@/lib/utils'

export function NavBar() {
  const pathname = usePathname()
  const { total, loadInbox } = useInboxStore()

  useEffect(() => {
    loadInbox({ status: 'pending', limit: '1' })
  }, [loadInbox])

  const navItems = [
    { href: '/', label: '图谱', icon: Network },
    { href: '/inbox', label: '待审', icon: Inbox, badge: total },
    { href: '/settings', label: '设置', icon: Settings },
  ]

  return (
    <nav className="flex items-center gap-1 border-b px-4 py-2">
      <Link href="/" className="mr-4 text-lg font-semibold">Galaxy</Link>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted',
            pathname === item.href && 'bg-muted text-foreground',
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
          {item.badge && item.badge > 0 ? (
            <span className={cn(
              'ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white',
              item.badge > 50 ? 'bg-red-500' : 'bg-blue-500',
            )}>
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: 创建 feed-fab.tsx**

```tsx
'use client'

import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api/client'
import { useInboxStore } from '@/lib/store/inbox-store'

export function FeedFab() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'text' | 'url'>('text')
  const [textContent, setTextContent] = useState('')
  const [urlContent, setUrlContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { loadInbox } = useInboxStore()

  const reset = () => {
    setTextContent('')
    setUrlContent('')
    setMode('text')
  }

  const onSubmit = async () => {
    setSubmitting(true)
    try {
      const input = mode === 'text'
        ? { type: 'text' as const, content: textContent.trim() }
        : { type: 'url' as const, url: urlContent.trim() }
      const result = await api.submitFeed(input)
      toast.success(`✅ 抽取出 ${result.suggestions_count} 条建议`)
      reset()
      setOpen(false)
      loadInbox({ status: 'pending' })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '投喂失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>投喂知识</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 border-b pb-2">
            <Button variant={mode === 'text' ? 'default' : 'outline'} size="sm" onClick={() => setMode('text')}>文本</Button>
            <Button variant={mode === 'url' ? 'default' : 'outline'} size="sm" onClick={() => setMode('url')}>URL</Button>
          </div>

          {mode === 'text' ? (
            <div className="space-y-1">
              <Label>粘贴文本内容</Label>
              <Textarea
                rows={8}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="粘贴一段文章、笔记、摘抄……AI 会从中抽取知识节点"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label>输入 URL</Label>
              <Input
                type="url"
                value={urlContent}
                onChange={(e) => setUrlContent(e.target.value)}
                placeholder="https://..."
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={onSubmit} disabled={submitting || (mode === 'text' ? !textContent.trim() : !urlContent.trim())}>
              {submitting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> 分析中…</> : '投喂'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 3: 创建 inbox-card.tsx**

```tsx
'use client'

import { Check, X, Edit, ExternalLink } from 'lucide-react'
import type { Suggestion } from '@galaxy/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  suggestion: Suggestion
  selected: boolean
  onToggleSelect: () => void
  onAccept: () => void
  onReject: () => void
  onEdit: () => void
}

export function InboxCard({ suggestion, selected, onToggleSelect, onAccept, onReject, onEdit }: Props) {
  const payload = typeof suggestion.payload === 'string' ? JSON.parse(suggestion.payload) : suggestion.payload
  const typeLabel: Record<string, string> = {
    new_node: '🆕 新增节点',
    new_edge: '🔗 新增关联',
    fill_aspect: '📝 填充视角',
    update_aspect: '✏️ 更新视角',
    merge_nodes: '🔀 合并节点',
  }

  return (
    <div className={cn('rounded-lg border p-4 transition-colors', selected && 'border-blue-500 bg-blue-50/50')}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggleSelect} className="mt-1" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{typeLabel[suggestion.type] ?? suggestion.type}</span>
            <span className="text-lg font-semibold">{payload.title ?? payload.source_title ?? '—'}</span>
          </div>
          {payload.summary && <p className="text-sm text-muted-foreground">{payload.summary}</p>}
          {suggestion.rationale && (
            <p className="text-xs text-muted-foreground">💡 {suggestion.rationale}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>置信度: {(suggestion.confidence * 100).toFixed(0)}%</span>
            {suggestion.provider_id && <span>📍{suggestion.provider_id}/{suggestion.model}</span>}
            {payload.domain && <span>领域: {payload.domain}</span>}
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={onAccept} title="接受 (A)">
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={onReject} title="拒绝 (R)">
            <X className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} title="修改后接受 (E)">
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 创建 inbox-confirm-dialog.tsx（修改后接受弹窗）**

```tsx
'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { Suggestion } from '@galaxy/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Props {
  suggestion: Suggestion | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (modifiedPayload: unknown, decisionNote: string) => Promise<void>
}

export function InboxConfirmDialog({ suggestion, open, onOpenChange, onConfirm }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [decisionNote, setDecisionNote] = useState('')

  const payload = suggestion
    ? typeof suggestion.payload === 'string' ? JSON.parse(suggestion.payload) : suggestion.payload
    : null

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [domain, setDomain] = useState('')

  // 当 suggestion 变化时重置表单
  const resetForm = () => {
    if (payload) {
      setTitle(payload.title ?? '')
      setSummary(payload.summary ?? '')
      setDomain(payload.domain ?? '')
    }
    setDecisionNote('')
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) resetForm()
    onOpenChange(nextOpen)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const modifiedPayload = { ...payload, title, summary, domain }
      await onConfirm(modifiedPayload, decisionNote)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (!suggestion) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>修改后接受</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>标题</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>摘要</Label>
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>领域</Label>
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>决策备注（可选）</Label>
            <Input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="为什么要修改？" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting || !title.trim()}>
            {submitting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> 提交中…</> : '修改并接受'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: 创建 inbox/page.tsx**

```tsx
'use client'

import { useEffect, useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { Suggestion } from '@galaxy/shared'
import { Button } from '@/components/ui/button'
import { useInboxStore } from '@/lib/store/inbox-store'
import { InboxCard } from '../_components/inbox-card'
import { InboxConfirmDialog } from '../_components/inbox-confirm-dialog'

export default function InboxPage() {
  const {
    suggestions, total, loading, error,
    loadInbox, confirmOne, batchConfirm,
    selectedIds, toggleSelect, selectAll, clearSelection,
  } = useInboxStore()

  const [editTarget, setEditTarget] = useState<Suggestion | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  useEffect(() => {
    loadInbox({ status: 'pending' })
  }, [loadInbox])

  const handleAccept = useCallback(async (id: string) => {
    try {
      await confirmOne(id, 'accept')
      toast.success('已接受')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }, [confirmOne])

  const handleReject = useCallback(async (id: string) => {
    try {
      await confirmOne(id, 'reject')
      toast.success('已拒绝')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }, [confirmOne])

  const handleEdit = useCallback((suggestion: Suggestion) => {
    setEditTarget(suggestion)
    setEditDialogOpen(true)
  }, [])

  const handleEditConfirm = useCallback(async (modifiedPayload: unknown, decisionNote: string) => {
    if (!editTarget) return
    try {
      await confirmOne(editTarget.id, 'accept_modified', { modified_payload: modifiedPayload, decision_note: decisionNote })
      toast.success('修改后已接受')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }, [editTarget, confirmOne])

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const focused = suggestions[0]
      if (!focused) return
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); handleAccept(focused.id) }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); handleReject(focused.id) }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); handleEdit(focused) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [suggestions, handleAccept, handleReject, handleEdit])

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">📥 待审队列 ({total})</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>全选</Button>
          <Button variant="outline" size="sm" onClick={clearSelection}>取消选择</Button>
          {selectedIds.size > 0 && (
            <>
              <Button size="sm" onClick={() => batchConfirm('accept').then(() => toast.success('批量接受完成'))}>
                批量接受 ({selectedIds.size})
              </Button>
              <Button variant="destructive" size="sm" onClick={() => batchConfirm('reject').then(() => toast.success('批量拒绝完成'))}>
                批量拒绝 ({selectedIds.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {loading && <p className="text-center text-muted-foreground">加载中…</p>}
      {error && <p className="text-center text-red-500">{error}</p>}

      <div className="space-y-3">
        {suggestions.map((s) => (
          <InboxCard
            key={s.id}
            suggestion={s}
            selected={selectedIds.has(s.id)}
            onToggleSelect={() => toggleSelect(s.id)}
            onAccept={() => handleAccept(s.id)}
            onReject={() => handleReject(s.id)}
            onEdit={() => handleEdit(s)}
          />
        ))}
      </div>

      {!loading && suggestions.length === 0 && (
        <div className="py-16 text-center text-muted-foreground">
          <p className="text-4xl mb-2">🎉</p>
          <p>Inbox 清空了！去投喂一些内容吧。</p>
        </div>
      )}

      <InboxConfirmDialog
        suggestion={editTarget}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onConfirm={handleEditConfirm}
      />
    </div>
  )
}
```

- [ ] **Step 5: 创建 settings/page.tsx**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettingsStore } from '@/lib/store/settings-store'

export default function SettingsPage() {
  const { settings, loading, loadSettings, updateSettings } = useSettingsStore()
  const [defaultProvider, setDefaultProvider] = useState('')
  const [defaultModel, setDefaultModel] = useState('')

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => {
    if (settings) {
      setDefaultProvider((settings.default_provider as string) ?? '')
      setDefaultModel((settings.default_model as string) ?? '')
    }
  }, [settings])

  const onSave = async () => {
    try {
      await updateSettings({ default_provider: defaultProvider, default_model: defaultModel })
      toast.success('设置已保存')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    }
  }

  if (loading || !settings) return <div className="p-6 text-center text-muted-foreground">加载中…</div>

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-2xl font-bold">⚙️ 设置</h1>

      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">AI Provider 配置</h2>
        <p className="text-sm text-muted-foreground">
          API Key 通过 .env 文件配置（OPENAI_API_KEY, ANTHROPIC_API_KEY, DASHSCOPE_API_KEY, ARK_API_KEY, DEEPSEEK_API_KEY）。
          {settings.configured_providers && (
            <span className="ml-1 font-medium text-green-600">
              已配置: {(settings.configured_providers as string[]).join(', ') || '无'}
            </span>
          )}
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>默认 Provider</Label>
            <Input value={defaultProvider} onChange={(e) => setDefaultProvider(e.target.value)} placeholder="openai" />
          </div>
          <div className="space-y-1">
            <Label>默认 Model</Label>
            <Input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder="gpt-4o-mini" />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">AI 开关</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!settings.enable_feed_ai} onChange={(e) => updateSettings({ enable_feed_ai: e.target.checked })} />
            启用投喂 AI 抽取
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!settings.enable_monthly_budget} onChange={(e) => updateSettings({ enable_monthly_budget: e.target.checked })} />
            启用月度预算上限
          </label>
        </div>
      </section>

      <Button onClick={onSave}>保存设置</Button>
    </div>
  )
}
```

- [ ] **Step 6: 更新 layout.tsx 使用 NavBar**

替换 layout.tsx 的内容：

```tsx
import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Galaxy',
  description: '个人立体知识库',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
```

注意：NavBar 需要在 client component 中使用，所以放在 page.tsx 中引用而非 layout.tsx。

- [ ] **Step 7: 更新 page.tsx — 添加 NavBar + FeedFab**

在 page.tsx 中：
- import NavBar 和 FeedFab
- 将 `<header>` 替换为 `<NavBar />`
- 在 `</main>` 之前添加 `<FeedFab />`

```tsx
import { NavBar } from './_components/nav-bar'
import { FeedFab } from './_components/feed-fab'

// 在 return 中：
<main className="flex h-screen flex-col">
  <NavBar />
  <div className="relative flex-1">
    <GraphCanvas ... />
    <NodeDetailPanel />
  </div>
  <NewNodeDialog ... />
  <CommandPalette ... />
  <FeedFab />
</main>
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/ && git commit -m "feat(web): NavBar + FeedFab + Inbox page + Settings page + keyboard shortcuts"
```

---

## Task 19: .env.example + 最终集成验证

**Files:**
- Create: `.env.example`

- [ ] **Step 1: 创建 .env.example**

```env
# Galaxy AI Provider API Keys
# 至少配置一个 Provider 才能使用投喂 AI 抽取功能

# OpenAI
OPENAI_API_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# 阿里云百炼（DashScope）
DASHSCOPE_API_KEY=

# 火山引擎（字节跳动 Ark）
ARK_API_KEY=

# DeepSeek
DEEPSEEK_API_KEY=

# 默认 Provider 和 Model（也可在 Settings 页面配置）
GALAXY_DEFAULT_PROVIDER=openai
GALAXY_DEFAULT_MODEL=gpt-4o-mini

# 加密密钥（用于加密存储在 DB 中的 API Key）
# 生成: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
GALAXY_ENCRYPT_KEY=

# 数据库路径（默认 ~/galaxy/data/galaxy.db）
# GALAXY_DB_PATH=
```

- [ ] **Step 2: 全量验证**

Run:
```bash
cd /Users/eleme/galaxy && pnpm install && pnpm typecheck && pnpm test
```
Expected: 全部通过

- [ ] **Step 3: 最终 commit + tag**

```bash
git add -A && git commit -m "feat: Galaxy M2 — feed + AI extraction + inbox + multi-provider + settings"
git tag m2-feed-inbox
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] F1: Multi-Provider 抽象 → Tasks 2-6
- [x] F2: 投喂入口 → Task 18 (FeedFab)
- [x] F3: AI 抽取管线 → Tasks 7-9
- [x] F4: Inbox 页面 → Task 18 (InboxPage + InboxCard)
- [x] F5: 确认入图 → Task 15 (confirm route)
- [x] F6: Settings 页面 → Tasks 16, 18
- [x] F7: AI 调用日志 → Task 9 (extract-from-feed writes ai_call_logs)
- [x] F8: DB Schema 扩展 → Task 12

**Placeholder scan:** No TBD/TODO found.

**Type consistency:** Suggestion, FeedItem types defined in Task 11 match usage in Tasks 14-18. LLMProvider interface in Task 2 matches usage in Tasks 3-6.