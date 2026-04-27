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
