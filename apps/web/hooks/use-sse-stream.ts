import { useCallback, useRef } from 'react'

export interface SSEEvent {
  type: 'chunk' | 'thinking' | 'tool_start' | 'tool_done' | 'done' | 'error'
  content?: string
  messageId?: string
  toolCall?: { id: string; name: string; arguments: string }
  toolCallId?: string
  result?: string
  error?: string
}

export interface SSEStreamCallbacks {
  onChunk: (content: string) => void
  onThinking?: () => void
  onToolStart?: (toolCall: { id: string; name: string; arguments: string }) => void
  onToolDone?: (toolCallId: string, result: string) => void
  onDone: (messageId: string, content: string) => void
  onError: (error: string) => void
}

export function useSSEStream() {
  const abortRef = useRef<AbortController | null>(null)

  const processStream = useCallback(
    async (reader: ReadableStreamDefaultReader<Uint8Array>, callbacks: SSEStreamCallbacks) => {
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as SSEEvent
            switch (event.type) {
              case 'chunk':
                callbacks.onChunk(event.content ?? '')
                break
              case 'thinking':
                callbacks.onThinking?.()
                break
              case 'tool_start':
                if (event.toolCall) callbacks.onToolStart?.(event.toolCall)
                break
              case 'tool_done':
                if (event.toolCallId != null) callbacks.onToolDone?.(event.toolCallId, event.result ?? '')
                break
              case 'done':
                callbacks.onDone(event.messageId ?? '', event.content ?? '')
                break
              case 'error':
                callbacks.onError(event.error ?? 'Unknown error')
                break
            }
          } catch {
            // 忽略解析失败的行
          }
        }
      }
    },
    [],
  )

  const sendStreamRequest = useCallback(
    async (
      url: string,
      body: Record<string, unknown>,
      callbacks: SSEStreamCallbacks,
    ) => {
      const controller = new AbortController()
      abortRef.current = controller

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      await processStream(reader, callbacks)
    },
    [processStream],
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  return { sendStreamRequest, processStream, abort }
}
