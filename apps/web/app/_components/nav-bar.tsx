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
    <nav className="flex items-center gap-1 border-b px-4 py-2">
      <Link href="/" className="mr-4 text-lg font-semibold">Galaxy</Link>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted',
            pathname === item.href && 'bg-muted text-foreground',
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
          {item.badge && item.badge > 0 ? (
            <span className={cn(
              'ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white',
              item.badge > 50 ? 'bg-red-500' : 'bg-blue-500',
            )}>
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  )
}
