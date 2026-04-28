import fs from 'node:fs'
import path from 'node:path'
// NOTE: js-yaml is NOT in @galaxy/ai dependencies — run `pnpm add js-yaml` and `pnpm add -D @types/js-yaml` in packages/ai
import yaml from 'js-yaml'

export interface AspectTemplate {
  key: string
  title: string
  description: string
  defaultContent: string
  order: number
  aiPromptHint: string
}

interface RawYamlTemplate {
  key: string
  title: string
  description: string
  default_content: string
  order: number
  ai_prompt_hint: string
}

const templateCache = new Map<string, AspectTemplate[]>()

/**
 * 读取指定目录下的所有 YAML 视角模板文件并解析为 AspectTemplate 数组。
 * 结果会被缓存，同一目录只解析一次。
 */
export function loadAspectTemplates(templatesDir: string): AspectTemplate[] {
  const cached = templateCache.get(templatesDir)
  if (cached) return cached

  if (!fs.existsSync(templatesDir)) {
    throw new Error(`Aspect templates directory not found: ${templatesDir}`)
  }

  const files = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))

  const templates: AspectTemplate[] = files.map((file) => {
    const filePath = path.join(templatesDir, file)
    const content = fs.readFileSync(filePath, 'utf-8')
    const raw = yaml.load(content) as RawYamlTemplate

    return {
      key: raw.key,
      title: raw.title,
      description: raw.description,
      defaultContent: raw.default_content ?? '',
      order: raw.order ?? 0,
      aiPromptHint: raw.ai_prompt_hint ?? '',
    }
  })

  templates.sort((a, b) => a.order - b.order)
  templateCache.set(templatesDir, templates)
  return templates
}

/**
 * 根据 key 获取单个视角模板。
 */
export function getAspectTemplate(key: string, templatesDir: string): AspectTemplate | undefined {
  const templates = loadAspectTemplates(templatesDir)
  return templates.find((t) => t.key === key)
}
