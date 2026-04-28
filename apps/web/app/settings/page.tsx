'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2, Zap, AlertTriangle, Shield, Download, Database, Radar, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettingsStore } from '@/lib/store/settings-store'
import { api } from '@/lib/api/client'
import { NavBar } from '../_components/nav-bar'

/** 支持的 Provider 定义 */
const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...', models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'] },
  { id: 'dashscope', label: '阿里云百炼', placeholder: 'sk-...', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'] },
  { id: 'ark', label: '火山引擎 (Ark)', placeholder: 'ark-...', models: ['doubao-pro-32k', 'doubao-lite-32k'] },
  { id: 'deepseek', label: 'DeepSeek', placeholder: 'sk-...', models: ['deepseek-chat', 'deepseek-reasoner'] },
] as const

type MaskedCred = { has_key: boolean; masked_key: string }

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
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
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

  // 主动扫描相关状态
  const [scanCron, setScanCron] = useState('0 3 * * *')
  const [scanMaxSuggestions, setScanMaxSuggestions] = useState(10)
  const [scanStrategies, setScanStrategies] = useState<string[]>(['islands', 'gaps'])
  const [scanRuns, setScanRuns] = useState<Array<{
    id: string; trigger: string; status: string; started_at: string
    finished_at: string | null; suggestions_count: number; cost_usd: number; error_message: string | null
  }>>([])
  const [triggeringScan, setTriggeringScan] = useState(false)

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => {
    api.getCostStats().then(setCostStats).catch(() => {})
    api.getRiskData().then(setRiskData).catch(() => {})
    api.getScanStatus().then(setScanRuns).catch(() => {})
  }, [])
  useEffect(() => {
    if (settings) {
      setDefaultProvider((settings.default_provider as string) ?? '')
      setDefaultModel((settings.default_model as string) ?? '')
      setScanCron((settings.proactive_scan_cron as string) ?? '0 3 * * *')
      setScanMaxSuggestions((settings.proactive_scan_max_suggestions as number) ?? 10)
      setScanStrategies((settings.proactive_scan_strategies as string[]) ?? ['islands', 'gaps'])
    }
  }, [settings])

  const maskedCredentials = (settings?.masked_credentials ?? {}) as Record<string, MaskedCred>
  const configuredProviders = (settings?.configured_providers ?? []) as string[]

  /** 获取当前选中 provider 对应的推荐模型列表 */
  const selectedProviderDef = PROVIDERS.find((p) => p.id === defaultProvider)
  const modelOptions = selectedProviderDef?.models ?? []

  const toggleKeyVisibility = useCallback((providerId: string) => {
    setVisibleKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }))
  }, [])

  const saveApiKey = useCallback(async (providerId: string) => {
    const key = apiKeys[providerId]
    if (!key || key.trim().length === 0) {
      toast.error('请输入 API Key')
      return
    }
    setSavingKeys((prev) => ({ ...prev, [providerId]: true }))
    try {
      // 合并现有 credentials
      const existingCreds = (settings?.provider_credentials_patch ?? {}) as Record<string, { api_key: string }>
      const newCreds: Record<string, { api_key: string }> = {}
      // 保留其他 provider 的 key（用 placeholder 标记）
      for (const p of PROVIDERS) {
        const existing = existingCreds[p.id]
        if (existing) newCreds[p.id] = existing
      }
      newCreds[providerId] = { api_key: key.trim() }
      await updateSettings({ provider_credentials: newCreds })
      setApiKeys((prev) => ({ ...prev, [providerId]: '' }))
      toast.success(`${PROVIDERS.find((p) => p.id === providerId)?.label} API Key 已保存`)
      await loadSettings()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSavingKeys((prev) => ({ ...prev, [providerId]: false }))
    }
  }, [apiKeys, settings, updateSettings, loadSettings])

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

  const onSaveGeneral = async () => {
    try {
      await updateSettings({ default_provider: defaultProvider, default_model: defaultModel })
      toast.success('设置已保存')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    }
  }

  if (loading || !settings) return <><NavBar /><div className="p-6 text-center text-muted-foreground">加载中…</div></>

  return (
    <>
      <NavBar />
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-6 animate-fade-in">
        <h1 className="font-['Noto_Serif_Display'] text-xl font-semibold tracking-tight">设置</h1>

        {/* API Keys */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">API Keys</h2>
            <p className="text-xs text-muted-foreground">至少配置一个 Provider</p>
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
                    <span className="text-[13px] font-medium">{provider.label}</span>
                    {hasKey && (
                      <span className="text-[10px] text-[hsl(var(--success))]">已配置</span>
                    )}
                  </div>
                  {hasKey && (
                    <button
                      onClick={() => removeApiKey(provider.id)}
                      disabled={isSaving}
                      className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
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
                    onClick={() => saveApiKey(provider.id)}
                    disabled={!inputValue.trim() || isSaving}
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
              </div>
            )
          })}
        </section>

        <hr className="border-border/30" />

        {/* 默认 Provider 和 Model */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">默认模型</h2>
            <p className="text-xs text-muted-foreground">投喂时使用的 Provider 和模型</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Provider</Label>
              <select
                className="flex h-8 w-full rounded-md border border-border/40 bg-transparent px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring/30"
                value={defaultProvider}
                onChange={(e) => {
                  setDefaultProvider(e.target.value)
                  const providerDef = PROVIDERS.find((p) => p.id === e.target.value)
                  if (providerDef && providerDef.models.length > 0) {
                    setDefaultModel(providerDef.models[0])
                  }
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
              <Label className="text-[11px] text-muted-foreground">Model</Label>
              {modelOptions.length > 0 ? (
                <select
                  className="flex h-8 w-full rounded-md border border-border/40 bg-transparent px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring/30"
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                >
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="__custom__">自定义…</option>
                </select>
              ) : (
                <Input
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  placeholder="模型名称"
                  className="h-8 border-border/40 bg-transparent"
                />
              )}
              {defaultModel === '__custom__' && (
                <Input
                  className="mt-1.5 h-8 border-border/40 bg-transparent"
                  value=""
                  onChange={(e) => setDefaultModel(e.target.value)}
                  placeholder="自定义模型名称"
                  autoFocus
                />
              )}
            </div>
          </div>
          <Button onClick={onSaveGeneral} size="sm" className="h-8">
            保存
          </Button>
        </section>

        <hr className="border-border/30" />

        {/* 功能开关 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">功能</h2>
          <div className="space-y-2.5">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-[13px] font-medium">投喂 AI 抽取</span>
                <p className="text-[11px] text-muted-foreground">投喂内容时自动抽取知识节点</p>
              </div>
              <div className={`relative h-5 w-9 rounded-full transition-colors ${settings.enable_feed_ai ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}>
                <input type="checkbox" checked={!!settings.enable_feed_ai} onChange={(e) => updateSettings({ enable_feed_ai: e.target.checked })} className="sr-only" />
                <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${settings.enable_feed_ai ? 'translate-x-4' : ''}`} />
              </div>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-[13px] font-medium">月度预算上限</span>
                <p className="text-[11px] text-muted-foreground">限制每月 AI 调用费用</p>
              </div>
              <div className={`relative h-5 w-9 rounded-full transition-colors ${settings.enable_monthly_budget ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}>
                <input type="checkbox" checked={!!settings.enable_monthly_budget} onChange={(e) => updateSettings({ enable_monthly_budget: e.target.checked })} className="sr-only" />
                <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${settings.enable_monthly_budget ? 'translate-x-4' : ''}`} />
              </div>
            </label>
          </div>
        </section>

        <hr className="border-border/30" />

        {/* 主动扫描 */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4" />
            <h2 className="text-sm font-semibold text-foreground">主动扫描</h2>
          </div>
          <p className="text-xs text-muted-foreground">AI 定时扫描图谱中的不足之处并生成改进建议</p>

          {/* 开关 */}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-[13px] font-medium">启用主动扫描</span>
              <p className="text-[11px] text-muted-foreground">开启后按 cron 表达式定时扫描</p>
            </div>
            <div className={`relative h-5 w-9 rounded-full transition-colors ${settings.enable_proactive_scan ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}>
              <input type="checkbox" checked={!!settings.enable_proactive_scan} onChange={(e) => updateSettings({ enable_proactive_scan: e.target.checked })} className="sr-only" />
              <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${settings.enable_proactive_scan ? 'translate-x-4' : ''}`} />
            </div>
          </label>

          {/* Cron 表达式 */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Cron 表达式</Label>
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
            <p className="text-[10px] text-muted-foreground">格式：分 时 日 月 周（默认每天凌晨 3 点）</p>
          </div>

          {/* 最大建议数 */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">每次扫描最大建议数</Label>
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
            <Label className="text-[11px] text-muted-foreground">扫描策略</Label>
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
                    <span className="text-[13px] font-medium">{strategy.label}</span>
                    <p className="text-[10px] text-muted-foreground">{strategy.desc}</p>
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
              <p className="text-[11px] text-muted-foreground">最近扫描记录</p>
              <div className="space-y-1">
                {scanRuns.map((run) => (
                  <div key={run.id} className="flex items-center justify-between rounded-md border border-border/30 px-3 py-1.5 text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${run.status === 'done' ? 'bg-[hsl(var(--success))]' : run.status === 'running' ? 'bg-amber-500 animate-pulse' : 'bg-destructive'}`} />
                      <span className="text-muted-foreground">{run.trigger === 'cron' ? '定时' : '手动'}</span>
                      <span className="font-medium">{run.suggestions_count} 条建议</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {run.error_message && (
                        <span className="text-destructive text-[10px]" title={run.error_message}>错误</span>
                      )}
                      <span>{new Date(run.started_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <hr className="border-border/30" />

        {/* AI 用量统计 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">AI 用量统计</h2>
          {costStats ? (
            <div className="space-y-1.5 text-[13px]">
              <p>
                <span className="text-muted-foreground">本月花费：</span>
                <span className="font-medium">${costStats.thisMonthCostUsd.toFixed(4)}</span>
                <span className="text-muted-foreground ml-2">（{costStats.thisMonthCalls} 次调用）</span>
              </p>
              <p>
                <span className="text-muted-foreground">累计花费：</span>
                <span className="font-medium">${costStats.totalCostUsd.toFixed(4)}</span>
                <span className="text-muted-foreground ml-2">（{costStats.totalCalls} 次调用）</span>
              </p>
              {costStats.byProvider.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  <p className="text-[11px] text-muted-foreground">按 Provider 分布：</p>
                  {costStats.byProvider.map((provider) => (
                    <p key={provider.providerId} className="text-[12px] pl-2">
                      <span className="font-medium">{provider.providerId}</span>
                      <span className="text-muted-foreground"> — ${provider.costUsd.toFixed(4)}，{provider.calls} 次</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">加载中…</p>
          )}
        </section>

        <hr className="border-border/30" />

        {/* 风险控制 */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-foreground">风险控制</h2>
          </div>
          {riskData ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">接受率（近 30 天）</span>
                  <span className="font-medium">
                    {riskData.acceptance.accepted}/{riskData.acceptance.total}
                    （{Math.round(riskData.acceptance.rate * 100)}%）
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[hsl(var(--muted))]">
                  <div
                    className={`h-full rounded-full transition-all ${riskData.acceptance.rate < 0.5 ? 'bg-amber-500' : 'bg-[hsl(var(--primary))]'}`}
                    style={{ width: `${Math.round(riskData.acceptance.rate * 100)}%` }}
                  />
                </div>
                {riskData.acceptance.rate < 0.5 && riskData.acceptance.total > 0 && (
                  <p className="flex items-center gap-1 text-[11px] text-amber-500">
                    <AlertTriangle className="h-3 w-3" />
                    接受率低于 50%，建议检查 AI 生成质量或调整配置
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">Inbox 积压</span>
                <span className="font-medium">{riskData.inboxBacklog} 条待处理</span>
              </div>

              {riskData.budget.enabled && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-muted-foreground">本月预算使用</span>
                    <span className="font-medium">
                      ${riskData.budget.currentCostUsd.toFixed(2)} / ${riskData.budget.monthlyBudgetUsd.toFixed(2)}
                      （{Math.round(riskData.budget.usageRate * 100)}%）
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[hsl(var(--muted))]">
                    <div
                      className={`h-full rounded-full transition-all ${riskData.budget.usageRate > 0.8 ? 'bg-destructive' : 'bg-[hsl(var(--primary))]'}`}
                      style={{ width: `${Math.min(100, Math.round(riskData.budget.usageRate * 100))}%` }}
                    />
                  </div>
                </div>
              )}

              {riskData.duplicateNodes.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] text-amber-500">
                    <AlertTriangle className="mr-1 inline h-3 w-3" />
                    检测到 {riskData.duplicateNodes.length} 组可能重复的节点
                  </p>
                  {riskData.duplicateNodes.slice(0, 5).map((pair, index) => (
                    <p key={index} className="text-[11px] text-muted-foreground pl-4">
                      「{pair.titleA}」↔「{pair.titleB}」（相似度 {Math.round(pair.similarity * 100)}%）
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">加载中…</p>
          )}
        </section>

        <hr className="border-border/30" />

        {/* 数据安全 */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <h2 className="text-sm font-semibold text-foreground">数据安全</h2>
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
              <div id="export-menu" className="hidden absolute top-9 left-0 z-10 rounded-md border bg-popover p-1 shadow-md">
                <button
                  className="flex w-full items-center rounded-sm px-3 py-1.5 text-[13px] hover:bg-accent"
                  onClick={() => {
                    api.exportData('json')
                    document.getElementById('export-menu')?.classList.add('hidden')
                    toast.success('正在导出 JSON…')
                  }}
                >
                  JSON 格式
                </button>
                <button
                  className="flex w-full items-center rounded-sm px-3 py-1.5 text-[13px] hover:bg-accent"
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
        </section>

        <hr className="border-border/30" />

        {/* 🛡️ 安全模式 */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold text-foreground">🛡️ 安全模式</h2>
          </div>
          <div className="space-y-2.5 text-[13px]">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">投喂 AI 抽取</span>
              <span className={settings.enable_feed_ai ? 'text-[hsl(var(--success))]' : 'text-muted-foreground'}>
                {settings.enable_feed_ai ? '✓ 开启' : '✗ 关闭'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">主动扫描</span>
              <span className={settings.enable_proactive_scan ? 'text-[hsl(var(--success))]' : 'text-muted-foreground'}>
                {settings.enable_proactive_scan ? '✓ 开启' : '✗ 关闭'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">深度探索</span>
              <span className={settings.enable_deepdive ? 'text-[hsl(var(--success))]' : 'text-muted-foreground'}>
                {settings.enable_deepdive ? '✓ 开启' : '✗ 关闭'}
              </span>
            </div>
          </div>
          {aiKilled ? (
            <div className="rounded-md border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5 px-3 py-2 text-[13px] text-[hsl(var(--success))]">
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
