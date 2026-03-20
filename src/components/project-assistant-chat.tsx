'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Check, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { createTask } from '@/lib/actions/task-actions'

interface Message {
  role: 'user' | 'assistant'
  content: string
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
  teamId: string
  initialMessages?: Message[]
}

export default function ProjectAssistantChat({
  projectId,
  teamId,
  initialMessages = [],
}: ProjectAssistantChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [actionBlocks, setActionBlocks] = useState<ActionBlock[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, actionBlocks])

  const parseActionBlocks = (content: string): ActionBlock[] => {
    const actionRegex = /\[ACTION\]\s*({[^}]+})\s*\[\/ACTION\]/g
    const matches = [...content.matchAll(actionRegex)]
    
    return matches.map((match, index) => {
      try {
        const data = JSON.parse(match[1])
        return {
          id: `${Date.now()}-${index}`,
          type: data.type || 'task',
          title: data.title || 'Untitled Action',
          description: data.description || '',
          status: 'pending' as const,
        }
      } catch (e) {
        return {
          id: `${Date.now()}-${index}`,
          type: 'task',
          title: 'Invalid Action',
          description: 'Failed to parse action block',
          status: 'pending' as const,
        }
      }
    })
  }

  const handleApprove = async (actionId: string) => {
    const action = actionBlocks.find(a => a.id === actionId)
    if (!action) return

    setActionBlocks(prev =>
      prev.map(a => (a.id === actionId ? { ...a, status: 'approved' as const } : a))
    )

    if (action.type === 'task') {
      await createTask({
        title: action.title,
        description: action.description,
        projectId,
        teamId,
        status: 'todo',
        priority: 'medium',
      })
    }
  }

  const handleReject = (actionId: string) => {
    setActionBlocks(prev =>
      prev.map(a => (a.id === actionId ? { ...a, status: 'rejected' as const } : a))
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/ai/project-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          projectId,
          teamId,
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
      }

      setMessages(prev => [...prev, assistantMessage])

      const actions = parseActionBlocks(data.message)
      if (actions.length > 0) {
        setActionBlocks(prev => [...prev, ...actions])
      }
    } catch (error) {
      console.error('Error:', error)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              }`}
            >
              {message.role === 'assistant' ? (
                <div className="prose dark:prose-invert max-w-none">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Action Blocks */}
        {actionBlocks.length > 0 && (
          <div className="space-y-3">
            {actionBlocks.map(action => (
              <div
                key={action.id}
                className={`border rounded-lg p-4 ${
                  action.status === 'approved'
                    ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                    : action.status === 'rejected'
                    ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                    : 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                      {action.title}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {action.description}
                    </p>
                  </div>
                  {action.status === 'approved' && (
                    <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                      Approved
                    </span>
                  )}
                  {action.status === 'rejected' && (
                    <span className="px-2 py-1 text-xs font-medium bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded">
                      Rejected
                    </span>
                  )}
                </div>
                {action.status === 'pending' && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleApprove(action.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(action.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
              <Loader2 className="w-5 h-5 animate-spin text-gray-600 dark:text-gray-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-4 border-t dark:border-gray-800">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            placeholder="Ask the project assistant..."
            className="flex-1 min-h-[80px] px-3 py-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
