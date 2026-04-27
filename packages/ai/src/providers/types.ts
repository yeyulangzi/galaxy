export interface ModelInfo {
  id: string
  displayName: string
  maxContextTokens: number
  inputPricePer1kTokens: number
  outputPricePer1kTokens: number
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface LLMRequest {
  model: string
  messages: Message[]
  tools?: ToolDefinition[]
  responseFormat?: { type: 'json_object' }
  maxTokens?: number
  temperature?: number
}

export interface LLMResponse {
  content: string
  toolCalls?: ToolCall[]
  usage: TokenUsage
  model: string
  providerId: string
}

export interface ProviderCapabilities {
  structuredOutput: boolean
  toolUse: boolean
  streaming: boolean
}

export interface LLMProvider {
  readonly id: string
  readonly displayName: string
  readonly supportedModels: ModelInfo[]
  readonly capabilities: ProviderCapabilities

  invoke(request: LLMRequest): Promise<LLMResponse>
  estimateCost(usage: TokenUsage, model: string): number
}

export interface ProviderConfig {
  apiKey: string
  baseUrl?: string
}
