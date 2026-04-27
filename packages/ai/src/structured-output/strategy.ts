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
      const parsed = schema.parse(response.toolCalls[0]!.arguments)
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
