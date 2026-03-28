'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronRight, ChevronDown, File, Folder, Plus, Trash2, MessageSquare } from 'lucide-react'
import { FileExplorer } from '@/components/coding-agent/file-explorer'
import { CodeViewer } from '@/components/coding-agent/code-viewer'
import { CodingAgentChat } from '@/components/coding-agent/coding-agent-chat'
import { ModelSelector } from '@/components/coding-agent/model-selector'

interface Session {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export default function CodingAgentPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [model, setModel] = useState<'gpt-4o-mini' | 'gpt-4o'>('gpt-4o-mini')
  const chatRef = useRef<{ saveSession: () => Promise<void> }>(null)

  // Load sessions on mount
  useEffect(() => {
    loadSessions()
  }, [])

  // Auto-save current session every 30 seconds
  useEffect(() => {
    if (!currentSessionId) return
    
    const interval = setInterval(() => {
      chatRef.current?.saveSession()
    }, 30000)

    return () => clearInterval(interval)
  }, [currentSessionId])

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/ai-sessions?agent_type=coding_agent')
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions || [])
        
        // If no current session and we have sessions, load the most recent
        if (!currentSessionId && data.sessions?.length > 0) {
          setCurrentSessionId(data.sessions[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to load sessions:', error)
    }
  }

  const createNewSession = async () => {
    try {
      const res = await fetch('/api/ai-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_type: 'coding_agent',
          title: `Coding Session ${new Date().toLocaleString()}`,
          messages: []
        })
      })

      if (res.ok) {
        const newSession = await res.json()
        setSessions(prev => [newSession, ...prev])
        setCurrentSessionId(newSession.id)
      }
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  const deleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/ai-sessions/${sessionId}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId))
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null)
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  const handleFileSelect = async (path: string) => {
    setSelectedFile(path)
    try {
      const res = await fetch('/api/coding-agent/read-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      })
      if (res.ok) {
        const data = await res.json()
        setFileContent(data.content || '')
      }
    } catch (error) {
      console.error('Failed to read file:', error)
    }
  }

  const handleSessionSaved = (sessionId: string) => {
    // Update the session in the list to reflect the latest update time
    loadSessions()
  }

  return (
    <div className="h-screen flex flex-col bg-[#1e1e1e]">
      {/* Top Bar */}
      <div className="h-12 bg-[#2d2d30] border-b border-[#3e3e42] flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-gray-200">Coding Agent</h1>
          <ModelSelector value={model} onChange={setModel} />
        </div>
        <button
          onClick={createNewSession}
          className="flex items-center gap-2 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          <Plus className="w-3 h-3" />
          New Session
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sessions Sidebar */}
        <div className="w-64 bg-[#252526] border-r border-[#3e3e42] flex flex-col">
          <div className="p-3 border-b border-[#3e3e42]">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sessions</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500">
                No sessions yet. Click "New Session" to start.
              </div>
            ) : (
              sessions.map(session => (
                <div
                  key={session.id}
                  onClick={() => setCurrentSessionId(session.id)}
                  className={`group flex items-center justify-between p-3 cursor-pointer hover:bg-[#2d2d30] border-b border-[#3e3e42] ${
                    currentSessionId === session.id ? 'bg-[#37373d]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-200 truncate">{session.title}</div>
                      <div className="text-[10px] text-gray-500">
                        {new Date(session.updated_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSession(session.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-600/20 rounded"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* File Explorer */}
        <div className="w-64 bg-[#252526] border-r border-[#3e3e42]">
          <FileExplorer onFileSelect={handleFileSelect} />
        </div>

        {/* Code Viewer */}
        <div className="flex-1 bg-[#1e1e1e]">
          <CodeViewer
            filePath={selectedFile}
            content={fileContent}
          />
        </div>

        {/* Chat Panel */}
        <div className="w-96 bg-[#252526] border-l border-[#3e3e42] flex flex-col">
          <CodingAgentChat
            ref={chatRef}
            sessionId={currentSessionId}
            selectedFile={selectedFile}
            model={model}
            onSessionSaved={handleSessionSaved}
          />
        </div>
      </div>
    </div>
  )
}
