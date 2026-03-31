'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Loader2, Check, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import ReactMarkdown from 'react-markdown'
import { createTaskAction } from '@/lib/actions/task-actions'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ActionBlock {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  status: 'pending' | 'approved' | 'rejected'
  taskId?: string
}

interface ProjectAssistantChatProps {
  projectId: string
  projectName: string
}

export function ProjectAssistantChat({ projectId, projectName }: ProjectAssistantChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [actionBlocks, setActionBlocks] = useState<ActionBlock[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, actionBlocks])

  const parseActionBlocks = (content: string): { cleanContent: string; actions: ActionBlock[] } => {
    const actionRegex = /\[ACTION\]([\s\S]*?)\[\/ACTION\]/g
    const actions: ActionBlock[] = []
    let match
    let cleanContent = content

    while ((match = actionRegex.exec(content)) !== null) {
      try {
        const actionData = JSON.parse(match[1].trim())
        actions.push({
          id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: actionData.title || 'Untitled Task',
          description: actionData.description || '',
          priority: actionData.priority || 'medium',
          status: 'pending'
        })
      } catch (e) {
        console.error('Failed to parse action block:', e)
      }
    }

    // Remove action blocks from content
    cleanContent = cleanContent.replace(actionRegex, '').trim()

    return { cleanContent, actions }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/ai/project-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
          projectId,
          projectName
        })
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()
      const { cleanContent, actions } = parseActionBlocks(data.content)

      const assistantMessage: Message = {
        role: 'assistant',
        content: cleanContent,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])
      
      // Append new actions to existing ones (don't replace)
      if (actions.length > 0) {
        setActionBlocks(prev => [...prev, ...actions])
      }
    } catch (error) {
      console.error('Error:', error)
      toast({
        title: 'Error',
        description: 'Failed to get response from assistant',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleActionApproval = async (actionId: string, approve: boolean) => {
    const action = actionBlocks.find(a => a.id === actionId)
    if (!action) return

    if (approve) {
      try {
        // Create the task
        const result = await createTaskAction({
          projectId,
          title: action.title,
          description: action.description,
          priority: action.priority,
          status: 'todo'
        })

        if (result.success && result.task) {
          // Update action block status
          setActionBlocks(prev =>
            prev.map(a =>
              a.id === actionId
                ? { ...a, status: 'approved', taskId: result.task!.id }
                : a
            )
          )

          toast({
            title: 'Task Created',
            description: `"${action.title}" has been added to your Work tab`
          })
        } else {
          throw new Error(result.error || 'Failed to create task')
        }
      } catch (error) {
        console.error('Error creating task:', error)
        toast({
          title: 'Error',
          description: 'Failed to create task',
          variant: 'destructive'
        })
      }
    } else {
      // Reject the action
      setActionBlocks(prev =>
        prev.map(a =>
          a.id === actionId ? { ...a, status: 'rejected' } : a
        )
      )

      toast({
        title: 'Task Rejected',
        description: `"${action.title}" has been dismissed`
      })
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-lg font-medium mb-2">Project Assistant for {projectName}</p>
              <p className="text-sm">Ask me to create tasks, analyze your project, or suggest improvements.</p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`rounded-lg px-4 py-2 max-w-[80%] ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}

          {/* Action Blocks - Render all at once */}
          {actionBlocks.length > 0 && (
            <div className="space-y-3">
              {actionBlocks.map((action) => (
                <div
                  key={action.id}
                  className={`rounded-lg border p-4 transition-all ${
                    action.status === 'approved'
                      ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                      : action.status === 'rejected'
                      ? 'border-red-500 bg-red-50 dark:bg-red-950/20 opacity-50'
                      : 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{action.title}</h4>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            action.priority === 'high'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                              : action.priority === 'medium'
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                          }`}
                        >
                          {action.priority}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{action.description}</p>
                    </div>

                    {action.status === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleActionApproval(action.id, true)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleActionApproval(action.id, false)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}

                    {action.status === 'approved' && (
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <Check className="h-5 w-5" />
                        <span className="text-sm font-medium">Approved</span>
                      </div>
                    )}

                    {action.status === 'rejected' && (
                      <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <X className="h-5 w-5" />
                        <span className="text-sm font-medium">Rejected</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-lg px-4 py-2 bg-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-3xl mx-auto">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me to create tasks or analyze your project..."
            className="min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
          />
          <Button type="submit" disabled={!input.trim() || isLoading} size="icon" className="h-[60px] w-[60px]">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
