import OpenAI from 'openai'
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ModelInfo,
  ProviderCapabilities,
  ProviderConfig,
  TokenUsage,
} from './types'

const OPENAI_MODELS: ModelInfo[] = [
  { id: 'gpt-4o', displayName: 'GPT-4o', maxContextTokens: 128000, maxOutputTokens: 16384, inputPricePer1kTokens: 0.0025, outputPricePer1kTokens: 0.01 },
  { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', maxContextTokens: 128000, maxOutputTokens: 16384, inputPricePer1kTokens: 0.00015, outputPricePer1kTokens: 0.0006 },
  { id: 'gpt-4.1', displayName: 'GPT-4.1', maxContextTokens: 1047576, maxOutputTokens: 32768, inputPricePer1kTokens: 0.002, outputPricePer1kTokens: 0.008 },
  { id: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini', maxContextTokens: 1047576, maxOutputTokens: 32768, inputPricePer1kTokens: 0.0004, outputPricePer1kTokens: 0.0016 },
  { id: 'gpt-4.1-nano', displayName: 'GPT-4.1 Nano', maxContextTokens: 1047576, maxOutputTokens: 32768, inputPricePer1kTokens: 0.0001, outputPricePer1kTokens: 0.0004 },
  { id: 'o3-mini', displayName: 'o3-mini', maxContextTokens: 200000, maxOutputTokens: 100000, inputPricePer1kTokens: 0.0011, outputPricePer1kTokens: 0.0044 },
]

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai'
  readonly displayName = 'OpenAI'
  readonly supportedModels = OPENAI_MODELS
  readonly capabilities: ProviderCapabilities = {
    structuredOutput: true,
    toolUse: true,
    streaming: true,
  }

  private client: OpenAI

  constructor(config: ProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? 'https://api.openai.com/v1',
    })
  }

  private isReasoningModel(model: string): boolean {
    return /^o[1-9]|^o3/.test(model)
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    const reasoning = this.isReasoningModel(request.model)
    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxTokens ?? (this.supportedModels.find((m) => m.id === request.model)?.maxOutputTokens ?? 16384),
    }

    // 推理模型不支持 temperature 设置
    if (!reasoning) {
      params.temperature = request.temperature ?? 0.3
    }

    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
      params.tool_choice = 'auto'
    }

    if (request.responseFormat) {
      params.response_format = request.responseFormat
    }

    const completion = await this.client.chat.completions.create(params)
    const choice = completion.choices[0]
    if (!choice) throw new Error('OpenAI returned empty choices')

    const toolCalls = choice.message.tool_calls?.map((tc) => ({
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }))

    return {
      content: choice.message.content ?? '',
      toolCalls,
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      },
      model: completion.model,
      providerId: this.id,
    }
  }

  async *stream(request: LLMRequest): AsyncIterable<string> {
    const reasoning = this.isReasoningModel(request.model)
    const streamParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxTokens ?? (this.supportedModels.find((m) => m.id === request.model)?.maxOutputTokens ?? 16384),
      stream: true,
    }
    if (!reasoning) {
      streamParams.temperature = request.temperature ?? 0.7
    }
    const stream = await this.client.chat.completions.create(streamParams)
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield delta
    }
  }

  estimateCost(usage: TokenUsage, model: string): number {
    const info = this.supportedModels.find((m) => m.id === model)
    if (!info) return 0
    return (usage.inputTokens / 1000) * info.inputPricePer1kTokens + (usage.outputTokens / 1000) * info.outputPricePer1kTokens
  }
}
