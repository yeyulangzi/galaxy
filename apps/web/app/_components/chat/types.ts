export interface ToolCallInfo {
  id: string
  name: string
  arguments: string
  result?: string
  loading?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: boolean
  toolCalls?: ToolCallInfo[]
}

export interface AgentOption {
  value: string
  label: string
  description: string
}
