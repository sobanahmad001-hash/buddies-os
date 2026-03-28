'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Check, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ActionBlock {
  id: string
  type: string
  data: {
    title?: string
    description?: string
    priority?: string
    status?: string
  }
  status: 'pending' | 'approved' | 'rejected'
}

interface ProjectAssistantChatProps {
  projectId: string
  onTaskCreated?: () => void
}

export default function ProjectAssistantChat({ projectId, onTaskCreated }: ProjectAssistantChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [actionBlocks, setActionBlocks] = useState<ActionBlock[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, actionBlocks])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat/project-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMessage }],
          projectId,
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      const assistantMessage = data.message

      setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }])

      // Parse action blocks from the response
      const actionRegex = /\[ACTION\]([\s\S]*?)\[\/ACTION\]/g
      const matches = [...assistantMessage.matchAll(actionRegex)]
      
      if (matches.length > 0) {
        const actions = matches.map((match, index) => {
          try {
            const jsonData = JSON.parse(match[1].trim())
            return {
              id: `${Date.now()}-${index}`,
              type: jsonData.type || 'task',
              data: jsonData,
              status: 'pending' as const,
            }
          } catch (e) {
            console.error('Failed to parse action block:', e)
            return null
          }
        }).filter(Boolean) as ActionBlock[]

        // Append new actions instead of replacing
        setActionBlocks(prev => [...prev, ...actions])
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleApprove = async (actionId: string) => {
    const action = actionBlocks.find(a => a.id === actionId)
    if (!action) return

    try {
      if (action.type === 'task') {
        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            title: action.data.title,
            description: action.data.description,
            priority: action.data.priority || 'medium',
            status: action.data.status || 'todo',
          }),
        })

        if (!response.ok) throw new Error('Failed to create task')

        setActionBlocks(prev =>
          prev.map(a => (a.id === actionId ? { ...a, status: 'approved' } : a))
        )

        onTaskCreated?.()
      }
    } catch (error) {
      console.error('Failed to approve action:', error)
      alert('Failed to create task. Please try again.')
    }
  }

  const handleReject = (actionId: string) => {
    setActionBlocks(prev =>
      prev.map(a => (a.id === actionId ? { ...a, status: 'rejected' } : a))
    )
  }

  const removeContentWithinTags = (content: string) => {
    return content.replace(/\[ACTION\][\s\S]*?\[\/ACTION\]/g, '').trim()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
              <div className="prose dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
                <ReactMarkdown>
                  {removeContentWithinTags(message.content)}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}

        {/* Action Blocks */}
        {actionBlocks.length > 0 && (
          <div className="space-y-3">
            {actionBlocks.map((action) => (
              <div
                key={action.id}
                className={`border rounded-lg p-4 ${
                  action.status === 'approved'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : action.status === 'rejected'
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                      {action.data.title}
                    </h4>
                    {action.data.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {action.data.description}
                      </p>
                    )}
                    <div className="flex gap-2 mt-2">
                      {action.data.priority && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {action.data.priority}
                        </span>
                      )}
                      {action.data.status && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {action.data.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {action.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(action.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                      >
                        <Check className="h-4 w-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(action.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </button>
                    </div>
                  )}

                  {action.status === 'approved' && (
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm font-medium">
                      <Check className="h-4 w-4" />
                      Approved
                    </span>
                  )}

                  {action.status === 'rejected' && (
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-sm font-medium">
                      <X className="h-4 w-4" />
                      Rejected
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
              <Loader2 className="h-5 w-5 animate-spin text-gray-600 dark:text-gray-400" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-gray-800 p-4">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything about this project..."
            className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            rows={3}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="self-end px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
