import { useCallback, useRef, useState } from 'react'

const SCROLL_THRESHOLD = 60

export function useAutoScroll() {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowScrollButton(false)
  }, [])

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    isAtBottomRef.current = distanceFromBottom < SCROLL_THRESHOLD
    setShowScrollButton(distanceFromBottom > SCROLL_THRESHOLD)
  }, [])

  const scrollToBottomIfNeeded = useCallback(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  return {
    scrollContainerRef,
    messagesEndRef,
    showScrollButton,
    scrollToBottom,
    handleScroll,
    scrollToBottomIfNeeded,
  }
}
