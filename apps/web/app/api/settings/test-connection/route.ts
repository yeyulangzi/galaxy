import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@galaxy/db'
import { settings } from '@galaxy/db/schema'
import { eq } from 'drizzle-orm'
import { ProviderRegistry } from '@galaxy/ai'
import { ensureDb } from '@/lib/api/ensure-db'

export const dynamic = 'force-dynamic'

/** 前端 provider id → registry 内置 provider id 映射 */
const PROVIDER_ID_MAP: Record<string, string> = {
  dashscope: 'bailian',
  ark: 'volcengine',
}

/** 每个 provider 的默认测试模型 */
const DEFAULT_TEST_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku-20240307',
  bailian: 'qwen-turbo',
  volcengine: 'doubao-lite-32k',
  deepseek: 'deepseek-chat',
}

export async function POST(request: NextRequest) {
  ensureDb()

  let body: { providerId?: string; model?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: { ok: false, error: '无效的请求体' } }, { status: 400 })
  }

  const { providerId: rawProviderId, model } = body
  if (!rawProviderId || typeof rawProviderId !== 'string') {
    return NextResponse.json({ data: { ok: false, error: '缺少 providerId 参数' } }, { status: 400 })
  }

  // 映射到 registry 的内置 provider id
  const registryProviderId = PROVIDER_ID_MAP[rawProviderId] ?? rawProviderId

  // 从 DB 读取 credentials
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row) {
    return NextResponse.json({ data: { ok: false, error: '设置未初始化' } }, { status: 500 })
  }

  const credentials = (row.provider_credentials ?? {}) as Record<string, { api_key?: string }>
  const providerCred = credentials[rawProviderId]
  if (!providerCred?.api_key) {
    return NextResponse.json({ data: { ok: false, error: `未配置 ${rawProviderId} 的 API Key` } })
  }

  // 注册 provider 并调用测试
  const registry = new ProviderRegistry()
  try {
    registry.registerBuiltIn(registryProviderId as Parameters<typeof registry.registerBuiltIn>[0], {
      apiKey: providerCred.api_key,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '注册 Provider 失败'
    return NextResponse.json({ data: { ok: false, error: message } })
  }

  const provider = registry.getOrThrow(registryProviderId)
  const testModel = model ?? DEFAULT_TEST_MODELS[registryProviderId] ?? provider.supportedModels[0]?.id

  if (!testModel) {
    return NextResponse.json({ data: { ok: false, error: '无法确定测试模型' } })
  }

  const startTime = Date.now()
  try {
    await provider.invoke({
      model: testModel,
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 16,
      temperature: 0,
    })
    const latencyMs = Date.now() - startTime

    return NextResponse.json({ data: { ok: true, model: testModel, latencyMs } })
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime
    const message = error instanceof Error ? error.message : '调用失败'
    return NextResponse.json({ data: { ok: false, error: message, model: testModel, latencyMs } })
  }
}
