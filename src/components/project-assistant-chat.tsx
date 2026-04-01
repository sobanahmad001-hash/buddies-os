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
  params: Record<string, any>
  status: 'pending' | 'approved' | 'rejected'
}

interface ProjectAssistantChatProps {
  projectId: string
}

export function ProjectAssistantChat({ projectId }: ProjectAssistantChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [actionBlocks, setActionBlocks] = useState<ActionBlock[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, actionBlocks])

  const parseActionBlocks = (content: string): ActionBlock[] => {
    const actionRegex = /\[ACTION\]([\s\S]*?)\[\/ACTION\]/g
    const actions: ActionBlock[] = []
    let match

    while ((match = actionRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim())
        actions.push({
          id: `action-${Date.now()}-${Math.random()}`,
          type: parsed.type || 'unknown',
          params: parsed.params || parsed,
          status: 'pending'
        })
      } catch (e) {
        console.error('Failed to parse action block:', e)
      }
    }

    return actions
  }

  const handleSendMessage = async () => {
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
          projectId
        })
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      const assistantMessage: Message = { role: 'assistant', content: data.message }
      
      setMessages(prev => [...prev, assistantMessage])
      
      // Parse and append action blocks
      const actions = parseActionBlocks(data.message)
      if (actions.length > 0) {
        setActionBlocks(prev => [...prev, ...actions])
      }
    } catch (error) {
      console.error('Error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleApproveAction = async (actionId: string) => {
    const action = actionBlocks.find(a => a.id === actionId)
    if (!action) return

    setActionBlocks(prev =>
      prev.map(a => a.id === actionId ? { ...a, status: 'approved' as const } : a)
    )

    try {
      // Handle different action types
      if (action.type === 'create_task') {
        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...action.params,
            projectId,
            status: 'todo'
          })
        })

        if (!response.ok) {
          throw new Error('Failed to create task')
        }
      }
      // Add more action type handlers as needed
    } catch (error) {
      console.error('Failed to execute action:', error)
      setActionBlocks(prev =>
        prev.map(a => a.id === actionId ? { ...a, status: 'pending' as const } : a)
      )
    }
  }

  const handleRejectAction = (actionId: string) => {
    setActionBlocks(prev =>
      prev.map(a => a.id === actionId ? { ...a, status: 'rejected' as const } : a)
    )
  }

  const removeContentWithinTags = (content: string) => {
    return content.replace(/\[ACTION\][\s\S]*?\[\/ACTION\]/g, '').trim()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              }`}
            >
              <ReactMarkdown className="prose dark:prose-invert max-w-none">
                {removeContentWithinTags(message.content)}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {actionBlocks.length > 0 && (
          <div className="space-y-3">
            {actionBlocks.map(action => (
              <div
                key={action.id}
                className={`border rounded-lg p-4 ${
                  action.status === 'approved'
                    ? 'border-green-500 bg-green-50 dark:bg-green-950'
                    : action.status === 'rejected'
                    ? 'border-red-500 bg-red-50 dark:bg-red-950'
                    : 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm mb-2">
                      {action.type === 'create_task' ? '📋 Create Task' : action.type}
                    </h4>
                    <div className="text-sm space-y-1">
                      {Object.entries(action.params).map(([key, value]) => (
                        <div key={key}>
                          <span className="font-medium">{key}:</span>{' '}
                          <span className="text-gray-700 dark:text-gray-300">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {action.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApproveAction(action.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm font-medium"
                        >
                          <Check className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectAction(action.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm font-medium"
                        >
                          <X className="w-4 h-4" />
                          Reject
                        </button>
                      </>
                    )}
                    {action.status === 'approved' && (
                      <span className="px-3 py-1.5 bg-green-500 text-white rounded text-sm font-medium flex items-center gap-1">
                        <Check className="w-4 h-4" />
                        Approved
                      </span>
                    )}
                    {action.status === 'rejected' && (
                      <span className="px-3 py-1.5 bg-red-500 text-white rounded text-sm font-medium flex items-center gap-1">
                        <X className="w-4 h-4" />
                        Rejected
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            placeholder="Ask me anything about your project..."
            className="flex-1 min-h-[60px] p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
