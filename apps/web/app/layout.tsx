import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Galaxy',
  description: '个人立体知识库',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased selection:bg-primary/20">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
