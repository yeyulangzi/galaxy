import path from 'node:path'
import fs from 'node:fs'
import { getDb } from '@galaxy/db'
import { settings } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { decrypt, ProviderRegistry, setAgentPromptPath } from '@galaxy/ai'

/** 项目根目录（monorepo 中 process.cwd() 指向 apps/web/，需向上两级） */
const PROJECT_ROOT = path.resolve(process.cwd(), '../..')

/** agent prompt 路径是否已初始化 */
let agentPromptsInitialized = false

/**
 * 初始化内置角色的 prompt 路径（仅执行一次）。
 * 优先使用环境变量覆盖，fallback 到 data/agents/ 目录。
 */
export function initAgentPrompts(): void {
  if (agentPromptsInitialized) return
  agentPromptsInitialized = true

  const agentsDir = path.resolve(PROJECT_ROOT, 'data/agents')
  const agents: Record<string, string | undefined> = {
    thinker: process.env.GALAXY_AGENT_PROMPT_THINKER ?? path.join(agentsDir, 'thinker.md'),
    partner: process.env.GALAXY_AGENT_PROMPT_PARTNER ?? path.join(agentsDir, 'partner.md'),
    direct: process.env.GALAXY_AGENT_PROMPT_DIRECT ?? path.join(agentsDir, 'direct.md'),
  }

  for (const [name, promptPath] of Object.entries(agents)) {
    if (promptPath) setAgentPromptPath(name, promptPath)
  }
}

export interface RegistryResult {
  registry: ProviderRegistry
  defaultProviderId: string
  defaultModel: string
  thinking: { enabled: boolean; budgetTokens: number }
}

/**
 * 从 settings 中读取并构建 ProviderRegistry，返回 registry、默认 provider/model 和 thinking 配置。
 */
export function buildRegistry(): RegistryResult {
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row) throw new Error('Settings not initialized')

  const registry = new ProviderRegistry()
  const creds = (row.provider_credentials ?? {}) as Record<
    string,
    { api_key?: string; base_url?: string }
  >

  for (const [providerId, value] of Object.entries(creds)) {
    const encryptedKey = value?.api_key ?? ''
    if (!encryptedKey) continue
    let apiKey: string
    try {
      apiKey = decrypt(encryptedKey)
    } catch {
      continue
    }
    registry.registerBuiltIn(
      providerId as Parameters<ProviderRegistry['registerBuiltIn']>[0],
      { apiKey, baseUrl: value?.base_url ?? (row.default_base_url as string | undefined) },
    )
  }

  return {
    registry,
    defaultProviderId: (row.default_provider as string) ?? '',
    defaultModel: (row.default_model as string) ?? '',
    thinking: {
      enabled: (row.enable_thinking as boolean) ?? false,
      budgetTokens: (row.thinking_budget_tokens as number) ?? 10000,
    },
  }
}

/**
 * 解析 data/ 下的子目录路径（如 prompts、aspects、summaries）。
 * 按优先级尝试 cwd/data/{subDir} → 项目根/data/{subDir}。
 */
export function resolveDataDir(subDir: string): string {
  const candidates = [
    path.resolve(process.cwd(), 'data', subDir),
    path.resolve(PROJECT_ROOT, 'data', subDir),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  throw new Error(`Cannot find data/${subDir} folder. Tried: ${candidates.join(', ')}`)
}

/** data/memory/ 目录路径 */
export const MEMORY_DIR = path.resolve(PROJECT_ROOT, 'data/memory')

/** data/agents/ 目录路径 */
export const AGENTS_DIR = path.resolve(PROJECT_ROOT, 'data/agents')
