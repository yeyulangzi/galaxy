'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Inbox, Settings, Network, MessageCircle } from 'lucide-react'
import { useInboxStore } from '@/lib/store/inbox-store'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'

const GlobalChatDialog = dynamic(
  () => import('./global-chat-dialog').then((m) => m.GlobalChatDialog),
  { ssr: false },
)

export function NavBar() {
  const pathname = usePathname()
  const { total, loadInbox } = useInboxStore()
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    loadInbox({ status: 'pending', limit: '1' })
  }, [loadInbox])

  const navItems = [
    { href: '/', label: '图谱', icon: Network },
    { href: '/inbox', label: '待审', icon: Inbox, badge: total },
    { href: '/settings', label: '设置', icon: Settings },
  ]

  return (
    <header className="sticky top-0 z-40 flex h-[64px] items-center justify-between clay-surface px-6">
      <div className="flex items-center gap-8">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-[28px] tracking-[-0.5px]" style={{ color: 'var(--clay-ink)', fontFamily: "'Cormorant Garamond', 'EB Garamond', serif", fontWeight: 400 }}>
            Galaxy
          </span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-2.5 text-[15px] font-medium transition-all duration-200',
                  isActive
                    ? 'text-[var(--clay-ink)] bg-[var(--clay-surface-card)] rounded-[var(--radius-md)]'
                    : 'text-[var(--clay-muted)] hover:text-[var(--clay-ink)]',
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
                {item.badge && item.badge > 0 ? (
                  <span className="ml-1 inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1 text-[12px] font-semibold" style={{ background: 'var(--clay-coral)', color: 'var(--clay-on-primary)' }}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </nav>
      </div>
      <button
        onClick={() => setChatOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 text-[15px] font-medium transition-all duration-200 text-[var(--clay-muted)] hover:text-[var(--clay-ink)]"
      >
        <MessageCircle className="h-[18px] w-[18px]" />
        AI 对话
      </button>
      <GlobalChatDialog open={chatOpen} onOpenChange={setChatOpen} />
    </header>
  )
}
