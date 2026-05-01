import { useEffect, useState } from 'react'

interface UseThinkingModeConfig {
  /** 是否启用加载（用于条件加载场景，如 Dialog 的 open 状态） */
  enabled?: boolean
}

export function useThinkingMode(config?: UseThinkingModeConfig) {
  const enabled = config?.enabled ?? true
  const [thinkingSupported, setThinkingSupported] = useState(false)
  const [useThinking, setUseThinking] = useState(false)

  useEffect(() => {
    if (!enabled) return
    fetch('/api/settings')
      .then((r) => r.json())
      .then((json: { data: { enable_thinking?: boolean } }) => {
        const supported = json.data?.enable_thinking ?? false
        setThinkingSupported(supported)
        setUseThinking(supported)
      })
      .catch(() => {
        // 保持默认
      })
  }, [enabled])

  return { thinkingSupported, useThinking, setUseThinking }
}
