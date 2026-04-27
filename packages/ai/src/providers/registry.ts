import type { LLMProvider, ProviderConfig } from './types'
import { OpenAIProvider } from './openai'
import { AnthropicProvider } from './anthropic'
import {
  OpenAICompatProvider,
  type OpenAICompatConfig,
  createBailianProvider,
  createVolcengineProvider,
  createDeepSeekProvider,
} from './openai-compat'

type BuiltInProviderId = 'openai' | 'anthropic' | 'bailian' | 'volcengine' | 'deepseek'

const BUILTIN_FACTORIES: Record<BuiltInProviderId, (config: ProviderConfig) => LLMProvider> = {
  openai: (c) => new OpenAIProvider(c),
  anthropic: (c) => new AnthropicProvider(c),
  bailian: (c) => createBailianProvider(c),
  volcengine: (c) => createVolcengineProvider(c),
  deepseek: (c) => createDeepSeekProvider(c),
}

/**
 * Provider 注册表：管理所有 LLM Provider 实例的创建和获取。
 */
export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>()

  /**
   * 注册一个内置 Provider。
   */
  registerBuiltIn(providerId: BuiltInProviderId, config: ProviderConfig): void {
    const factory = BUILTIN_FACTORIES[providerId]
    if (!factory) throw new Error(`Unknown built-in provider: ${providerId}`)
    this.providers.set(providerId, factory(config))
  }

  /**
   * 注册一个自定义 OpenAI 兼容 Provider。
   */
  registerCustom(config: OpenAICompatConfig): void {
    this.providers.set(config.providerId, new OpenAICompatProvider(config))
  }

  /**
   * 获取指定 Provider 实例。
   */
  get(providerId: string): LLMProvider | undefined {
    return this.providers.get(providerId)
  }

  /**
   * 获取指定 Provider，不存在则抛异常。
   */
  getOrThrow(providerId: string): LLMProvider {
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error(`Provider "${providerId}" not registered. Check API key configuration.`)
    return provider
  }

  /**
   * 列出所有已注册的 Provider ID。
   */
  listRegistered(): string[] {
    return [...this.providers.keys()]
  }

  /**
   * 列出所有可用的内置 Provider ID（不管是否注册）。
   */
  listBuiltIn(): BuiltInProviderId[] {
    return Object.keys(BUILTIN_FACTORIES) as BuiltInProviderId[]
  }
}
