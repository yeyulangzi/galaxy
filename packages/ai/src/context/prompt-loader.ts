import fs from 'node:fs'
import path from 'node:path'
import Handlebars from 'handlebars'

const templateCache = new Map<string, HandlebarsTemplateDelegate>()

/**
 * 加载并编译 Prompt 模板。
 * 模板路径相对于 data/prompts/ 目录。
 */
export function loadPromptTemplate(templateName: string, promptsDir: string): HandlebarsTemplateDelegate {
  const cached = templateCache.get(templateName)
  if (cached) return cached

  const filePath = path.join(promptsDir, `${templateName}.md`)
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt template not found: ${filePath}`)
  }

  const source = fs.readFileSync(filePath, 'utf-8')

  // 加载 _shared/ 下的 partial 模板
  const sharedDir = path.join(promptsDir, '_shared')
  if (fs.existsSync(sharedDir)) {
    for (const file of fs.readdirSync(sharedDir)) {
      if (file.endsWith('.md')) {
        const partialName = file.replace('.md', '').replace(/-/g, '_')
        const partialSource = fs.readFileSync(path.join(sharedDir, file), 'utf-8')
        Handlebars.registerPartial(partialName, partialSource)
      }
    }
  }

  const compiled = Handlebars.compile(source)
  templateCache.set(templateName, compiled)
  return compiled
}

/**
 * 清空模板缓存（用于热加载场景）。
 */
export function clearTemplateCache(): void {
  templateCache.clear()
}
