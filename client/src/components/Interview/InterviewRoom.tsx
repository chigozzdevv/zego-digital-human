import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DigitalHuman } from './DigitalHuman'
import { VoiceMessageInput } from '../Voice/VoiceMessageInput'
import { MessageBubble } from '../Chat/MessageBubble'
import { Button } from '../UI/Button'
import { useInterview } from '../../hooks/useInterview'
import { PhoneOff, Clock, User, Bot } from 'lucide-react'

interface InterviewRoomProps {
  onComplete: (data: any) => void
}

export const InterviewRoom = ({ onComplete }: InterviewRoomProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [startTime] = useState(Date.now())
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
    startInterview,
    sendTextMessage, 
    toggleVoiceRecording,
    toggleVoiceSettings,
    endInterview
  } = useInterview()

  // Update timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Handle interview completion
  useEffect(() => {
    if (isInterviewComplete) {
      const duration = Math.floor((Date.now() - startTime) / 1000)
      const interviewData = {
        duration: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`,
        questionsCount: questionsAsked,
        responsesCount: messages.filter(m => m.sender === 'user').length,
        messages: messages
      }
      onComplete(interviewData)
    }
  }, [isInterviewComplete, startTime, questionsAsked, messages, onComplete])

  const handleStartInterview = async () => {
    await startInterview()
  }

  const handleEndInterview = async () => {
    await endInterview()
  }

  const formatDuration = (ms: number) => {
    const seconds = Math.floor((ms - startTime) / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const getStatusText = () => {
    if (!isConnected) return 'Click Start Interview to begin'
    if (isInterviewComplete) return 'Interview completed'
    
    switch (agentStatus) {
      case 'listening':
        return 'Listening to your response...'
      case 'thinking':
        return 'Analyzing your answer...'
      case 'speaking':
        return 'AI Interviewer is asking a question...'
      default:
        return 'Ready for your response'
    }
  }

  const getStatusColor = () => {
    if (!isConnected) return 'text-gray-500'
    if (isInterviewComplete) return 'text-green-600'
    
    switch (agentStatus) {
      case 'listening':
        return 'text-green-600'
      case 'thinking':
        return 'text-blue-600'
      case 'speaking':
        return 'text-purple-600'
      default:
        return 'text-green-600'
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <motion.div 
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        className="bg-white border-b border-gray-200 px-6 py-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">AI Interview</h1>
              <p className={`text-sm ${getStatusColor()}`}>
                {getStatusText()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {isConnected && (
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Clock className="w-4 h-4" />
                <span>{formatDuration(currentTime)}</span>
              </div>
            )}
            
            <div className="text-sm text-gray-600">
              Question {questionsAsked + 1}
            </div>
            
            {isConnected ? (
              <Button 
                onClick={handleEndInterview} 
                variant="secondary" 
                size="sm" 
                disabled={isLoading}
              >
                <PhoneOff className="w-4 h-4 mr-2" />
                End Interview
              </Button>
            ) : (
              <Button 
                onClick={handleStartInterview} 
                isLoading={isLoading} 
                size="sm"
              >
                Start Interview
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      <div className="flex-1 flex overflow-hidden">
        {/* Digital Human Video Panel */}
        <div className="w-1/2 bg-black relative">
          <DigitalHuman 
            isConnected={isConnected}
            agentStatus={agentStatus}
            currentQuestion={currentQuestion}
          />
        </div>

        {/* Chat Panel */}
        <div className="w-1/2 flex flex-col bg-white">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-6">
            {messages.length === 0 && !isConnected && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center h-full text-center"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mb-4">
                  <User className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Ready for Your Interview
                </h3>
                <p className="text-gray-600 mb-6 max-w-md">
                  Click "Start Interview" to begin your session with our AI interviewer. 
                  The digital human will ask you questions and you can respond naturally using voice or text.
                </p>
                <div className="space-y-2 text-sm text-gray-500">
                  <p>💼 Professional interview experience</p>
                  <p>🎤 Natural voice interaction</p>
                  <p>🤖 AI-powered questioning</p>
                </div>
              </motion.div>
            )}

            <AnimatePresence mode="popLayout">
              {messages.map((message) => (
                <MessageBubble 
                  key={message.id} 
                  message={message} 
                  showTimestamp={true}
                />
              ))}
            </AnimatePresence>
            
            {agentStatus === 'thinking' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex justify-start mb-6"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-800 rounded-full flex items-center justify-center">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="bg-white border border-gray-200 rounded-2xl px-5 py-3">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      </div>
                      <span className="text-sm text-gray-500">Analyzing your response...</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Voice Input Area */}
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
            <div className="p-4 bg-green-50 border-t border-green-200">
              <div className="text-center">
                <p className="text-green-800 font-medium">Interview Completed!</p>
                <p className="text-green-600 text-sm mt-1">
                  Thank you for participating in the interview.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}