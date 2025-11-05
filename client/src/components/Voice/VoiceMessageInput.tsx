import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { Button } from '../UI/Button'

interface VoiceMessageInputProps {
  onSendMessage: (content: string) => Promise<void>
  isRecording: boolean
  onToggleRecording: () => void
  currentTranscript: string
  isConnected: boolean
  voiceEnabled: boolean
  onToggleVoice: () => void
  agentStatus?: 'idle' | 'listening' | 'thinking' | 'speaking'
}

export const VoiceMessageInput = ({
  onSendMessage,
  isRecording,
  onToggleRecording,
  currentTranscript,
  isConnected,
  voiceEnabled,
  onToggleVoice,
  agentStatus = 'idle'
}: VoiceMessageInputProps) => {
  const [message, setMessage] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!textareaRef.current) return

    textareaRef.current.style.height = 'auto'
    const scrollHeight = textareaRef.current.scrollHeight
    const height = Math.min(Math.max(scrollHeight, 44), 120)
    textareaRef.current.style.height = `${height}px`
  }, [message])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedMessage = message.trim()
    if (!trimmedMessage || !isConnected || isSending) return

    setIsSending(true)
    try {
      await onSendMessage(trimmedMessage)
      setMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsSending(false)
    }
  }, [message, isConnected, isSending, onSendMessage])

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isSending) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }, [isSending, handleSubmit])

  const isDisabled = !isConnected || agentStatus === 'thinking' || agentStatus === 'speaking'
  const isVoiceDisabled = isDisabled || !voiceEnabled

  const placeholderText = useMemo(() => {
    if (!isConnected) return 'Start interview to begin responding...'
    if (agentStatus === 'thinking') return 'AI is processing your response...'
    if (agentStatus === 'speaking') return 'AI interviewer is speaking...'
    if (isRecording) return 'Recording your response... speak now'
    return 'Type your response or use voice to answer...'
  }, [isConnected, agentStatus, isRecording])

  const recordingState = useMemo(() => {
    if (isVoiceDisabled) return 'disabled'
    if (agentStatus === 'listening' || isRecording) return 'recording'
    return 'idle'
  }, [isVoiceDisabled, agentStatus, isRecording])

  const statusMessage = useMemo(() => {
    const statusMap = {
      listening: 'The AI interviewer is listening to your response',
      thinking: 'Processing your answer and preparing the next question',
      speaking: 'The AI interviewer is asking a question',
      idle: 'Ready for your response'
    }
    return statusMap[agentStatus]
  }, [agentStatus])

  const statusColor = useMemo(() => {
    const colorMap = {
      listening: 'bg-emerald-500',
      thinking: 'bg-blue-500',
      speaking: 'bg-violet-500',
      idle: 'bg-slate-400'
    }
    return colorMap[agentStatus]
  }, [agentStatus])

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-white border-t border-slate-200 shadow-lg"
    >
      <div className="px-5 py-2.5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2.5">
            <motion.div
              className={`w-2 h-2 rounded-full ${statusColor}`}
              animate={agentStatus !== 'idle' ? { scale: [1, 1.3, 1], opacity: [1, 0.7, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            />
            <span className="text-slate-700 font-medium">{statusMessage}</span>
          </div>
          {isConnected && (
            <span className="text-xs text-slate-500 font-medium tracking-wide">
              Interview in progress
            </span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {(currentTranscript || agentStatus === 'listening') && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-5 py-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100"
          >
            <div className="flex items-start space-x-3">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="flex-shrink-0 mt-1"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              </motion.div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-900 mb-1.5 tracking-wide uppercase">
                  Recording
                </p>
                <p className="text-emerald-800 text-sm leading-relaxed">
                  {currentTranscript || 'Listening... please speak your answer'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-5">
        <form onSubmit={handleSubmit} className="flex items-end space-x-3">
          <div className="flex-1 min-w-0">
            <div
              className={`relative rounded-2xl border-2 transition-all duration-200 ${
                isFocused
                  ? 'border-blue-500 bg-blue-50/50 shadow-sm shadow-blue-100'
                  : 'border-slate-200 bg-slate-50/50'
              } ${isDisabled ? 'opacity-60' : ''}`}
            >
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={placeholderText}
                disabled={isDisabled || isSending}
                className="w-full px-4 py-3 bg-transparent border-none focus:outline-none resize-none placeholder-slate-500 disabled:cursor-not-allowed text-sm leading-relaxed"
                style={{
                  minHeight: '44px',
                  maxHeight: '120px',
                  overflow: 'hidden'
                }}
                rows={1}
              />

              {message.length > 500 && (
                <div className="absolute bottom-2 right-2 text-xs font-medium text-slate-400 bg-white px-2 py-0.5 rounded-full shadow-sm">
                  {message.length}/1000
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onToggleVoice}
              disabled={!isConnected}
              className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-50 transition-all duration-200"
              title={voiceEnabled ? 'Disable voice input' : 'Enable voice input'}
            >
              {voiceEnabled ? <Volume2 className="w-5 h-5" strokeWidth={2} /> : <VolumeX className="w-5 h-5" strokeWidth={2} />}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onToggleRecording}
              disabled={recordingState === 'disabled'}
              className={`transition-all duration-200 ${
                recordingState === 'recording'
                  ? 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-lg scale-105'
                  : recordingState === 'disabled'
                  ? 'text-slate-400 cursor-not-allowed opacity-50'
                  : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'
              }`}
              title={
                recordingState === 'disabled'
                  ? 'Voice not available'
                  : recordingState === 'recording'
                  ? 'Stop recording'
                  : 'Start voice response'
              }
            >
              <motion.div
                animate={recordingState === 'recording' ? { scale: [1, 1.15, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1.2 }}
              >
                {recordingState === 'recording' ? (
                  <MicOff className="w-5 h-5" strokeWidth={2} />
                ) : (
                  <Mic className="w-5 h-5" strokeWidth={2} />
                )}
              </motion.div>
            </Button>

            <Button
              type="submit"
              disabled={!message.trim() || isDisabled || isSending}
              size="md"
              className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white px-7 disabled:opacity-50 disabled:cursor-not-allowed min-w-[80px] shadow-md shadow-blue-500/30 transition-all duration-200"
              isLoading={isSending}
            >
              <Send className="w-4 h-4" strokeWidth={2.5} />
            </Button>
          </div>
        </form>

        <div className="mt-3 text-xs text-slate-500 text-center font-medium">
          {!isConnected
            ? 'Start the interview to enable response input'
            : agentStatus === 'speaking'
            ? 'Please wait for the question to complete before responding'
            : 'Use voice input for natural conversation or type your response'}
        </div>
      </div>
    </motion.div>
  )
}
