import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { DigitalHuman } from './DigitalHuman'
import { ChatPanel } from './ChatPanel'
import { Button } from '../UI/Button'
import { useInterview } from '../../hooks/useInterview'
import { PhoneOff, Clock, Sparkles } from 'lucide-react'

interface InterviewRoomProps {
  onComplete: (data: any) => void
}

export const InterviewRoom = ({ onComplete }: InterviewRoomProps) => {
  const [currentTime, setCurrentTime] = useState(Date.now())

  const {
    messages,
    isLoading,
    isConnected,
    agentStatus,
    questionsAsked,
    isInterviewComplete,
    startTime,
    startInterview,
    endInterview
  } = useInterview()

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
      questionsCount: questionsAsked,
      responsesCount: messages.filter(m => m.sender === 'user').length,
      messages
    }
    onComplete(interviewData)
  }, [isInterviewComplete, startTime, questionsAsked, messages, onComplete])

  const handleStartInterview = useCallback(async () => {
    await startInterview()
    try {
      await import('../../services/zego').then(m => m.ZegoService.getInstance().unlockAutoplay())
    } catch { }
  }, [startInterview])

  const formatDuration = useCallback((current: number) => {
    if (!startTime) return '0:00'
    const seconds = Math.floor((current - startTime) / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [startTime])

  const statusDisplay = useMemo(() => {
    if (!isConnected) return { text: 'Ready to begin', color: 'text-slate-400' }
    if (isInterviewComplete) return { text: 'Interview completed', color: 'text-emerald-500' }

    const statusMap = {
      listening: { text: 'Listening...', color: 'text-emerald-500' },
      thinking: { text: 'Thinking...', color: 'text-blue-500' },
      speaking: { text: 'Speaking...', color: 'text-violet-500' },
      idle: { text: 'Ready', color: 'text-slate-400' }
    }

    return statusMap[agentStatus]
  }, [isConnected, isInterviewComplete, agentStatus])

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-800"
      >
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">AI Interview</h1>
                <p className={`text-sm font-medium ${statusDisplay.color}`}>
                  {statusDisplay.text}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {isConnected && (
                <>
                  <div className="flex items-center space-x-2 text-sm text-slate-400">
                    <Clock className="w-4 h-4" />
                    <span className="tabular-nums">{formatDuration(currentTime)}</span>
                  </div>

                  <div className="px-3 py-1 bg-blue-500/10 rounded-full">
                    <span className="text-xs font-semibold text-blue-400">
                      Q{questionsAsked}
                    </span>
                  </div>
                </>
              )}

              {isConnected ? (
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
              ) : (
                <Button
                  onClick={handleStartInterview}
                  isLoading={isLoading}
                  size="sm"
                  className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Start Interview
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-full lg:w-1/2 relative">
          <DigitalHuman
            isConnected={isConnected}
            agentStatus={agentStatus}
            currentQuestion=""
          />
        </div>

        <div className="hidden lg:flex lg:w-1/2 border-l border-slate-800">
          <ChatPanel
            messages={messages}
            isTyping={agentStatus === 'thinking' || agentStatus === 'speaking'}
          />
        </div>
      </div>
    </div>
  )
}
