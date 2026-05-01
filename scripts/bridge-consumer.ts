import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getDb, initDb, schema } from '@galaxy/db'
import { ProviderRegistry, decrypt, ensureBridgeDirs } from '@galaxy/ai'
import type { BridgeTaskFile } from '@galaxy/ai'
import type { Message } from '@galaxy/ai'
import { eq } from 'drizzle-orm'

const { settings } = schema

const registry = new ProviderRegistry()

function resolveTilde(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2))
  }
  return filePath
}

async function processTask(filePath: string, model: string): Promise<void> {
  const fileName = path.basename(filePath)
  console.log(`[bridge-consumer] Processing task: ${fileName}`)

  let task: BridgeTaskFile
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    task = JSON.parse(raw) as BridgeTaskFile
  } catch (error) {
    console.error(`[bridge-consumer] Failed to read/parse task file: ${fileName}`, error)
    return
  }

  const doneDir = path.join(path.dirname(path.dirname(filePath)), 'done')
  const donePath = path.join(doneDir, `${task.task_id}.json`)

  try {
    const systemContent = [
      `You are a ${task.agent_type} agent for deep-dive conversations.`,
      `Node context: ${task.node_context.title} (${task.node_context.domain})`,
      `Summary: ${task.node_context.summary}`,
      task.expected_output ? `Expected output: ${task.expected_output}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const messages: Message[] = [
      { role: 'system', content: systemContent },
      ...task.conversation_history.map((message) => ({
        role: message.role as Message['role'],
        content: message.content,
      })),
    ]

    const provider = registry.getOrThrow(registry.listRegistered()[0]!)
    const response = await provider.invoke({ model, messages })

    const result = {
      task_id: task.task_id,
      result: {
        content: response.content,
        model: response.model,
        provider_id: response.providerId,
        usage: response.usage,
      },
      completed_at: new Date().toISOString(),
    }

    fs.writeFileSync(donePath, JSON.stringify(result, null, 2), 'utf-8')
    fs.unlinkSync(filePath)
    console.log(`[bridge-consumer] Task completed: ${task.task_id}`)
  } catch (error) {
    const errorResult = {
      task_id: task.task_id,
      error: error instanceof Error ? error.message : String(error),
      completed_at: new Date().toISOString(),
    }
    fs.writeFileSync(donePath, JSON.stringify(errorResult, null, 2), 'utf-8')

    try {
      fs.unlinkSync(filePath)
    } catch {
      /* already removed or inaccessible */
    }

    console.error(`[bridge-consumer] Task failed: ${task.task_id}`, error)
  }
}

async function main(): Promise<void> {
  console.log('[bridge-consumer] Starting...')

  initDb()
  const db = getDb()

  const settingsRow = db.select().from(settings).get()
  if (!settingsRow) {
    throw new Error('No settings row found. Run the app first to initialize the database.')
  }

  const bridgeDir = resolveTilde(settingsRow.qoder_bridge_dir ?? '~/galaxy/bridge/')
  ensureBridgeDirs(bridgeDir)
  console.log(`[bridge-consumer] Bridge dir: ${bridgeDir}`)

  const credentials = settingsRow.provider_credentials as
    | Record<string, { api_key: string; base_url?: string }>
    | null
  const defaultProvider = settingsRow.default_provider
  const defaultModel = settingsRow.default_model

  if (!credentials || !defaultProvider || !defaultModel) {
    throw new Error(
      'Missing provider configuration. Set default_provider, default_model, and provider_credentials in settings.',
    )
  }

  for (const [providerId, credential] of Object.entries(credentials)) {
    try {
      const decryptedKey = decrypt(credential.api_key)
      registry.registerBuiltIn(providerId as Parameters<typeof registry.registerBuiltIn>[0], {
        apiKey: decryptedKey,
        baseUrl: credential.base_url,
      })
      console.log(`[bridge-consumer] Registered provider: ${providerId}`)
    } catch (error) {
      console.warn(`[bridge-consumer] Failed to register provider ${providerId}:`, error)
    }
  }

  const pendingDir = path.join(bridgeDir, 'pending')

  // Process existing files on startup
  const existingFiles = fs.readdirSync(pendingDir).filter((file) => file.endsWith('.json'))
  if (existingFiles.length > 0) {
    console.log(`[bridge-consumer] Found ${existingFiles.length} existing task(s), processing...`)
    for (const file of existingFiles) {
      await processTask(path.join(pendingDir, file), defaultModel)
    }
  }

  // Watch for new files
  console.log(`[bridge-consumer] Watching ${pendingDir} for new tasks...`)
  fs.watch(pendingDir, (eventType, filename) => {
    if (eventType === 'rename' && filename && filename.endsWith('.json')) {
      const filePath = path.join(pendingDir, filename)
      if (fs.existsSync(filePath)) {
        processTask(filePath, defaultModel).catch((error) => {
          console.error(`[bridge-consumer] Unhandled error processing ${filename}:`, error)
        })
      }
    }
  })

  console.log('[bridge-consumer] Ready. Press Ctrl+C to stop.')
}

main().catch((error) => {
  console.error('[bridge-consumer] Fatal error:', error)
  process.exit(1)
})
