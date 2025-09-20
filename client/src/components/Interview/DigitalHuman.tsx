import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDigitalHuman } from '../../hooks/useDigitalHuman'
import { Bot, Volume2, VolumeX, Video, VideoOff } from 'lucide-react'

interface DigitalHumanProps {
  isConnected: boolean
  agentStatus: 'idle' | 'listening' | 'thinking' | 'speaking'
  currentQuestion?: string
}

export const DigitalHuman = ({ isConnected, agentStatus, currentQuestion }: DigitalHumanProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { isVideoEnabled, isAudioEnabled, toggleVideo, toggleAudio } = useDigitalHuman()

  // Initialize video element for digital human stream
  useEffect(() => {
    if (videoRef.current && isConnected) {
      // The video stream will be connected by the ZEGO service
      // This ref is used by the ZEGO SDK to attach the remote video stream
      videoRef.current.autoplay = true
      videoRef.current.playsInline = true
      videoRef.current.muted = false
    }
  }, [isConnected])

  const getStatusIndicator = () => {
    switch (agentStatus) {
      case 'listening':
        return {
          color: 'bg-green-500',
          pulse: true,
          text: 'Listening'
        }
      case 'thinking':
        return {
          color: 'bg-blue-500',
          pulse: true,
          text: 'Processing'
        }
      case 'speaking':
        return {
          color: 'bg-purple-500',
          pulse: true,
          text: 'Speaking'
        }
      default:
        return {
          color: 'bg-gray-500',
          pulse: false,
          text: 'Ready'
        }
    }
  }

  const statusIndicator = getStatusIndicator()

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
      {/* Video Stream */}
      <video
        ref={videoRef}
        id="digital-human-video"
        className="w-full h-full object-cover"
        style={{ display: isConnected && isVideoEnabled ? 'block' : 'none' }}
        autoPlay
        playsInline
        muted={false}
      />

      {/* Fallback when not connected or video disabled */}
      {(!isConnected || !isVideoEnabled) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center text-white"
        >
          <div className="w-32 h-32 bg-gradient-to-br from-blue-600 to-blue-800 rounded-full flex items-center justify-center mb-6 shadow-2xl">
            <Bot className="w-16 h-16 text-white" />
          </div>
          <h3 className="text-2xl font-semibold mb-2">AI Interviewer</h3>
          <p className="text-gray-300 text-center max-w-md">
            {!isConnected 
              ? 'Digital interviewer will appear when you start the interview'
              : 'Video is disabled'
            }
          </p>
        </motion.div>
      )}

      {/* Current Question Overlay */}
      <AnimatePresence>
        {currentQuestion && agentStatus === 'speaking' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6"
          >
            <div className="bg-white/90 backdrop-blur-sm rounded-lg p-4">
              <p className="text-gray-900 font-medium text-lg leading-relaxed">
                {currentQuestion}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Indicator */}
      {isConnected && (
        <div className="absolute top-4 left-4">
          <div className="flex items-center space-x-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-2">
            <motion.div
              className={`w-3 h-3 rounded-full ${statusIndicator.color}`}
              animate={statusIndicator.pulse ? { scale: [1, 1.2, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
            <span className="text-white text-sm font-medium">
              {statusIndicator.text}
            </span>
          </div>
        </div>
      )}

      {/* Controls */}
      {isConnected && (
        <div className="absolute top-4 right-4">
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleVideo}
              className={`p-2 rounded-full backdrop-blur-sm transition-colors ${
                isVideoEnabled 
                  ? 'bg-white/20 hover:bg-white/30 text-white' 
                  : 'bg-red-500/80 hover:bg-red-600/80 text-white'
              }`}
              title={isVideoEnabled ? 'Disable video' : 'Enable video'}
            >
              {isVideoEnabled ? (
                <Video className="w-5 h-5" />
              ) : (
                <VideoOff className="w-5 h-5" />
              )}
            </button>
            
            <button
              onClick={toggleAudio}
              className={`p-2 rounded-full backdrop-blur-sm transition-colors ${
                isAudioEnabled 
                  ? 'bg-white/20 hover:bg-white/30 text-white' 
                  : 'bg-red-500/80 hover:bg-red-600/80 text-white'
              }`}
              title={isAudioEnabled ? 'Mute audio' : 'Unmute audio'}
            >
              {isAudioEnabled ? (
                <Volume2 className="w-5 h-5" />
              ) : (
                <VolumeX className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isConnected && agentStatus === 'thinking' && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/90 backdrop-blur-sm rounded-full px-6 py-3 flex items-center space-x-3"
          >
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
            <span className="text-gray-900 font-medium">Processing your response...</span>
          </motion.div>
        </div>
      )}

      {/* Connection Status */}
      {!isConnected && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
          <div className="bg-gray-800/80 backdrop-blur-sm rounded-full px-4 py-2 text-white text-sm">
            Waiting for connection...
          </div>
        </div>
      )}
    </div>
  )
}