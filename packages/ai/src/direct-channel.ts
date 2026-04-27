import { ProviderRegistry } from './providers/registry'
import { extractFromFeed, type ExtractFromFeedInput, type ExtractFromFeedOutput } from './tasks/extract-from-feed'
import { checkBudget, addCost } from './budget'

export class DirectChannel {
  constructor(
    private registry: ProviderRegistry,
    private promptsDir: string,
  ) {}

  /**
   * 执行投喂抽取。
   */
  async extractFromFeed(
    feedItemId: string,
    parsedContent: string,
    providerId: string,
    model: string,
  ): Promise<ExtractFromFeedOutput> {
    // 预算检查
    const budget = checkBudget()
    if (!budget.withinBudget) {
      throw new Error(`月度预算已达上限（$${budget.currentCost.toFixed(2)} / $${budget.budgetLimit.toFixed(2)}）`)
    }

    const provider = this.registry.getOrThrow(providerId)

    const result = await extractFromFeed({
      feedItemId,
      parsedContent,
      provider,
      model,
      promptsDir: this.promptsDir,
    })

    // 累加成本
    addCost(result.costUsd)

    return result
  }
}
