import { ZegoExpressEngine } from 'zego-express-engine-webrtc'
import { VoiceChanger } from 'zego-express-engine-webrtc/voice-changer'
import { config } from '../config'
import { digitalHumanAPI } from './digitalHumanAPI'

// Note: VoiceChanger module will be loaded when available
// For now, traditional 3A audio processing is enabled by default in the SDK

export class ZegoService {
  private static instance: ZegoService
  private zg: ZegoExpressEngine | null = null
  private isInitialized = false
  private currentRoomId: string | null = null
  private currentUserId: string | null = null
  private localStream: any = null
  private isJoining = false
  private audioElement: HTMLAudioElement | null = null
  private videoElement: HTMLVideoElement | null = null

  static getInstance(): ZegoService {
    if (!ZegoService.instance) {
      ZegoService.instance = new ZegoService()
    }
    return ZegoService.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized || this.isJoining) return

    this.isJoining = true
    try {
      // Load audio processing module before engine creation
      try {
        ZegoExpressEngine.use(VoiceChanger)
      } catch (e) {
        console.warn('VoiceChanger module not available or failed to load:', e)
      }

      // Initialize with High Quality Chatroom scenario for optimal AI voice interaction
      // Scenario 7 enables optimizations for voice call quality and latency
      this.zg = new ZegoExpressEngine(
        parseInt(config.ZEGO_APP_ID),
        config.ZEGO_SERVER,
        {
          scenario: 7  // High Quality Chatroom - optimized for AI Agent voice calls
        }
      )

      // Basic system checks
      try {
        const rtcSup = await this.zg.checkSystemRequirements('webRTC')
        if (!rtcSup?.result) {
          throw new Error('WebRTC not supported in this browser')
        }
        const micSup = await this.zg.checkSystemRequirements('microphone')
        if (!micSup?.result) {
          console.warn('Microphone permission not granted yet')
        }
      } catch (checkErr) {
        console.warn('System requirement check warning:', checkErr)
      }

      this.setupEventListeners()
      this.setupMediaElements()
      this.isInitialized = true
      console.log('✅ ZEGO initialized successfully with AI audio processing & digital human support')
    } catch (error) {
      console.error('❌ ZEGO initialization failed:', error)
      throw error
    } finally {
      this.isJoining = false
    }
  }

  private setupMediaElements(): void {
    // Setup audio element for AI voice
    this.audioElement = document.getElementById('ai-audio-output') as HTMLAudioElement
    if (!this.audioElement) {
      this.audioElement = document.createElement('audio')
      this.audioElement.id = 'ai-audio-output'
      this.audioElement.autoplay = true
      this.audioElement.controls = false
      this.audioElement.style.display = 'none'
      document.body.appendChild(this.audioElement)
    }

    // Setup video element for digital human
    this.videoElement = document.getElementById('digital-human-video') as HTMLVideoElement
    if (!this.videoElement) {
      this.videoElement = document.createElement('video')
      this.videoElement.id = 'digital-human-video'
      this.videoElement.autoplay = true
      this.videoElement.playsInline = true
      this.videoElement.muted = false
      this.videoElement.controls = false
      this.videoElement.style.width = '100%'
      this.videoElement.style.height = '100%'
      this.videoElement.style.objectFit = 'cover'

      // Find digital human container and append
      const container = document.querySelector('[data-digital-human-container]')
      if (container) {
        container.appendChild(this.videoElement)
      }
    }

    this.setupMediaEventListeners()
  }

  private setupMediaEventListeners(): void {
    if (this.audioElement) {
      this.audioElement.addEventListener('loadstart', () => {
        console.log('🔊 Audio loading started')
      })

      this.audioElement.addEventListener('canplay', () => {
        console.log('🔊 Audio ready to play')
      })

      this.audioElement.addEventListener('play', () => {
        console.log('🔊 Audio playback started')
      })

      this.audioElement.addEventListener('error', (e) => {
        console.error('❌ Audio error:', e)
      })
    }

    if (this.videoElement) {
      this.videoElement.addEventListener('loadstart', () => {
        console.log('📹 Digital human video loading started')
      })

      this.videoElement.addEventListener('canplay', () => {
        console.log('📹 Digital human video ready to play')
      })

      this.videoElement.addEventListener('play', () => {
        console.log('📹 Digital human video playback started')
      })

      this.videoElement.addEventListener('error', (e) => {
        console.error('❌ Digital human video error:', e)
      })
    }
  }

  private setupEventListeners(): void {
    if (!this.zg) return

    this.zg.on('recvExperimentalAPI', (result: any) => {
      const { method, content } = result
      if (method === 'onRecvRoomChannelMessage') {
        try {
          const message = JSON.parse(content.msgContent)
          console.log('🎯 Room message received:', message)
          this.handleRoomMessage(message)
        } catch (error) {
          console.error('Failed to parse room message:', error)
        }
      }
    })

    this.zg.on('roomStreamUpdate', async (_roomID: string, updateType: string, streamList: any[]) => {
      console.log('📡 Stream update:', updateType, streamList.length, 'streams')

      if (updateType === 'ADD' && streamList.length > 0) {
        for (const stream of streamList) {
          const userStreamId = this.currentUserId ? `${this.currentUserId}_stream` : null

          if (userStreamId && stream.streamID === userStreamId) {
            console.log('🚫 Skipping user\'s own stream:', stream.streamID)
            continue
          }

          try {
            console.log('🔗 Playing agent stream:', stream.streamID)

            const mediaStream = await this.zg!.startPlayingStream(stream.streamID)
            if (mediaStream) {
              // Validate stream tracks
              const videoTracks = mediaStream.getVideoTracks()
              const audioTracks = mediaStream.getAudioTracks()
              const hasVideo = videoTracks?.length > 0
              const hasAudio = audioTracks?.length > 0

              console.log('📊 Stream info:', {
                hasVideo,
                hasAudio,
                videoTrackCount: videoTracks?.length,
                audioTrackCount: audioTracks?.length,
                streamID: stream.streamID
              })

              if (!hasVideo && !hasAudio) {
                console.error('❌ Stream has no tracks!')
                return
              }

              const remoteView = await this.zg!.createRemoteStreamView(mediaStream)
              if (remoteView) {
                try {
                  if (hasVideo && this.videoElement) {
                    // Digital human - play to video element
                    await remoteView.play(this.videoElement, {
                      enableAutoplayDialog: false,
                      muted: false
                    })
                    console.log('✅ Digital human video connected')
                  } else if (this.audioElement) {
                    // Regular agent - play to audio element
                    await remoteView.play(this.audioElement, {
                      enableAutoplayDialog: false,
                      muted: false
                    })
                    console.log('✅ Agent audio connected')
                  }
                } catch (playError) {
                  console.error('❌ Failed to play via remoteView:', playError)

                  // Fallback: direct srcObject assignment
                  try {
                    if (hasVideo && this.videoElement) {
                      this.videoElement.srcObject = mediaStream
                      await this.videoElement.play()
                      console.log('✅ Fallback: Digital human video playing')
                    } else if (this.audioElement) {
                      this.audioElement.srcObject = mediaStream
                      await this.audioElement.play()
                      console.log('✅ Fallback: Audio playing')
                    }
                  } catch (fallbackError) {
                    console.error('❌ Fallback play failed:', fallbackError)
                  }
                }
              }
            }
          } catch (error) {
            console.error('❌ Failed to play agent stream:', error)
          }
        }
      } else if (updateType === 'DELETE') {
        console.log('📴 Agent stream disconnected')
        if (this.audioElement) {
          this.audioElement.srcObject = null
        }
        if (this.videoElement) {
          this.videoElement.srcObject = null
        }
      }
    })

    // SEI data listener for digital human lip-sync
    // SEI (Supplemental Enhancement Information) provides timing data for precise lip synchronization
    this.zg.on('playerRecvSEI', (streamID: string, seiData: Uint8Array) => {
      console.log('📦 SEI data received for stream:', streamID, 'size:', seiData.length)
      // SEI data will be passed to digital human SDK for lip-sync when integrated
    })

    this.zg.on('roomUserUpdate', (_roomID: string, updateType: string, userList: any[]) => {
      console.log('👥 Room user update:', updateType, userList.length, 'users')
    })

    this.zg.on('roomStateChanged', (roomID: string, reason: string, errorCode: number) => {
      console.log('🏠 Room state changed:', { roomID, reason, errorCode })
    })

    this.zg.on('networkQuality', (userID: string, upstreamQuality: number, downstreamQuality: number) => {
      if (upstreamQuality > 2 || downstreamQuality > 2) {
        console.warn('📶 Network quality issues:', { userID, upstreamQuality, downstreamQuality })
      }
    })

    this.zg.on('publisherStateUpdate', (result: any) => {
      console.log('📤 Publisher state update:', result)
    })

    this.zg.on('playerStateUpdate', (result: any) => {
      console.log('📥 Player state update:', result)
    })
  }

  private messageCallback: ((message: any) => void) | null = null

  private handleRoomMessage(message: any): void {
    if (this.messageCallback) {
      this.messageCallback(message)
    }
  }

  async joinRoom(roomId: string, userId: string): Promise<boolean> {
    if (!this.zg) {
      console.error('❌ ZEGO not initialized')
      return false
    }

    if (this.currentRoomId === roomId && this.currentUserId === userId) {
      console.log('ℹ️ Already in the same room')
      return true
    }

    try {
      if (this.currentRoomId) {
        console.log('🔄 Leaving previous room before joining new one')
        await this.leaveRoom()
      }

      this.currentRoomId = roomId
      this.currentUserId = userId

      console.log('🔑 Getting token for user:', userId)
      const { token } = await digitalHumanAPI.getToken(userId, roomId)

      console.log('🚪 Logging into room:', roomId)
      await this.zg.loginRoom(roomId, token, {
        userID: userId,
        userName: userId
      })

      console.log('📢 Enabling room message reception')
      this.zg.callExperimentalAPI({
        method: 'onRecvRoomChannelMessage',
        params: {}
      })

      console.log('🎤 Creating local stream for interview')
      const localStream = await this.zg.createZegoStream({
        camera: {
          video: false,  // Audio only for candidate
          audio: true
        }
      })

      if (localStream) {
        this.localStream = localStream
        const streamId = `${userId}_stream`

        console.log('📤 Publishing candidate stream:', streamId)
        await this.zg.startPublishingStream(streamId, localStream, {
          enableAutoSwitchVideoCodec: true
        })

        console.log('✅ Interview room joined successfully')
        return true
      } else {
        throw new Error('Failed to create local stream')
      }
    } catch (error) {
      console.error('❌ Failed to join interview room:', error)
      this.currentRoomId = null
      this.currentUserId = null
      return false
    }
  }

  async enableMicrophone(enabled: boolean): Promise<boolean> {
    if (!this.zg || !this.localStream) {
      console.warn('⚠️ Cannot toggle microphone: no stream available')
      return false
    }

    try {
      if (this.localStream.getAudioTracks) {
        const audioTrack = this.localStream.getAudioTracks()[0]
        if (audioTrack) {
          audioTrack.enabled = enabled
          console.log(`🎤 Microphone ${enabled ? 'enabled' : 'disabled'}`)
          return true
        }
      }

      console.warn('⚠️ No audio track found in local stream')
      return false
    } catch (error) {
      console.error('❌ Failed to toggle microphone:', error)
      return false
    }
  }

  async leaveRoom(): Promise<void> {
    if (!this.zg || !this.currentRoomId) {
      console.log('ℹ️ No room to leave')
      return
    }

    try {
      console.log('🚪 Leaving interview room:', this.currentRoomId)

      if (this.currentUserId && this.localStream) {
        const streamId = `${this.currentUserId}_stream`
        console.log('📤 Stopping stream publication:', streamId)
        await this.zg.stopPublishingStream(streamId)
      }

      if (this.localStream) {
        console.log('🗑️ Destroying local stream')
        this.zg.destroyStream(this.localStream)
        this.localStream = null
      }

      await this.zg.logoutRoom()

      // Clean up media elements
      if (this.audioElement) {
        this.audioElement.srcObject = null
      }
      if (this.videoElement) {
        this.videoElement.srcObject = null
      }

      this.currentRoomId = null
      this.currentUserId = null

      console.log('✅ Left interview room successfully')
    } catch (error) {
      console.error('❌ Failed to leave interview room:', error)
      this.currentRoomId = null
      this.currentUserId = null
      this.localStream = null
    }
  }

  onRoomMessage(callback: (message: any) => void): void {
    this.messageCallback = callback
  }

  getCurrentRoomId(): string | null {
    return this.currentRoomId
  }

  getCurrentUserId(): string | null {
    return this.currentUserId
  }

  getEngine(): ZegoExpressEngine | null {
    return this.zg
  }

  isInRoom(): boolean {
    return !!this.currentRoomId && !!this.currentUserId
  }

  // Digital human specific methods
  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement
  }

  getAudioElement(): HTMLAudioElement | null {
    return this.audioElement
  }

  destroy(): void {
    if (this.zg) {
      this.leaveRoom()
      this.zg = null
      this.isInitialized = false

      if (this.audioElement && this.audioElement.parentNode) {
        this.audioElement.parentNode.removeChild(this.audioElement)
        this.audioElement = null
      }

      if (this.videoElement && this.videoElement.parentNode) {
        this.videoElement.parentNode.removeChild(this.videoElement)
        this.videoElement = null
      }

      console.log('🗑️ ZEGO service destroyed')
    }
  }
}
