import { useEffect, useState } from 'react'
import type { AgentOption } from '@/app/_components/chat/types'

const DEFAULT_AGENTS: AgentOption[] = [
  { value: 'direct', label: '直接对话', description: '直接对话' },
  { value: 'thinker', label: '思考者', description: '深度思考' },
  { value: 'partner', label: '搭档', description: '协作讨论' },
]

interface RawAgent {
  id: string
  name: string
  description?: string
}

interface UseAgentOptionsConfig {
  /** 是否启用加载（用于条件加载场景，如 Dialog 的 open 状态） */
  enabled?: boolean
  /** 自定义数据映射：将 API 原始响应转换为 AgentOption[] */
  mapResponse?: (json: Record<string, unknown>) => AgentOption[]
}

/** 默认映射：兼容 { data: AgentOption[] } 和 { data: { agents: RawAgent[] } } 两种格式 */
function defaultMapResponse(json: Record<string, unknown>): AgentOption[] {
  const data = json.data as Record<string, unknown> | AgentOption[] | undefined
  if (!data) return []

  // 格式 1: { data: AgentOption[] }（global-chat 使用）
  if (Array.isArray(data)) return data

  // 格式 2: { data: { agents: RawAgent[] } }（deep-dive 使用）
  const agents = (data as Record<string, unknown>).agents as RawAgent[] | undefined
  if (Array.isArray(agents)) {
    return agents.map((a) => ({
      value: a.id,
      label: a.name,
      description: a.description ?? '',
    }))
  }

  return []
}

export function useAgentOptions(config?: UseAgentOptionsConfig) {
  const enabled = config?.enabled ?? true
  const mapResponse = config?.mapResponse ?? defaultMapResponse
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>(DEFAULT_AGENTS)

  useEffect(() => {
    if (!enabled) return
    fetch('/api/agents')
      .then((r) => r.json())
      .then((json: Record<string, unknown>) => {
        const options = mapResponse(json)
        if (options.length > 0) {
          setAgentOptions(options)
        }
      })
      .catch(() => {
        // 使用默认选项
      })
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return agentOptions
}
