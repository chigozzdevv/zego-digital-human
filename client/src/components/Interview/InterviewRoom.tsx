import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { DigitalHuman } from './DigitalHuman'
import { VoiceMessageInput } from '../Voice/VoiceMessageInput'
import { Button } from '../UI/Button'
import { useInterview } from '../../hooks/useInterview'
import { PhoneOff, Clock, Sparkles, CheckCircle2 } from 'lucide-react'

interface InterviewRoomProps {
  onComplete: (data: any) => void
}

export const InterviewRoom = ({ onComplete }: InterviewRoomProps) => {
  const [currentTime, setCurrentTime] = useState(Date.now())

  const {
    messages,
    isLoading,
    isConnected,
    isRecording,
    currentTranscript,
    agentStatus,
    session,
    currentQuestion,
    questionsAsked,
    isInterviewComplete,
    startTime,
    startInterview,
    sendTextMessage,
    toggleVoiceRecording,
    toggleVoiceSettings,
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
    } catch {}
  }, [startInterview])

  const formatDuration = useCallback((current: number) => {
    if (!startTime) return '0:00'
    const seconds = Math.floor((current - startTime) / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [startTime])

  const statusDisplay = useMemo(() => {
    if (!isConnected) return { text: 'Ready to begin', color: 'text-slate-500' }
    if (isInterviewComplete) return { text: 'Interview completed', color: 'text-emerald-600' }

    const statusMap = {
      listening: { text: 'Listening to your response...', color: 'text-emerald-600' },
      thinking: { text: 'Analyzing your answer...', color: 'text-blue-600' },
      speaking: { text: 'AI Interviewer is asking...', color: 'text-violet-600' },
      idle: { text: 'Ready for your response', color: 'text-emerald-600' }
    }

    return statusMap[agentStatus]
  }, [isConnected, isInterviewComplete, agentStatus])

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm"
      >
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-violet-600 rounded-xl blur-lg opacity-30" />
                <div className="relative w-11 h-11 bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Sparkles className="w-5 h-5 text-white" strokeWidth={2} />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                  AI Interview
                </h1>
                <p className={`text-sm font-medium ${statusDisplay.color} transition-colors duration-200`}>
                  {statusDisplay.text}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-6">
              {isConnected && (
                <>
                  <div className="flex items-center space-x-2.5 text-sm font-medium text-slate-600">
                    <Clock className="w-4 h-4" strokeWidth={2.5} />
                    <span className="tabular-nums tracking-wide">{formatDuration(currentTime)}</span>
                  </div>

                  <div className="flex items-center space-x-2 px-3 py-1.5 bg-blue-50 rounded-full">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                    <span className="text-xs font-semibold text-blue-700 tracking-wide">
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
                  className="bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 border-slate-200 hover:border-red-200 transition-all duration-200"
                >
                  <PhoneOff className="w-4 h-4 mr-2" strokeWidth={2} />
                  End Interview
                </Button>
              ) : (
                <Button
                  onClick={handleStartInterview}
                  isLoading={isLoading}
                  size="sm"
                  className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white shadow-lg shadow-blue-500/30 transition-all duration-200"
                >
                  <Sparkles className="w-4 h-4 mr-2" strokeWidth={2} />
                  Start Interview
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 relative">
          <DigitalHuman
            isConnected={isConnected}
            agentStatus={agentStatus}
            currentQuestion={currentQuestion}
          />
        </div>

        {isConnected && !isInterviewComplete && (
          <VoiceMessageInput
            onSendMessage={sendTextMessage}
            isRecording={isRecording}
            onToggleRecording={toggleVoiceRecording}
            currentTranscript={currentTranscript}
            isConnected={isConnected}
            voiceEnabled={session?.voiceSettings.isEnabled || false}
            onToggleVoice={toggleVoiceSettings}
            agentStatus={agentStatus}
          />
        )}

        {isInterviewComplete && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-t border-emerald-200/60"
          >
            <div className="max-w-2xl mx-auto text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full mb-4 shadow-lg"
              >
                <CheckCircle2 className="w-8 h-8 text-white" strokeWidth={2.5} />
              </motion.div>
              <h3 className="text-2xl font-bold text-emerald-900 mb-2">Interview Completed!</h3>
              <p className="text-emerald-700">
                Thank you for participating. Your responses have been recorded.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
