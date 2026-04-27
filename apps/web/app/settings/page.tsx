'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettingsStore } from '@/lib/store/settings-store'
import { NavBar } from '../_components/nav-bar'

export default function SettingsPage() {
  const { settings, loading, loadSettings, updateSettings } = useSettingsStore()
  const [defaultProvider, setDefaultProvider] = useState('')
  const [defaultModel, setDefaultModel] = useState('')

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => {
    if (settings) {
      setDefaultProvider((settings.default_provider as string) ?? '')
      setDefaultModel((settings.default_model as string) ?? '')
    }
  }, [settings])

  const onSave = async () => {
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

        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">AI Provider 配置</h2>
          <p className="text-sm text-muted-foreground">
            API Key 通过 .env 文件配置（OPENAI_API_KEY, ANTHROPIC_API_KEY, DASHSCOPE_API_KEY, ARK_API_KEY, DEEPSEEK_API_KEY）。
            {settings.configured_providers && (
              <span className="ml-1 font-medium text-green-600">
                已配置: {(settings.configured_providers as string[]).join(', ') || '无'}
              </span>
            )}
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>默认 Provider</Label>
              <Input value={defaultProvider} onChange={(e) => setDefaultProvider(e.target.value)} placeholder="openai" />
            </div>
            <div className="space-y-1">
              <Label>默认 Model</Label>
              <Input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder="gpt-4o-mini" />
            </div>
          </div>
        </section>

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

        <Button onClick={onSave}>保存设置</Button>
      </div>
    </>
  )
}
