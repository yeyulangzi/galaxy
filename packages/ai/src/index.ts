export { encrypt, decrypt } from './crypto'
export { ProviderRegistry } from './providers/registry'
export { DirectChannel } from './direct-channel'
export { checkBudget, addCost } from './budget'
export { extractFromFeed } from './tasks/extract-from-feed'
export {
  buildDeepDiveSystemPrompt,
  extractSuggestionsFromConversation,
  setAgentPromptPath,
} from './tasks/deep-dive'

// Global Chat
export { CHAT_TOOLS, executeToolCall, isWriteTool } from './tasks/chat-tools'
export type { ToolExecResult } from './tasks/chat-tools'
export { buildGlobalChatSystemPrompt } from './tasks/chat-system-prompt'
export { resolveAgentPersona } from './tasks/deep-dive'

export { buildSummarizePrompt, summarizeConversation } from './tasks/summarize-conversation'
export { extractAspectsFromConversation } from './tasks/extract-aspects'
export type { ExtractedAspect, ExtractAspectsResult } from './tasks/extract-aspects'
export { generateEdgeDescription } from './tasks/generate-edge-description'
export { backfillEdgesForNode } from './tasks/backfill-edges'
export type { BackfillNodeInfo, BackfillSuggestedEdge, BackfillResult } from './tasks/backfill-edges'
export type { EdgeDescriptionInput, EdgeDescriptionResult } from './tasks/generate-edge-description'
export { FeedExtractionResultSchema } from './tasks/schemas'
export { buildGraphSummary } from './context/graph-summary'
export { loadPromptTemplate, clearTemplateCache } from './context/prompt-loader'
export { loadAspectTemplates, getAspectTemplate } from './context/aspect-templates'
export { findIslands, findGaps, findAgingNodes, collectTargets } from './tasks/scan-strategies'
export { runScan } from './tasks/run-scan'
export { startScheduler, stopScheduler, triggerManualScan } from './scheduler'
export type { AspectTemplate } from './context/aspect-templates'
export type { LLMProvider, LLMRequest, LLMResponse, ProviderConfig, ModelInfo, TokenUsage, ToolDefinition, ToolCall, Message } from './providers/types'
export type { ExtractFromFeedInput, ExtractFromFeedOutput } from './tasks/extract-from-feed'
export type { DeepDiveContext, DeepDiveAgentType } from './tasks/deep-dive'
export type { ConversationSummary } from './tasks/summarize-conversation'
export type { ScanTarget } from './tasks/scan-strategies'
export type { RunScanOptions, ScanResult } from './tasks/run-scan'

// Feedback
export { collectFeedback } from './feedback/collector'
export { getAdjustedStrategies } from './feedback/strategy-adjuster'
export { buildFeedbackContext } from './feedback/prompt-injector'
export { calibrateConfidence, recalibrateAllPending } from './feedback/calibrator'
export { learnPreferences } from './feedback/personalizer'
export type { AdjustedStrategies } from './feedback/strategy-adjuster'

// Bridge
export { createBridgeTask, readBridgeResult, cancelBridgeTask, archiveBridgeTask, ensureBridgeDirs } from './bridge/protocol'
export { BridgeWatcher } from './bridge/watcher'
export type { BridgeTaskFile } from './bridge/protocol'
