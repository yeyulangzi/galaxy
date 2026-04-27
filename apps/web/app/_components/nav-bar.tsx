'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { Inbox, Settings, Network } from 'lucide-react'
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
    <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-border/50 bg-background/95 px-5">
      <div className="flex items-center gap-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <span className="font-['Noto_Serif_Display'] text-base font-semibold tracking-tight text-foreground">
            Galaxy
          </span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-0.5">
          {navItems.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                  'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                  isActive && 'text-foreground',
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
                {isActive && (
                  <span className="absolute -bottom-[7px] left-3 right-3 h-[2px] rounded-full bg-[hsl(var(--primary))]" />
                )}
                {item.badge && item.badge > 0 ? (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(var(--primary))] px-1 text-[10px] font-semibold text-[hsl(var(--primary-foreground))]">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
