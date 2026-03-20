'use client'

import { useState, useRef, useEffect } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Loader2, Check, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ActionBlock {
  id: string
  type: string
  title: string
  description: string
  status: 'pending' | 'approved' | 'rejected'
}

interface ProjectAssistantChatProps {
  projectId: string
  onTaskCreated?: () => void
}

export function ProjectAssistantChat({ projectId, onTaskCreated }: ProjectAssistantChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [actionBlocks, setActionBlocks] = useState<ActionBlock[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const parseActionBlocks = (content: string): ActionBlock[] => {
    const actionRegex = /\[ACTION\]\s*type="([^"]+)"\s*title="([^"]+)"\s*description="([^"]+)"\s*\[\/ACTION\]/g
    const actions: ActionBlock[] = []
    let match

    while ((match = actionRegex.exec(content)) !== null) {
      actions.push({
        id: `action-${Date.now()}-${Math.random()}`,
        type: match[1],
        title: match[2],
        description: match[3],
        status: 'pending'
      })
    }

    return actions
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          projectId
        })
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])

      // Parse and append action blocks
      const actions = parseActionBlocks(data.message)
      if (actions.length > 0) {
        setActionBlocks(prev => [...prev, ...actions])
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleActionApprove = async (actionId: string) => {
    const action = actionBlocks.find(a => a.id === actionId)
    if (!action) return

    setActionBlocks(prev =>
      prev.map(a => a.id === actionId ? { ...a, status: 'approved' as const } : a)
    )

    try {
      if (action.type === 'create_task') {
        await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            title: action.title,
            description: action.description,
            status: 'todo',
            priority: 'medium'
          })
        })
        onTaskCreated?.()
      }
    } catch (error) {
      console.error('Action execution error:', error)
      setActionBlocks(prev =>
        prev.map(a => a.id === actionId ? { ...a, status: 'pending' as const } : a)
      )
    }
  }

  const handleActionReject = (actionId: string) => {
    setActionBlocks(prev =>
      prev.map(a => a.id === actionId ? { ...a, status: 'rejected' as const } : a)
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                }`}
              >
                <ReactMarkdown
                  className="prose prose-sm dark:prose-invert max-w-none"
                  components={{
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '')
                      return !inline && match ? (
                        <SyntaxHighlighter
                          style={vscDarkPlus}
                          language={match[1]}
                          PreTag="div"
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      )
                    }
                  }}
                >
                  {message.content.replace(/\[ACTION\].*?\[\/ACTION\]/gs, '')}
                </ReactMarkdown>
              </div>
            </div>
          ))}

          {actionBlocks.length > 0 && (
            <div className="space-y-3">
              {actionBlocks.map((action) => (
                <div
                  key={action.id}
                  className={`rounded-lg border-2 p-4 transition-all ${
                    action.status === 'approved'
                      ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                      : action.status === 'rejected'
                      ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                      : 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                          {action.title}
                        </h4>
                        {action.status !== 'pending' && (
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              action.status === 'approved'
                                ? 'bg-green-500 text-white'
                                : 'bg-red-500 text-white'
                            }`}
                          >
                            {action.status === 'approved' ? 'Approved' : 'Rejected'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {action.description}
                      </p>
                    </div>
                    {action.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleActionApprove(action.id)}
                          className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                          title="Approve"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleActionReject(action.id)}
                          className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                          title="Reject"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything about this project..."
            className="min-h-[60px] max-h-[200px] resize-none"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-md transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}