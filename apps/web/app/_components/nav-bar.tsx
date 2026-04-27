'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { Inbox, Settings, Network, Sparkles } from 'lucide-react'
import { useInboxStore } from '@/lib/store/inbox-store'
import { cn } from '@/lib/utils'

export function NavBar() {
  const pathname = usePathname()
  const { total, loadInbox } = useInboxStore()

  useEffect(() => {
    loadInbox({ status: 'pending', limit: '1' })
  }, [loadInbox])

  const navItems = [
    { href: '/', label: '图谱', icon: Network },
    { href: '/inbox', label: '待审', icon: Inbox, badge: total },
    { href: '/settings', label: '设置', icon: Settings },
  ]

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-16 flex-col items-center border-r border-border/60 bg-[hsl(var(--sidebar))] py-5 transition-all hover:w-44 group/sidebar">
      {/* Brand */}
      <Link href="/" className="mb-8 flex items-center gap-2.5 px-3">
        <Sparkles className="h-6 w-6 shrink-0 text-[hsl(var(--primary))]" />
        <span className="text-gradient overflow-hidden whitespace-nowrap text-lg font-bold opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
          Galaxy
        </span>
      </Link>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-1 w-full px-2">
        {navItems.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                'text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--accent))] hover:text-foreground',
                isActive && 'bg-[hsl(var(--accent))] text-foreground shadow-sm',
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[hsl(var(--sidebar-active))]" />
              )}
              <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-[hsl(var(--sidebar-active))]')} />
              <span className="overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
                {item.label}
              </span>
              {item.badge && item.badge > 0 ? (
                <span className={cn(
                  'absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover/sidebar:opacity-100',
                  item.badge > 50 ? 'bg-red-500' : 'bg-[hsl(var(--primary))]',
                )}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
