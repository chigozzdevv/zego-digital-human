import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDigitalHuman } from '../../hooks/useDigitalHuman'
import { Volume2, VolumeX, Video, VideoOff, Circle } from 'lucide-react'

interface DigitalHumanProps {
  isConnected: boolean
  agentStatus: 'idle' | 'listening' | 'thinking' | 'speaking'
  currentQuestion?: string
}

export const DigitalHuman = ({ isConnected, agentStatus, currentQuestion }: DigitalHumanProps) => {
  const { isVideoEnabled, isAudioEnabled, toggleVideo, toggleAudio } = useDigitalHuman()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [videoReady, setVideoReady] = useState(false)
  const [debugInfo, setDebugInfo] = useState<any>(null)

  // Debug mode - press 'd' key to toggle
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'd' && e.ctrlKey) {
        setShowDebug(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [])

  useEffect(() => {
    let cancelled = false
    const ensureVideoMount = async () => {
      try {
        const { ZegoService } = await import('../../services/zego')
        if (!cancelled) {
          const service = ZegoService.getInstance()
          service.ensureVideoContainer()
        }
      } catch (error) {
        console.warn('Unable to ensure digital human video container:', error)
      }
    }
    ensureVideoMount()
    return () => {
      cancelled = true
    }
  }, [isConnected])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    const registerPlayerState = async () => {
      try {
        const { ZegoService } = await import('../../services/zego')
        if (cancelled) return
        const service = ZegoService.getInstance()
        service.ensureVideoContainer()

        const handler = (payload: { state: string; streamID: string; errorCode: number }) => {
          if (!payload) return
          const normalizedState = payload.state?.toUpperCase()
          switch (normalizedState) {
            case 'PLAYING':
            case 'PLAY_OK':
            case 'PLAY_REQUESTING':
            case 'PLAY_START':
              setVideoReady(true)
              break
            case 'PLAY_STOP':
            case 'NO_PLAY':
            case 'PLAY_FAIL':
              setVideoReady(false)
              break
            default:
              if (payload.errorCode !== 0) {
                setVideoReady(false)
              }
          }
        }

        unsubscribe = service.onPlayerStateUpdate(handler)
      } catch (error) {
        console.warn('Unable to subscribe to player state updates:', error)
      }
    }

    registerPlayerState()

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    const handleGlobalState = (event: Event) => {
      const custom = event as CustomEvent<{ ready: boolean }>
      if (typeof custom.detail?.ready === 'boolean' && isVideoEnabled) {
        setVideoReady(custom.detail.ready)
      }
    }

    document.addEventListener('zego-digital-human-video-state', handleGlobalState)
    return () => {
      document.removeEventListener('zego-digital-human-video-state', handleGlobalState)
    }
  }, [isVideoEnabled])

  useEffect(() => {
    const updateReadyState = async () => {
      try {
        const { ZegoService } = await import('../../services/zego')
        const service = ZegoService.getInstance()
        service.ensureVideoContainer()
        const videoEl = service.getVideoElement()
        if (videoEl) {
          videoRef.current = videoEl
          if (!isVideoEnabled) {
            setVideoReady(false)
          } else if (service.isVideoReady() || (!videoEl.paused && videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && videoEl.videoWidth > 0)) {
            setVideoReady(true)
          } else {
            setVideoReady(false)
          }
        }
      } catch (error) {
        console.warn('Unable to evaluate digital human video state:', error)
      }
    }

    updateReadyState()
  }, [isVideoEnabled])

  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl) return

    const markReady = () => {
      if (isVideoEnabled && videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && videoEl.videoWidth > 0) {
        setVideoReady(true)
      }
    }
    const handleWaiting = () => setVideoReady(false)

    videoEl.addEventListener('loadeddata', markReady)
    videoEl.addEventListener('canplay', markReady)
    videoEl.addEventListener('play', markReady)
    videoEl.addEventListener('resize', markReady)
    videoEl.addEventListener('waiting', handleWaiting)
    videoEl.addEventListener('stalled', handleWaiting)
    videoEl.addEventListener('emptied', handleWaiting)

    markReady()

    return () => {
      videoEl.removeEventListener('loadeddata', markReady)
      videoEl.removeEventListener('canplay', markReady)
      videoEl.removeEventListener('play', markReady)
      videoEl.removeEventListener('resize', markReady)
      videoEl.removeEventListener('waiting', handleWaiting)
      videoEl.removeEventListener('stalled', handleWaiting)
      videoEl.removeEventListener('emptied', handleWaiting)
    }
  }, [isVideoEnabled])

  useEffect(() => {
    if (!isConnected) {
      setVideoReady(false)
    }
  }, [isConnected])

  // Update debug info periodically
  useEffect(() => {
    if (!showDebug) return

    const updateDebugInfo = async () => {
      try {
        const { ZegoService } = await import('../../services/zego')
        const service = ZegoService.getInstance()
        const videoEl = service.getVideoElement()

        setDebugInfo({
          isConnected,
          isVideoEnabled,
          isAudioEnabled,
          videoReady,
          agentStatus,
          videoElement: videoEl ? {
            readyState: videoEl.readyState,
            videoWidth: videoEl.videoWidth,
            videoHeight: videoEl.videoHeight,
            paused: videoEl.paused,
            muted: videoEl.muted,
            currentTime: videoEl.currentTime,
            hasSrcObject: !!videoEl.srcObject,
            dataset: videoEl.dataset,
            style: {
              display: videoEl.style.display,
              visibility: videoEl.style.visibility,
              opacity: videoEl.style.opacity,
              zIndex: videoEl.style.zIndex
            },
            inDOM: document.body.contains(videoEl),
            parentElement: videoEl.parentElement?.tagName
          } : null,
          zegoService: {
            isVideoReady: service.isVideoReady(),
            isInRoom: service.isInRoom(),
            streams: service.getStreamsDebug ? service.getStreamsDebug() : []
          }
        })
      } catch (error) {
        setDebugInfo({ error: String(error) })
      }
    }

    updateDebugInfo()
    const interval = setInterval(updateDebugInfo, 1000)
    return () => clearInterval(interval)
  }, [showDebug, isConnected, isVideoEnabled, isAudioEnabled, videoReady, agentStatus])

  const showPlaceholder = false

  const statusConfig = {
    listening: { color: 'bg-emerald-500', text: 'Listening', pulse: true },
    thinking: { color: 'bg-blue-500', text: 'Processing', pulse: true },
    speaking: { color: 'bg-violet-500', text: 'Speaking', pulse: true },
    idle: { color: 'bg-slate-400', text: 'Ready', pulse: false }
  }

  const status = statusConfig[agentStatus]

  return (
    <div
      className="relative w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center overflow-hidden"
      data-digital-human-container
      ref={containerRef}
    >
      <div
        id="remoteSteamView"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 z-10 ${videoReady && isVideoEnabled ? 'opacity-100' : 'opacity-0'}`}
      />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent z-0" />

      {showPlaceholder && null}

      <AnimatePresence>
        {currentQuestion && agentStatus === 'speaking' && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/90 via-black/60 to-transparent"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className="backdrop-blur-xl bg-white/95 rounded-2xl p-6 shadow-2xl border border-white/20"
            >
              <div className="flex items-start space-x-3">
                <Circle className="w-5 h-5 text-violet-500 mt-1 flex-shrink-0 fill-current" />
                <p className="text-slate-900 font-medium text-lg leading-relaxed flex-1">
                  {currentQuestion}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isConnected && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-6 left-6 right-6 flex items-center justify-between"
        >
          <div className="flex items-center space-x-3 backdrop-blur-xl bg-black/40 rounded-full px-4 py-2.5 border border-white/10 shadow-xl">
            <motion.div
              className={`w-2.5 h-2.5 rounded-full ${status.color}`}
              animate={status.pulse ? {
                scale: [1, 1.3, 1],
                opacity: [1, 0.7, 1]
              } : {}}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            />
            <span className="text-white text-sm font-medium tracking-wide">
              {status.text}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleVideo}
              className={`p-2.5 rounded-full backdrop-blur-xl transition-all duration-200 border ${
                isVideoEnabled
                  ? 'bg-white/20 hover:bg-white/30 text-white border-white/20'
                  : 'bg-red-500/90 hover:bg-red-600 text-white border-red-400/50'
              }`}
              title={isVideoEnabled ? 'Disable video' : 'Enable video'}
            >
              {isVideoEnabled ? (
                <Video className="w-4 h-4" strokeWidth={2} />
              ) : (
                <VideoOff className="w-4 h-4" strokeWidth={2} />
              )}
            </button>

            <button
              onClick={toggleAudio}
              className={`p-2.5 rounded-full backdrop-blur-xl transition-all duration-200 border ${
                isAudioEnabled
                  ? 'bg-white/20 hover:bg-white/30 text-white border-white/20'
                  : 'bg-red-500/90 hover:bg-red-600 text-white border-red-400/50'
              }`}
              title={isAudioEnabled ? 'Mute audio' : 'Unmute audio'}
            >
              {isAudioEnabled ? (
                <Volume2 className="w-4 h-4" strokeWidth={2} />
              ) : (
                <VolumeX className="w-4 h-4" strokeWidth={2} />
              )}
            </button>
          </div>
        </motion.div>
      )}

      {isConnected && agentStatus === 'thinking' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/10 backdrop-blur-[2px] flex items-center justify-center pointer-events-none z-20"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white/95 backdrop-blur-xl rounded-2xl px-8 py-5 flex items-center space-x-4 shadow-2xl border border-white/20"
          >
            <div className="flex space-x-1.5">
              {[0, 0.15, 0.3].map((delay, i) => (
                <motion.div
                  key={i}
                  className="w-2.5 h-2.5 bg-blue-500 rounded-full"
                  animate={{
                    y: [0, -8, 0],
                    opacity: [1, 0.5, 1]
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.9,
                    delay,
                    ease: 'easeInOut'
                  }}
                />
              ))}
            </div>
            <span className="text-slate-900 font-medium">Analyzing your response...</span>
          </motion.div>
        </motion.div>
      )}

      {!isConnected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
        >
          <div className="backdrop-blur-xl bg-slate-800/60 rounded-full px-6 py-3 text-white text-sm border border-white/10 shadow-xl">
            <div className="flex items-center space-x-2">
              <motion.div
                className="w-2 h-2 bg-slate-400 rounded-full"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <span>Waiting to connect...</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Debug Overlay - Press Ctrl+D to toggle */}
      {showDebug && debugInfo && (
        <div className="absolute top-16 right-6 bg-black/90 text-white text-xs p-4 rounded-lg max-w-md max-h-96 overflow-auto z-50 font-mono">
          <div className="mb-2 text-green-400 font-bold">
            DEBUG INFO (Ctrl+D to hide)
          </div>
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
      )}

      {/* Debug hint when connected but no video */}
      {isConnected && !videoReady && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-30">
          <div className="backdrop-blur-xl bg-yellow-500/80 rounded-lg px-4 py-2 text-white text-xs border border-yellow-400/50 shadow-xl">
            <div className="flex items-center space-x-2">
              <span>Press Ctrl+D for debug info | Check browser console</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
