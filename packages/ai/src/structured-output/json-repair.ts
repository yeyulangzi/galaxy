import { jsonrepair } from 'jsonrepair'

/**
 * 尝试从 AI 响应中提取并修复 JSON。
 * 1. 去除推理模型的 <tool_call>...<tool_call> 标签
 * 2. 尝试直接 parse
 * 3. 提取 ```json ... ``` 代码块
 * 4. 提取第一个 JSON 对象/数组
 * 5. 使用 jsonrepair 兜底
 */
export function extractAndRepairJson(raw: string): unknown {
  // 0. 去除 DeepSeek R1 等推理模型的 <tool_call>...<tool_call> 内容
  let cleaned = raw.replace(/<tool_call>[\s\S]*?</think>/g, '').trim()
  if (!cleaned) cleaned = raw.trim()

  // 1. 直接解析
  try {
    return JSON.parse(cleaned)
  } catch {
    // continue
  }

  // 2. 提取 markdown 代码块
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch?.[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {
      // continue
    }
  }

  // 3. 提取第一个 JSON 对象或数组
  const jsonObjectMatch = cleaned.match(/(\{[\s\S]*\})/)
  if (jsonObjectMatch?.[1]) {
    try {
      return JSON.parse(jsonObjectMatch[1])
    } catch {
      // continue to jsonrepair
    }
  }

  // 4. jsonrepair 兜底
  const candidate = codeBlockMatch?.[1]?.trim() ?? jsonObjectMatch?.[1] ?? cleaned
  const repaired = jsonrepair(candidate)
  return JSON.parse(repaired)
}
