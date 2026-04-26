# Galaxy M1 · 骨架可运行 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 Galaxy 项目的可运行骨架——Monorepo 工程结构 + SQLite 数据层全表 schema + Next.js 14 Web App 框架 + Cytoscape 图谱画布 + 节点/边手动 CRUD，达到「能手动建图谱、数据持久化、重启数据不丢」的可演示状态。

**Architecture:** pnpm Monorepo（apps/web + packages/db + packages/shared）。数据层用 better-sqlite3 + Drizzle ORM 建表落到 `~/galaxy/data/galaxy.db`。Web 端用 Next.js 14 App Router + shadcn/ui，图谱用 Cytoscape.js（dynamic import 规避 SSR）。后端 API 用 Next.js Route Handlers 直连数据层。M1 不含任何 AI 调用，AI 相关包（packages/ai）留到 M2 引入。

**Tech Stack:** pnpm 9, TypeScript 5.4, Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui, Cytoscape.js + cytoscape-fcose, better-sqlite3, Drizzle ORM + drizzle-kit, Vitest（单测）, Zod（API 入参校验）, nanoid（id 生成）, cmdk（命令面板）, sonner（toast）

---

## File Structure 总览

| 路径 | 创建/修改 | 责任 |
|---|---|---|
| `pnpm-workspace.yaml` | 创建 | 声明 monorepo 三个包 |
| `package.json` | 创建 | 根包：脚本入口（dev/build/db:migrate/test） |
| `tsconfig.base.json` | 创建 | 共享 TS 配置 |
| `.gitignore` | 创建 | 忽略 data/, bridge/, node_modules, .next, .env.local |
| `.env.example` | 创建 | 环境变量样板（GALAXY_DB_PATH） |
| `packages/shared/package.json` | 创建 | shared 包定义 |
| `packages/shared/tsconfig.json` | 创建 | 继承 tsconfig.base.json |
| `packages/shared/src/index.ts` | 创建 | 包入口 re-export |
| `packages/shared/src/types/domain.ts` | 创建 | Node/Edge/RelationType 等领域类型 |
| `packages/shared/src/utils/id.ts` | 创建 | nanoid 封装 |
| `packages/shared/src/utils/slug.ts` | 创建 | title → slug 转换 |
| `packages/db/package.json` | 创建 | db 包定义 |
| `packages/db/tsconfig.json` | 创建 | 继承 tsconfig.base.json |
| `packages/db/drizzle.config.ts` | 创建 | drizzle-kit 配置 |
| `packages/db/src/index.ts` | 创建 | 包入口 re-export |
| `packages/db/src/client.ts` | 创建 | SQLite + Drizzle 客户端单例 + initDb |
| `packages/db/src/schema/index.ts` | 创建 | re-export 全部 schema |
| `packages/db/src/schema/nodes.ts` | 创建 | nodes 表 schema |
| `packages/db/src/schema/edges.ts` | 创建 | edges 表 schema |
| `packages/db/src/schema/aspects.ts` | 创建 | aspects 表 schema |
| `packages/db/src/schema/suggestions.ts` | 创建 | suggestions 表 schema |
| `packages/db/src/schema/feed-items.ts` | 创建 | feed_items 表 schema |
| `packages/db/src/schema/scan-runs.ts` | 创建 | scan_runs 表 schema |
| `packages/db/src/schema/deep-dive.ts` | 创建 | deep_dive_sessions / deep_dive_messages 表 |
| `packages/db/src/schema/settings.ts` | 创建 | settings 单例表 |
| `packages/db/src/schema/ai-call-logs.ts` | 创建 | ai_call_logs 表 |
| `packages/db/src/schema/operation-logs.ts` | 创建 | operation_logs 表 |
| `packages/db/src/seed.ts` | 创建 | 默认 settings 行写入 |
| `packages/db/src/__tests__/client.test.ts` | 创建 | 数据库 init + nodes 表 CRUD 冒烟测试 |
| `apps/web/package.json` | 创建 | Web 应用包定义 |
| `apps/web/tsconfig.json` | 创建 | Next.js TS 配置 |
| `apps/web/next.config.mjs` | 创建 | Next.js 配置（standalone / experimental） |
| `apps/web/tailwind.config.ts` | 创建 | Tailwind 配置 |
| `apps/web/postcss.config.mjs` | 创建 | PostCSS 配置 |
| `apps/web/components.json` | 创建 | shadcn/ui CLI 配置 |
| `apps/web/app/globals.css` | 创建 | Tailwind 入口 + shadcn CSS 变量 |
| `apps/web/app/layout.tsx` | 创建 | 根 layout（含 Sonner Toaster） |
| `apps/web/app/page.tsx` | 创建 | 主图谱页（client component 入口） |
| `apps/web/app/_components/graph-canvas.tsx` | 创建 | Cytoscape 封装（dynamic import） |
| `apps/web/app/_components/node-detail-panel.tsx` | 创建 | 右侧节点详情/编辑滑出面板 |
| `apps/web/app/_components/new-node-dialog.tsx` | 创建 | 新建节点表单弹窗 |
| `apps/web/app/_components/command-palette.tsx` | 创建 | cmdk 节点搜索命令面板 |
| `apps/web/app/api/nodes/route.ts` | 创建 | GET 列表 / POST 创建 |
| `apps/web/app/api/nodes/[id]/route.ts` | 创建 | GET / PATCH / DELETE 单节点 |
| `apps/web/app/api/edges/route.ts` | 创建 | GET 列表 / POST 创建 |
| `apps/web/app/api/edges/[id]/route.ts` | 创建 | DELETE 单边 |
| `apps/web/lib/api/schemas.ts` | 创建 | 所有 API 入参的 Zod schema |
| `apps/web/lib/api/client.ts` | 创建 | 前端调用 API 的 fetch 封装（含错误统一处理） |
| `apps/web/lib/store/graph-store.ts` | 创建 | zustand store（节点/边内存状态） |
| `apps/web/components/ui/*` | 创建（shadcn CLI） | shadcn 基础组件（button/dialog/input/sheet/...） |
| `apps/web/__tests__/api-nodes.test.ts` | 创建 | nodes API 路由的集成测试 |
| `scripts/dev.ts` | 创建 | 开发启动脚本：initDb + spawn next dev |
| `vitest.config.ts` | 创建 | 共享 vitest 配置 |
| `README.md` | 创建 | M1 阶段的 quickstart |

---

## 任务编排

任务按依赖顺序排列，每个任务可独立提交。建议按顺序串行执行；任务 5、6、7、8、9（schema 各表）相互独立，可并行。

- Task 1: Monorepo 骨架与工具链
- Task 2: shared 包：领域类型与工具函数
- Task 3: db 包：客户端与初始化
- Task 4: db 包：nodes 表 schema
- Task 5: db 包：edges 表 schema
- Task 6: db 包：aspects 表 schema
- Task 7: db 包：suggestions 表 schema
- Task 8: db 包：feed_items / scan_runs / deep_dive / ai_call_logs / operation_logs 表
- Task 9: db 包：settings 表 + seed
- Task 10: db 包：迁移生成与冒烟测试
- Task 11: web 包：Next.js + Tailwind + shadcn 初始化
- Task 12: web 包：API 入参 Zod schemas
- Task 13: web 包：nodes API 路由
- Task 14: web 包：edges API 路由
- Task 15: web 包：API 集成测试
- Task 16: web 包：API 客户端封装与 zustand store
- Task 17: web 包：主页面骨架与 Cytoscape 画布
- Task 18: web 包：节点详情侧栏（NodeDetailPanel）
- Task 19: web 包：新建节点对话框 + 拖拽连线交互
- Task 20: web 包：cmdk 命令面板（搜索节点）
- Task 21: 启动脚本 dev.ts
- Task 22: README + M1 验收冒烟测试

---

### Task 1: Monorepo 骨架与工具链

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `vitest.config.ts`

- [ ] **Step 1: 在 `~/galaxy/` 初始化 git 仓库**

```bash
cd ~/galaxy
git init -b main
```

- [ ] **Step 2: 创建 `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 3: 创建根 `package.json`**

```json
{
  "name": "galaxy",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx scripts/dev.ts",
    "build": "pnpm --filter @galaxy/web build",
    "db:generate": "pnpm --filter @galaxy/db drizzle-kit generate",
    "db:migrate": "pnpm --filter @galaxy/db tsx src/__bin__/migrate.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 4: 创建 `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true
  }
}
```

- [ ] **Step 5: 创建 `.gitignore`**

```
node_modules
.next
dist
*.log

# Galaxy data & runtime
data/
bridge/
.env.local
.env

# OS
.DS_Store
```

- [ ] **Step 6: 创建 `.env.example`**

```
# Galaxy 数据库路径（默认 ~/galaxy/data/galaxy.db）
# GALAXY_DB_PATH=

# Web 端口（默认 3000）
# PORT=3000
```

- [ ] **Step 7: 创建 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
  },
})
```

- [ ] **Step 8: 安装根依赖**

```bash
cd ~/galaxy
pnpm install
```

- [ ] **Step 9: 验证工具链**

Run: `pnpm tsc --version && pnpm vitest --version`
Expected: 两个版本号正常输出，无报错

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "chore: init galaxy monorepo skeleton with pnpm workspaces"
```

---

### Task 2: shared 包 — 领域类型与工具函数

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types/domain.ts`
- Create: `packages/shared/src/utils/id.ts`
- Create: `packages/shared/src/utils/slug.ts`
- Create: `packages/shared/src/utils/__tests__/slug.test.ts`

- [ ] **Step 1: 创建 `packages/shared/package.json`**

```json
{
  "name": "@galaxy/shared",
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
    "nanoid": "^5.0.6",
    "slugify": "^1.6.6"
  }
}
```

- [ ] **Step 2: 创建 `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 创建 `packages/shared/src/types/domain.ts`**

```ts
// 关联类型枚举（与 spec 3.2 对齐）
export const RELATION_TYPES = [
  'contains',
  'related',
  'opposes',
  'instance_of',
  'evolved_from',
  'cites',
] as const
export type RelationType = (typeof RELATION_TYPES)[number]

export const NODE_STATUSES = ['active', 'archived'] as const
export type NodeStatus = (typeof NODE_STATUSES)[number]

export const CREATED_BY_KINDS = ['user', 'ai_feed', 'ai_proactive', 'ai_deepdive'] as const
export type CreatedByKind = (typeof CREATED_BY_KINDS)[number]

// 领域对象（DB 行的 TS 镜像，仅用于跨包传递）
export interface Node {
  id: string
  title: string
  slug: string
  summary: string | null
  domain: string | null
  is_seed: boolean
  status: NodeStatus
  created_at: string
  updated_at: string
  created_by: CreatedByKind
  ai_metadata: Record<string, unknown> | null
}

export interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
  relation_type: RelationType
  weight: number
  description: string | null
  created_at: string
  updated_at: string
  created_by: CreatedByKind
  ai_metadata: Record<string, unknown> | null
}
```

- [ ] **Step 4: 创建 `packages/shared/src/utils/id.ts`**

```ts
import { nanoid } from 'nanoid'

export function newId(prefix?: string): string {
  const id = nanoid(16)
  return prefix ? `${prefix}_${id}` : id
}
```

- [ ] **Step 5: 创建 `packages/shared/src/utils/slug.ts`**

```ts
import slugify from 'slugify'

export function toSlug(input: string): string {
  const base = slugify(input, { lower: true, strict: true, trim: true })
  if (base.length > 0) return base
  // 全中文等无法 slug 的情况，回退使用 base64-url 短串
  return Buffer.from(input).toString('base64url').slice(0, 32).toLowerCase()
}
```

- [ ] **Step 6: 创建 `packages/shared/src/index.ts`**

```ts
export * from './types/domain.js'
export * from './utils/id.js'
export * from './utils/slug.js'
```

- [ ] **Step 7: Write the failing test for slug**

Create `packages/shared/src/utils/__tests__/slug.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { toSlug } from '../slug.js'

describe('toSlug', () => {
  it('converts english title to lower-kebab', () => {
    expect(toSlug('Front Warehouse')).toBe('front-warehouse')
  })

  it('strips punctuation', () => {
    expect(toSlug('AI: Agent Skills?')).toBe('ai-agent-skills')
  })

  it('handles pure chinese title with base64-url fallback', () => {
    const out = toSlug('前置仓')
    expect(out).toMatch(/^[a-z0-9_\-]+$/)
    expect(out.length).toBeGreaterThan(0)
  })

  it('returns deterministic output for same input', () => {
    expect(toSlug('hello')).toBe(toSlug('hello'))
  })
})
```

- [ ] **Step 8: Install dependencies and run test (expect fail until implementation exists, then pass)**

```bash
cd ~/galaxy
pnpm install
pnpm vitest run packages/shared/src/utils/__tests__/slug.test.ts
```

Expected: 4 tests pass

- [ ] **Step 9: Typecheck**

```bash
pnpm --filter @galaxy/shared typecheck
```

Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add domain types, id and slug utilities"
```

---

### Task 3: db 包 — 客户端与初始化

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/__bin__/migrate.ts`

- [ ] **Step 1: 创建 `packages/db/package.json`**

```json
{
  "name": "@galaxy/db",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/__bin__/migrate.ts"
  },
  "dependencies": {
    "@galaxy/shared": "workspace:*",
    "better-sqlite3": "^11.0.0",
    "drizzle-orm": "^0.30.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.9",
    "drizzle-kit": "^0.20.0"
  }
}
```

- [ ] **Step 2: 创建 `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 创建 `packages/db/drizzle.config.ts`**

```ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/schema/*.ts',
  out: './drizzle',
  dialect: 'sqlite',
} satisfies Config
```

- [ ] **Step 4: 创建 `packages/db/src/client.ts`**

```ts
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema/index.js'

let _db: BetterSQLite3Database<typeof schema> | null = null
let _sqlite: Database.Database | null = null

export function resolveDbPath(): string {
  return process.env.GALAXY_DB_PATH || path.join(os.homedir(), 'galaxy', 'data', 'galaxy.db')
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db
  const dbPath = resolveDbPath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  _sqlite = new Database(dbPath)
  _sqlite.pragma('journal_mode = WAL')
  _sqlite.pragma('foreign_keys = ON')
  _sqlite.pragma('synchronous = NORMAL')
  _db = drizzle(_sqlite, { schema })
  return _db
}

export function closeDb(): void {
  _sqlite?.close()
  _sqlite = null
  _db = null
}

/**
 * 启动时调用：执行尚未执行的 migrations。
 * migrationsFolder 默认指向 packages/db/drizzle 目录。
 */
export function initDb(migrationsFolder?: string): void {
  const db = getDb()
  const dir = migrationsFolder || path.resolve(new URL('..', import.meta.url).pathname, 'drizzle')
  if (!fs.existsSync(dir)) {
    throw new Error(`Drizzle migrations folder not found: ${dir}. Run \`pnpm db:generate\` first.`)
  }
  migrate(db, { migrationsFolder: dir })
}
```

- [ ] **Step 5: 创建 `packages/db/src/__bin__/migrate.ts`**

```ts
import { initDb, resolveDbPath } from '../client.js'

console.log(`[galaxy/db] migrating database at ${resolveDbPath()}`)
initDb()
console.log('[galaxy/db] migrations applied successfully')
process.exit(0)
```

- [ ] **Step 6: 创建占位 `packages/db/src/index.ts`（schema 文件未建前先 re-export client）**

```ts
export * from './client.js'
export * as schema from './schema/index.js'
```

- [ ] **Step 7: 安装依赖**

```bash
cd ~/galaxy
pnpm install
```

Expected: better-sqlite3 编译成功（macOS 需要 Xcode CLT）

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(db): add drizzle client, sqlite bootstrap and migrate runner"
```

---

### Task 4: db 包 — nodes 表 schema

**Files:**
- Create: `packages/db/src/schema/nodes.ts`

- [ ] **Step 1: 创建 `packages/db/src/schema/nodes.ts`**

```ts
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const nodes = sqliteTable(
  'nodes',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    summary: text('summary'),
    domain: text('domain'),
    is_seed: integer('is_seed', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    created_by: text('created_by', {
      enum: ['user', 'ai_feed', 'ai_proactive', 'ai_deepdive'],
    })
      .notNull()
      .default('user'),
    ai_metadata: text('ai_metadata', { mode: 'json' }),
  },
  (t) => ({
    titleIdx: index('idx_nodes_title').on(t.title),
    domainIdx: index('idx_nodes_domain').on(t.domain),
    slugUnique: uniqueIndex('uq_nodes_slug').on(t.slug),
  }),
)

export type NodeRow = typeof nodes.$inferSelect
export type NewNodeRow = typeof nodes.$inferInsert
```

- [ ] **Step 2: 确保 schema 目录有 index 文件占位（后续 task 会扩充）**

Create `packages/db/src/schema/index.ts`:

```ts
export * from './nodes.js'
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema
git commit -m "feat(db): add nodes table schema"
```

---

### Task 5: db 包 — edges 表 schema

**Files:**
- Create: `packages/db/src/schema/edges.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: 创建 `packages/db/src/schema/edges.ts`**

```ts
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { nodes } from './nodes.js'

export const edges = sqliteTable(
  'edges',
  {
    id: text('id').primaryKey(),
    source_node_id: text('source_node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    target_node_id: text('target_node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    relation_type: text('relation_type', {
      enum: ['contains', 'related', 'opposes', 'instance_of', 'evolved_from', 'cites'],
    }).notNull(),
    weight: real('weight').notNull().default(1.0),
    description: text('description'),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    created_by: text('created_by', {
      enum: ['user', 'ai_feed', 'ai_proactive', 'ai_deepdive'],
    })
      .notNull()
      .default('user'),
    ai_metadata: text('ai_metadata', { mode: 'json' }),
  },
  (t) => ({
    tripleUnique: uniqueIndex('uq_edges_triple').on(t.source_node_id, t.target_node_id, t.relation_type),
    sourceIdx: index('idx_edges_source').on(t.source_node_id),
    targetIdx: index('idx_edges_target').on(t.target_node_id),
  }),
)

export type EdgeRow = typeof edges.$inferSelect
export type NewEdgeRow = typeof edges.$inferInsert
```

- [ ] **Step 2: 修改 `packages/db/src/schema/index.ts`**

```ts
export * from './nodes.js'
export * from './edges.js'
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema
git commit -m "feat(db): add edges table schema with composite unique"
```

---

### Task 6: db 包 — aspects 表 schema

**Files:**
- Create: `packages/db/src/schema/aspects.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: 创建 `packages/db/src/schema/aspects.ts`**

```ts
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { nodes } from './nodes.js'

export const aspects = sqliteTable(
  'aspects',
  {
    id: text('id').primaryKey(),
    node_id: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    template_key: text('template_key').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    order: integer('order').notNull().default(0),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    created_by: text('created_by', {
      enum: ['user', 'ai_feed', 'ai_proactive', 'ai_deepdive'],
    })
      .notNull()
      .default('user'),
    ai_metadata: text('ai_metadata', { mode: 'json' }),
  },
  (t) => ({
    nodeTemplateUnique: uniqueIndex('uq_aspects_node_template').on(t.node_id, t.template_key),
    nodeIdx: index('idx_aspects_node').on(t.node_id),
  }),
)

export type AspectRow = typeof aspects.$inferSelect
export type NewAspectRow = typeof aspects.$inferInsert
```

- [ ] **Step 2: 在 `packages/db/src/schema/index.ts` 末尾追加**

```ts
export * from './aspects.js'
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema
git commit -m "feat(db): add aspects table schema"
```

---

### Task 7: db 包 — suggestions 表 schema

**Files:**
- Create: `packages/db/src/schema/suggestions.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: 创建 `packages/db/src/schema/suggestions.ts`**

```ts
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const suggestions = sqliteTable(
  'suggestions',
  {
    id: text('id').primaryKey(),
    type: text('type', {
      enum: ['new_node', 'new_edge', 'fill_aspect', 'update_aspect', 'merge_nodes'],
    }).notNull(),
    source: text('source', { enum: ['feed', 'proactive_scan', 'deepdive'] }).notNull(),
    source_ref_id: text('source_ref_id'),

    payload: text('payload', { mode: 'json' }).notNull(),

    rationale: text('rationale'),
    confidence: real('confidence').notNull().default(0.5),

    status: text('status', {
      enum: ['pending', 'accepted', 'rejected', 'accepted_modified', 'expired', 'paused'],
    })
      .notNull()
      .default('pending'),
    decided_at: text('decided_at'),
    decided_payload: text('decided_payload', { mode: 'json' }),
    decision_note: text('decision_note'),

    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    expires_at: text('expires_at'),

    provider_id: text('provider_id'),
    model: text('model'),
  },
  (t) => ({
    statusIdx: index('idx_suggestions_status').on(t.status),
    sourceIdx: index('idx_suggestions_source').on(t.source),
    typeIdx: index('idx_suggestions_type').on(t.type),
    confidenceIdx: index('idx_suggestions_confidence').on(t.confidence),
  }),
)

export type SuggestionRow = typeof suggestions.$inferSelect
export type NewSuggestionRow = typeof suggestions.$inferInsert
```

- [ ] **Step 2: 在 `packages/db/src/schema/index.ts` 末尾追加**

```ts
export * from './suggestions.js'
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema
git commit -m "feat(db): add suggestions table schema"
```

---

### Task 8: db 包 — feed_items / scan_runs / deep_dive / ai_call_logs / operation_logs 表

**Files:**
- Create: `packages/db/src/schema/feed-items.ts`
- Create: `packages/db/src/schema/scan-runs.ts`
- Create: `packages/db/src/schema/deep-dive.ts`
- Create: `packages/db/src/schema/ai-call-logs.ts`
- Create: `packages/db/src/schema/operation-logs.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: 创建 `packages/db/src/schema/feed-items.ts`**

```ts
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const feedItems = sqliteTable('feed_items', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['text', 'url', 'file_md', 'file_pdf'] }).notNull(),
  raw_content: text('raw_content'),
  file_path: text('file_path'),
  source_url: text('source_url'),
  status: text('status', { enum: ['processing', 'done', 'failed'] }).notNull().default('processing'),
  error_message: text('error_message'),
  suggestions_count: integer('suggestions_count').notNull().default(0),
  created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
})

export type FeedItemRow = typeof feedItems.$inferSelect
export type NewFeedItemRow = typeof feedItems.$inferInsert
```

- [ ] **Step 2: 创建 `packages/db/src/schema/scan-runs.ts`**

```ts
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const scanRuns = sqliteTable('scan_runs', {
  id: text('id').primaryKey(),
  trigger: text('trigger', { enum: ['cron', 'manual'] }).notNull(),
  status: text('status', { enum: ['running', 'done', 'failed'] }).notNull().default('running'),
  started_at: text('started_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  finished_at: text('finished_at'),
  scope: text('scope', { mode: 'json' }),
  suggestions_count: integer('suggestions_count').notNull().default(0),
  cost_tokens: integer('cost_tokens').notNull().default(0),
  cost_usd: real('cost_usd').notNull().default(0),
  acceptance_rate: real('acceptance_rate'),
  error_message: text('error_message'),
  provider_id: text('provider_id'),
  model: text('model'),
})

export type ScanRunRow = typeof scanRuns.$inferSelect
export type NewScanRunRow = typeof scanRuns.$inferInsert
```

- [ ] **Step 3: 创建 `packages/db/src/schema/deep-dive.ts`**

```ts
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { nodes } from './nodes.js'

export const deepDiveSessions = sqliteTable(
  'deep_dive_sessions',
  {
    id: text('id').primaryKey(),
    node_id: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    agent_type: text('agent_type', { enum: ['thinker', 'partner', 'direct'] }).notNull(),
    bridge_task_path: text('bridge_task_path'),
    status: text('status', { enum: ['active', 'completed', 'abandoned'] }).notNull().default('active'),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    final_suggestion_ids: text('final_suggestion_ids', { mode: 'json' }),
    provider_id: text('provider_id'),
    model: text('model'),
  },
  (t) => ({
    nodeIdx: index('idx_deep_dive_node').on(t.node_id),
  }),
)

export const deepDiveMessages = sqliteTable(
  'deep_dive_messages',
  {
    id: text('id').primaryKey(),
    session_id: text('session_id')
      .notNull()
      .references(() => deepDiveSessions.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'ai', 'system'] }).notNull(),
    content: text('content').notNull(),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => ({
    sessionIdx: index('idx_deep_dive_messages_session').on(t.session_id),
  }),
)

export type DeepDiveSessionRow = typeof deepDiveSessions.$inferSelect
export type DeepDiveMessageRow = typeof deepDiveMessages.$inferSelect
```

- [ ] **Step 4: 创建 `packages/db/src/schema/ai-call-logs.ts`**

```ts
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const aiCallLogs = sqliteTable(
  'ai_call_logs',
  {
    id: text('id').primaryKey(),
    channel: text('channel', { enum: ['direct', 'bridge'] }).notNull(),
    task: text('task').notNull(),
    provider_id: text('provider_id'),
    model: text('model'),
    base_url: text('base_url'),
    prompt_template: text('prompt_template'),
    context_summary: text('context_summary'),
    input_tokens: integer('input_tokens').notNull().default(0),
    output_tokens: integer('output_tokens').notNull().default(0),
    cost_usd: real('cost_usd').notNull().default(0),
    duration_ms: integer('duration_ms').notNull().default(0),
    status: text('status', { enum: ['success', 'failed', 'timeout'] }).notNull(),
    error_message: text('error_message'),
    created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => ({
    createdIdx: index('idx_ai_call_logs_created').on(t.created_at),
    providerIdx: index('idx_ai_call_logs_provider').on(t.provider_id),
  }),
)

export type AiCallLogRow = typeof aiCallLogs.$inferSelect
```

- [ ] **Step 5: 创建 `packages/db/src/schema/operation-logs.ts`**

```ts
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const operationLogs = sqliteTable('operation_logs', {
  id: text('id').primaryKey(),
  operation: text('operation').notNull(),
  affected_ids: text('affected_ids', { mode: 'json' }).notNull(),
  payload_snapshot: text('payload_snapshot', { mode: 'json' }),
  user_note: text('user_note'),
  is_undone: integer('is_undone', { mode: 'boolean' }).notNull().default(false),
  undone_at: text('undone_at'),
  created_at: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
})

export type OperationLogRow = typeof operationLogs.$inferSelect
```

- [ ] **Step 6: 在 `packages/db/src/schema/index.ts` 末尾追加**

```ts
export * from './feed-items.js'
export * from './scan-runs.js'
export * from './deep-dive.js'
export * from './ai-call-logs.js'
export * from './operation-logs.js'
```

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema
git commit -m "feat(db): add feed-items, scan-runs, deep-dive, ai-call-logs, operation-logs schemas"
```

---

### Task 9: db 包 — settings 单例表 + seed

**Files:**
- Create: `packages/db/src/schema/settings.ts`
- Create: `packages/db/src/seed.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/client.ts`

- [ ] **Step 1: 创建 `packages/db/src/schema/settings.ts`**

```ts
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),

  // AI 开关
  enable_feed_ai: integer('enable_feed_ai', { mode: 'boolean' }).notNull().default(true),
  enable_proactive_scan: integer('enable_proactive_scan', { mode: 'boolean' }).notNull().default(false),
  enable_deepdive: integer('enable_deepdive', { mode: 'boolean' }).notNull().default(true),

  // 主动扫描配置
  proactive_scan_cron: text('proactive_scan_cron').notNull().default('0 3 * * *'),
  proactive_scan_max_suggestions: integer('proactive_scan_max_suggestions').notNull().default(10),
  proactive_scan_strategies: text('proactive_scan_strategies', { mode: 'json' })
    .notNull()
    .default(sql`(json('["islands","gaps"]'))`),

  // 多 Provider 配置
  default_provider: text('default_provider'),
  default_model: text('default_model'),
  provider_credentials: text('provider_credentials', { mode: 'json' }),
  task_provider_overrides: text('task_provider_overrides', { mode: 'json' }),
  custom_providers: text('custom_providers', { mode: 'json' }),

  // 桥接配置
  qoder_bridge_dir: text('qoder_bridge_dir'),
  bridge_timeout_minutes: integer('bridge_timeout_minutes').notNull().default(30),

  // 风险控制
  enable_monthly_budget: integer('enable_monthly_budget', { mode: 'boolean' }).notNull().default(false),
  monthly_budget_usd: real('monthly_budget_usd').notNull().default(20),
  current_month_cost_usd: real('current_month_cost_usd').notNull().default(0),
  current_month_key: text('current_month_key').notNull().default(''),

  updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
})

export type SettingsRow = typeof settings.$inferSelect
```

- [ ] **Step 2: 在 `packages/db/src/schema/index.ts` 末尾追加**

```ts
export * from './settings.js'
```

- [ ] **Step 3: 创建 `packages/db/src/seed.ts`**

```ts
import { getDb } from './client.js'
import { settings } from './schema/settings.js'
import { sql } from 'drizzle-orm'

/**
 * 确保 settings 表存在唯一一行（id = 1）。幂等。
 */
export function seedDefaultSettings(): void {
  const db = getDb()
  db.insert(settings)
    .values({ id: 1 })
    .onConflictDoNothing({ target: settings.id })
    .run()
}
```

- [ ] **Step 4: 修改 `packages/db/src/client.ts`，在 `initDb` 末尾调用 seed**

在 `initDb` 函数最后一行 `migrate(db, ...)` 之后追加：

```ts
  // 内联 import 避免循环依赖
  const { seedDefaultSettings } = require('./seed.js') as typeof import('./seed.js')
  seedDefaultSettings()
```

完成后 `initDb` 形如：

```ts
export function initDb(migrationsFolder?: string): void {
  const db = getDb()
  const dir = migrationsFolder || path.resolve(new URL('..', import.meta.url).pathname, 'drizzle')
  if (!fs.existsSync(dir)) {
    throw new Error(`Drizzle migrations folder not found: ${dir}. Run \`pnpm db:generate\` first.`)
  }
  migrate(db, { migrationsFolder: dir })
  const { seedDefaultSettings } = require('./seed.js') as typeof import('./seed.js')
  seedDefaultSettings()
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): add settings singleton table and default seed"
```

---

### Task 10: db 包 — 迁移生成与冒烟测试

**Files:**
- Create: `packages/db/drizzle/0000_*.sql`（由 drizzle-kit 自动生成）
- Create: `packages/db/src/__tests__/client.test.ts`

- [ ] **Step 1: 生成迁移文件**

```bash
cd ~/galaxy
pnpm db:generate
```

Expected: 在 `packages/db/drizzle/` 下生成 `0000_*.sql` 与 `meta/` 目录，控制台输出 `✓ done`

- [ ] **Step 2: 写冒烟测试 `packages/db/src/__tests__/client.test.ts`（先失败）**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { closeDb, initDb, getDb, resolveDbPath } from '../client.js'
import { nodes } from '../schema/nodes.js'
import { settings } from '../schema/settings.js'
import { eq } from 'drizzle-orm'

const TMP_DB = path.join(os.tmpdir(), `galaxy-test-${Date.now()}.db`)

beforeEach(() => {
  process.env.GALAXY_DB_PATH = TMP_DB
})

afterEach(() => {
  closeDb()
  if (fs.existsSync(TMP_DB)) fs.rmSync(TMP_DB)
  delete process.env.GALAXY_DB_PATH
})

describe('db client', () => {
  it('resolveDbPath honors env override', () => {
    expect(resolveDbPath()).toBe(TMP_DB)
  })

  it('initDb creates tables and seeds settings row', () => {
    initDb()
    const db = getDb()
    const rows = db.select().from(settings).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(1)
  })

  it('can insert and read a node', () => {
    initDb()
    const db = getDb()
    db.insert(nodes)
      .values({ id: 'n_test1', title: '前置仓', slug: 'qian-zhi-cang' })
      .run()
    const row = db.select().from(nodes).where(eq(nodes.id, 'n_test1')).get()
    expect(row?.title).toBe('前置仓')
    expect(row?.status).toBe('active')
    expect(row?.is_seed).toBe(false)
  })
})
```

- [ ] **Step 3: 运行测试**

```bash
cd ~/galaxy
pnpm vitest run packages/db
```

Expected: 3 tests pass

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @galaxy/db typecheck
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "test(db): generate initial migrations and add client smoke tests"
```

---

### Task 11: web 包 — Next.js + Tailwind + shadcn 初始化

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/components.json`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`（占位）

- [ ] **Step 1: 创建 `apps/web/package.json`**

```json
{
  "name": "@galaxy/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@galaxy/db": "workspace:*",
    "@galaxy/shared": "workspace:*",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-toast": "^1.1.5",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "cmdk": "^1.0.0",
    "cytoscape": "^3.28.1",
    "cytoscape-fcose": "^2.2.0",
    "lucide-react": "^0.378.0",
    "next": "14.2.3",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "sonner": "^1.4.41",
    "tailwind-merge": "^2.3.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.23.0",
    "zustand": "^4.5.2"
  },
  "devDependencies": {
    "@types/cytoscape": "^3.21.4",
    "@types/react": "18.3.2",
    "@types/react-dom": "18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3"
  }
}
```

- [ ] **Step 2: 创建 `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    },
    "noEmit": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: 创建 `apps/web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
}

export default nextConfig
```

- [ ] **Step 4: 创建 `apps/web/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
      },
    },
  },
  plugins: [animate],
}

export default config
```

- [ ] **Step 5: 创建 `apps/web/postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: 创建 `apps/web/components.json`（shadcn CLI 配置）**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 7: 创建 `apps/web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 8: 创建 `apps/web/lib/utils.ts`（shadcn 必需）**

```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 9: 创建 `apps/web/app/layout.tsx`**

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

- [ ] **Step 10: 创建 `apps/web/app/page.tsx`（占位，下面 Task 17 会替换）**

```tsx
export default function Page() {
  return (
    <main className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Galaxy · M1 骨架</h1>
    </main>
  )
}
```

- [ ] **Step 11: 安装依赖并启动 dev 验证**

```bash
cd ~/galaxy
pnpm install
pnpm --filter @galaxy/web dev
```

Expected: `http://localhost:3000` 能看到 "Galaxy · M1 骨架" 文字（Ctrl+C 停止）

- [ ] **Step 12: 用 shadcn CLI 添加基础组件**

```bash
cd ~/galaxy/apps/web
pnpm dlx shadcn-ui@latest add button dialog input label sheet textarea select separator
```

Expected: 在 `apps/web/components/ui/` 下生成对应组件文件

- [ ] **Step 13: Commit**

```bash
cd ~/galaxy
git add apps/web
git commit -m "feat(web): scaffold next.js 14 app with tailwind, shadcn and base components"
```

---

### Task 12: web 包 — API 入参 Zod schemas

**Files:**
- Create: `apps/web/lib/api/schemas.ts`

- [ ] **Step 1: 创建 `apps/web/lib/api/schemas.ts`**

```ts
import { z } from 'zod'
import { RELATION_TYPES, NODE_STATUSES } from '@galaxy/shared'

export const CreateNodeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(2000).nullish(),
  domain: z.string().max(100).nullish(),
  is_seed: z.boolean().optional().default(false),
})
export type CreateNodeInput = z.infer<typeof CreateNodeSchema>

export const UpdateNodeSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().max(2000).nullish(),
  domain: z.string().max(100).nullish(),
  is_seed: z.boolean().optional(),
  status: z.enum(NODE_STATUSES).optional(),
})
export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>

export const CreateEdgeSchema = z.object({
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
  relation_type: z.enum(RELATION_TYPES),
  weight: z.number().min(0).max(1).optional().default(1),
  description: z.string().max(500).nullish(),
}).refine((v) => v.source_node_id !== v.target_node_id, {
  message: 'source and target must differ',
  path: ['target_node_id'],
})
export type CreateEdgeInput = z.infer<typeof CreateEdgeSchema>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/api/schemas.ts
git commit -m "feat(web): add zod schemas for nodes/edges API inputs"
```

---

### Task 13: web 包 — nodes API 路由

**Files:**
- Create: `apps/web/app/api/nodes/route.ts`
- Create: `apps/web/app/api/nodes/[id]/route.ts`

- [ ] **Step 1: 创建 `apps/web/app/api/nodes/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { nodes } from '@galaxy/db/schema'
import { newId, toSlug } from '@galaxy/shared'
import { CreateNodeSchema } from '@/lib/api/schemas'
import { desc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

// 模块级仅初始化一次
let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

export async function GET() {
  ensureDb()
  const db = getDb()
  const rows = db.select().from(nodes).orderBy(desc(nodes.updated_at)).all()
  return NextResponse.json({ data: rows })
}

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = CreateNodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()
  const id = newId('n')
  const slug = toSlug(parsed.data.title)
  try {
    db.insert(nodes)
      .values({
        id,
        title: parsed.data.title,
        slug,
        summary: parsed.data.summary ?? null,
        domain: parsed.data.domain ?? null,
        is_seed: parsed.data.is_seed ?? false,
      })
      .run()
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) {
      return NextResponse.json({ error: { slug: ['同名节点已存在'] } }, { status: 409 })
    }
    throw e
  }
  const row = db.select().from(nodes).where((t) => t.id.eq(id) as any).get()
  return NextResponse.json({ data: row }, { status: 201 })
}
```

- [ ] **Step 2: 创建 `apps/web/app/api/nodes/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { nodes } from '@galaxy/db/schema'
import { UpdateNodeSchema } from '@/lib/api/schemas'
import { eq } from 'drizzle-orm'
import { toSlug } from '@galaxy/shared'

export const dynamic = 'force-dynamic'

let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const row = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ data: row })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = UpdateNodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()
  const existing = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const patch: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.title) patch.slug = toSlug(parsed.data.title)
  patch.updated_at = new Date().toISOString()

  db.update(nodes).set(patch).where(eq(nodes.id, params.id)).run()
  const row = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  return NextResponse.json({ data: row })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const existing = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  db.delete(nodes).where(eq(nodes.id, params.id)).run()
  return NextResponse.json({ data: { id: params.id } })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/nodes
git commit -m "feat(web): add nodes REST endpoints (list/create/get/patch/delete)"
```

---

### Task 14: web 包 — edges API 路由

**Files:**
- Create: `apps/web/app/api/edges/route.ts`
- Create: `apps/web/app/api/edges/[id]/route.ts`

- [ ] **Step 1: 创建 `apps/web/app/api/edges/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { edges, nodes } from '@galaxy/db/schema'
import { newId } from '@galaxy/shared'
import { CreateEdgeSchema } from '@/lib/api/schemas'
import { desc, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

export async function GET() {
  ensureDb()
  const db = getDb()
  const rows = db.select().from(edges).orderBy(desc(edges.updated_at)).all()
  return NextResponse.json({ data: rows })
}

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = CreateEdgeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()

  // 校验两端节点存在
  const src = db.select().from(nodes).where(eq(nodes.id, parsed.data.source_node_id)).get()
  const tgt = db.select().from(nodes).where(eq(nodes.id, parsed.data.target_node_id)).get()
  if (!src || !tgt) {
    return NextResponse.json({ error: 'source or target node not found' }, { status: 404 })
  }

  const id = newId('e')
  try {
    db.insert(edges)
      .values({
        id,
        source_node_id: parsed.data.source_node_id,
        target_node_id: parsed.data.target_node_id,
        relation_type: parsed.data.relation_type,
        weight: parsed.data.weight ?? 1,
        description: parsed.data.description ?? null,
      })
      .run()
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) {
      return NextResponse.json({ error: '相同三元组的边已存在' }, { status: 409 })
    }
    throw e
  }
  const row = db.select().from(edges).where(eq(edges.id, id)).get()
  return NextResponse.json({ data: row }, { status: 201 })
}
```

- [ ] **Step 2: 创建 `apps/web/app/api/edges/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { edges } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const existing = db.select().from(edges).where(eq(edges.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  db.delete(edges).where(eq(edges.id, params.id)).run()
  return NextResponse.json({ data: { id: params.id } })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/edges
git commit -m "feat(web): add edges REST endpoints (list/create/delete)"
```

---

### Task 15: web 包 — API 集成测试

**Files:**
- Create: `apps/web/__tests__/api-nodes.test.ts`

- [ ] **Step 1: 创建 `apps/web/__tests__/api-nodes.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { closeDb } from '@galaxy/db'

const TMP_DB = path.join(os.tmpdir(), `galaxy-api-${Date.now()}.db`)

beforeEach(() => {
  process.env.GALAXY_DB_PATH = TMP_DB
})

afterEach(() => {
  closeDb()
  if (fs.existsSync(TMP_DB)) fs.rmSync(TMP_DB)
  delete process.env.GALAXY_DB_PATH
})

describe('nodes API route handlers', () => {
  it('POST then GET returns the created node', async () => {
    const { POST, GET } = await import('../app/api/nodes/route')
    const req = new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: '前置仓', summary: '即时配送基础设施' }),
    }) as any
    const created = await POST(req)
    expect(created.status).toBe(201)
    const createdJson = await created.json()
    expect(createdJson.data.title).toBe('前置仓')

    const list = await GET()
    const listJson = await list.json()
    expect(listJson.data).toHaveLength(1)
    expect(listJson.data[0].id).toBe(createdJson.data.id)
  })

  it('POST with empty title returns 400', async () => {
    const { POST } = await import('../app/api/nodes/route')
    const req = new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
    }) as any
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('PATCH updates title and slug', async () => {
    const { POST } = await import('../app/api/nodes/route')
    const { PATCH } = await import('../app/api/nodes/[id]/route')

    const createReq = new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: 'old' }),
    }) as any
    const created = await POST(createReq)
    const { data } = await created.json()

    const patchReq = new Request('http://localhost/api/nodes/' + data.id, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'new title' }),
    }) as any
    const patched = await PATCH(patchReq, { params: { id: data.id } })
    const patchedJson = await patched.json()
    expect(patchedJson.data.title).toBe('new title')
    expect(patchedJson.data.slug).toBe('new-title')
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
cd ~/galaxy
pnpm vitest run apps/web/__tests__
```

Expected: 3 tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__
git commit -m "test(web): add integration tests for nodes API route handlers"
```

---

### Task 16: web 包 — API 客户端封装与 zustand store

**Files:**
- Create: `apps/web/lib/api/client.ts`
- Create: `apps/web/lib/store/graph-store.ts`

- [ ] **Step 1: 创建 `apps/web/lib/api/client.ts`**

```ts
import type { Node, Edge } from '@galaxy/shared'
import type { CreateNodeInput, UpdateNodeInput, CreateEdgeInput } from './schemas'

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  const json = (await res.json()) as { data: T }
  return json.data
}

export const api = {
  listNodes: () => fetch('/api/nodes').then((r) => handle<Node[]>(r)),
  createNode: (input: CreateNodeInput) =>
    fetch('/api/nodes', { method: 'POST', body: JSON.stringify(input) }).then((r) => handle<Node>(r)),
  updateNode: (id: string, input: UpdateNodeInput) =>
    fetch(`/api/nodes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((r) => handle<Node>(r)),
  deleteNode: (id: string) =>
    fetch(`/api/nodes/${id}`, { method: 'DELETE' }).then((r) => handle<{ id: string }>(r)),
  listEdges: () => fetch('/api/edges').then((r) => handle<Edge[]>(r)),
  createEdge: (input: CreateEdgeInput) =>
    fetch('/api/edges', { method: 'POST', body: JSON.stringify(input) }).then((r) => handle<Edge>(r)),
  deleteEdge: (id: string) =>
    fetch(`/api/edges/${id}`, { method: 'DELETE' }).then((r) => handle<{ id: string }>(r)),
}
```

- [ ] **Step 2: 创建 `apps/web/lib/store/graph-store.ts`**

```ts
import { create } from 'zustand'
import type { Node, Edge } from '@galaxy/shared'
import { api } from '../api/client'

interface GraphState {
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  loading: boolean
  error: string | null

  loadAll: () => Promise<void>
  selectNode: (id: string | null) => void
  addNode: (input: Parameters<typeof api.createNode>[0]) => Promise<Node>
  patchNode: (id: string, input: Parameters<typeof api.updateNode>[1]) => Promise<void>
  removeNode: (id: string) => Promise<void>
  addEdge: (input: Parameters<typeof api.createEdge>[0]) => Promise<Edge>
  removeEdge: (id: string) => Promise<void>
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  loading: false,
  error: null,

  async loadAll() {
    set({ loading: true, error: null })
    try {
      const [nodes, edges] = await Promise.all([api.listNodes(), api.listEdges()])
      set({ nodes, edges, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  selectNode(id) {
    set({ selectedNodeId: id })
  },

  async addNode(input) {
    const node = await api.createNode(input)
    set({ nodes: [...get().nodes, node] })
    return node
  },

  async patchNode(id, input) {
    const updated = await api.updateNode(id, input)
    set({ nodes: get().nodes.map((n) => (n.id === id ? updated : n)) })
  },

  async removeNode(id) {
    await api.deleteNode(id)
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source_node_id !== id && e.target_node_id !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    })
  },

  async addEdge(input) {
    const edge = await api.createEdge(input)
    set({ edges: [...get().edges, edge] })
    return edge
  },

  async removeEdge(id) {
    await api.deleteEdge(id)
    set({ edges: get().edges.filter((e) => e.id !== id) })
  },
}))
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib
git commit -m "feat(web): add typed api client and zustand graph store"
```

---

### Task 17: web 包 — 主页面骨架与 Cytoscape 画布

**Files:**
- Create: `apps/web/app/_components/graph-canvas.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: 创建 `apps/web/app/_components/graph-canvas.tsx`**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import cytoscape, { Core, EventObject } from 'cytoscape'
// @ts-expect-error - cytoscape-fcose has no types
import fcose from 'cytoscape-fcose'
import type { Node, Edge } from '@galaxy/shared'

cytoscape.use(fcose)

interface Props {
  nodes: Node[]
  edges: Edge[]
  onSelectNode: (id: string | null) => void
  onCreateEdge: (sourceId: string, targetId: string) => void
}

export function GraphCanvas({ nodes, edges, onSelectNode, onCreateEdge }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const pendingSourceRef = useRef<string | null>(null)

  // 初始化 cytoscape 实例
  useEffect(() => {
    if (!containerRef.current) return
    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#0f172a',
            label: 'data(label)',
            color: '#0f172a',
            'font-size': 12,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            width: 28,
            height: 28,
          },
        },
        {
          selector: 'node[?seed]',
          style: { 'background-color': '#f59e0b', width: 36, height: 36 },
        },
        { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#3b82f6' } },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 10,
            color: '#64748b',
          },
        },
      ],
    })
    cyRef.current = cy

    cy.on('tap', 'node', (e: EventObject) => {
      const id = e.target.id() as string
      if (pendingSourceRef.current && pendingSourceRef.current !== id) {
        onCreateEdge(pendingSourceRef.current, id)
        pendingSourceRef.current = null
        cy.elements().removeClass('pending-source')
      } else {
        onSelectNode(id)
      }
    })
    cy.on('tap', (e: EventObject) => {
      if (e.target === cy) {
        onSelectNode(null)
        pendingSourceRef.current = null
        cy.elements().removeClass('pending-source')
      }
    })
    cy.on('cxttap', 'node', (e: EventObject) => {
      // 右键：开始连线
      pendingSourceRef.current = e.target.id() as string
      e.target.addClass('pending-source')
    })

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [onSelectNode, onCreateEdge])

  // 同步数据
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().remove()
    cy.add([
      ...nodes.map((n) => ({
        group: 'nodes' as const,
        data: { id: n.id, label: n.title, seed: n.is_seed ? 1 : 0 },
      })),
      ...edges.map((e) => ({
        group: 'edges' as const,
        data: { id: e.id, source: e.source_node_id, target: e.target_node_id, label: e.relation_type },
      })),
    ])
    cy.layout({ name: 'fcose', animate: false, randomize: nodes.length < 20 } as any).run()
    cy.fit(undefined, 40)
  }, [nodes, edges])

  return (
    <div ref={containerRef} className="h-full w-full bg-muted/20" />
  )
}
```

- [ ] **Step 2: 修改 `apps/web/app/page.tsx` 为完整主页**

```tsx
'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useGraphStore } from '@/lib/store/graph-store'

const GraphCanvas = dynamic(
  () => import('./_components/graph-canvas').then((m) => m.GraphCanvas),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-muted" /> },
)
const NodeDetailPanel = dynamic(
  () => import('./_components/node-detail-panel').then((m) => m.NodeDetailPanel),
  { ssr: false },
)
const NewNodeDialog = dynamic(
  () => import('./_components/new-node-dialog').then((m) => m.NewNodeDialog),
  { ssr: false },
)
const CommandPalette = dynamic(
  () => import('./_components/command-palette').then((m) => m.CommandPalette),
  { ssr: false },
)

export default function Page() {
  const { nodes, edges, loadAll, selectNode, addEdge } = useGraphStore()
  const [newOpen, setNewOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // 全局快捷键 Cmd+K 打开命令面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h1 className="text-lg font-semibold">Galaxy</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)}>
            <Search className="mr-1 h-4 w-4" /> 搜索 (⌘K)
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> 新建节点
          </Button>
        </div>
      </header>
      <div className="relative flex-1">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          onSelectNode={selectNode}
          onCreateEdge={async (s, t) => {
            try {
              await addEdge({ source_node_id: s, target_node_id: t, relation_type: 'related' })
              toast.success('已创建边')
            } catch (e: any) {
              toast.error(e.message || '创建失败')
            }
          }}
        />
        <NodeDetailPanel />
      </div>
      <NewNodeDialog open={newOpen} onOpenChange={setNewOpen} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app
git commit -m "feat(web): wire main page with cytoscape graph canvas and toolbar"
```

---

### Task 18: web 包 — 节点详情侧栏（NodeDetailPanel）

**Files:**
- Create: `apps/web/app/_components/node-detail-panel.tsx`

- [ ] **Step 1: 创建 `apps/web/app/_components/node-detail-panel.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useGraphStore } from '@/lib/store/graph-store'

export function NodeDetailPanel() {
  const { nodes, selectedNodeId, selectNode, patchNode, removeNode } = useGraphStore()
  const node = nodes.find((n) => n.id === selectedNodeId) || null
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [domain, setDomain] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!node) return
    setTitle(node.title)
    setSummary(node.summary ?? '')
    setDomain(node.domain ?? '')
  }, [node?.id])

  if (!node) return null

  const onSave = async () => {
    setSaving(true)
    try {
      await patchNode(node.id, { title, summary: summary || null, domain: domain || null })
      toast.success('已保存')
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!confirm(`删除节点「${node.title}」？相关边也会被删除。`)) return
    try {
      await removeNode(node.id)
      toast.success('已删除')
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && selectNode(null)}>
      <SheetContent side="right" className="w-[400px] sm:w-[480px]">
        <SheetHeader>
          <SheetTitle>节点详情</SheetTitle>
          <SheetDescription>{node.id}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title">标题</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="domain">领域</Label>
            <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="summary">摘要</Label>
            <Textarea id="summary" rows={6} value={summary} onChange={(e) => setSummary(e.target.value)} />
           'boolean' }).notNull().default(false),
  monthly_budget_usd: real('monthly_budget_usd').notNull().default(20),
  current_month_cost_usd: real('current_month_cost_usd').notNull().default(0),
  current_month_key: text('current_month_key').notNull().default(''),

  updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
})

export type SettingsRow = typeof settings.$inferSelect
```

- [ ] **Step 2: 在 `packages/db/src/schema/index.ts` 末尾追加**

```ts
export * from './settings.js'
```

- [ ] **Step 3: 创建 `packages/db/src/seed.ts`**

```ts
import { getDb } from './client.js'
import { settings } from './schema/settings.js'
import { sql } from 'drizzle-orm'

/**
 * 确保 settings 表存在唯一一行（id = 1）。幂等。
 */
export function seedDefaultSettings(): void {
  const db = getDb()
  db.insert(settings)
    .values({ id: 1 })
    .onConflictDoNothing({ target: settings.id })
    .run()
}
```

- [ ] **Step 4: 修改 `packages/db/src/client.ts`，在 `initDb` 末尾调用 seed**

在 `initDb` 函数最后一行 `migrate(db, ...)` 之后追加：

```ts
  // 内联 import 避免循环依赖
  const { seedDefaultSettings } = require('./seed.js') as typeof import('./seed.js')
  seedDefaultSettings()
```

完成后 `initDb` 形如：

```ts
export function initDb(migrationsFolder?: string): void {
  const db = getDb()
  const dir = migrationsFolder || path.resolve(new URL('..', import.meta.url).pathname, 'drizzle')
  if (!fs.existsSync(dir)) {
    throw new Error(`Drizzle migrations folder not found: ${dir}. Run \`pnpm db:generate\` first.`)
  }
  migrate(db, { migrationsFolder: dir })
  const { seedDefaultSettings } = require('./seed.js') as typeof import('./seed.js')
  seedDefaultSettings()
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): add settings singleton table and default seed"
```

---

### Task 10: db 包 — 迁移生成与冒烟测试

**Files:**
- Create: `packages/db/drizzle/0000_*.sql`（由 drizzle-kit 自动生成）
- Create: `packages/db/src/__tests__/client.test.ts`

- [ ] **Step 1: 生成迁移文件**

```bash
cd ~/galaxy
pnpm db:generate
```

Expected: 在 `packages/db/drizzle/` 下生成 `0000_*.sql` 与 `meta/` 目录，控制台输出 `✓ done`

- [ ] **Step 2: 写冒烟测试 `packages/db/src/__tests__/client.test.ts`（先失败）**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { closeDb, initDb, getDb, resolveDbPath } from '../client.js'
import { nodes } from '../schema/nodes.js'
import { settings } from '../schema/settings.js'
import { eq } from 'drizzle-orm'

const TMP_DB = path.join(os.tmpdir(), `galaxy-test-${Date.now()}.db`)

beforeEach(() => {
  process.env.GALAXY_DB_PATH = TMP_DB
})

afterEach(() => {
  closeDb()
  if (fs.existsSync(TMP_DB)) fs.rmSync(TMP_DB)
  delete process.env.GALAXY_DB_PATH
})

describe('db client', () => {
  it('resolveDbPath honors env override', () => {
    expect(resolveDbPath()).toBe(TMP_DB)
  })

  it('initDb creates tables and seeds settings row', () => {
    initDb()
    const db = getDb()
    const rows = db.select().from(settings).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(1)
  })

  it('can insert and read a node', () => {
    initDb()
    const db = getDb()
    db.insert(nodes)
      .values({ id: 'n_test1', title: '前置仓', slug: 'qian-zhi-cang' })
      .run()
    const row = db.select().from(nodes).where(eq(nodes.id, 'n_test1')).get()
    expect(row?.title).toBe('前置仓')
    expect(row?.status).toBe('active')
    expect(row?.is_seed).toBe(false)
  })
})
```

- [ ] **Step 3: 运行测试**

```bash
cd ~/galaxy
pnpm vitest run packages/db
```

Expected: 3 tests pass

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @galaxy/db typecheck
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "test(db): generate initial migrations and add client smoke tests"
```

---

### Task 11: web 包 — Next.js + Tailwind + shadcn 初始化

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/components.json`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`（占位）

- [ ] **Step 1: 创建 `apps/web/package.json`**

```json
{
  "name": "@galaxy/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@galaxy/db": "workspace:*",
    "@galaxy/shared": "workspace:*",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-toast": "^1.1.5",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "cmdk": "^1.0.0",
    "cytoscape": "^3.28.1",
    "cytoscape-fcose": "^2.2.0",
    "lucide-react": "^0.378.0",
    "next": "14.2.3",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "sonner": "^1.4.41",
    "tailwind-merge": "^2.3.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.23.0",
    "zustand": "^4.5.2"
  },
  "devDependencies": {
    "@types/cytoscape": "^3.21.4",
    "@types/react": "18.3.2",
    "@types/react-dom": "18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3"
  }
}
```

- [ ] **Step 2: 创建 `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    },
    "noEmit": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: 创建 `apps/web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
}

export default nextConfig
```

- [ ] **Step 4: 创建 `apps/web/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
      },
    },
  },
  plugins: [animate],
}

export default config
```

- [ ] **Step 5: 创建 `apps/web/postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: 创建 `apps/web/components.json`（shadcn CLI 配置）**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 7: 创建 `apps/web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 8: 创建 `apps/web/lib/utils.ts`（shadcn 必需）**

```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 9: 创建 `apps/web/app/layout.tsx`**

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

- [ ] **Step 10: 创建 `apps/web/app/page.tsx`（占位，下面 Task 17 会替换）**

```tsx
export default function Page() {
  return (
    <main className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Galaxy · M1 骨架</h1>
    </main>
  )
}
```

- [ ] **Step 11: 安装依赖并启动 dev 验证**

```bash
cd ~/galaxy
pnpm install
pnpm --filter @galaxy/web dev
```

Expected: `http://localhost:3000` 能看到 "Galaxy · M1 骨架" 文字（Ctrl+C 停止）

- [ ] **Step 12: 用 shadcn CLI 添加基础组件**

```bash
cd ~/galaxy/apps/web
pnpm dlx shadcn-ui@latest add button dialog input label sheet textarea select separator
```

Expected: 在 `apps/web/components/ui/` 下生成对应组件文件

- [ ] **Step 13: Commit**

```bash
cd ~/galaxy
git add apps/web
git commit -m "feat(web): scaffold next.js 14 app with tailwind, shadcn and base components"
```

---

### Task 12: web 包 — API 入参 Zod schemas

**Files:**
- Create: `apps/web/lib/api/schemas.ts`

- [ ] **Step 1: 创建 `apps/web/lib/api/schemas.ts`**

```ts
import { z } from 'zod'
import { RELATION_TYPES, NODE_STATUSES } from '@galaxy/shared'

export const CreateNodeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(2000).nullish(),
  domain: z.string().max(100).nullish(),
  is_seed: z.boolean().optional().default(false),
})
export type CreateNodeInput = z.infer<typeof CreateNodeSchema>

export const UpdateNodeSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().max(2000).nullish(),
  domain: z.string().max(100).nullish(),
  is_seed: z.boolean().optional(),
  status: z.enum(NODE_STATUSES).optional(),
})
export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>

export const CreateEdgeSchema = z.object({
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
  relation_type: z.enum(RELATION_TYPES),
  weight: z.number().min(0).max(1).optional().default(1),
  description: z.string().max(500).nullish(),
}).refine((v) => v.source_node_id !== v.target_node_id, {
  message: 'source and target must differ',
  path: ['target_node_id'],
})
export type CreateEdgeInput = z.infer<typeof CreateEdgeSchema>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/api/schemas.ts
git commit -m "feat(web): add zod schemas for nodes/edges API inputs"
```

---

### Task 13: web 包 — nodes API 路由

**Files:**
- Create: `apps/web/app/api/nodes/route.ts`
- Create: `apps/web/app/api/nodes/[id]/route.ts`

- [ ] **Step 1: 创建 `apps/web/app/api/nodes/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { nodes } from '@galaxy/db/schema'
import { newId, toSlug } from '@galaxy/shared'
import { CreateNodeSchema } from '@/lib/api/schemas'
import { desc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

// 模块级仅初始化一次
let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

export async function GET() {
  ensureDb()
  const db = getDb()
  const rows = db.select().from(nodes).orderBy(desc(nodes.updated_at)).all()
  return NextResponse.json({ data: rows })
}

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = CreateNodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()
  const id = newId('n')
  const slug = toSlug(parsed.data.title)
  try {
    db.insert(nodes)
      .values({
        id,
        title: parsed.data.title,
        slug,
        summary: parsed.data.summary ?? null,
        domain: parsed.data.domain ?? null,
        is_seed: parsed.data.is_seed ?? false,
      })
      .run()
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) {
      return NextResponse.json({ error: { slug: ['同名节点已存在'] } }, { status: 409 })
    }
    throw e
  }
  const row = db.select().from(nodes).where((t) => t.id.eq(id) as any).get()
  return NextResponse.json({ data: row }, { status: 201 })
}
```

- [ ] **Step 2: 创建 `apps/web/app/api/nodes/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { nodes } from '@galaxy/db/schema'
import { UpdateNodeSchema } from '@/lib/api/schemas'
import { eq } from 'drizzle-orm'
import { toSlug } from '@galaxy/shared'

export const dynamic = 'force-dynamic'

let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const row = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ data: row })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = UpdateNodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()
  const existing = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const patch: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.title) patch.slug = toSlug(parsed.data.title)
  patch.updated_at = new Date().toISOString()

  db.update(nodes).set(patch).where(eq(nodes.id, params.id)).run()
  const row = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  return NextResponse.json({ data: row })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const existing = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  db.delete(nodes).where(eq(nodes.id, params.id)).run()
  return NextResponse.json({ data: { id: params.id } })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/nodes
git commit -m "feat(web): add nodes REST endpoints (list/create/get/patch/delete)"
```

---

### Task 14: web 包 — edges API 路由

**Files:**
- Create: `apps/web/app/api/edges/route.ts`
- Create: `apps/web/app/api/edges/[id]/route.ts`

- [ ] **Step 1: 创建 `apps/web/app/api/edges/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { edges, nodes } from '@galaxy/db/schema'
import { newId } from '@galaxy/shared'
import { CreateEdgeSchema } from '@/lib/api/schemas'
import { desc, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

export async function GET() {
  ensureDb()
  const db = getDb()
  const rows = db.select().from(edges).orderBy(desc(edges.updated_at)).all()
  return NextResponse.json({ data: rows })
}

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = CreateEdgeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()

  // 校验两端节点存在
  const src = db.select().from(nodes).where(eq(nodes.id, parsed.data.source_node_id)).get()
  const tgt = db.select().from(nodes).where(eq(nodes.id, parsed.data.target_node_id)).get()
  if (!src || !tgt) {
    return NextResponse.json({ error: 'source or target node not found' }, { status: 404 })
  }

  const id = newId('e')
  try {
    db.insert(edges)
      .values({
        id,
        source_node_id: parsed.data.source_node_id,
        target_node_id: parsed.data.target_node_id,
        relation_type: parsed.data.relation_type,
        weight: parsed.data.weight ?? 1,
        description: parsed.data.description ?? null,
      })
      .run()
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) {
      return NextResponse.json({ error: '相同三元组的边已存在' }, { status: 409 })
    }
    throw e
  }
  const row = db.select().from(edges).where(eq(edges.id, id)).get()
  return NextResponse.json({ data: row }, { status: 201 })
}
```

- [ ] **Step 2: 创建 `apps/web/app/api/edges/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { edges } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const existing = db.select().from(edges).where(eq(edges.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  db.delete(edges).where(eq(edges.id, params.id)).run()
  return NextResponse.json({ data: { id: params.id } })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/edges
git commit -m "feat(web): add edges REST endpoints (list/create/delete)"
```

---

### Task 15: web 包 — API 集成测试

**Files:**
- Create: `apps/web/__tests__/api-nodes.test.ts`

- [ ] **Step 1: 创建 `apps/web/__tests__/api-nodes.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { closeDb } from '@galaxy/db'

const TMP_DB = path.join(os.tmpdir(), `galaxy-api-${Date.now()}.db`)

beforeEach(() => {
  process.env.GALAXY_DB_PATH = TMP_DB
})

afterEach(() => {
  closeDb()
  if (fs.existsSync(TMP_DB)) fs.rmSync(TMP_DB)
  delete process.env.GALAXY_DB_PATH
})

describe('nodes API route handlers', () => {
  it('POST then GET returns the created node', async () => {
    const { POST, GET } = await import('../app/api/nodes/route')
    const req = new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: '前置仓', summary: '即时配送基础设施' }),
    }) as any
    const created = await POST(req)
    expect(created.status).toBe(201)
    const createdJson = await created.json()
    expect(createdJson.data.title).toBe('前置仓')

    const list = await GET()
    const listJson = await list.json()
    expect(listJson.data).toHaveLength(1)
    expect(listJson.data[0].id).toBe(createdJson.data.id)
  })

  it('POST with empty title returns 400', async () => {
    const { POST } = await import('../app/api/nodes/route')
    const req = new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
    }) as any
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('PATCH updates title and slug', async () => {
    const { POST } = await import('../app/api/nodes/route')
    const { PATCH } = await import('../app/api/nodes/[id]/route')

    const createReq = new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: 'old' }),
    }) as any
    const created = await POST(createReq)
    const { data } = await created.json()

    const patchReq = new Request('http://localhost/api/nodes/' + data.id, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'new title' }),
    }) as any
    const patched = await PATCH(patchReq, { params: { id: data.id } })
    const patchedJson = await patched.json()
    expect(patchedJson.data.title).toBe('new title')
    expect(patchedJson.data.slug).toBe('new-title')
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
cd ~/galaxy
pnpm vitest run apps/web/__tests__
```

Expected: 3 tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__
git commit -m "test(web): add integration tests for nodes API route handlers"
```

---

### Task 16: web 包 — API 客户端封装与 zustand store

**Files:**
- Create: `apps/web/lib/api/client.ts`
- Create: `apps/web/lib/store/graph-store.ts`

- [ ] **Step 1: 创建 `apps/web/lib/api/client.ts`**

```ts
import type { Node, Edge } from '@galaxy/shared'
import type { CreateNodeInput, UpdateNodeInput, CreateEdgeInput } from './schemas'

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  const json = (await res.json()) as { data: T }
  return json.data
}

export const api = {
  listNodes: () => fetch('/api/nodes').then((r) => handle<Node[]>(r)),
  createNode: (input: CreateNodeInput) =>
    fetch('/api/nodes', { method: 'POST', body: JSON.stringify(input) }).then((r) => handle<Node>(r)),
  updateNode: (id: string, input: UpdateNodeInput) =>
    fetch(`/api/nodes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((r) => handle<Node>(r)),
  deleteNode: (id: string) =>
    fetch(`/api/nodes/${id}`, { method: 'DELETE' }).then((r) => handle<{ id: string }>(r)),
  listEdges: () => fetch('/api/edges').then((r) => handle<Edge[]>(r)),
  createEdge: (input: CreateEdgeInput) =>
    fetch('/api/edges', { method: 'POST', body: JSON.stringify(input) }).then((r) => handle<Edge>(r)),
  deleteEdge: (id: string) =>
    fetch(`/api/edges/${id}`, { method: 'DELETE' }).then((r) => handle<{ id: string }>(r)),
}
```

- [ ] **Step 2: 创建 `apps/web/lib/store/graph-store.ts`**

```ts
import { create } from 'zustand'
import type { Node, Edge } from '@galaxy/shared'
import { api } from '../api/client'

interface GraphState {
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  loading: boolean
  error: string | null

  loadAll: () => Promise<void>
  selectNode: (id: string | null) => void
  addNode: (input: Parameters<typeof api.createNode>[0]) => Promise<Node>
  patchNode: (id: string, input: Parameters<typeof api.updateNode>[1]) => Promise<void>
  removeNode: (id: string) => Promise<void>
  addEdge: (input: Parameters<typeof api.createEdge>[0]) => Promise<Edge>
  removeEdge: (id: string) => Promise<void>
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  loading: false,
  error: null,

  async loadAll() {
    set({ loading: true, error: null })
    try {
      const [nodes, edges] = await Promise.all([api.listNodes(), api.listEdges()])
      set({ nodes, edges, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  selectNode(id) {
    set({ selectedNodeId: id })
  },

  async addNode(input) {
    const node = await api.createNode(input)
    set({ nodes: [...get().nodes, node] })
    return node
  },

  async patchNode(id, input) {
    const updated = await api.updateNode(id, input)
    set({ nodes: get().nodes.map((n) => (n.id === id ? updated : n)) })
  },

  async removeNode(id) {
    await api.deleteNode(id)
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source_node_id !== id && e.target_node_id !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    })
  },

  async addEdge(input) {
    const edge = await api.createEdge(input)
    set({ edges: [...get().edges, edge] })
    return edge
  },

  async removeEdge(id) {
    await api.deleteEdge(id)
    set({ edges: get().edges.filter((e) => e.id !== id) })
  },
}))
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib
git commit -m "feat(web): add typed api client and zustand graph store"
```

---

### Task 17: web 包 — 主页面骨架与 Cytoscape 画布

**Files:**
- Create: `apps/web/app/_components/graph-canvas.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: 创建 `apps/web/app/_components/graph-canvas.tsx`**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import cytoscape, { Core, EventObject } from 'cytoscape'
// @ts-expect-error - cytoscape-fcose has no types
import fcose from 'cytoscape-fcose'
import type { Node, Edge } from '@galaxy/shared'

cytoscape.use(fcose)

interface Props {
  nodes: Node[]
  edges: Edge[]
  onSelectNode: (id: string | null) => void
  onCreateEdge: (sourceId: string, targetId: string) => void
}

export function GraphCanvas({ nodes, edges, onSelectNode, onCreateEdge }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const pendingSourceRef = useRef<string | null>(null)

  // 初始化 cytoscape 实例
  useEffect(() => {
    if (!containerRef.current) return
    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#0f172a',
            label: 'data(label)',
            color: '#0f172a',
            'font-size': 12,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            width: 28,
            height: 28,
          },
        },
        {
          selector: 'node[?seed]',
          style: { 'background-color': '#f59e0b', width: 36, height: 36 },
        },
        { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#3b82f6' } },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 10,
            color: '#64748b',
          },
        },
      ],
    })
    cyRef.current = cy

    cy.on('tap', 'node', (e: EventObject) => {
      const id = e.target.id() as string
      if (pendingSourceRef.current && pendingSourceRef.current !== id) {
        onCreateEdge(pendingSourceRef.current, id)
        pendingSourceRef.current = null
        cy.elements().removeClass('pending-source')
      } else {
        onSelectNode(id)
      }
    })
    cy.on('tap', (e: EventObject) => {
      if (e.target === cy) {
        onSelectNode(null)
        pendingSourceRef.current = null
        cy.elements().removeClass('pending-source')
      }
    })
    cy.on('cxttap', 'node', (e: EventObject) => {
      // 右键：开始连线
      pendingSourceRef.current = e.target.id() as string
      e.target.addClass('pending-source')
    })

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [onSelectNode, onCreateEdge])

  // 同步数据
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().remove()
    cy.add([
      ...nodes.map((n) => ({
        group: 'nodes' as const,
        data: { id: n.id, label: n.title, seed: n.is_seed ? 1 : 0 },
      })),
      ...edges.map((e) => ({
        group: 'edges' as const,
        data: { id: e.id, source: e.source_node_id, target: e.target_node_id, label: e.relation_type },
      })),
    ])
    cy.layout({ name: 'fcose', animate: false, randomize: nodes.length < 20 } as any).run()
    cy.fit(undefined, 40)
  }, [nodes, edges])

  return (
    <div ref={containerRef} className="h-full w-full bg-muted/20" />
  )
}
```

- [ ] **Step 2: 修改 `apps/web/app/page.tsx` 为完整主页**

```tsx
'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useGraphStore } from '@/lib/store/graph-store'

const GraphCanvas = dynamic(
  () => import('./_components/graph-canvas').then((m) => m.GraphCanvas),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-muted" /> },
)
const NodeDetailPanel = dynamic(
  () => import('./_components/node-detail-panel').then((m) => m.NodeDetailPanel),
  { ssr: false },
)
const NewNodeDialog = dynamic(
  () => import('./_components/new-node-dialog').then((m) => m.NewNodeDialog),
  { ssr: false },
)
const CommandPalette = dynamic(
  () => import('./_components/command-palette').then((m) => m.CommandPalette),
  { ssr: false },
)

export default function Page() {
  const { nodes, edges, loadAll, selectNode, addEdge } = useGraphStore()
  const [newOpen, setNewOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // 全局快捷键 Cmd+K 打开命令面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h1 className="text-lg font-semibold">Galaxy</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)}>
            <Search className="mr-1 h-4 w-4" /> 搜索 (⌘K)
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> 新建节点
          </Button>
        </div>
      </header>
      <div className="relative flex-1">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          onSelectNode={selectNode}
          onCreateEdge={async (s, t) => {
            try {
              await addEdge({ source_node_id: s, target_node_id: t, relation_type: 'related' })
              toast.success('已创建边')
            } catch (e: any) {
              toast.error(e.message || '创建失败')
            }
          }}
        />
        <NodeDetailPanel />
      </div>
      <NewNodeDialog open={newOpen} onOpenChange={setNewOpen} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app
git commit -m "feat(web): wire main page with cytoscape graph canvas and toolbar"
```

---

### Task 18: web 包 — 节点详情侧栏（NodeDetailPanel）

**Files:**
- Create: `apps/web/app/_components/node-detail-panel.tsx`

- [ ] **Step 1: 创建 `apps/web/app/_components/node-detail-panel.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useGraphStore } from '@/lib/store/graph-store'

export function NodeDetailPanel() {
  const { nodes, selectedNodeId, selectNode, patchNode, removeNode } = useGraphStore()
  const node = nodes.find((n) => n.id === selectedNodeId) || null
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [domain, setDomain] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!node) return
    setTitle(node.title)
    setSummary(node.summary ?? '')
    setDomain(node.domain ?? '')
  }, [node?.id])

  if (!node) return null

  const onSave = async () => {
    setSaving(true)
    try {
      await patchNode(node.id, { title, summary: summary || null, domain: domain || null })
      toast.success('已保存')
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!confirm(`删除节点「${node.title}」？相关边也会被删除。`)) return
    try {
      await removeNode(node.id)
      toast.success('已删除')
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && selectNode(null)}>
      <SheetContent side="right" className="w-[400px] sm:w-[480px]">
        <SheetHeader>
          <SheetTitle>节点详情</SheetTitle>
          <SheetDescription>{node.id}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title">标题</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="domain">领域</Label>
            <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="summary">摘要</Label>
            <Textarea id="summary" rows={6} value={summary} onChange={(e) => setSummary(e.target.value)} />
           'boolean' }).notNull().default(false),
  monthly_budget_usd: real('monthly_budget_usd').notNull().default(20),
  current_month_cost_usd: real('current_month_cost_usd').notNull().default(0),
  current_month_key: text('current_month_key').notNull().default(''),

  updated_at: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
})

export type SettingsRow = typeof settings.$inferSelect
```

- [ ] **Step 2: 在 `packages/db/src/schema/index.ts` 末尾追加**

```ts
export * from './settings.js'
```

- [ ] **Step 3: 创建 `packages/db/src/seed.ts`**

```ts
import { getDb } from './client.js'
import { settings } from './schema/settings.js'
import { sql } from 'drizzle-orm'

/**
 * 确保 settings 表存在唯一一行（id = 1）。幂等。
 */
export function seedDefaultSettings(): void {
  const db = getDb()
  db.insert(settings)
    .values({ id: 1 })
    .onConflictDoNothing({ target: settings.id })
    .run()
}
```

- [ ] **Step 4: 修改 `packages/db/src/client.ts`，在 `initDb` 末尾调用 seed**

在 `initDb` 函数最后一行 `migrate(db, ...)` 之后追加：

```ts
  // 内联 import 避免循环依赖
  const { seedDefaultSettings } = require('./seed.js') as typeof import('./seed.js')
  seedDefaultSettings()
```

完成后 `initDb` 形如：

```ts
export function initDb(migrationsFolder?: string): void {
  const db = getDb()
  const dir = migrationsFolder || path.resolve(new URL('..', import.meta.url).pathname, 'drizzle')
  if (!fs.existsSync(dir)) {
    throw new Error(`Drizzle migrations folder not found: ${dir}. Run \`pnpm db:generate\` first.`)
  }
  migrate(db, { migrationsFolder: dir })
  const { seedDefaultSettings } = require('./seed.js') as typeof import('./seed.js')
  seedDefaultSettings()
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): add settings singleton table and default seed"
```

---

### Task 10: db 包 — 迁移生成与冒烟测试

**Files:**
- Create: `packages/db/drizzle/0000_*.sql`（由 drizzle-kit 自动生成）
- Create: `packages/db/src/__tests__/client.test.ts`

- [ ] **Step 1: 生成迁移文件**

```bash
cd ~/galaxy
pnpm db:generate
```

Expected: 在 `packages/db/drizzle/` 下生成 `0000_*.sql` 与 `meta/` 目录，控制台输出 `✓ done`

- [ ] **Step 2: 写冒烟测试 `packages/db/src/__tests__/client.test.ts`（先失败）**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { closeDb, initDb, getDb, resolveDbPath } from '../client.js'
import { nodes } from '../schema/nodes.js'
import { settings } from '../schema/settings.js'
import { eq } from 'drizzle-orm'

const TMP_DB = path.join(os.tmpdir(), `galaxy-test-${Date.now()}.db`)

beforeEach(() => {
  process.env.GALAXY_DB_PATH = TMP_DB
})

afterEach(() => {
  closeDb()
  if (fs.existsSync(TMP_DB)) fs.rmSync(TMP_DB)
  delete process.env.GALAXY_DB_PATH
})

describe('db client', () => {
  it('resolveDbPath honors env override', () => {
    expect(resolveDbPath()).toBe(TMP_DB)
  })

  it('initDb creates tables and seeds settings row', () => {
    initDb()
    const db = getDb()
    const rows = db.select().from(settings).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(1)
  })

  it('can insert and read a node', () => {
    initDb()
    const db = getDb()
    db.insert(nodes)
      .values({ id: 'n_test1', title: '前置仓', slug: 'qian-zhi-cang' })
      .run()
    const row = db.select().from(nodes).where(eq(nodes.id, 'n_test1')).get()
    expect(row?.title).toBe('前置仓')
    expect(row?.status).toBe('active')
    expect(row?.is_seed).toBe(false)
  })
})
```

- [ ] **Step 3: 运行测试**

```bash
cd ~/galaxy
pnpm vitest run packages/db
```

Expected: 3 tests pass

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @galaxy/db typecheck
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "test(db): generate initial migrations and add client smoke tests"
```

---

### Task 11: web 包 — Next.js + Tailwind + shadcn 初始化

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/components.json`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`（占位）

- [ ] **Step 1: 创建 `apps/web/package.json`**

```json
{
  "name": "@galaxy/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@galaxy/db": "workspace:*",
    "@galaxy/shared": "workspace:*",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-toast": "^1.1.5",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "cmdk": "^1.0.0",
    "cytoscape": "^3.28.1",
    "cytoscape-fcose": "^2.2.0",
    "lucide-react": "^0.378.0",
    "next": "14.2.3",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "sonner": "^1.4.41",
    "tailwind-merge": "^2.3.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.23.0",
    "zustand": "^4.5.2"
  },
  "devDependencies": {
    "@types/cytoscape": "^3.21.4",
    "@types/react": "18.3.2",
    "@types/react-dom": "18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3"
  }
}
```

- [ ] **Step 2: 创建 `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    },
    "noEmit": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: 创建 `apps/web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
}

export default nextConfig
```

- [ ] **Step 4: 创建 `apps/web/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
      },
    },
  },
  plugins: [animate],
}

export default config
```

- [ ] **Step 5: 创建 `apps/web/postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: 创建 `apps/web/components.json`（shadcn CLI 配置）**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 7: 创建 `apps/web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 8: 创建 `apps/web/lib/utils.ts`（shadcn 必需）**

```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 9: 创建 `apps/web/app/layout.tsx`**

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

- [ ] **Step 10: 创建 `apps/web/app/page.tsx`（占位，下面 Task 17 会替换）**

```tsx
export default function Page() {
  return (
    <main className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Galaxy · M1 骨架</h1>
    </main>
  )
}
```

- [ ] **Step 11: 安装依赖并启动 dev 验证**

```bash
cd ~/galaxy
pnpm install
pnpm --filter @galaxy/web dev
```

Expected: `http://localhost:3000` 能看到 "Galaxy · M1 骨架" 文字（Ctrl+C 停止）

- [ ] **Step 12: 用 shadcn CLI 添加基础组件**

```bash
cd ~/galaxy/apps/web
pnpm dlx shadcn-ui@latest add button dialog input label sheet textarea select separator
```

Expected: 在 `apps/web/components/ui/` 下生成对应组件文件

- [ ] **Step 13: Commit**

```bash
cd ~/galaxy
git add apps/web
git commit -m "feat(web): scaffold next.js 14 app with tailwind, shadcn and base components"
```

---

### Task 12: web 包 — API 入参 Zod schemas

**Files:**
- Create: `apps/web/lib/api/schemas.ts`

- [ ] **Step 1: 创建 `apps/web/lib/api/schemas.ts`**

```ts
import { z } from 'zod'
import { RELATION_TYPES, NODE_STATUSES } from '@galaxy/shared'

export const CreateNodeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(2000).nullish(),
  domain: z.string().max(100).nullish(),
  is_seed: z.boolean().optional().default(false),
})
export type CreateNodeInput = z.infer<typeof CreateNodeSchema>

export const UpdateNodeSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().max(2000).nullish(),
  domain: z.string().max(100).nullish(),
  is_seed: z.boolean().optional(),
  status: z.enum(NODE_STATUSES).optional(),
})
export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>

export const CreateEdgeSchema = z.object({
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
  relation_type: z.enum(RELATION_TYPES),
  weight: z.number().min(0).max(1).optional().default(1),
  description: z.string().max(500).nullish(),
}).refine((v) => v.source_node_id !== v.target_node_id, {
  message: 'source and target must differ',
  path: ['target_node_id'],
})
export type CreateEdgeInput = z.infer<typeof CreateEdgeSchema>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/api/schemas.ts
git commit -m "feat(web): add zod schemas for nodes/edges API inputs"
```

---

### Task 13: web 包 — nodes API 路由

**Files:**
- Create: `apps/web/app/api/nodes/route.ts`
- Create: `apps/web/app/api/nodes/[id]/route.ts`

- [ ] **Step 1: 创建 `apps/web/app/api/nodes/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { nodes } from '@galaxy/db/schema'
import { newId, toSlug } from '@galaxy/shared'
import { CreateNodeSchema } from '@/lib/api/schemas'
import { desc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

// 模块级仅初始化一次
let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

export async function GET() {
  ensureDb()
  const db = getDb()
  const rows = db.select().from(nodes).orderBy(desc(nodes.updated_at)).all()
  return NextResponse.json({ data: rows })
}

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = CreateNodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()
  const id = newId('n')
  const slug = toSlug(parsed.data.title)
  try {
    db.insert(nodes)
      .values({
        id,
        title: parsed.data.title,
        slug,
        summary: parsed.data.summary ?? null,
        domain: parsed.data.domain ?? null,
        is_seed: parsed.data.is_seed ?? false,
      })
      .run()
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) {
      return NextResponse.json({ error: { slug: ['同名节点已存在'] } }, { status: 409 })
    }
    throw e
  }
  const row = db.select().from(nodes).where((t) => t.id.eq(id) as any).get()
  return NextResponse.json({ data: row }, { status: 201 })
}
```

- [ ] **Step 2: 创建 `apps/web/app/api/nodes/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { nodes } from '@galaxy/db/schema'
import { UpdateNodeSchema } from '@/lib/api/schemas'
import { eq } from 'drizzle-orm'
import { toSlug } from '@galaxy/shared'

export const dynamic = 'force-dynamic'

let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const row = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ data: row })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = UpdateNodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()
  const existing = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const patch: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.title) patch.slug = toSlug(parsed.data.title)
  patch.updated_at = new Date().toISOString()

  db.update(nodes).set(patch).where(eq(nodes.id, params.id)).run()
  const row = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  return NextResponse.json({ data: row })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const existing = db.select().from(nodes).where(eq(nodes.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  db.delete(nodes).where(eq(nodes.id, params.id)).run()
  return NextResponse.json({ data: { id: params.id } })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/nodes
git commit -m "feat(web): add nodes REST endpoints (list/create/get/patch/delete)"
```

---

### Task 14: web 包 — edges API 路由

**Files:**
- Create: `apps/web/app/api/edges/route.ts`
- Create: `apps/web/app/api/edges/[id]/route.ts`

- [ ] **Step 1: 创建 `apps/web/app/api/edges/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { edges, nodes } from '@galaxy/db/schema'
import { newId } from '@galaxy/shared'
import { CreateEdgeSchema } from '@/lib/api/schemas'
import { desc, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

export async function GET() {
  ensureDb()
  const db = getDb()
  const rows = db.select().from(edges).orderBy(desc(edges.updated_at)).all()
  return NextResponse.json({ data: rows })
}

export async function POST(req: NextRequest) {
  ensureDb()
  const body = await req.json().catch(() => ({}))
  const parsed = CreateEdgeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()

  // 校验两端节点存在
  const src = db.select().from(nodes).where(eq(nodes.id, parsed.data.source_node_id)).get()
  const tgt = db.select().from(nodes).where(eq(nodes.id, parsed.data.target_node_id)).get()
  if (!src || !tgt) {
    return NextResponse.json({ error: 'source or target node not found' }, { status: 404 })
  }

  const id = newId('e')
  try {
    db.insert(edges)
      .values({
        id,
        source_node_id: parsed.data.source_node_id,
        target_node_id: parsed.data.target_node_id,
        relation_type: parsed.data.relation_type,
        weight: parsed.data.weight ?? 1,
        description: parsed.data.description ?? null,
      })
      .run()
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) {
      return NextResponse.json({ error: '相同三元组的边已存在' }, { status: 409 })
    }
    throw e
  }
  const row = db.select().from(edges).where(eq(edges.id, id)).get()
  return NextResponse.json({ data: row }, { status: 201 })
}
```

- [ ] **Step 2: 创建 `apps/web/app/api/edges/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb, initDb } from '@galaxy/db'
import { edges } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

let initialized = false
function ensureDb() {
  if (!initialized) {
    initDb()
    initialized = true
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  ensureDb()
  const db = getDb()
  const existing = db.select().from(edges).where(eq(edges.id, params.id)).get()
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  db.delete(edges).where(eq(edges.id, params.id)).run()
  return NextResponse.json({ data: { id: params.id } })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/edges
git commit -m "feat(web): add edges REST endpoints (list/create/delete)"
```

---

### Task 15: web 包 — API 集成测试

**Files:**
- Create: `apps/web/__tests__/api-nodes.test.ts`

- [ ] **Step 1: 创建 `apps/web/__tests__/api-nodes.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { closeDb } from '@galaxy/db'

const TMP_DB = path.join(os.tmpdir(), `galaxy-api-${Date.now()}.db`)

beforeEach(() => {
  process.env.GALAXY_DB_PATH = TMP_DB
})

afterEach(() => {
  closeDb()
  if (fs.existsSync(TMP_DB)) fs.rmSync(TMP_DB)
  delete process.env.GALAXY_DB_PATH
})

describe('nodes API route handlers', () => {
  it('POST then GET returns the created node', async () => {
    const { POST, GET } = await import('../app/api/nodes/route')
    const req = new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: '前置仓', summary: '即时配送基础设施' }),
    }) as any
    const created = await POST(req)
    expect(created.status).toBe(201)
    const createdJson = await created.json()
    expect(createdJson.data.title).toBe('前置仓')

    const list = await GET()
    const listJson = await list.json()
    expect(listJson.data).toHaveLength(1)
    expect(listJson.data[0].id).toBe(createdJson.data.id)
  })

  it('POST with empty title returns 400', async () => {
    const { POST } = await import('../app/api/nodes/route')
    const req = new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
    }) as any
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('PATCH updates title and slug', async () => {
    const { POST } = await import('../app/api/nodes/route')
    const { PATCH } = await import('../app/api/nodes/[id]/route')

    const createReq = new Request('http://localhost/api/nodes', {
      method: 'POST',
      body: JSON.stringify({ title: 'old' }),
    }) as any
    const created = await POST(createReq)
    const { data } = await created.json()

    const patchReq = new Request('http://localhost/api/nodes/' + data.id, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'new title' }),
    }) as any
    const patched = await PATCH(patchReq, { params: { id: data.id } })
    const patchedJson = await patched.json()
    expect(patchedJson.data.title).toBe('new title')
    expect(patchedJson.data.slug).toBe('new-title')
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
cd ~/galaxy
pnpm vitest run apps/web/__tests__
```

Expected: 3 tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__
git commit -m "test(web): add integration tests for nodes API route handlers"
```

---

### Task 16: web 包 — API 客户端封装与 zustand store

**Files:**
- Create: `apps/web/lib/api/client.ts`
- Create: `apps/web/lib/store/graph-store.ts`

- [ ] **Step 1: 创建 `apps/web/lib/api/client.ts`**

```ts
import type { Node, Edge } from '@galaxy/shared'
import type { CreateNodeInput, UpdateNodeInput, CreateEdgeInput } from './schemas'

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  const json = (await res.json()) as { data: T }
  return json.data
}

export const api = {
  listNodes: () => fetch('/api/nodes').then((r) => handle<Node[]>(r)),
  createNode: (input: CreateNodeInput) =>
    fetch('/api/nodes', { method: 'POST', body: JSON.stringify(input) }).then((r) => handle<Node>(r)),
  updateNode: (id: string, input: UpdateNodeInput) =>
    fetch(`/api/nodes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((r) => handle<Node>(r)),
  deleteNode: (id: string) =>
    fetch(`/api/nodes/${id}`, { method: 'DELETE' }).then((r) => handle<{ id: string }>(r)),
  listEdges: () => fetch('/api/edges').then((r) => handle<Edge[]>(r)),
  createEdge: (input: CreateEdgeInput) =>
    fetch('/api/edges', { method: 'POST', body: JSON.stringify(input) }).then((r) => handle<Edge>(r)),
  deleteEdge: (id: string) =>
    fetch(`/api/edges/${id}`, { method: 'DELETE' }).then((r) => handle<{ id: string }>(r)),
}
```

- [ ] **Step 2: 创建 `apps/web/lib/store/graph-store.ts`**

```ts
import { create } from 'zustand'
import type { Node, Edge } from '@galaxy/shared'
import { api } from '../api/client'

interface GraphState {
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  loading: boolean
  error: string | null

  loadAll: () => Promise<void>
  selectNode: (id: string | null) => void
  addNode: (input: Parameters<typeof api.createNode>[0]) => Promise<Node>
  patchNode: (id: string, input: Parameters<typeof api.updateNode>[1]) => Promise<void>
  removeNode: (id: string) => Promise<void>
  addEdge: (input: Parameters<typeof api.createEdge>[0]) => Promise<Edge>
  removeEdge: (id: string) => Promise<void>
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  loading: false,
  error: null,

  async loadAll() {
    set({ loading: true, error: null })
    try {
      const [nodes, edges] = await Promise.all([api.listNodes(), api.listEdges()])
      set({ nodes, edges, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  selectNode(id) {
    set({ selectedNodeId: id })
  },

  async addNode(input) {
    const node = await api.createNode(input)
    set({ nodes: [...get().nodes, node] })
    return node
  },

  async patchNode(id, input) {
    const updated = await api.updateNode(id, input)
    set({ nodes: get().nodes.map((n) => (n.id === id ? updated : n)) })
  },

  async removeNode(id) {
    await api.deleteNode(id)
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source_node_id !== id && e.target_node_id !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    })
  },

  async addEdge(input) {
    const edge = await api.createEdge(input)
    set({ edges: [...get().edges, edge] })
    return edge
  },

  async removeEdge(id) {
    await api.deleteEdge(id)
    set({ edges: get().edges.filter((e) => e.id !== id) })
  },
}))
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib
git commit -m "feat(web): add typed api client and zustand graph store"
```

---

### Task 17: web 包 — 主页面骨架与 Cytoscape 画布

**Files:**
- Create: `apps/web/app/_components/graph-canvas.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: 创建 `apps/web/app/_components/graph-canvas.tsx`**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import cytoscape, { Core, EventObject } from 'cytoscape'
// @ts-expect-error - cytoscape-fcose has no types
import fcose from 'cytoscape-fcose'
import type { Node, Edge } from '@galaxy/shared'

cytoscape.use(fcose)

interface Props {
  nodes: Node[]
  edges: Edge[]
  onSelectNode: (id: string | null) => void
  onCreateEdge: (sourceId: string, targetId: string) => void
}

export function GraphCanvas({ nodes, edges, onSelectNode, onCreateEdge }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const pendingSourceRef = useRef<string | null>(null)

  // 初始化 cytoscape 实例
  useEffect(() => {
    if (!containerRef.current) return
    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#0f172a',
            label: 'data(label)',
            color: '#0f172a',
            'font-size': 12,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            width: 28,
            height: 28,
          },
        },
        {
          selector: 'node[?seed]',
          style: { 'background-color': '#f59e0b', width: 36, height: 36 },
        },
        { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#3b82f6' } },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 10,
            color: '#64748b',
          },
        },
      ],
    })
    cyRef.current = cy

    cy.on('tap', 'node', (e: EventObject) => {
      const id = e.target.id() as string
      if (pendingSourceRef.current && pendingSourceRef.current !== id) {
        onCreateEdge(pendingSourceRef.current, id)
        pendingSourceRef.current = null
        cy.elements().removeClass('pending-source')
      } else {
        onSelectNode(id)
      }
    })
    cy.on('tap', (e: EventObject) => {
      if (e.target === cy) {
        onSelectNode(null)
        pendingSourceRef.current = null
        cy.elements().removeClass('pending-source')
      }
    })
    cy.on('cxttap', 'node', (e: EventObject) => {
      // 右键：开始连线
      pendingSourceRef.current = e.target.id() as string
      e.target.addClass('pending-source')
    })

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [onSelectNode, onCreateEdge])

  // 同步数据
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().remove()
    cy.add([
      ...nodes.map((n) => ({
        group: 'nodes' as const,
        data: { id: n.id, label: n.title, seed: n.is_seed ? 1 : 0 },
      })),
      ...edges.map((e) => ({
        group: 'edges' as const,
        data: { id: e.id, source: e.source_node_id, target: e.target_node_id, label: e.relation_type },
      })),
    ])
    cy.layout({ name: 'fcose', animate: false, randomize: nodes.length < 20 } as any).run()
    cy.fit(undefined, 40)
  }, [nodes, edges])

  return (
    <div ref={containerRef} className="h-full w-full bg-muted/20" />
  )
}
```

- [ ] **Step 2: 修改 `apps/web/app/page.tsx` 为完整主页**

```tsx
'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useGraphStore } from '@/lib/store/graph-store'

const GraphCanvas = dynamic(
  () => import('./_components/graph-canvas').then((m) => m.GraphCanvas),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-muted" /> },
)
const NodeDetailPanel = dynamic(
  () => import('./_components/node-detail-panel').then((m) => m.NodeDetailPanel),
  { ssr: false },
)
const NewNodeDialog = dynamic(
  () => import('./_components/new-node-dialog').then((m) => m.NewNodeDialog),
  { ssr: false },
)
const CommandPalette = dynamic(
  () => import('./_components/command-palette').then((m) => m.CommandPalette),
  { ssr: false },
)

export default function Page() {
  const { nodes, edges, loadAll, selectNode, addEdge } = useGraphStore()
  const [newOpen, setNewOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // 全局快捷键 Cmd+K 打开命令面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h1 className="text-lg font-semibold">Galaxy</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)}>
            <Search className="mr-1 h-4 w-4" /> 搜索 (⌘K)
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> 新建节点
          </Button>
        </div>
      </header>
      <div className="relative flex-1">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          onSelectNode={selectNode}
          onCreateEdge={async (s, t) => {
            try {
              await addEdge({ source_node_id: s, target_node_id: t, relation_type: 'related' })
              toast.success('已创建边')
            } catch (e: any) {
              toast.error(e.message || '创建失败')
            }
          }}
        />
        <NodeDetailPanel />
      </div>
      <NewNodeDialog open={newOpen} onOpenChange={setNewOpen} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app
git commit -m "feat(web): wire main page with cytoscape graph canvas and toolbar"
```

---

### Task 18: web 包 — 节点详情侧栏（NodeDetailPanel）

**Files:**
- Create: `apps/web/app/_components/node-detail-panel.tsx`

- [ ] **Step 1: 创建 `apps/web/app/_components/node-detail-panel.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useGraphStore } from '@/lib/store/graph-store'

export function NodeDetailPanel() {
  const { nodes, selectedNodeId, selectNode, patchNode, removeNode } = useGraphStore()
  const node = nodes.find((n) => n.id === selectedNodeId) || null
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [domain, setDomain] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!node) return
    setTitle(node.title)
    setSummary(node.summary ?? '')
    setDomain(node.domain ?? '')
  }, [node?.id])

  if (!node) return null

  const onSave = async () => {
    setSaving(true)
    try {
      await patchNode(node.id, { title, summary: summary || null, domain: domain || null })
      toast.success('已保存')
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!confirm(`删除节点「${node.title}」？相关边也会被删除。`)) return
    try {
      await removeNode(node.id)
      toast.success('已删除')
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && selectNode(null)}>
      <SheetContent side="right" className="w-[400px] sm:w-[480px]">
        <SheetHeader>
          <SheetTitle>节点详情</SheetTitle>
          <SheetDescription>{node.id}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title">标题</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="domain">领域</Label>
            <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="summary">摘要</Label>
            <Textarea id="summary" rows={6} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="destructive" onClick={onDelete}>删除</Button>
            <Button onClick={onSave} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/_components/node-detail-panel.tsx
git commit -m "feat(web): add node detail side panel with edit and delete"
```

---

### Task 19: web 包 — 新建节点对话框

**Files:**
- Create: `apps/web/app/_components/new-node-dialog.tsx`

- [ ] **Step 1: 创建 `apps/web/app/_components/new-node-dialog.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useGraphStore } from '@/lib/store/graph-store'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewNodeDialog({ open, onOpenChange }: Props) {
  const { addNode } = useGraphStore()
  const [title, setTitle] = useState('')
  const [domain, setDomain] = useState('')
  const [summary, setSummary] = useState('')
  const [isSeed, setIsSeed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setTitle('')
    setDomain('')
    setSummary('')
    setIsSeed(false)
  }

  const onSubmit = async () => {
    if (!title.trim()) {
      toast.error('标题不能为空')
      return
    }
    setSubmitting(true)
    try {
      await addNode({
        title: title.trim(),
        domain: domain.trim() || null,
        summary: summary.trim() || null,
        is_seed: isSeed,
      })
      toast.success('已创建节点')
      reset()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e.message || '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>新建节点</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="new-title">标题 *</Label>
            <Input
              id="new-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：前置仓"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-domain">领域</Label>
            <Input
              id="new-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="如：即时零售"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-summary">摘要</Label>
            <Textarea
              id="new-summary"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isSeed}
              onChange={(e) => setIsSeed(e.target.checked)}
            />
            标记为种子节点
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? '创建中…' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/_components/new-node-dialog.tsx
git commit -m "feat(web): add new node dialog"
```

---

### Task 20: web 包 — cmdk 命令面板（搜索节点）

**Files:**
- Create: `apps/web/app/_components/command-palette.tsx`

- [ ] **Step 1: 创建 `apps/web/app/_components/command-palette.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useGraphStore } from '@/lib/store/graph-store'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const { nodes, selectNode } = useGraphStore()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return nodes.slice(0, 30)
    return nodes
      .filter((n) =>
        n.title.toLowerCase().includes(q) ||
        (n.summary?.toLowerCase().includes(q) ?? false) ||
        (n.domain?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 30)
  }, [nodes, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[560px]">
        <Command label="节点搜索" shouldFilter={false} className="flex flex-col">
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="搜索节点标题 / 摘要 / 领域…"
            className="border-b px-4 py-3 outline-none"
          />
          <Command.List className="max-h-[360px] overflow-y-auto p-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">
              没有匹配的节点
            </Command.Empty>
            {filtered.map((n) => (
              <Command.Item
                key={n.id}
                value={n.id}
                onSelect={() => {
                  selectNode(n.id)
                  onOpenChange(false)
                }}
                className="flex cursor-pointer flex-col gap-0.5 rounded px-3 py-2 text-sm aria-selected:bg-accent"
              >
                <span className="font-medium">{n.title}</span>
                {n.domain && (
                  <span className="text-xs text-muted-foreground">{n.domain}</span>
                )}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/_components/command-palette.tsx
git commit -m "feat(web): add cmdk command palette for node search"
```

---

### Task 21: 启动脚本 dev.ts

**Files:**
- Create: `scripts/dev.ts`
- Modify: `package.json`（根包，调整 `dev` 脚本）

- [ ] **Step 1: 创建 `scripts/dev.ts`**

```ts
#!/usr/bin/env tsx
/**
 * Galaxy 开发启动脚本：
 * 1) 确保 ~/galaxy/data/ 目录存在
 * 2) 调用 db 包的 initDb 跑迁移 + seed
 * 3) spawn next dev（apps/web）
 */
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { initDb, closeDb, resolveDbPath } from '@galaxy/db'

async function main() {
  const dbPath = resolveDbPath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  console.log(`[galaxy] DB path: ${dbPath}`)
  initDb()
  console.log('[galaxy] DB initialized.')
  closeDb()

  const child = spawn('pnpm', ['--filter', '@galaxy/web', 'dev'], {
    stdio: 'inherit',
    env: process.env,
  })

  const onExit = () => {
    child.kill('SIGTERM')
    process.exit(0)
  }
  process.on('SIGINT', onExit)
  process.on('SIGTERM', onExit)

  child.on('exit', (code) => process.exit(code ?? 0))
}

main().catch((err) => {
  console.error('[galaxy] dev script failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: 修改根 `package.json` 的 `scripts.dev`**

将根 `package.json` 中：

```json
"dev": "pnpm --filter @galaxy/web dev",
```

替换为：

```json
"dev": "tsx scripts/dev.ts",
```

并在根 `package.json` 的 `devDependencies` 中追加（若尚未存在）：

```json
"tsx": "^4.7.0"
```

- [ ] **Step 3: 安装新依赖**

```bash
cd ~/galaxy
pnpm install
```

Expected: 安装成功，`tsx` 出现在根 `node_modules/.bin/`

- [ ] **Step 4: 跑一次 dev 验证端到端**

```bash
cd ~/galaxy
pnpm db:generate   # 若 Task 10 已执行可跳过
pnpm dev
```

Expected: 控制台输出 `[galaxy] DB path: /Users/<you>/galaxy/data/galaxy.db` → `[galaxy] DB initialized.` → Next.js 启动并监听 3000。访问 `http://localhost:3000` 看到 Galaxy 头部 + 空白画布。Ctrl+C 停止。

- [ ] **Step 5: Commit**

```bash
git add scripts/dev.ts package.json
git commit -m "feat(scripts): add dev launcher that initializes db before next"
```

---

### Task 22: README + M1 验收冒烟测试

**Files:**
- Create: `README.md`

- [ ] **Step 1: 创建 `README.md`**

````markdown
# Galaxy

个人立体知识库。AI 辅助扩展知识边界，人工确认所有入图。

## 当前阶段：M1（骨架可运行）

- Monorepo 工程结构（apps/web + packages/db + packages/shared）
- SQLite 全表 schema 落地（无 AI 调用）
- Next.js 14 主页 + Cytoscape 图谱画布
- 节点 / 边手动 CRUD（新建 / 编辑 / 删除 / 连线 / 搜索）
- 数据持久化到 `~/galaxy/data/galaxy.db`

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
- 桥接目录（M3+ 才会用到）：`~/galaxy/bridge/`

## 操作指南（M1）

- **新建节点**：右上角「新建节点」按钮
- **编辑节点**：点击图谱中的节点，右侧滑出详情面板
- **删除节点**：在详情面板点击「删除」（同时删除相关边）
- **连线**：在源节点上**右键** → 再点击目标节点
- **搜索**：⌘K（macOS）/ Ctrl+K（其他）打开命令面板

## 路线图

- M1（当前）：骨架可运行
- M2：被动投喂 + AI 抽取候选 + 待审 Inbox
- M3：节点深度对话（Deep Dive）+ 文件桥接 Qoder
- M4：AI 主动扫描（每周巡检）+ 反馈循环
- M5：节点纵深视角（多面切片）+ 演化历史

## 许可

私有项目，未公开发布。
````

- [ ] **Step 2: M1 验收冒烟测试（手动）**

按以下脚本依次操作并确认每一步：

1. 执行 `pnpm install && pnpm db:generate && pnpm test`
   - Expected：所有单元测试和集成测试通过
2. 执行 `pnpm typecheck`
   - Expected：无类型错误
3. 执行 `pnpm dev`，浏览器打开 `http://localhost:3000`
   - Expected：看到 Galaxy 头部，画布为空
4. 点击「新建节点」，填入标题「前置仓」，领域「即时零售」，勾选种子节点 → 创建
   - Expected：toast 提示成功，画布出现一个橙色节点
5. 再新建一个节点「订单履约」（不勾种子）
   - Expected：画布出现第二个深色节点
6. 在「前置仓」节点上**右键** → 点击「订单履约」
   - Expected：toast 提示「已创建边」，两节点间出现带箭头的连线
7. 点击「订单履约」节点 → 右侧出现详情面板 → 修改摘要为「外卖履约链路」→ 保存
   - Expected：toast 成功
8. 按 ⌘K → 输入「履约」→ 选中「订单履约」
   - Expected：详情面板再次打开，显示该节点
9. **关闭浏览器和 dev 进程**，重新执行 `pnpm dev` 并打开页面
   - Expected：两个节点 + 一条边仍然存在，摘要保留
10. 检查 `ls -lh ~/galaxy/data/galaxy.db`
    - Expected：文件存在，体积 > 20KB

如所有项通过，则 M1 验收通过。

- [ ] **Step 3: 提交 README 与初次冒烟记录**

```bash
git add README.md
git commit -m "docs: add README and M1 acceptance smoke checklist"
```

- [ ] **Step 4: 打 M1 完成 tag**

```bash
git tag -a m1-skeleton -m "Galaxy M1: runnable skeleton with manual node/edge CRUD"
```

---

## M1 完成定义（Definition of Done）

- [ ] 所有 22 个任务全部勾选完成
- [ ] `pnpm test` 通过（db 客户端冒烟测试 + nodes/edges API 集成测试）
- [ ] `pnpm typecheck` 无错误
- [ ] `pnpm dev` 能成功启动并完成 Task 22 Step 2 的 10 项冒烟检查
- [ ] git 提交历史清晰（每个 Task 至少一个 commit），打上 `m1-skeleton` tag
- [ ] 数据库文件 `~/galaxy/data/galaxy.db` 落地，重启数据不丢

完成 M1 后即可进入 M2（被动投喂 + AI 抽取候选 + Inbox 待审），下一个 plan 文件名建议：`docs/superpowers/plans/2026-05-XX-galaxy-m2-passive-feed.md`。
