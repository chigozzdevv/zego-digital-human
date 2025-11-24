import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { DigitalHuman } from './DigitalHuman'
import { ChatPanel } from './ChatPanel'
import { Button } from '../UI/Button'
import { useInterview } from '../../hooks/useInterview'
import { PhoneOff, Clock } from 'lucide-react'
import type { Message } from '../../types'

export interface InterviewSummary {
  duration: string
  questionsCount: number
  responsesCount: number
  messages: Message[]
}

interface InterviewRoomProps {
  onComplete: (data: InterviewSummary) => void
}

export const InterviewRoom = ({ onComplete }: InterviewRoomProps) => {
  const [currentTime, setCurrentTime] = useState(Date.now())

  const {
    messages,
    isLoading,
    isConnected,
    isRecording,
    error,
    agentStatus,
    questionsAsked,
    isInterviewComplete,
    startTime,
    startInterview,
    endInterview
  } = useInterview()

  useEffect(() => {
    void startInterview()
  }, [])

  useEffect(() => {
    if (!isConnected) return
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [isConnected])

  useEffect(() => {
    if (!isInterviewComplete || !startTime) return

    const duration = Math.floor((Date.now() - startTime) / 1000)
    const interviewData = {
      duration: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`,
      questionsCount: messages.filter(m => m.sender === 'ai').length,
      responsesCount: messages.filter(m => m.sender === 'user').length,
      messages
    }
    onComplete(interviewData)
  }, [isInterviewComplete, startTime, questionsAsked, messages, onComplete])

  const formatDuration = useCallback((current: number) => {
    if (!startTime) return '0:00'
    const seconds = Math.floor((current - startTime) / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [startTime])

  const statusDisplay = useMemo(() => {
    if (isInterviewComplete) {
      return { text: 'Interview completed', color: 'text-emerald-500' }
    }

    if (isLoading && !isConnected) {
      return { text: 'Connecting...', color: 'text-blue-500' }
    }

    if (isLoading && isConnected) {
      return { text: 'Ending interview...', color: 'text-slate-400' }
    }

    if (!isConnected) {
      return { text: 'Connecting...', color: 'text-blue-500' }
    }

    const statusMap = {
      listening: { text: 'Listening...', color: 'text-emerald-500' },
      thinking: { text: 'Thinking...', color: 'text-blue-500' },
      speaking: { text: 'Speaking...', color: 'text-violet-500' },
      idle: { text: 'Ready', color: 'text-slate-400' }
    }

    return statusMap[agentStatus]
  }, [isConnected, isInterviewComplete, agentStatus, isLoading])

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-800"
      >
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-white">AI Interview</h1>
              <p className={`text-sm font-medium ${statusDisplay.color}`}>
                {statusDisplay.text}
              </p>
              {error && (
                <p className="text-xs text-red-400 mt-1">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center space-x-4">
              {isConnected && (
                <>
                  <div className="flex items-center space-x-2 text-sm text-slate-400">
                    <Clock className="w-4 h-4" />
                    <span className="tabular-nums">{formatDuration(currentTime)}</span>
                  </div>

                  {isRecording && (
                    <div className="px-3 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-semibold text-emerald-300">Mic On / Listening</span>
                    </div>
                  )}

                  <div className="px-3 py-1 bg-blue-500/10 rounded-full">
                    <span className="text-xs font-semibold text-blue-400">
                      Q{questionsAsked}
                    </span>
                  </div>

                  <Button
                    onClick={endInterview}
                    variant="secondary"
                    size="sm"
                    disabled={isLoading}
                    className="bg-slate-800 hover:bg-red-500/10 text-slate-300 hover:text-red-400 border-slate-700"
                  >
                    <PhoneOff className="w-4 h-4 mr-2" />
                    End
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        <div className="w-full lg:w-1/2 relative flex flex-col min-h-0">
          <DigitalHuman
            isConnected={isConnected}
            agentStatus={agentStatus}
            currentQuestion=""
          />
        </div>

        <div className="w-full lg:w-1/2 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col min-h-0">
          <ChatPanel
            messages={messages}
            isTyping={agentStatus === 'thinking' || agentStatus === 'speaking'}
          />
        </div>
      </div>
    </div>
  )
}
