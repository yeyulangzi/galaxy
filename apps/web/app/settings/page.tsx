'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2, Zap, AlertTriangle, Shield, Download, Upload, Database, Radar, Play, User, Brain, Bot, Plus, Pencil, Trash2, Save, X, Radio, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettingsStore } from '@/lib/store/settings-store'
import { api } from '@/lib/api/client'
import { NavBar } from '../_components/nav-bar'
import { SafetyPanel } from '../_components/safety-panel'
import { BridgeMonitor } from '../_components/bridge-monitor'
import { OperationLogViewer } from '../_components/operation-log-viewer'

/** 支持的 Provider 定义 */
const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...', defaultBaseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...', defaultBaseUrl: 'https://api.anthropic.com' },
  { id: 'dashscope', label: '阿里云百炼', placeholder: 'sk-...', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'ark', label: '火山引擎 (Ark)', placeholder: 'ark-...', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'deepseek', label: 'DeepSeek', placeholder: 'sk-...', defaultBaseUrl: 'https://api.deepseek.com/v1' },
] as const

type MaskedCred = { has_key: boolean; masked_key: string; base_url?: string }

interface CostStats {
  totalCostUsd: number
  totalCalls: number
  thisMonthCostUsd: number
  thisMonthCalls: number
  byProvider: Array<{ providerId: string; costUsd: number; calls: number }>
}

export default function SettingsPage() {
  const { settings, loading, loadSettings, updateSettings } = useSettingsStore()
  const [defaultProvider, setDefaultProvider] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const [defaultBaseUrl, setDefaultBaseUrl] = useState('')
  const [enableThinking, setEnableThinking] = useState(false)
  const [thinkingBudgetTokens, setThinkingBudgetTokens] = useState(10000)
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildStatus, setRebuildStatus] = useState('')
  const [bridgeDir, setBridgeDir] = useState('')
  const [bridgeTimeout, setBridgeTimeout] = useState(30)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({})
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({})
  const [testingKeys, setTestingKeys] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({})
  const [costStats, setCostStats] = useState<CostStats | null>(null)
  const [riskData, setRiskData] = useState<{
    acceptance: { accepted: number; total: number; rate: number }
    inboxBacklog: number
    budget: { enabled: boolean; monthlyBudgetUsd: number; currentCostUsd: number; usageRate: number }
    duplicateNodes: Array<{ nodeA: string; nodeB: string; titleA: string; titleB: string; similarity: number }>
  } | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [killingAI, setKillingAI] = useState(false)
  const [aiKilled, setAiKilled] = useState(false)
  const [importing, setImporting] = useState(false)
  const [logViewerOpen, setLogViewerOpen] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)

  // 主动扫描相关状态
  const [scanCron, setScanCron] = useState('0 3 * * *')
  const [scanMaxSuggestions, setScanMaxSuggestions] = useState(10)
  const [scanStrategies, setScanStrategies] = useState<string[]>(['islands', 'gaps'])
  const [scanRuns, setScanRuns] = useState<Array<{
    id: string; trigger: string; status: string; started_at: string
    finished_at: string | null; suggestions_count: number; cost_usd: number; error_message: string | null
  }>>([])
  const [triggeringScan, setTriggeringScan] = useState(false)

  // --- Memory & Agents ---
  const [userProfile, setUserProfile] = useState('')
  const [globalMemory, setGlobalMemory] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [memorySaving, setMemorySaving] = useState(false)
  const [agents, setAgents] = useState<Array<{ id: string; name: string; description: string }>>([])
  const [editingAgent, setEditingAgent] = useState<string | null>(null)
  const [agentContent, setAgentContent] = useState('')
  const [agentSaving, setAgentSaving] = useState(false)
  const [showNewAgent, setShowNewAgent] = useState(false)
  const [newAgentId, setNewAgentId] = useState('')
  const [newAgentContent, setNewAgentContent] = useState('')

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => {
    api.getCostStats().then(setCostStats).catch(() => {})
    api.getRiskData().then(setRiskData).catch(() => {})
    api.getScanStatus().then(setScanRuns).catch(() => {})
    loadMemory()
    loadAgents()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (settings) {
      setDefaultProvider((settings.default_provider as string) ?? '')
      setDefaultModel((settings.default_model as string) ?? '')
      setDefaultBaseUrl((settings.default_base_url as string) ?? '')
      setEnableThinking((settings.enable_thinking as boolean) ?? false)
      setThinkingBudgetTokens((settings.thinking_budget_tokens as number) ?? 10000)
      setScanCron((settings.proactive_scan_cron as string) ?? '0 3 * * *')
      setScanMaxSuggestions((settings.proactive_scan_max_suggestions as number) ?? 10)
      setScanStrategies((settings.proactive_scan_strategies as string[]) ?? ['islands', 'gaps'])
      setBridgeDir((settings.qoder_bridge_dir as string) ?? '~/galaxy/bridge/')
      setBridgeTimeout((settings.bridge_timeout_minutes as number) ?? 30)
    }
  }, [settings])

  const maskedCredentials = (settings?.masked_credentials ?? {}) as Record<string, MaskedCred>
  const configuredProviders = (settings?.configured_providers ?? []) as string[]

  const selectedProviderDef = PROVIDERS.find((p) => p.id === defaultProvider)

  const toggleKeyVisibility = useCallback((providerId: string) => {
    setVisibleKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }))
  }, [])

  const saveProviderConfig = useCallback(async (providerId: string) => {
    const key = apiKeys[providerId]?.trim() ?? ''
    const providerBaseUrl = baseUrls[providerId]?.trim() || undefined
    const hasExistingKey = (maskedCredentials[providerId]?.has_key) ?? false

    if (!key && !hasExistingKey) {
      toast.error('请输入 API Key')
      return
    }

    setSavingKeys((prev) => ({ ...prev, [providerId]: true }))
    try {
      const newCreds: Record<string, { api_key: string; base_url?: string }> = {}
      // 保留其他 provider 的配置
      for (const p of PROVIDERS) {
        if (p.id !== providerId) {
          const cred = maskedCredentials[p.id]
          if (cred?.has_key) {
            newCreds[p.id] = { api_key: '__KEEP__', base_url: cred.base_url }
          }
        }
      }
      // 当前 provider：有新 key 就用新 key，否则保留旧 key
      newCreds[providerId] = {
        api_key: key || '__KEEP__',
        base_url: providerBaseUrl,
      }
      await updateSettings({ provider_credentials: newCreds })
      setApiKeys((prev) => ({ ...prev, [providerId]: '' }))
      const label = PROVIDERS.find((p) => p.id === providerId)?.label
      toast.success(key ? `${label} 配置已保存` : `${label} Base URL 已更新`)
      await loadSettings()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSavingKeys((prev) => ({ ...prev, [providerId]: false }))
    }
  }, [apiKeys, baseUrls, maskedCredentials, updateSettings, loadSettings])

  const removeApiKey = useCallback(async (providerId: string) => {
    setSavingKeys((prev) => ({ ...prev, [providerId]: true }))
    try {
      const newCreds: Record<string, { api_key: string }> = {}
      for (const p of PROVIDERS) {
        if (p.id !== providerId) {
          const cred = maskedCredentials[p.id]
          if (cred?.has_key) {
            // 保留已有 key（用空占位符表示不更新）
            newCreds[p.id] = { api_key: '__KEEP__' }
          }
        }
      }
      // 传空 key 表示删除
      newCreds[providerId] = { api_key: '' }
      await updateSettings({ provider_credentials: newCreds })
      toast.success(`已移除 ${PROVIDERS.find((p) => p.id === providerId)?.label} API Key`)
      await loadSettings()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '移除失败')
    } finally {
      setSavingKeys((prev) => ({ ...prev, [providerId]: false }))
    }
  }, [maskedCredentials, updateSettings, loadSettings])

  const testConnection = useCallback(async (providerId: string) => {
    setTestingKeys((prev) => ({ ...prev, [providerId]: 'testing' }))
    try {
      const result = await api.testConnection({ providerId })
      if (result.ok) {
        setTestingKeys((prev) => ({ ...prev, [providerId]: 'success' }))
        toast.success(`连接成功 — ${result.model}，延迟 ${result.latencyMs}ms`)
        setTimeout(() => setTestingKeys((prev) => ({ ...prev, [providerId]: 'idle' })), 3000)
      } else {
        setTestingKeys((prev) => ({ ...prev, [providerId]: 'error' }))
        toast.error(`连接失败: ${result.error}`)
        setTimeout(() => setTestingKeys((prev) => ({ ...prev, [providerId]: 'idle' })), 3000)
      }
    } catch (error: unknown) {
      setTestingKeys((prev) => ({ ...prev, [providerId]: 'error' }))
      toast.error(error instanceof Error ? error.message : '测试连接失败')
      setTimeout(() => setTestingKeys((prev) => ({ ...prev, [providerId]: 'idle' })), 3000)
    }
  }, [])

  const loadMemory = useCallback(async () => {
    try {
      const [profileData, memoryData] = await Promise.all([
        fetch('/api/memory?type=profile').then(r => r.json()),
        fetch('/api/memory?type=global').then(r => r.json()),
      ])
      if (profileData?.data?.content) setUserProfile(profileData.data.content)
      if (memoryData?.data?.content) setGlobalMemory(memoryData.data.content)
    } catch { /* 静默 */ }
  }, [])

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents').then(r => r.json())
      if (res?.data?.agents) setAgents(res.data.agents)
    } catch { /* 静默 */ }
  }, [])

  const saveProfile = useCallback(async () => {
    setProfileSaving(true)
    try {
      await fetch('/api/memory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'profile', content: userProfile }),
      })
      toast.success('个人档案已保存')
    } catch { toast.error('保存失败') }
    finally { setProfileSaving(false) }
  }, [userProfile])

  const saveGlobalMemory = useCallback(async () => {
    setMemorySaving(true)
    try {
      await fetch('/api/memory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'global', content: globalMemory }),
      })
      toast.success('全局记忆已保存')
    } catch { toast.error('保存失败') }
    finally { setMemorySaving(false) }
  }, [globalMemory])

  const handleEditAgent = useCallback(async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}`).then(r => r.json())
      if (res?.data?.content) {
        setAgentContent(res.data.content)
        setEditingAgent(agentId)
      }
    } catch { toast.error('加载角色失败') }
  }, [])

  const saveAgent = useCallback(async () => {
    if (!editingAgent) return
    setAgentSaving(true)
    try {
      await fetch(`/api/agents/${editingAgent}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: agentContent }),
      })
      toast.success('角色已保存')
      setEditingAgent(null)
      loadAgents()
    } catch { toast.error('保存失败') }
    finally { setAgentSaving(false) }
  }, [editingAgent, agentContent, loadAgents])

  const createNewAgent = useCallback(async () => {
    if (!newAgentId.trim()) return
    try {
      await fetch('/api/agents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newAgentId.trim(), content: newAgentContent || `# ${newAgentId}\n\n在这里编写角色的提示词...` }),
      })
      toast.success('角色创建成功')
      setShowNewAgent(false)
      setNewAgentId('')
      setNewAgentContent('')
      loadAgents()
    } catch { toast.error('创建失败') }
  }, [newAgentId, newAgentContent, loadAgents])

  const deleteAgent = useCallback(async (agentId: string) => {
    try {
      await fetch(`/api/agents/${agentId}`, { method: 'DELETE' })
      toast.success('角色已删除')
      loadAgents()
    } catch { toast.error('删除失败') }
  }, [loadAgents])

  const onSaveGeneral = async () => {
    try {
      await updateSettings({
        default_provider: defaultProvider,
        default_model: defaultModel,
        default_base_url: defaultBaseUrl || undefined,
        enable_thinking: enableThinking,
        thinking_budget_tokens: thinkingBudgetTokens,
        qoder_bridge_dir: bridgeDir || undefined,
        bridge_timeout_minutes: bridgeTimeout,
      })
      toast.success('设置已保存')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    }
  }

  if (loading || !settings) return <><NavBar /><div className="p-6 text-center" style={{ color: 'var(--clay-muted)' }}>加载中…</div></>

  return (
    <>
      <NavBar />
      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8 animate-fade-in">
        <h1 className="text-display-sm">设置</h1>

        {/* 🔑 AI 配置 */}
        <section className="clay-card p-5 space-y-3">
          <h2 className="text-title-sm">🔑 AI 配置</h2>

          {/* API Keys */}
          <div>
            <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>API Keys</p>
            <p className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>至少配置一个 Provider</p>
          </div>

          {PROVIDERS.map((provider) => {
            const cred = maskedCredentials[provider.id]
            const hasKey = cred?.has_key ?? false
            const inputValue = apiKeys[provider.id] ?? ''
            const isVisible = visibleKeys[provider.id] ?? false
            const isSaving = savingKeys[provider.id] ?? false
            const testStatus = testingKeys[provider.id] ?? 'idle'

            return (
              <div key={provider.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>{provider.label}</span>
                    {hasKey && (
                      <span className="text-caption" style={{ color: 'var(--clay-success)' }}>已配置</span>
                    )}
                  </div>
                  {hasKey && (
                    <button
                      onClick={() => removeApiKey(provider.id)}
                      disabled={isSaving}
                      className="text-caption transition-colors"
                      style={{ color: 'var(--clay-muted)' }}
                    >
                      移除
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={isVisible ? 'text' : 'password'}
                      value={inputValue}
                      onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                      placeholder={hasKey ? `${cred!.masked_key}  · 输入新值覆盖` : provider.placeholder}
                      className="h-8 border-border/40 bg-transparent pr-8 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => toggleKeyVisibility(provider.id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                    >
                      {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => saveProviderConfig(provider.id)}
                    disabled={(!inputValue.trim() && !(baseUrls[provider.id]?.trim()) && !hasKey) || isSaving}
                    className="h-8 px-3"
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '保存'}
                  </Button>
                  {hasKey && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testConnection(provider.id)}
                      disabled={testStatus === 'testing'}
                      className="h-8 px-2.5"
                    >
                      {testStatus === 'testing' && <><Loader2 className="mr-1 h-3 w-3 animate-spin" />测试中…</>}
                      {testStatus === 'success' && <span className="text-[hsl(var(--success))]">✓ 成功</span>}
                      {testStatus === 'error' && <span className="text-destructive">✗ 失败</span>}
                      {testStatus === 'idle' && <><Zap className="mr-1 h-3 w-3" />测试</>}
                    </Button>
                  )}
                </div>
                <Input
                  value={baseUrls[provider.id] ?? cred?.base_url ?? ''}
                  onChange={(e) => setBaseUrls((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                  placeholder={provider.defaultBaseUrl}
                  className="h-7 border-border/40 bg-transparent text-xs"
                />
                <p className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>
                  Base URL · 留空使用默认
                </p>
              </div>
            )
          })}

          {/* 默认模型 */}
          <div className="pt-3" style={{ borderTop: '1px solid var(--clay-hairline)' }}>
            <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>默认模型</p>
            <p className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>投喂时使用的 Provider 和模型</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>Provider</Label>
              <select
                className="flex h-8 w-full px-2.5 text-sm outline-none"
                style={{ border: '1px solid var(--clay-hairline)', borderRadius: 'var(--radius-md)', background: 'var(--clay-canvas)', color: 'var(--clay-ink)' }}
                value={defaultProvider}
                onChange={(e) => {
                  setDefaultProvider(e.target.value)
                  setDefaultModel('')
                  setDefaultBaseUrl('')
                }}
              >
                <option value="">选择</option>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id} disabled={!configuredProviders.includes(p.id)}>
                    {p.label} {configuredProviders.includes(p.id) ? '' : '(未配置)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>Model</Label>
              <Input
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                placeholder="填写模型名称"
                className="h-8 border-border/40 bg-transparent"
              />
            </div>
          </div>
          <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--clay-hairline)' }}>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>思考模式</Label>
                <p className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>
                  让 AI 先深度推理再回答（Anthropic extended thinking / OpenAI reasoning）
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enableThinking}
                onClick={() => setEnableThinking(!enableThinking)}
                className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                style={{ background: enableThinking ? 'var(--clay-primary)' : 'var(--clay-hairline)' }}
              >
                <span
                  className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
                  style={{ transform: enableThinking ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </button>
            </div>
            {enableThinking && (
              <div className="space-y-1 pl-0">
                <Label className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>思考 Token 预算</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1000}
                    max={100000}
                    step={1000}
                    value={thinkingBudgetTokens}
                    onChange={(e) => setThinkingBudgetTokens(Number(e.target.value) || 10000)}
                    className="h-7 w-32 border-border/40 bg-transparent text-sm"
                  />
                  <span className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>tokens（推荐 5,000 ~ 30,000）</span>
                </div>
              </div>
            )}
          </div>
          {/* 外部 Agent 代理 */}
          <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--clay-hairline)' }}>
            <div>
              <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>外部 Agent 代理</p>
              <p className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>
                将深度探索任务委托给本地运行的外部 AI（如 Claude Code、自定义脚本等）
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>任务交换目录</Label>
              <Input
                value={bridgeDir}
                onChange={(e) => setBridgeDir(e.target.value)}
                placeholder="~/galaxy/bridge/"
                className="h-8 border-border/40 bg-transparent text-sm font-mono"
              />
              <p className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>外部 Agent 从此目录的 pending/ 读取任务，结果写入 done/</p>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>任务超时（分钟）</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={bridgeTimeout}
                onChange={(e) => setBridgeTimeout(Number(e.target.value) || 30)}
                className="h-7 w-24 border-border/40 bg-transparent text-sm"
              />
            </div>
          </div>

          <Button onClick={onSaveGeneral} size="sm" className="h-8">
            保存
          </Button>
        </section>

        {/* 🧠 AI 个性化 */}
        <section className="clay-card p-5 space-y-3">
          <h2 className="text-title-sm">🧠 AI 个性化</h2>

          {/* 个人档案 */}
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" style={{ color: 'var(--clay-primary)' }} />
            <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>个人档案</p>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>AI 助手会参考这份档案来个性化回答</p>
          <textarea
            value={userProfile}
            onChange={(e) => setUserProfile(e.target.value)}
            className="w-full rounded-md px-3 py-2 text-sm font-mono outline-none resize-y"
            style={{ height: '200px', border: '1px solid var(--clay-hairline)', background: 'var(--clay-canvas)', color: 'var(--clay-ink)' }}
            placeholder="在这里编写你的个人档案，例如：姓名、职业、偏好..."
          />
          <Button size="sm" className="h-8" onClick={saveProfile} disabled={profileSaving}>
            {profileSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            保存
          </Button>

          {/* 全局记忆 */}
          <div className="pt-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--clay-hairline)' }}>
            <Brain className="h-4 w-4" style={{ color: 'var(--clay-primary)' }} />
            <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>全局记忆</p>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>跨会话持久化的记忆，AI 会在每次对话时参考</p>
          <textarea
            value={globalMemory}
            onChange={(e) => setGlobalMemory(e.target.value)}
            className="w-full rounded-md px-3 py-2 text-sm font-mono outline-none resize-y"
            style={{ height: '200px', border: '1px solid var(--clay-hairline)', background: 'var(--clay-canvas)', color: 'var(--clay-ink)' }}
            placeholder="AI 会自动记录重要信息到这里，你也可以手动编辑..."
          />
          <Button size="sm" className="h-8" onClick={saveGlobalMemory} disabled={memorySaving}>
            {memorySaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            保存
          </Button>

          {/* 角色管理 */}
          <div className="pt-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--clay-hairline)' }}>
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" style={{ color: 'var(--clay-primary)' }} />
              <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>角色管理</p>
            </div>
            <Button size="sm" variant="outline" className="h-8 px-3" onClick={() => setShowNewAgent(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              新增角色
            </Button>
          </div>

          {showNewAgent && (
            <div className="space-y-2 rounded-md p-4" style={{ border: '1px solid var(--clay-hairline)', background: 'var(--clay-canvas)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium" style={{ color: 'var(--clay-ink)' }}>新增角色</span>
                <button onClick={() => { setShowNewAgent(false); setNewAgentId(''); setNewAgentContent('') }}>
                  <X className="h-4 w-4" style={{ color: 'var(--clay-muted)' }} />
                </button>
              </div>
              <Input
                value={newAgentId}
                onChange={(e) => setNewAgentId(e.target.value)}
                placeholder="角色 ID（英文，如 reviewer）"
                className="h-8 border-border/40 bg-transparent text-sm"
              />
              <textarea
                value={newAgentContent}
                onChange={(e) => setNewAgentContent(e.target.value)}
                className="w-full rounded-md px-3 py-2 text-sm font-mono outline-none resize-y"
                style={{ height: '200px', border: '1px solid var(--clay-hairline)', background: 'var(--clay-surface-card)', color: 'var(--clay-ink)' }}
                placeholder="角色的提示词内容（Markdown 格式）..."
              />
              <div className="flex gap-2">
                <Button size="sm" className="h-8" onClick={createNewAgent} disabled={!newAgentId.trim()}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  创建
                </Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => { setShowNewAgent(false); setNewAgentId(''); setNewAgentContent('') }}>
                  取消
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {agents.map((agent) => (
              <div key={agent.id} className="rounded-md p-3" style={{ border: '1px solid var(--clay-hairline)', background: 'var(--clay-canvas)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[13px] font-medium" style={{ color: 'var(--clay-ink)' }}>{agent.name}</span>
                    <span className="ml-2 text-[11px]" style={{ color: 'var(--clay-muted)' }}>{agent.id}</span>
                    {agent.description && (
                      <p className="mt-0.5 text-[11px]" style={{ color: 'var(--clay-muted)' }}>{agent.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleEditAgent(agent.id)}
                      className="rounded p-1.5 transition-colors hover:bg-black/5"
                      title="编辑"
                    >
                      <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--clay-muted)' }} />
                    </button>
                    {!['direct', 'thinker', 'partner'].includes(agent.id) && (
                      <button
                        onClick={() => deleteAgent(agent.id)}
                        className="rounded p-1.5 transition-colors hover:bg-red-50"
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
                {editingAgent === agent.id && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={agentContent}
                      onChange={(e) => setAgentContent(e.target.value)}
                      className="w-full rounded-md px-3 py-2 text-sm font-mono outline-none resize-y"
                      style={{ height: '300px', border: '1px solid var(--clay-hairline)', background: 'var(--clay-surface-card)', color: 'var(--clay-ink)' }}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-8" onClick={saveAgent} disabled={agentSaving}>
                        {agentSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                        保存
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setEditingAgent(null)}>
                        <X className="mr-1 h-3.5 w-3.5" />
                        取消
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {agents.length === 0 && (
              <p className="py-4 text-center text-[13px]" style={{ color: 'var(--clay-muted)' }}>暂无角色，点击上方按钮新增</p>
            )}
          </div>
        </section>

        {/* ⚡ 图谱维护 */}
        <section className="clay-card p-5 space-y-3">
          <h2 className="text-title-sm">⚡ 图谱维护</h2>

          {/* 重建关联 */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[13px] font-medium" style={{ color: 'var(--clay-ink)' }}>重建关联</span>
              <p className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>
                {rebuildStatus || '全量重新生成所有节点关联和边描述（耗时较长）'}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={rebuilding}
              onClick={async () => {
                setRebuilding(true)
                setRebuildStatus('启动中…')
                try {
                  const res = await fetch('/api/edges/rebuild', { method: 'POST' })
                  const json = await res.json()
                  if (!res.ok) { throw new Error(json.error ?? '启动失败') }
                  const taskId = json.data?.taskId
                  if (!taskId) throw new Error('未获取到任务 ID')
                  setRebuildStatus('任务已启动，正在执行…')
                  const poll = setInterval(async () => {
                    try {
                      const r = await fetch(`/api/edges/rebuild?taskId=${taskId}`)
                      const d = (await r.json()).data
                      if (!d) return
                      if (d.phase === 'backfilling') {
                        setRebuildStatus(`补充关联中… ${d.progress?.current ?? 0}/${d.progress?.total ?? '?'}`)
                      } else if (d.phase === 'regenerating') {
                        setRebuildStatus(`生成描述中… ${d.progress?.current ?? 0}/${d.progress?.total ?? '?'}`)
                      } else if (d.phase === 'completed') {
                        clearInterval(poll)
                        const result = d.result
                        setRebuildStatus(`完成：新增 ${result?.created ?? 0} 条关联，更新 ${result?.updated ?? 0} 条描述`)
                        setRebuilding(false)
                        toast.success('重建关联完成')
                      } else if (d.phase === 'failed') {
                        clearInterval(poll)
                        setRebuildStatus(`失败：${d.error ?? '未知错误'}`)
                        setRebuilding(false)
                        toast.error('重建关联失败')
                      }
                    } catch { /* 轮询失败静默 */ }
                  }, 2000)
                } catch (err: unknown) {
                  setRebuildStatus('')
                  setRebuilding(false)
                  toast.error(err instanceof Error ? err.message : '启动失败')
                }
              }}
            >
              {rebuilding ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              {rebuilding ? '执行中' : '重建'}
            </Button>
          </div>

          {/* 主动扫描 */}
          <div className="pt-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--clay-hairline)' }}>
            <Radar className="h-4 w-4" />
            <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>主动扫描</p>
          </div>
          <p className="text-xs" style={{ color: 'var(--clay-muted)' }}>AI 定时扫描图谱中的不足之处并生成改进建议</p>

          {/* 开关 */}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-[13px] font-medium" style={{ color: 'var(--clay-ink)' }}>启用主动扫描</span>
              <p className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>开启后按 cron 表达式定时扫描</p>
            </div>
            <div className="relative h-5 w-9 rounded-full transition-colors" style={{ background: settings.enable_proactive_scan ? 'var(--clay-primary)' : 'var(--clay-hairline)' }}>
              <input type="checkbox" checked={!!settings.enable_proactive_scan} onChange={(e) => updateSettings({ enable_proactive_scan: e.target.checked })} className="sr-only" />
              <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${settings.enable_proactive_scan ? 'translate-x-4' : ''}`} />
            </div>
          </label>

          {/* Cron 表达式 */}
          <div className="space-y-1">
            <Label className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>Cron 表达式</Label>
            <div className="flex gap-2">
              <Input
                value={scanCron}
                onChange={(e) => setScanCron(e.target.value)}
                placeholder="0 3 * * *"
                className="h-8 border-border/40 bg-transparent text-sm font-mono"
              />
              <Button
                size="sm"
                className="h-8 px-3"
                onClick={async () => {
                  try {
                    await updateSettings({ proactive_scan_cron: scanCron })
                    toast.success('Cron 表达式已保存')
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : '保存失败')
                  }
                }}
              >
                保存
              </Button>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>格式：分 时 日 月 周（默认每天凌晨 3 点）</p>
          </div>

          {/* 最大建议数 */}
          <div className="space-y-1">
            <Label className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>每次扫描最大建议数</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                max={50}
                value={scanMaxSuggestions}
                onChange={(e) => setScanMaxSuggestions(parseInt(e.target.value, 10) || 10)}
                className="h-8 w-24 border-border/40 bg-transparent text-sm"
              />
              <Button
                size="sm"
                className="h-8 px-3"
                onClick={async () => {
                  try {
                    await updateSettings({ proactive_scan_max_suggestions: scanMaxSuggestions })
                    toast.success('最大建议数已保存')
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : '保存失败')
                  }
                }}
              >
                保存
              </Button>
            </div>
          </div>

          {/* 策略多选 */}
          <div className="space-y-1.5">
            <Label className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>扫描策略</Label>
            <div className="space-y-1.5">
              {[
                { id: 'islands', label: '孤岛节点', desc: '查找没有关联或关联度很低的节点' },
                { id: 'gaps', label: '关联缺口', desc: '查找同领域内缺少关联的节点对' },
                { id: 'aging', label: '老化节点', desc: '查找超过 30 天未更新的节点' },
              ].map((strategy) => (
                <label key={strategy.id} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scanStrategies.includes(strategy.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...scanStrategies, strategy.id]
                        : scanStrategies.filter((s) => s !== strategy.id)
                      setScanStrategies(next)
                      updateSettings({ proactive_scan_strategies: next }).catch(() => {})
                    }}
                    className="h-3.5 w-3.5 rounded border-border/40"
                  />
                  <div>
                    <span className="text-[13px] font-medium" style={{ color: 'var(--clay-ink)' }}>{strategy.label}</span>
                    <p className="text-[10px]" style={{ color: 'var(--clay-muted)' }}>{strategy.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 手动触发 */}
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={triggeringScan}
            onClick={async () => {
              setTriggeringScan(true)
              try {
                const result = await api.triggerScan()
                toast.success(`扫描已触发（ID: ${result.scanRunId.slice(0, 8)}…）`)
                // 刷新扫描记录
                setTimeout(() => {
                  api.getScanStatus().then(setScanRuns).catch(() => {})
                }, 2000)
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : '触发失败')
              } finally {
                setTriggeringScan(false)
              }
            }}
          >
            {triggeringScan ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            手动触发扫描
          </Button>

          {/* 最近扫描记录 */}
          {scanRuns.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>最近扫描记录</p>
              <div className="space-y-1">
                {scanRuns.map((run) => (
                  <div key={run.id} className="flex items-center justify-between px-3 py-1.5 text-[12px]" style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--clay-hairline-soft)' }}>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: run.status === 'done' ? 'var(--clay-success)' : run.status === 'running' ? 'var(--clay-warning)' : 'var(--clay-error)' }} />
                      <span style={{ color: 'var(--clay-muted)' }}>{run.trigger === 'cron' ? '定时' : '手动'}</span>
                      <span className="font-medium" style={{ color: 'var(--clay-ink)' }}>{run.suggestions_count} 条建议</span>
                    </div>
                    <div className="flex items-center gap-2" style={{ color: 'var(--clay-muted)' }}>
                      {run.error_message && (
                        <span className="text-[10px]" style={{ color: 'var(--clay-error)' }} title={run.error_message}>错误</span>
                      )}
                      <span>{new Date(run.started_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 💰 用量与预算 */}
        <section className="clay-card p-5 space-y-3">
          <h2 className="text-title-sm">💰 用量与预算</h2>

          {/* 月度预算 */}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-[13px] font-medium" style={{ color: 'var(--clay-ink)' }}>月度预算上限</span>
              <p className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>限制每月 AI 调用费用</p>
            </div>
            <div className="relative h-5 w-9 rounded-full transition-colors" style={{ background: settings.enable_monthly_budget ? 'var(--clay-primary)' : 'var(--clay-hairline)' }}>
              <input type="checkbox" checked={!!settings.enable_monthly_budget} onChange={(e) => updateSettings({ enable_monthly_budget: e.target.checked })} className="sr-only" />
              <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${settings.enable_monthly_budget ? 'translate-x-4' : ''}`} />
            </div>
          </label>

          {/* 用量统计 */}
          <div className="pt-2" style={{ borderTop: '1px solid var(--clay-hairline)' }}>
            <p className="text-body-sm font-medium mb-2" style={{ color: 'var(--clay-ink)' }}>用量统计</p>
          </div>
          {costStats ? (
            <div className="space-y-1.5 text-[13px]">
              <p>
                <span style={{ color: 'var(--clay-muted)' }}>本月花费：</span>
                <span className="font-medium" style={{ color: 'var(--clay-ink)' }}>${costStats.thisMonthCostUsd.toFixed(4)}</span>
                <span className="ml-2" style={{ color: 'var(--clay-muted)' }}>（{costStats.thisMonthCalls} 次调用）</span>
              </p>
              <p>
                <span style={{ color: 'var(--clay-muted)' }}>累计花费：</span>
                <span className="font-medium" style={{ color: 'var(--clay-ink)' }}>${costStats.totalCostUsd.toFixed(4)}</span>
                <span className="ml-2" style={{ color: 'var(--clay-muted)' }}>（{costStats.totalCalls} 次调用）</span>
              </p>
              {costStats.byProvider.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  <p className="text-[11px]" style={{ color: 'var(--clay-muted)' }}>按 Provider 分布：</p>
                  {costStats.byProvider.map((provider) => (
                    <p key={provider.providerId} className="text-[12px] pl-2">
                      <span className="font-medium" style={{ color: 'var(--clay-ink)' }}>{provider.providerId}</span>
                      <span style={{ color: 'var(--clay-muted)' }}> — ${provider.costUsd.toFixed(4)}，{provider.calls} 次</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13px]" style={{ color: 'var(--clay-muted)' }}>加载中…</p>
          )}
        </section>

        {/* 🛡️ 安全与数据 */}
        <section className="clay-card p-5 space-y-3">
          <h2 className="text-title-sm">🛡️ 安全与数据</h2>

          {/* 风险控制 */}
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" style={{ color: 'var(--clay-warning)' }} />
            <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>风险控制</p>
          </div>
          {riskData ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span style={{ color: 'var(--clay-muted)' }}>接受率（近 30 天）</span>
                  <span className="font-medium">
                    {riskData.acceptance.accepted}/{riskData.acceptance.total}
                    （{Math.round(riskData.acceptance.rate * 100)}%）
                  </span>
                </div>
                <div className="h-2 rounded-full" style={{ background: 'var(--clay-hairline)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.round(riskData.acceptance.rate * 100)}%`, background: riskData.acceptance.rate < 0.5 ? 'var(--clay-warning)' : 'var(--clay-primary)' }}
                  />
                </div>
                {riskData.acceptance.rate < 0.5 && riskData.acceptance.total > 0 && (
                  <p className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--clay-warning)' }}>
                    <AlertTriangle className="h-3 w-3" />
                    接受率低于 50%，建议检查 AI 生成质量或调整配置
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between text-[13px]">
                <span style={{ color: 'var(--clay-muted)' }}>Inbox 积压</span>
                <span className="font-medium" style={{ color: 'var(--clay-ink)' }}>{riskData.inboxBacklog} 条待处理</span>
              </div>

              {riskData.budget.enabled && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span style={{ color: 'var(--clay-muted)' }}>本月预算使用</span>
                    <span className="font-medium">
                      ${riskData.budget.currentCostUsd.toFixed(2)} / ${riskData.budget.monthlyBudgetUsd.toFixed(2)}
                      （{Math.round(riskData.budget.usageRate * 100)}%）
                    </span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: 'var(--clay-hairline)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.round(riskData.budget.usageRate * 100))}%`, background: riskData.budget.usageRate > 0.8 ? 'var(--clay-error)' : 'var(--clay-primary)' }}
                    />
                  </div>
                </div>
              )}

              {riskData.duplicateNodes.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px]" style={{ color: 'var(--clay-warning)' }}>
                    <AlertTriangle className="mr-1 inline h-3 w-3" />
                    检测到 {riskData.duplicateNodes.length} 组可能重复的节点
                  </p>
                  {riskData.duplicateNodes.slice(0, 5).map((pair, index) => (
                    <p key={index} className="text-[11px] pl-4" style={{ color: 'var(--clay-muted)' }}>
                      「{pair.titleA}」↔「{pair.titleB}」（相似度 {Math.round(pair.similarity * 100)}%）
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13px]" style={{ color: 'var(--clay-muted)' }}>加载中…</p>
          )}

          {/* 数据安全 */}
          <div className="pt-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--clay-hairline)' }}>
            <Database className="h-4 w-4" style={{ color: 'var(--clay-ink)' }} />
            <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>数据安全</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={backingUp}
              onClick={async () => {
                setBackingUp(true)
                try {
                  const result = await api.triggerBackup()
                  toast.success(`备份完成，当前共 ${result.backupsCount} 个备份`)
                } catch (error: unknown) {
                  toast.error(error instanceof Error ? error.message : '备份失败')
                } finally {
                  setBackingUp(false)
                }
              }}
            >
              {backingUp ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Database className="mr-1.5 h-3.5 w-3.5" />}
              立即备份
            </Button>
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => {
                  const menu = document.getElementById('export-menu')
                  menu?.classList.toggle('hidden')
                }}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                导出数据
              </Button>
              <div id="export-menu" className="hidden absolute top-9 left-0 z-10 p-1" style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--clay-hairline-soft)', background: 'var(--clay-canvas)', boxShadow: 'var(--shadow-clay-md)' }}>
                <button
                  className="flex w-full items-center px-3 py-1.5 text-[13px] transition-colors"
                  style={{ borderRadius: 'var(--radius-sm)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--clay-surface-soft)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => {
                    api.exportData('json')
                    document.getElementById('export-menu')?.classList.add('hidden')
                    toast.success('正在导出 JSON…')
                  }}
                >
                  JSON 格式
                </button>
                <button
                  className="flex w-full items-center px-3 py-1.5 text-[13px] transition-colors"
                  style={{ borderRadius: 'var(--radius-sm)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--clay-surface-soft)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => {
                    api.exportData('markdown')
                    document.getElementById('export-menu')?.classList.add('hidden')
                    toast.success('正在导出 Markdown…')
                  }}
                >
                  Markdown 格式
                </button>
              </div>
            </div>
          </div>

          {/* 导入数据 */}
          <div className="pt-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--clay-hairline)' }}>
            <Upload className="h-4 w-4" style={{ color: 'var(--clay-ink)' }} />
            <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>导入数据</p>
          </div>
          <div className="space-y-3">
            <p className="text-[13px]" style={{ color: 'var(--clay-muted)' }}>
              从 Galaxy JSON 文件导入节点、边、切面数据。导入前会自动备份当前数据库。
            </p>
            <div className="flex items-center gap-2">
              <input
                ref={importFileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setImporting(true)
                  try {
                    const text = await file.text()
                    const data = JSON.parse(text)
                    const result = await api.importData(data)
                    toast.success(result.message)
                  } catch (error: unknown) {
                    toast.error(error instanceof Error ? error.message : '导入失败')
                  } finally {
                    setImporting(false)
                    if (importFileRef.current) importFileRef.current.value = ''
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={importing}
                onClick={() => importFileRef.current?.click()}
              >
                {importing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                选择文件导入
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => {
                  const template = {
                    nodes: [
                      {
                        id: 'example-node-1',
                        title: '示例节点',
                        summary: '这是一个示例节点的摘要',
                        domain: '技术/前端',
                        node_type: 'concept',
                        channel: 'light',
                        internalization_status: 'draft',
                        my_thoughts: '可以在这里写下你的理解和思考',
                        source_url: null,
                      },
                    ],
                    edges: [
                      {
                        id: 'example-edge-1',
                        source_id: 'example-node-1',
                        target_id: 'example-node-2',
                        label: '相关',
                        relation_type: 'related_to',
                        weight: 1.0,
                        origin: 'manual',
                      },
                    ],
                    aspects: [
                      {
                        id: 'example-aspect-1',
                        node_id: 'example-node-1',
                        title: '核心要点',
                        content: '这是此节点的核心要点描述',
                        source_type: 'manual',
                        template_key: null,
                      },
                    ],
                  }
                  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const anchor = document.createElement('a')
                  anchor.href = url
                  anchor.download = 'galaxy-import-template.json'
                  anchor.click()
                  URL.revokeObjectURL(url)
                  toast.success('模板已下载')
                }}
              >
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
                下载导入模板
              </Button>
            </div>
            <div className="text-[11px] space-y-0.5" style={{ color: 'var(--clay-muted)' }}>
              <p>• 支持的字段见模板文件，导入采用 <strong>upsert</strong> 策略（已有相同 ID 的记录跳过）</p>
              <p>• 也可以直接导入通过「导出数据 → JSON」导出的文件</p>
            </div>
          </div>

          {/* Bridge 任务监控 */}
          <div className="pt-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--clay-hairline)' }}>
            <Radio className="h-4 w-4" style={{ color: 'var(--clay-ink)' }} />
            <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>Bridge 任务监控</p>
          </div>
          <BridgeMonitor />

          {/* 操作日志 */}
          <div className="pt-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--clay-hairline)' }}>
            <Database className="h-4 w-4" style={{ color: 'var(--clay-ink)' }} />
            <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>操作日志</p>
          </div>
          <div className="space-y-2">
            <p className="text-[13px]" style={{ color: 'var(--clay-muted)' }}>
              查看所有操作记录，支持撤销有快照的操作。
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogViewerOpen(true)}
            >
              查看操作日志
            </Button>
          </div>
          <OperationLogViewer open={logViewerOpen} onOpenChange={setLogViewerOpen} />

          {/* 安全模式 */}
          <div className="pt-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--clay-hairline)' }}>
            <Shield className="h-4 w-4" style={{ color: 'var(--clay-error)' }} />
            <p className="text-body-sm font-medium" style={{ color: 'var(--clay-ink)' }}>安全模式</p>
          </div>
          <div className="space-y-2.5 text-[13px]">
            <div className="flex items-center gap-3">
              <span style={{ color: 'var(--clay-muted)' }}>投喂 AI</span>
              <span style={{ color: settings.enable_feed_ai ? 'var(--clay-success)' : 'var(--clay-muted)' }}>
                {settings.enable_feed_ai ? '✓ 开启' : '✗ 关闭'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span style={{ color: 'var(--clay-muted)' }}>主动扫描</span>
              <span style={{ color: settings.enable_proactive_scan ? 'var(--clay-success)' : 'var(--clay-muted)' }}>
                {settings.enable_proactive_scan ? '✓ 开启' : '✗ 关闭'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span style={{ color: 'var(--clay-muted)' }}>深度探索</span>
              <span style={{ color: settings.enable_deepdive ? 'var(--clay-success)' : 'var(--clay-muted)' }}>
                {settings.enable_deepdive ? '✓ 开启' : '✗ 关闭'}
              </span>
            </div>
          </div>

          {/* 增强安全面板 */}
          {riskData && (
            <SafetyPanel
              inboxBacklog={riskData.inboxBacklog}
              budget={riskData.budget}
            />
          )}

          {aiKilled ? (
            <div className="px-3 py-2 text-[13px]" style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--clay-success)', background: 'rgba(34, 197, 94, 0.05)', color: 'var(--clay-success)' }}>
              ✓ 所有 AI 功能已关闭
            </div>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              className="h-9 px-4 font-medium"
              disabled={killingAI}
              onClick={async () => {
                setKillingAI(true)
                try {
                  await api.killAllAI()
                  setAiKilled(true)
                  toast.success('所有 AI 功能已关闭')
                  await loadSettings()
                } catch (error: unknown) {
                  toast.error(error instanceof Error ? error.message : '操作失败')
                } finally {
                  setKillingAI(false)
                }
              }}
            >
              {killingAI ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Shield className="mr-1.5 h-4 w-4" />}
              一键关闭所有 AI
            </Button>
          )}
        </section>
      </div>
    </>
  )
}
