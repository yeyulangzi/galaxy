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

  if (loading || !settings) return <><NavBar /><div className="p-6 text-center text-muted-foreground">加载中…</div></>

  return (
    <>
      <NavBar />
      <div className="mx-auto max-w-2xl space-y-8 p-6">
        <h1 className="text-2xl font-bold">⚙️ 设置</h1>

        {/* Provider API Key 配置 */}
        <section className="space-y-4 rounded-lg border p-4">
          <div>
            <h2 className="text-lg font-semibold">大模型 API Key</h2>
            <p className="text-sm text-muted-foreground">配置各 Provider 的 API Key，至少配置一个才能使用 AI 功能。</p>
          </div>

          <div className="space-y-3">
            {PROVIDERS.map((provider) => {
              const cred = maskedCredentials[provider.id]
              const hasKey = cred?.has_key ?? false
              const inputValue = apiKeys[provider.id] ?? ''
              const isVisible = visibleKeys[provider.id] ?? false
              const isSaving = savingKeys[provider.id] ?? false

              return (
                <div key={provider.id} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label className="min-w-[120px] font-medium">{provider.label}</Label>
                    {hasKey && (
                      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        <Check className="h-3 w-3" /> 已配置
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={isVisible ? 'text' : 'password'}
                        value={inputValue}
                        onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                        placeholder={hasKey ? `当前: ${cred!.masked_key}  (输入新值可覆盖)` : provider.placeholder}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility(provider.id)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => saveApiKey(provider.id)}
                      disabled={!inputValue.trim() || isSaving}
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}
                    </Button>
                    {hasKey && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeApiKey(provider.id)}
                        disabled={isSaving}
                        className="text-red-600 hover:text-red-700"
                      >
                        移除
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* 默认 Provider 和 Model */}
        <section className="space-y-4 rounded-lg border p-4">
          <div>
            <h2 className="text-lg font-semibold">默认大模型</h2>
            <p className="text-sm text-muted-foreground">选择投喂 AI 抽取使用的默认 Provider 和模型。</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={defaultProvider}
                onChange={(e) => {
                  setDefaultProvider(e.target.value)
                  // 切换 provider 时自动设置该 provider 的第一个推荐模型
                  const providerDef = PROVIDERS.find((p) => p.id === e.target.value)
                  if (providerDef && providerDef.models.length > 0) {
                    setDefaultModel(providerDef.models[0])
                  }
                }}
              >
                <option value="">请选择 Provider</option>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id} disabled={!configuredProviders.includes(p.id)}>
                    {p.label} {configuredProviders.includes(p.id) ? '✓' : '(未配置)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              {modelOptions.length > 0 ? (
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                />
              )}
              {defaultModel === '__custom__' && (
                <Input
                  className="mt-2"
                  value=""
                  onChange={(e) => setDefaultModel(e.target.value)}
                  placeholder="输入自定义模型名称"
                  autoFocus
                />
              )}
            </div>
          </div>
          <Button onClick={onSaveGeneral} size="sm">保存默认模型</Button>
        </section>

        {/* AI 开关 */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">AI 开关</h2>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!settings.enable_feed_ai} onChange={(e) => updateSettings({ enable_feed_ai: e.target.checked })} />
              启用投喂 AI 抽取
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!settings.enable_monthly_budget} onChange={(e) => updateSettings({ enable_monthly_budget: e.target.checked })} />
              启用月度预算上限
            </label>
          </div>
        </section>
      </div>
    </>
  )
}
