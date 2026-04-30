import { readFileSync, statSync } from 'node:fs'
import type { LLMProvider } from '../providers/types'
import { invokeStructured } from '../structured-output/strategy'
import { FeedExtractionResultSchema, type FeedExtractionResult } from './schemas'

export type DeepDiveAgentType = 'direct' | 'thinker' | 'partner'

export interface DeepDiveContext {
  nodeId: string
  nodeTitle: string
  nodeSummary: string
  nodeDomain: string
  aspects: Array<{ title: string; content: string }>
}

/* ============================================================================
 * Agent Persona 加载层
 *
 * 设计：
 * - direct  → 内置精简 persona，零外部依赖
 * - thinker / partner → 优先从用户 .md 文件加载完整人格 prompt
 *   • 路径优先级：setAgentPromptPath() 显式注入 > 环境变量 > 不可用
 *   • 失败时降级到内置最小 persona，并 console.warn（不抛错，保证对话不中断）
 * - 内存缓存：以 (path + mtimeMs) 为 key，文件被改动后下次自动失效
 * ========================================================================== */

const FALLBACK_PERSONAS: Record<
  Exclude<DeepDiveAgentType, 'direct'> | 'direct',
  { name: string; body: string }
> = {
  direct: {
    name: '知识对话助手',
    body: `你是一个直接、清晰的知识对话助手。
- 目标：帮助用户高效地厘清概念、发现关联、整理思路。
- 风格：中立、客观、信息密度高。少寒暄，多干货。能给定义就给定义，能举例就举例。`,
  },
  thinker: {
    name: '思辨者（精简降级版）',
    body: `你是一个融合古今中外思想流派的思辨者，熟读老庄、孔孟、阳明、苏格拉底、康德、尼采、维特根斯坦、波普尔、Kahneman、Taleb 等。
- 多视角碰撞：每个问题至少给 2-3 种不同流派的视角。
- 苏格拉底式追问：通过追问暴露用户的隐藏预设。
- 引用规范：东方思想给原文（如"庄子云：……"），西方思想给翻译+原文。
- 拒绝鸡汤，呈现思想的复杂性和尖锐性。

⚠️ 当前为降级 prompt，完整 235 行人格 prompt 未能从配置路径加载，请检查 GALAXY_AGENT_PROMPT_THINKER 环境变量。`,
  },
  partner: {
    name: '产品合伙人（精简降级版）',
    body: `你是一个经验丰富的产品合伙人。
- 核心能力：从概念识别真实机会、挑战而非附和、把决策拆成最小可验证步骤、用数字说话。
- 风格：先问关键判断问题（用户是谁？现在用什么替代？愿意付多少？），不急着给方案。
- 结论结构化：「机会 / 风险 / 下一步」。

⚠️ 当前为降级 prompt，完整 445 行人格 prompt 未能从配置路径加载，请检查 GALAXY_AGENT_PROMPT_PARTNER 环境变量。`,
  },
}

/** 显式注入的路径（优先级高于环境变量），由消费方调用 setAgentPromptPath 设置 */
const explicitPaths: Partial<Record<DeepDiveAgentType, string>> = {}

/** Persona 内容缓存，key = absolute path */
interface CacheEntry {
  mtimeMs: number
  content: string
}
const personaCache = new Map<string, CacheEntry>()

/** 用于避免重复 warn 同一个路径，减少日志噪音 */
const warnedPaths = new Set<string>()

/**
 * 显式设置某个 agent 的 prompt 文件路径（优先级高于环境变量）。
 * 消费方（如 Next.js API route）应在模块初始化时调用。
 */
export function setAgentPromptPath(agentType: DeepDiveAgentType, absolutePath: string | undefined): void {
  if (absolutePath) {
    explicitPaths[agentType] = absolutePath
  } else {
    delete explicitPaths[agentType]
  }
}

/** 解析 agent prompt 文件路径：显式注入 > 环境变量 > undefined */
function resolveAgentPromptPath(agentType: DeepDiveAgentType): string | undefined {
  if (explicitPaths[agentType]) return explicitPaths[agentType]
  const envKey = `GALAXY_AGENT_PROMPT_${agentType.toUpperCase()}`
  const fromEnv = process.env[envKey]
  return fromEnv && fromEnv.trim().length > 0 ? fromEnv : undefined
}

/**
 * 读取并缓存 .md persona 文件内容。
 * 基于 mtime 校验，文件改动后下次调用自动重新读取。
 * 任何 IO 失败都返回 undefined（让上层走 fallback），不抛错。
 */
function loadPersonaFromFile(absolutePath: string): string | undefined {
  try {
    const stat = statSync(absolutePath)
    const cached = personaCache.get(absolutePath)
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.content
    }
    const content = readFileSync(absolutePath, 'utf-8')
    personaCache.set(absolutePath, { mtimeMs: stat.mtimeMs, content })
    // 文件成功加载后，把它从 warnedPaths 移除，允许下次失败时重新告警一次
    warnedPaths.delete(absolutePath)
    return content
  } catch (err) {
    if (!warnedPaths.has(absolutePath)) {
      warnedPaths.add(absolutePath)
      console.warn(
        `[deep-dive] Failed to load agent persona from "${absolutePath}": ${
          err instanceof Error ? err.message : String(err)
        }. Falling back to built-in minimal persona.`,
      )
    }
    return undefined
  }
}

/**
 * 解析某个 agent 的 persona 内容：
 * - direct → 总是用内置内容
 * - thinker / partner → 优先从文件加载，失败回退到 FALLBACK
 */
export function resolveAgentPersona(agentType: DeepDiveAgentType): { name: string; body: string } {
  if (agentType === 'direct') return FALLBACK_PERSONAS.direct

  const filePath = resolveAgentPromptPath(agentType)
  if (filePath) {
    const fileContent = loadPersonaFromFile(filePath)
    if (fileContent) {
      return {
        name: agentType === 'thinker' ? '思想家' : '产品合伙人',
        body: fileContent,
      }
    }
  }
  return FALLBACK_PERSONAS[agentType]
}

/**
 * 构建 Deep Dive 对话的 system prompt：人格 prompt（来自 .md）+ 节点上下文。
 */
export function buildDeepDiveSystemPrompt(
  context: DeepDiveContext,
  agentType: DeepDiveAgentType = 'direct',
): string {
  const aspectBlock =
    context.aspects.length > 0
      ? context.aspects.map((a) => `### ${a.title}\n${a.content}`).join('\n\n')
      : '（暂无切面信息）'

  const persona = resolveAgentPersona(agentType)

  return `${persona.body}

---

# 当前对话上下文

你正在与用户围绕以下知识节点进行深度对话。请在保持你「${persona.name}」人格、视角和对话风格的前提下，结合下面的节点信息展开。

## 当前讨论的知识节点
- **标题**：${context.nodeTitle}
- **领域**：${context.nodeDomain}
- **摘要**：${context.nodeSummary}

## 已有切面
${aspectBlock}

---

# 通用约束
1. 始终保持你作为「${persona.name}」的人格、视角和语气，不要在每条回复里自我介绍角色。
2. 围绕上方知识节点与用户对话，但当用户引出新的话题或关联时，自然地展开。
3. 主动提出有启发性的问题或追问，引导用户思考更深的联系。
4. 如果你在前述人格 prompt 里已经定义了对话开场协议（例如问题诊断、模式选择），请严格遵循它；如果没有，按你自然的人格风格作答即可。`
}

/**
 * 从 Deep Dive 对话历史中提取可落库的知识建议（新节点、新关联、切面补充）。
 */
export async function extractSuggestionsFromConversation(
  messages: Array<{ role: string; content: string }>,
  provider: LLMProvider,
  model: string,
): Promise<FeedExtractionResult> {
  const conversationText = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join('\n\n')

  const extractionPrompt = `请从以下深度对话中提取可以落库的知识建议。包括：
1. 对话中发现的新知识节点（new_nodes）— 每个节点需指定 node_type（concept/claim/case/resource）和 channel（core/light）
2. 节点之间的新关联关系（new_edges）— 支持的 relation_type 包括：contains/related/opposes/instance_of/evolved_from/cites/evidence_for/evidence_against/refines
3. 对已有节点的维度补充（fill_aspects）— 使用 aspect_title（维度标题）而非 template_key

只提取有实质价值、在对话中被充分讨论过的内容，不要提取模糊或不确定的信息。

## 对话内容
${conversationText}

请以结构化 JSON 格式输出结果。`

  const { data } = await invokeStructured({
    provider,
    request: {
      model,
      messages: [
        { role: 'system', content: '你是一个知识抽取助手，从对话中提取结构化知识。' },
        { role: 'user', content: extractionPrompt },
      ],
      maxTokens: 16384,
      temperature: 0.2,
    },
    schema: FeedExtractionResultSchema,
    toolName: 'extract_deep_dive_suggestions',
    toolDescription: '从深度对话中提取候选知识节点和关联',
  })

  return { ...data, new_edges: data.new_edges ?? [], fill_aspects: data.fill_aspects ?? [] }
}
