import { useState, useEffect, useRef } from 'react'
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

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const scrollHeight = textareaRef.current.scrollHeight
      const minHeight = 44
      const maxHeight = 120
      
      textareaRef.current.style.height = Math.min(Math.max(scrollHeight, minHeight), maxHeight) + 'px'
    }
  }, [message])

  const handleSubmit = async (e: React.FormEvent) => {
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
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isSending) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  const isDisabled = !isConnected || agentStatus === 'thinking' || agentStatus === 'speaking'
  const isVoiceDisabled = isDisabled || !voiceEnabled

  const getPlaceholderText = () => {
    if (!isConnected) return "Start interview to begin responding..."
    if (agentStatus === 'thinking') return "AI is processing your response..."
    if (agentStatus === 'speaking') return "AI interviewer is speaking..."
    if (isRecording) return "Recording your response... speak now"
    return "Type your response or use voice to answer..."
  }

  const getRecordingButtonState = () => {
    if (isVoiceDisabled) return 'disabled'
    if (agentStatus === 'listening' || isRecording) return 'recording'
    return 'idle'
  }

  const recordingState = getRecordingButtonState()

  const getStatusMessage = () => {
    switch (agentStatus) {
      case 'listening':
        return 'The AI interviewer is listening to your response'
      case 'thinking':
        return 'Processing your answer and preparing the next question'
      case 'speaking':
        return 'The AI interviewer is asking a question'
      default:
        return 'Ready for your response'
    }
  }

  return (
    <motion.div 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-white border-t border-gray-200"
    >
      {/* Status Bar */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            <motion.div
              className={`w-2 h-2 rounded-full ${
                agentStatus === 'listening' ? 'bg-green-500' :
                agentStatus === 'thinking' ? 'bg-blue-500' :
                agentStatus === 'speaking' ? 'bg-purple-500' :
                'bg-gray-400'
              }`}
              animate={agentStatus !== 'idle' ? { scale: [1, 1.2, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
            <span className="text-gray-600">{getStatusMessage()}</span>
          </div>
          {isConnected && (
            <span className="text-xs text-gray-500">
              Interview in progress
            </span>
          )}
        </div>
      </div>

      {/* Transcript Display */}
      <AnimatePresence>
        {(currentTranscript || agentStatus === 'listening') && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-3 bg-blue-50 border-b border-blue-100"
          >
            <div className="flex items-center space-x-3">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                className="flex-shrink-0"
              >
                <div className="w-3 h-3 rounded-full bg-blue-500" />
              </motion.div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-blue-800 font-medium mb-1">Recording your response:</p>
                <p className="text-blue-700 text-sm leading-relaxed">
                  {currentTranscript || 'Listening... please speak your answer'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area */}
      <div className="p-4">
        <form onSubmit={handleSubmit} className="flex items-end space-x-3">
          {/* Text Input Container */}
          <div className="flex-1 min-w-0">
            <div className={`relative rounded-xl border-2 transition-all duration-200 ${
              isFocused ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'
            } ${isDisabled ? 'opacity-50' : ''}`}>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={getPlaceholderText()}
                disabled={isDisabled || isSending}
                className="w-full px-4 py-3 bg-transparent border-none focus:outline-none resize-none placeholder-gray-500 disabled:cursor-not-allowed text-sm leading-relaxed"
                style={{ 
                  minHeight: '44px',
                  maxHeight: '120px',
                  overflow: 'hidden'
                }}
                rows={1}
              />
              
              {/* Character counter for long responses */}
              {message.length > 500 && (
                <div className="absolute bottom-2 right-2 text-xs text-gray-400 bg-white px-1 rounded">
                  {message.length}/1000
                </div>
              )}
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center space-x-2">
            {/* Voice Toggle */}
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onToggleVoice}
              disabled={!isConnected}
              className="text-gray-600 hover:text-gray-900 disabled:opacity-50"
              title={voiceEnabled ? "Disable voice input" : "Enable voice input"}
            >
              {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </Button>

            {/* Voice Recording Button */}
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onToggleRecording}
              disabled={recordingState === 'disabled'}
              className={`transition-all duration-200 ${
                recordingState === 'recording'
                  ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg scale-110' 
                  : recordingState === 'disabled'
                  ? 'text-gray-400 cursor-not-allowed opacity-50'
                  : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
              }`}
              title={
                recordingState === 'disabled' 
                  ? "Voice not available" 
                  : recordingState === 'recording'
                  ? "Stop recording"
                  : "Start voice response"
              }
            >
              <motion.div
                animate={recordingState === 'recording' ? { scale: [1, 1.1, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1 }}
              >
                {recordingState === 'recording' ? (
                  <MicOff className="w-5 h-5" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </motion.div>
            </Button>

            {/* Send Button */}
            <Button
              type="submit"
              disabled={!message.trim() || isDisabled || isSending}
              size="md"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 disabled:opacity-50 disabled:cursor-not-allowed min-w-[70px]"
              isLoading={isSending}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>

        {/* Help Text */}
        <div className="mt-3 text-xs text-gray-500 text-center">
          {!isConnected ? (
            "Start the interview to enable response input"
          ) : agentStatus === 'speaking' ? (
            "Please wait for the question to complete before responding"
          ) : (
            "Use voice input for natural conversation or type your response"
          )}
        </div>
      </div>
    </motion.div>
  )
}