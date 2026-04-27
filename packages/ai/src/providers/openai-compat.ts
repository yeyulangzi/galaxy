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

export interface OpenAICompatConfig extends ProviderConfig {
  providerId: string
  providerDisplayName: string
  models: ModelInfo[]
  capabilities?: Partial<ProviderCapabilities>
}

/**
 * 通用 OpenAI 兼容适配器。
 * 百炼、火山引擎、DeepSeek、Ollama 等均通过此类接入。
 */
export class OpenAICompatProvider implements LLMProvider {
  readonly id: string
  readonly displayName: string
  readonly supportedModels: ModelInfo[]
  readonly capabilities: ProviderCapabilities

  private client: OpenAI

  constructor(config: OpenAICompatConfig) {
    this.id = config.providerId
    this.displayName = config.providerDisplayName
    this.supportedModels = config.models
    this.capabilities = {
      structuredOutput: config.capabilities?.structuredOutput ?? true,
      toolUse: config.capabilities?.toolUse ?? true,
      streaming: config.capabilities?.streaming ?? true,
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    })
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.3,
    }

    if (request.tools && request.tools.length > 0 && this.capabilities.toolUse) {
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

    if (request.responseFormat && this.capabilities.structuredOutput) {
      params.response_format = request.responseFormat
    }

    const completion = await this.client.chat.completions.create(params)
    const choice = completion.choices[0]
    if (!choice) throw new Error(`${this.displayName} returned empty choices`)

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

  estimateCost(usage: TokenUsage, model: string): number {
    const info = this.supportedModels.find((m) => m.id === model)
    if (!info) return 0
    return (usage.inputTokens / 1000) * info.inputPricePer1kTokens + (usage.outputTokens / 1000) * info.outputPricePer1kTokens
  }
}

/** 预配置的百炼 Provider */
export function createBailianProvider(config: ProviderConfig): OpenAICompatProvider {
  return new OpenAICompatProvider({
    ...config,
    baseUrl: config.baseUrl ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    providerId: 'bailian',
    providerDisplayName: '阿里云百炼',
    models: [
      { id: 'qwen-max', displayName: 'Qwen Max', maxContextTokens: 32000, inputPricePer1kTokens: 0.002, outputPricePer1kTokens: 0.006 },
      { id: 'qwen-plus', displayName: 'Qwen Plus', maxContextTokens: 131072, inputPricePer1kTokens: 0.0008, outputPricePer1kTokens: 0.002 },
      { id: 'qwen-turbo', displayName: 'Qwen Turbo', maxContextTokens: 131072, inputPricePer1kTokens: 0.0003, outputPricePer1kTokens: 0.0006 },
      { id: 'qwen3-235b-a22b', displayName: 'Qwen3 235B', maxContextTokens: 131072, inputPricePer1kTokens: 0.004, outputPricePer1kTokens: 0.012 },
    ],
  })
}

/** 预配置的火山引擎 Provider */
export function createVolcengineProvider(config: ProviderConfig): OpenAICompatProvider {
  return new OpenAICompatProvider({
    ...config,
    baseUrl: config.baseUrl ?? 'https://ark.cn-beijing.volces.com/api/v3',
    providerId: 'volcengine',
    providerDisplayName: '火山引擎',
    models: [
      { id: 'doubao-1-5-pro-256k', displayName: '豆包 1.5 Pro', maxContextTokens: 256000, inputPricePer1kTokens: 0.0008, outputPricePer1kTokens: 0.002 },
      { id: 'doubao-1-5-lite-32k', displayName: '豆包 1.5 Lite', maxContextTokens: 32000, inputPricePer1kTokens: 0.0003, outputPricePer1kTokens: 0.0006 },
    ],
  })
}

/** 预配置的 DeepSeek Provider */
export function createDeepSeekProvider(config: ProviderConfig): OpenAICompatProvider {
  return new OpenAICompatProvider({
    ...config,
    baseUrl: config.baseUrl ?? 'https://api.deepseek.com/v1',
    providerId: 'deepseek',
    providerDisplayName: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', displayName: 'DeepSeek Chat (V3)', maxContextTokens: 65536, inputPricePer1kTokens: 0.00027, outputPricePer1kTokens: 0.0011 },
      { id: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner (R1)', maxContextTokens: 65536, inputPricePer1kTokens: 0.00055, outputPricePer1kTokens: 0.0022 },
    ],
  })
}
