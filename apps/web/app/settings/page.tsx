'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettingsStore } from '@/lib/store/settings-store'
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

export default function SettingsPage() {
  const { settings, loading, loadSettings, updateSettings } = useSettingsStore()
  const [defaultProvider, setDefaultProvider] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({})

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => {
    if (settings) {
      setDefaultProvider((settings.default_provider as string) ?? '')
      setDefaultModel((settings.default_model as string) ?? '')
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

  const onSaveGeneral = async () => {
    try {
      await updateSettings({ default_provider: defaultProvider, default_model: defaultModel })
      toast.success('设置已保存')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    }
  }

  if (loading || !settings) return <><NavBar /><div className="ml-16 p-6 text-center text-muted-foreground">加载中…</div></>

  return (
    <>
      <NavBar />
      <div className="ml-16 mx-auto max-w-2xl space-y-6 px-8 py-8 animate-fade-in">
        <div className="mb-2">
          <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理 AI 服务、模型和系统偏好</p>
        </div>

        {/* Provider API Key 配置 */}
        <section className="rounded-xl border border-border/60 bg-[hsl(var(--card))] p-5 animate-slide-up">
          <div className="mb-4">
            <h2 className="text-base font-semibold">大模型 API Key</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">至少配置一个 Provider 才能使用 AI 功能</p>
          </div>

          <div className="divide-y divide-border/40">
            {PROVIDERS.map((provider) => {
              const cred = maskedCredentials[provider.id]
              const hasKey = cred?.has_key ?? false
              const inputValue = apiKeys[provider.id] ?? ''
              const isVisible = visibleKeys[provider.id] ?? false
              const isSaving = savingKeys[provider.id] ?? false

              return (
                <div key={provider.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{provider.label}</span>
                      {hasKey && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--success))]/15 px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--success))]">
                          <Check className="h-3 w-3" /> 已配置
                        </span>
                      )}
                    </div>
                    {hasKey && (
                      <button
                        onClick={() => removeApiKey(provider.id)}
                        disabled={isSaving}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
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
                        className="h-9 bg-[hsl(var(--muted))]/50 border-border/40 pr-9 text-sm placeholder:text-muted-foreground/50"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility(provider.id)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                      >
                        {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => saveApiKey(provider.id)}
                      disabled={!inputValue.trim() || isSaving}
                      className="h-9 px-4 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90"
                    >
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '保存'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* 默认 Provider 和 Model */}
        <section className="rounded-xl border border-border/60 bg-[hsl(var(--card))] p-5 animate-slide-up" style={{ animationDelay: '50ms' }}>
          <div className="mb-4">
            <h2 className="text-base font-semibold">默认大模型</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">投喂时 AI 抽取使用的 Provider 和模型</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Provider</Label>
              <select
                className="flex h-9 w-full rounded-lg border border-border/40 bg-[hsl(var(--muted))]/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40 transition-shadow"
                value={defaultProvider}
                onChange={(e) => {
                  setDefaultProvider(e.target.value)
                  const providerDef = PROVIDERS.find((p) => p.id === e.target.value)
                  if (providerDef && providerDef.models.length > 0) {
                    setDefaultModel(providerDef.models[0])
                  }
                }}
              >
                <option value="">选择 Provider</option>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id} disabled={!configuredProviders.includes(p.id)}>
                    {p.label} {configuredProviders.includes(p.id) ? '✓' : '(未配置)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Model</Label>
              {modelOptions.length > 0 ? (
                <select
                  className="flex h-9 w-full rounded-lg border border-border/40 bg-[hsl(var(--muted))]/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40 transition-shadow"
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
                  placeholder="输入模型名称"
                  className="h-9 bg-[hsl(var(--muted))]/50 border-border/40"
                />
              )}
              {defaultModel === '__custom__' && (
                <Input
                  className="mt-2 h-9 bg-[hsl(var(--muted))]/50 border-border/40"
                  value=""
                  onChange={(e) => setDefaultModel(e.target.value)}
                  placeholder="输入自定义模型名称"
                  autoFocus
                />
              )}
            </div>
          </div>
          <Button onClick={onSaveGeneral} size="sm" className="mt-4 h-9 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90">
            保存
          </Button>
        </section>

        {/* AI 开关 */}
        <section className="rounded-xl border border-border/60 bg-[hsl(var(--card))] p-5 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <div className="mb-4">
            <h2 className="text-base font-semibold">功能开关</h2>
          </div>
          <div className="space-y-3">
            <label className="flex items-center justify-between rounded-lg px-1 py-1 cursor-pointer group">
              <div>
                <span className="text-sm font-medium">投喂 AI 抽取</span>
                <p className="text-xs text-muted-foreground">投喂内容时自动使用 AI 抽取知识节点</p>
              </div>
              <div className={`relative h-5 w-9 rounded-full transition-colors ${settings.enable_feed_ai ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}>
                <input type="checkbox" checked={!!settings.enable_feed_ai} onChange={(e) => updateSettings({ enable_feed_ai: e.target.checked })} className="sr-only" />
                <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${settings.enable_feed_ai ? 'translate-x-4' : ''}`} />
              </div>
            </label>
            <label className="flex items-center justify-between rounded-lg px-1 py-1 cursor-pointer group">
              <div>
                <span className="text-sm font-medium">月度预算上限</span>
                <p className="text-xs text-muted-foreground">限制每月 AI 调用费用不超过预算</p>
              </div>
              <div className={`relative h-5 w-9 rounded-full transition-colors ${settings.enable_monthly_budget ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}>
                <input type="checkbox" checked={!!settings.enable_monthly_budget} onChange={(e) => updateSettings({ enable_monthly_budget: e.target.checked })} className="sr-only" />
                <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${settings.enable_monthly_budget ? 'translate-x-4' : ''}`} />
              </div>
            </label>
          </div>
        </section>
      </div>
    </>
  )
}
