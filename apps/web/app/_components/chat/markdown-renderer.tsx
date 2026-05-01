'use client'

import Markdown from 'react-markdown'

const PROSE_CLASSES = [
  'prose prose-sm prose-stone dark:prose-invert max-w-none',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_pre]:bg-black/5 [&_pre]:rounded-md [&_pre]:p-3',
  '[&_code]:text-xs [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5',
  '[&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm',
  '[&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium',
  '[&_h1]:mt-3 [&_h2]:mt-2 [&_h3]:mt-2',
  '[&_blockquote]:border-l-2 [&_blockquote]:pl-3',
  '[&_blockquote]:italic [&_blockquote]:text-[var(--clay-muted)]',
].join(' ')

interface MarkdownRendererProps {
  content: string
  streaming?: boolean
  className?: string
}

export function MarkdownRenderer({ content, streaming, className }: MarkdownRendererProps) {
  return (
    <>
      <div className={`${PROSE_CLASSES} ${className ?? ''}`}>
        <Markdown>{content}</Markdown>
      </div>
      {streaming && (
        <>
          <span className="inline-block w-[2px] h-[14px] ml-0.5 align-middle animate-cursor-blink" style={{ background: 'var(--clay-muted)' }} />
          <style>{`@keyframes cursor-blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } } .animate-cursor-blink { animation: cursor-blink 1s step-end infinite; }`}</style>
        </>
      )}
    </>
  )
}
