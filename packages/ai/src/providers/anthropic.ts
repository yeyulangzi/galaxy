import Anthropic from '@anthropic-ai/sdk'
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ModelInfo,
  ProviderCapabilities,
  ProviderConfig,
  TokenUsage,
} from './types'

const ANTHROPIC_MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-4-5-20250514', displayName: 'Claude Sonnet 4.5', maxContextTokens: 200000, inputPricePer1kTokens: 0.003, outputPricePer1kTokens: 0.015 },
  { id: 'claude-haiku-4-5-20250514', displayName: 'Claude Haiku 4.5', maxContextTokens: 200000, inputPricePer1kTokens: 0.0008, outputPricePer1kTokens: 0.004 },
  { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', maxContextTokens: 200000, inputPricePer1kTokens: 0.015, outputPricePer1kTokens: 0.075 },
]

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic'
  readonly displayName = 'Anthropic'
  readonly supportedModels = ANTHROPIC_MODELS
  readonly capabilities: ProviderCapabilities = {
    structuredOutput: true,
    toolUse: true,
    streaming: true,
  }

  private client: Anthropic

  constructor(config: ProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    })
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    const systemMessage = request.messages.find((m) => m.role === 'system')
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system')

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    }

    if (systemMessage) {
      params.system = systemMessage.content
    }

    if (request.temperature !== undefined) {
      params.temperature = request.temperature
    }

    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool.InputSchema,
      }))
    }

    const response = await this.client.messages.create(params)

    let content = ''
    const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = []

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        })
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
      providerId: this.id,
    }
  }

  async *stream(request: LLMRequest): AsyncIterable<string> {
    const systemMessage = request.messages.find((m) => m.role === 'system')
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system')
    const stream = this.client.messages.stream({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      system: systemMessage?.content,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text
      }
    }
  }

  estimateCost(usage: TokenUsage, model: string): number {
    const info = this.supportedModels.find((m) => m.id === model)
    if (!info) return 0
    return (usage.inputTokens / 1000) * info.inputPricePer1kTokens + (usage.outputTokens / 1000) * info.outputPricePer1kTokens
  }
}
