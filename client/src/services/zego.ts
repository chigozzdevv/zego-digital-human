import { ZegoExpressEngine } from 'zego-express-engine-webrtc'
import { VoiceChanger } from 'zego-express-engine-webrtc/voice-changer'
import { config } from '../config'
import { digitalHumanAPI } from './digitalHumanAPI'

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
  private messageCallback: ((message: any) => void) | null = null
  private playerStateListeners = new Set<(payload: { state: string; streamID: string; errorCode: number }) => void>()
  private videoReady = false
  private dhVideoStreamId: string | null = null  // Digital human video stream (video only)
  private agentAudioStreamId: string | null = null  // AI agent audio stream (audio only)
  private voiceEnabled = false
  private dhPlayRetryTimer: ReturnType<typeof setTimeout> | null = null
  private dhPlayRetryCount = 0
  private readonly MAX_DH_PLAY_RETRY = 6
  private playingStreamIds = new Set<string>()

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

      this.zg = new ZegoExpressEngine(
        parseInt(config.ZEGO_APP_ID),
        config.ZEGO_SERVER,
        {
          scenario: 7
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
      console.log('✅ ZEGO initialized')
    } catch (error) {
      console.error('❌ ZEGO initialization failed:', error)
      throw error
    } finally {
      this.isJoining = false
    }
  }

  private setupMediaElements(): void {
    console.log('🔧 Setting up media elements...')

    this.audioElement = document.getElementById('ai-audio-output') as HTMLAudioElement
    if (!this.audioElement) {
      this.audioElement = document.createElement('audio')
      this.audioElement.id = 'ai-audio-output'
      this.audioElement.autoplay = true
      this.audioElement.controls = false
      this.audioElement.style.display = 'none'
      document.body.appendChild(this.audioElement)
      console.log('✅ Audio element ready')
    }

    this.videoElement = document.getElementById('digital-human-video') as HTMLVideoElement
    if (!this.videoElement) {
      console.log('📹 Creating video element...')
      this.videoElement = document.createElement('video')
      this.videoElement.id = 'digital-human-video'
      this.videoElement.autoplay = true
      this.videoElement.playsInline = true
      this.videoElement.muted = true
      this.videoElement.controls = false
      this.videoElement.style.width = '100%'
      this.videoElement.style.height = '100%'
      this.videoElement.style.objectFit = 'cover'
      this.videoElement.style.position = 'absolute'
      this.videoElement.style.top = '0'
      this.videoElement.style.left = '0'
      this.videoElement.style.zIndex = '5'
      this.videoElement.style.pointerEvents = 'none'
      this.videoElement.style.opacity = '1'
      this.videoElement.style.backgroundColor = 'black'
      this.videoElement.classList.add('digital-human-video-element')
      this.videoElement.dataset.ready = '0'

      setTimeout(() => {
        const container = document.querySelector('[data-digital-human-container]')
        if (container && this.videoElement) {
          container.appendChild(this.videoElement)
          console.log('✅ Digital human video element appended to container')
        } else if (this.videoElement) {
          console.warn('⚠️ Digital human container not found, will retry attachment later')
        }
      }, 100)
    } else {
      console.log('📹 Video element found')
      this.videoElement.style.zIndex = this.videoElement.style.zIndex || '5'
      this.videoElement.style.pointerEvents = 'none'
      this.videoElement.style.opacity = this.videoElement.style.opacity || '1'
      this.videoElement.muted = true
      this.videoElement.classList.add('digital-human-video-element')
      this.videoElement.dataset.ready = this.videoElement.dataset.ready || '0'
      this.attachVideoElementToContainer()
    }

    this.setupMediaEventListeners()
  }

  private attachVideoElementToContainer(): void {
    if (!this.videoElement) {
      console.warn('⚠️ Cannot attach video element - element is null')
      return
    }
    const container = document.querySelector('[data-digital-human-container]')
    if (!container) {
      console.warn('⚠️ Digital human container not available for attachment, will retry...')
      // Retry after a short delay
      setTimeout(() => this.attachVideoElementToContainer(), 200)
      return
    }
    if (this.videoElement.parentElement !== container) {
      container.appendChild(this.videoElement)
      this.videoElement.style.display = 'block'
      this.videoElement.style.visibility = 'visible'
      console.log('✅ Video element attached to container')
      this.videoElement.dataset.ready = this.videoReady ? '1' : '0'
    }
  }

  private setVideoReady(ready: boolean): void {
    this.videoReady = ready
    if (this.videoElement) {
      this.videoElement.dataset.ready = ready ? '1' : '0'
    }
    try {
      document.dispatchEvent(new CustomEvent('zego-digital-human-video-state', {
        detail: { ready }
      }))
    } catch {}
  }

  private clearDigitalHumanRetry(): void {
    if (this.dhPlayRetryTimer) {
      clearTimeout(this.dhPlayRetryTimer)
      this.dhPlayRetryTimer = null
    }
    this.dhPlayRetryCount = 0
  }

  private async waitForFirstFrame(maxWaitMs = 4000, stepMs = 150): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < maxWaitMs) {
      if (this.videoElement && this.videoElement.videoWidth > 0) return true
      await new Promise(res => setTimeout(res, stepMs))
    }
    return false
  }

  private scheduleDigitalHumanRetry(delay = 1500): void {
    if (!this.dhVideoStreamId) return
    if (this.isStreamPlaying(this.dhVideoStreamId)) return
    if (this.dhPlayRetryCount >= this.MAX_DH_PLAY_RETRY) {
      console.warn('⚠️ Reached max retry attempts for digital human stream playback')
      return
    }
    if (this.dhPlayRetryTimer) {
      clearTimeout(this.dhPlayRetryTimer)
    }

    const attempt = this.dhPlayRetryCount + 1
    this.dhPlayRetryTimer = setTimeout(async () => {
      this.dhPlayRetryTimer = null
      if (!this.dhVideoStreamId) return
      this.dhPlayRetryCount = attempt
      console.log('⏳ Retrying digital human stream playback', {
        attempt,
        streamId: this.dhVideoStreamId,
        agentAudioStreamId: this.agentAudioStreamId
      })

      // Check if this is a unified stream (same ID for audio and video)
      const isUnifiedStream = this.agentAudioStreamId && this.dhVideoStreamId === this.agentAudioStreamId
      let played = false

      if (isUnifiedStream) {
        console.log('🔗 Retry: Using unified stream method')
        played = await this.playUnifiedStream(this.dhVideoStreamId)
      } else {
        console.log('📹 Retry: Using separate video stream method')
        played = await this.playDigitalHumanVideoStream(this.dhVideoStreamId)
      }

      if (!played && this.dhPlayRetryCount < this.MAX_DH_PLAY_RETRY) {
        const nextDelay = Math.min(delay * 1.5, 8000)
        this.scheduleDigitalHumanRetry(nextDelay)
      }
    }, delay)
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
      console.log('📡 ====== STREAM UPDATE ======')
      console.log('📡 Update type:', updateType)
      console.log('📡 Number of streams:', streamList.length)
      console.log('📡 Stream list details:', streamList.map(s => ({ streamID: s.streamID, user: s.user })))
      console.log('📡 Expected DH video stream:', this.dhVideoStreamId)
      console.log('📡 Expected agent audio stream:', this.agentAudioStreamId)

      // Check if we have a unified stream (same ID for both audio and video)
      const isUnifiedStream = this.dhVideoStreamId && this.agentAudioStreamId && this.dhVideoStreamId === this.agentAudioStreamId
      if (isUnifiedStream) {
        console.log('🔗 Detected UNIFIED stream (same ID for audio and video):', this.dhVideoStreamId)
      }

      if (updateType === 'ADD') {
        const userStreamId = this.currentUserId ? `${this.currentUserId}_stream` : null

        for (const stream of streamList) {
          // Skip user's own stream
          if (userStreamId && stream.streamID === userStreamId) {
            console.log('🚫 Skipping user\'s own stream:', stream.streamID)
            continue
          }

          const streamId = stream.streamID
          console.log('🎯 Processing remote stream:', streamId)

          if (this.isStreamPlaying(streamId)) {
            console.log('✅ Stream already playing, skipping duplicate play:', streamId)
            continue
          }

          // Check if this matches our expected stream(s)
          const matchesVideo = this.dhVideoStreamId && streamId === this.dhVideoStreamId
          const matchesAudio = this.agentAudioStreamId && streamId === this.agentAudioStreamId

          if (matchesVideo || matchesAudio) {
            // If it's a unified stream, play it once and assign to both elements
            if (isUnifiedStream && streamId === this.dhVideoStreamId) {
              console.log('🔗 Playing UNIFIED stream (contains both audio and video)')
              try {
                const success = await this.playUnifiedStream(streamId)
                if (success) {
                  console.log('✅ Unified stream playback successful')
                } else {
                  console.warn('⚠️ Unified stream playback returned false')
                }
              } catch (error) {
                console.error('❌ Failed to play unified stream:', error)
              }
            }
            // Separate streams - handle individually
            else if (matchesVideo && !matchesAudio) {
              console.log('📹 ✓ Matched video-only stream, attempting playback')
              try {
                const success = await this.playDigitalHumanVideoStream(streamId)
                if (success) {
                  console.log('✅ Digital human video stream playback successful')
                }
              } catch (error) {
                console.error('❌ Failed to play digital human video stream:', error)
              }
            }
            else if (matchesAudio && !matchesVideo) {
              console.log('🔊 ✓ Matched audio-only stream, attempting playback')
              try {
                const success = await this.playAgentAudioStream(streamId)
                if (success) {
                  console.log('✅ Agent audio stream playback successful')
                }
              } catch (error) {
                console.error('❌ Failed to play agent audio stream:', error)
              }
            }
          }
          // Unknown stream - try to auto-detect
          else {
            console.log('❓ Unknown stream, attempting auto-detection:', streamId)
            try {
              const success = await this.playUnifiedStream(streamId)
              if (success) {
                console.log('✅ Auto-detected unified stream playback successful')
              }
            } catch (error) {
              console.error('❌ Failed to auto-detect stream:', streamId, error)
            }
          }
        }
      }

      if (updateType === 'DELETE') {
        const userStreamId = this.currentUserId ? `${this.currentUserId}_stream` : null

        for (const stream of streamList) {
          // Skip user's own stream
          if (userStreamId && stream.streamID === userStreamId) {
            continue
          }

          console.log('📴 Remote stream removed from room:', stream.streamID)

          if (this.dhVideoStreamId === stream.streamID) {
            if (this.videoElement) {
              this.videoElement.srcObject = null
            }
            this.setVideoReady(false)
            this.dhVideoStreamId = null
          }

          if (this.agentAudioStreamId === stream.streamID) {
            if (this.audioElement) {
              this.audioElement.srcObject = null
            }
            this.agentAudioStreamId = null
          }
        }
      }
    })

    // SEI data for lip-sync
    this.zg.on('playerRecvSEI', (streamID: string, seiData: Uint8Array) => {
      console.log('📦 SEI received:', streamID, 'size:', seiData.length)
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
      console.log('📤 Publisher:', result?.state, result?.streamID)
    })

    this.zg.on('playerStateUpdate', (result: any) => {
      console.log('📥 Player:', result?.state, result?.streamID, 'err:', result?.errorCode ?? 0)

      const errorCode = result?.errorCode ?? 0

      if (result?.state === 'PLAYING') {
        this.attachVideoElementToContainer()
        ;(async () => {
          const gotFrame = await this.waitForFirstFrame(3500)
          this.setVideoReady(!!gotFrame)
        })()
        if (result?.streamID) this.markStreamPlaying(result.streamID)
        this.clearDigitalHumanRetry()
        if (this.voiceEnabled) this.updateVoiceState()
      } else if (result?.state === 'NO_PLAY' || result?.state === 'PLAY_STOP' || result?.state === 'PLAY_FAIL') {
        this.setVideoReady(false)
        if (result?.streamID) this.unmarkStreamPlaying(result.streamID)
        this.scheduleDigitalHumanRetry()
      } else if (result?.state === 'PLAY_REQUESTING' && errorCode !== 0) {
        this.scheduleDigitalHumanRetry()
      }

      if (errorCode) {
        console.warn('⚠️ Player state error:', {
          errorCode,
          extendedData: result?.extendedData,
          streamID: result?.streamID
        })
        if (errorCode === 1004020 || errorCode === 1004005 || errorCode === 1004001) {
          this.scheduleDigitalHumanRetry()
        }
      }
      for (const listener of this.playerStateListeners) {
        try {
          listener({
            state: result?.state ?? '',
            streamID: result?.streamID ?? '',
            errorCode: result?.errorCode ?? 0
          })
        } catch (error) {
          console.warn('⚠️ Player state listener error:', error)
        }
      }
    })
  }

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
      this.attachVideoElementToContainer()

      console.log('📢 Enabling room message reception')
      this.zg.callExperimentalAPI({
        method: 'onRecvRoomChannelMessage',
        params: {}
      })

      // Manual playback attempts while backend publishes streams
      const attemptStreamPlayback = async (attempt: number, maxAttempts: number) => {
        console.log(`🔍 ====== MANUAL STREAM PLAYBACK ATTEMPT ${attempt}/${maxAttempts} ======`)

        this.attachVideoElementToContainer()

        const isUnifiedStream = this.dhVideoStreamId && this.agentAudioStreamId && this.dhVideoStreamId === this.agentAudioStreamId
        if (isUnifiedStream) {
          console.log('🔗 Detected UNIFIED stream configuration')
          console.log('🔗 Stream ID:', this.dhVideoStreamId)
        }

        let videoSuccess = false

        if (isUnifiedStream && this.dhVideoStreamId) {
          console.log('🔗 Attempting UNIFIED stream playback:', this.dhVideoStreamId)
          if (this.isStreamPlaying(this.dhVideoStreamId)) {
            console.log('✅ Unified stream already playing')
            videoSuccess = true
          } else {
            try {
              const success = await this.playUnifiedStream(this.dhVideoStreamId)
              if (success) {
                console.log('✅ Unified stream connected!')
                videoSuccess = true
              } else {
                console.warn('⚠️ Unified stream returned false')
              }
            } catch (err) {
              console.warn('⚠️ Failed to play unified stream:', err)
            }
          }
        } else {
          if (this.agentAudioStreamId) {
            console.log('🔊 Attempting agent audio stream:', this.agentAudioStreamId)
            if (this.isStreamPlaying(this.agentAudioStreamId)) {
              console.log('✅ Agent audio already playing')
            } else {
              try {
                const success = await this.playAgentAudioStream(this.agentAudioStreamId)
                if (success) {
                  console.log('✅ Agent audio stream connected!')
                } else {
                  console.warn('⚠️ Agent audio stream returned false')
                }
              } catch (err) {
                console.warn('⚠️ Agent audio stream not ready yet:', err)
              }
            }
          }
          if (this.dhVideoStreamId) {
            console.log('📹 Attempting digital human video stream:', this.dhVideoStreamId)
            if (this.isStreamPlaying(this.dhVideoStreamId)) {
              console.log('✅ Digital human video already playing')
              videoSuccess = true
            } else {
              try {
                const success = await this.playDigitalHumanVideoStream(this.dhVideoStreamId)
                if (success) {
                  console.log('✅ Digital human video stream connected!')
                  videoSuccess = true
                } else {
                  console.warn('⚠️ Digital human video stream returned false')
                }
              } catch (err) {
                console.warn('⚠️ Failed to play digital human video stream:', err)
              }
            }
          }
        }

        if (!videoSuccess && this.dhVideoStreamId && attempt < maxAttempts) {
          const delay = 3000
          console.warn(`⚠️ Video stream not ready, will retry in ${delay/1000} seconds (${maxAttempts - attempt} attempts left)`)
          setTimeout(() => attemptStreamPlayback(attempt + 1, maxAttempts), delay)
        } else if (videoSuccess) {
          console.log('✅ Manual playback successful!')
        } else {
          console.error('❌ Exhausted all manual playback attempts')
        }
      }

      setTimeout(() => attemptStreamPlayback(1, 5), 7000)

      console.log('🎤 Creating local stream for interview')
      const localStream = await this.zg.createStream({ camera: { video: false, audio: true } })

      if (localStream) {
        this.localStream = localStream
        const streamId = `${userId}_stream`

        console.log('📤 Publishing stream:', streamId)
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
        console.log('📤 Stopping publish:', streamId)
        await this.zg.stopPublishingStream(streamId)
      }

      if (this.localStream) {
        console.log('🗑️ Destroying local stream')
        this.zg.destroyStream(this.localStream)
        this.localStream = null
      }

      await this.zg.logoutRoom(this.currentRoomId as string)

      // Clean up media elements
      if (this.audioElement) {
        this.audioElement.srcObject = null
      }
      if (this.videoElement) {
        this.videoElement.srcObject = null
      }
      this.setVideoReady(false)
      this.clearDigitalHumanRetry()
      this.dhVideoStreamId = null
      this.voiceEnabled = false

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

  onPlayerStateUpdate(callback: (payload: { state: string; streamID: string; errorCode: number }) => void): () => void {
    this.playerStateListeners.add(callback)
    return () => {
      this.playerStateListeners.delete(callback)
    }
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

  isVideoReady(): boolean {
    return this.videoReady
  }

  setDigitalHumanStream(streamId: string | null): void {
    console.log('🎯 ====== SET DIGITAL HUMAN STREAM ======')
    console.log('🎯 New stream ID:', streamId)
    console.log('🎯 Previous stream ID:', this.dhVideoStreamId)
    console.log('🎯 Agent audio stream ID:', this.agentAudioStreamId)

    this.clearDigitalHumanRetry()
    this.dhVideoStreamId = streamId || null

    if (!streamId) {
      this.setVideoReady(false)
      return
    }

    // Check if this is a unified stream (same ID as audio stream)
    const isUnifiedStream = this.agentAudioStreamId && streamId === this.agentAudioStreamId
    if (isUnifiedStream) {
      console.log('🔗 Detected UNIFIED stream (same ID as agent audio stream)')
    }

    console.log('🎯 Digital human video stream configured:', streamId)
    console.log('🎯 Will attempt playback after delay to allow backend stream publishing...')

    // Attempt playback after delay to allow Digital Human API to publish the stream
    // Digital Human streams are created asynchronously by the backend, so we need to wait
    setTimeout(async () => {
      console.log('🎯 Attempting playback of:', streamId)
      try {
        // Use unified stream handler if it's a unified stream
        const success = isUnifiedStream
          ? await this.playUnifiedStream(streamId)
          : await this.playDigitalHumanVideoStream(streamId)

        if (success) {
          console.log('✅ Playback successful!')
        } else {
          console.warn('⚠️ Playback failed, will rely on retry logic')
        }
      } catch (error) {
        console.warn('⚠️ Playback error:', error)
      }
    }, 3000)  // Increased delay to give backend time to publish stream
  }

  setAgentAudioStream(streamId: string | null): void {
    this.agentAudioStreamId = streamId || null
    if (streamId) {
      console.log('🔊 Agent audio stream set:', streamId)
    }
  }

  setVoicePreference(enabled: boolean): void {
    this.voiceEnabled = enabled
    if (this.videoReady) this.updateVoiceState()
    else if (this.videoElement && !enabled) this.videoElement.muted = true
  }

  private updateVoiceState(): void {
    if (!this.audioElement) return
    this.audioElement.muted = !this.voiceEnabled
    if (this.voiceEnabled) this.unlockAutoplay().catch(() => {})
  }

  ensureVideoContainer(): void {
    this.attachVideoElementToContainer()
  }

  async unlockAutoplay(): Promise<void> {
    try {
      if (this.videoElement) {
        await this.videoElement.play().catch(() => {})
      }
    } catch {}
    try {
      if (this.audioElement) {
        await this.audioElement.play().catch(() => {})
      }
    } catch {}
  }


  async playUnifiedStream(streamId: string): Promise<boolean> {
    console.log('🔗 ====== PLAY UNIFIED STREAM (AUDIO + VIDEO) ======')
    console.log('🔗 Stream ID:', streamId)

    if (!this.zg) {
      console.error('❌ ZEGO engine not initialized')
      return false
    }

    if (!this.videoElement || !this.audioElement) {
      console.error('❌ Media elements not available')
      return false
    }

    try {
      console.log('🔗 Calling zg.startPlayingStream (ONCE for unified stream)...')
      if (this.isStreamPlaying(streamId)) return true
      const playOption = { jitterBufferTarget: 500 }
      const mediaStream = await this.zg.startPlayingStream(streamId, playOption as any)

      if (!mediaStream) {
        console.warn('⚠️ No media stream returned for:', streamId)
        return false
      }

      console.log('✓ Media stream received')

      const videoTracks = mediaStream.getVideoTracks()
      const audioTracks = mediaStream.getAudioTracks()
      const hasVideo = videoTracks?.length > 0
      const hasAudio = audioTracks?.length > 0

      console.log('🔗 Unified stream tracks:', { hasVideo, hasAudio, v: videoTracks?.length || 0, a: audioTracks?.length || 0 })

      // Assign the SAME MediaStream to both video and audio elements
      if (hasVideo) {
        console.log('✓ Assigning unified stream to VIDEO element...')
        this.attachVideoElementToContainer()
        this.videoElement.muted = true
        this.videoElement.style.display = 'block'
        this.videoElement.style.visibility = 'visible'
        this.videoElement.style.opacity = '1'
        this.videoElement.srcObject = mediaStream

        try {
          await this.videoElement.play()
          console.log('✅ Video element play() succeeded')
        } catch (playError) {
          console.warn('⚠️ Video element play() failed:', playError)
        }

        const gotFrame = await this.waitForFirstFrame()
        this.setVideoReady(!!gotFrame)
        this.clearDigitalHumanRetry()
        this.markStreamPlaying(streamId)
      }

      if (hasAudio) {
        console.log('✓ Assigning unified stream to AUDIO element...')
        this.audioElement.muted = !this.voiceEnabled
        this.audioElement.srcObject = mediaStream

        try {
          await this.audioElement.play()
          console.log('✅ Audio element play() succeeded')
        } catch (playError) {
          console.warn('⚠️ Audio element play() failed:', playError)
        }
      }

      console.log('✅ Unified stream successfully assigned to both elements')
      console.log('📹 Final state:', {
        videoElement: {
          readyState: this.videoElement.readyState,
          videoWidth: this.videoElement.videoWidth,
          videoHeight: this.videoElement.videoHeight,
          paused: this.videoElement.paused,
          muted: this.videoElement.muted,
          currentTime: this.videoElement.currentTime,
          hasSrcObject: !!this.videoElement.srcObject
        },
        audioElement: {
          readyState: this.audioElement.readyState,
          paused: this.audioElement.paused,
          muted: this.audioElement.muted,
          hasSrcObject: !!this.audioElement.srcObject
        }
      })

      return hasVideo || hasAudio
    } catch (e: any) {
      if (e?.code === 1103049 || e?.errorCode === 1103049) {
        console.warn('ℹ️ Unified stream already playing, treating as success:', streamId)
        this.markStreamPlaying(streamId)
        this.setVideoReady(true)
        return true
      }
      console.error('❌ Failed to play unified stream:', streamId)
      console.error('❌ Error details:', e)
      this.setVideoReady(false)
      return false
    }
  }

  async playDigitalHumanVideoStream(streamId: string): Promise<boolean> {
    console.log('🎬 ====== PLAY DIGITAL HUMAN VIDEO STREAM ======')
    console.log('🎬 Stream ID:', streamId)

    if (!this.zg) {
      console.error('❌ ZEGO engine not initialized')
      return false
    }

    if (!this.videoElement) {
      console.error('❌ Video element not available')
      return false
    }

    try {
      console.log('🎬 Calling zg.startPlayingStream...')
      if (this.isStreamPlaying(streamId)) return true
      const playOption = { jitterBufferTarget: 500 }
      const mediaStream = await this.zg.startPlayingStream(streamId, playOption as any)

      if (!mediaStream) {
        console.warn('⚠️ No media stream returned for:', streamId)
        return false
      }

      console.log('✓ Media stream received')

      const videoTracks = mediaStream.getVideoTracks()
      const audioTracks = mediaStream.getAudioTracks()
      const hasVideo = videoTracks?.length > 0

      console.log('📹 Stream tracks:', { hasVideo, v: videoTracks?.length || 0, a: audioTracks?.length || 0 })

      if (!hasVideo) {
        console.warn('⚠️ Digital human stream has no video tracks:', streamId)
        return false
      }

      console.log('✓ Video tracks confirmed, preparing video element...')

      // Ensure video element is attached to container
      this.attachVideoElementToContainer()

      // Configure video element
      this.videoElement.muted = true
      this.videoElement.style.display = 'block'
      this.videoElement.style.visibility = 'visible'
      this.videoElement.style.opacity = '1'

      console.log('✓ Assigning srcObject to video element...')
      this.videoElement.srcObject = mediaStream

      console.log('✓ Attempting to play video element...')
      try {
        await this.videoElement.play()
        console.log('✅ Video element play() succeeded')
      } catch (playError) {
        console.warn('⚠️ Video element play() failed:', playError)
        // Continue anyway, autoplay might work
      }

      console.log('✅ Digital human video stream playing successfully:', streamId)
      const gotFrame = await this.waitForFirstFrame()
      this.setVideoReady(!!gotFrame)
      this.clearDigitalHumanRetry()
      this.markStreamPlaying(streamId)

      return true
    } catch (e: any) {
      if (e?.code === 1103049 || e?.errorCode === 1103049) {
        console.warn('ℹ️ Video stream already playing, treating as success:', streamId)
        this.markStreamPlaying(streamId)
        this.setVideoReady(true)
        return true
      }
      console.error('❌ Failed to play digital human video stream:', streamId)
      console.error('❌ Error details:', e)
      this.setVideoReady(false)
      return false
    }
  }

  async playAgentAudioStream(streamId: string): Promise<boolean> {
    if (!this.zg || !this.audioElement) return false
    try {
      console.log('🔊 Starting agent audio stream playback:', streamId)
      if (this.isStreamPlaying(streamId)) return true
      const playOption = { jitterBufferTarget: 500 }
      const mediaStream = await this.zg.startPlayingStream(streamId, playOption as any)
      if (!mediaStream) {
        console.warn('⚠️ No media stream returned for:', streamId)
        return false
      }

      const hasAudio = mediaStream.getAudioTracks()?.length > 0
      console.log('🔊 Audio tracks available:', hasAudio, 'Track count:', mediaStream.getAudioTracks()?.length)
      if (!hasAudio) {
        console.warn('⚠️ Agent stream has no audio tracks:', streamId)
        return false
      }

      this.audioElement.muted = !this.voiceEnabled
      this.audioElement.srcObject = mediaStream
      try { await this.audioElement.play() } catch {}
      console.log('✅ Agent audio stream playing (element.srcObject):', streamId, 'Voice enabled:', this.voiceEnabled)

      this.markStreamPlaying(streamId)
      return true
    } catch (e: any) {
      if (e?.code === 1103049 || e?.errorCode === 1103049) {
        console.warn('ℹ️ Audio stream already playing, treating as success:', streamId)
        this.markStreamPlaying(streamId)
        return true
      }
      console.error('❌ Failed to play agent audio stream:', streamId, e)
      return false
    }
  }

  async playRemoteStream(streamId: string): Promise<boolean> {
    console.log('🔄 playRemoteStream wrapper called for:', streamId)
    if (!this.zg || !streamId) return false

    // Check if this is a unified stream (same ID for audio and video)
    const isUnifiedStream = this.agentAudioStreamId && streamId === this.agentAudioStreamId

    if (isUnifiedStream) {
      console.log('🔗 Detected unified stream, delegating to playUnifiedStream')
      return await this.playUnifiedStream(streamId)
    } else if (streamId === this.dhVideoStreamId) {
      console.log('📹 Detected separate video stream, delegating to playDigitalHumanVideoStream')
      return await this.playDigitalHumanVideoStream(streamId)
    } else if (streamId === this.agentAudioStreamId) {
      console.log('🔊 Detected separate audio stream, delegating to playAgentAudioStream')
      return await this.playAgentAudioStream(streamId)
    } else {
      // Unknown stream - try auto-detection
      console.log('❓ Unknown stream type, attempting unified stream playback')
      return await this.playUnifiedStream(streamId)
    }
  }

  async listAvailableStreams(): Promise<void> {
    if (!this.zg || !this.currentRoomId) {
      console.warn('⚠️ Cannot list streams: not in a room')
      return
    }

    try {
      console.log('📋 ====== LISTING AVAILABLE STREAMS ======')
      console.log('📋 Current room ID:', this.currentRoomId)
      console.log('📋 Current user ID:', this.currentUserId)
      console.log('📋 Expected DH video stream:', this.dhVideoStreamId)
      console.log('📋 Expected agent audio stream:', this.agentAudioStreamId)

      // Note: ZEGO SDK doesn't expose a direct API to list streams
      // We rely on roomStreamUpdate events to track streams
      console.log('📋 Streams are tracked via roomStreamUpdate events')
      console.log('📋 Check console for "📡 ====== STREAM UPDATE ======" messages')
    } catch (error) {
      console.error('❌ Error listing streams:', error)
    }
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

      this.playerStateListeners.clear()
      this.setVideoReady(false)
      this.dhVideoStreamId = null
      this.voiceEnabled = false
      this.clearDigitalHumanRetry()

      console.log('🗑️ ZEGO service destroyed')
    }
  }

  private isStreamPlaying(streamId: string | null | undefined): boolean {
    if (!streamId) return false
    return this.playingStreamIds.has(streamId)
  }

  private markStreamPlaying(streamId: string | null | undefined): void {
    if (!streamId) return
    this.playingStreamIds.add(streamId)
  }

  private unmarkStreamPlaying(streamId: string | null | undefined): void {
    if (!streamId) return
    this.playingStreamIds.delete(streamId)
  }
}

// Expose debug helpers to window for console access
if (typeof window !== 'undefined') {
  (window as any).zegoDebug = {
    getService: () => ZegoService.getInstance(),
    listStreams: () => ZegoService.getInstance().listAvailableStreams(),
    getVideoElement: () => ZegoService.getInstance().getVideoElement(),
    playStream: (streamId: string) => ZegoService.getInstance().playDigitalHumanVideoStream(streamId),
    forceRetry: () => {
      const service = ZegoService.getInstance()
      const streamId = (service as any).dhVideoStreamId
      if (streamId) {
        console.log('🔄 Forcing retry for stream:', streamId)
        return service.playDigitalHumanVideoStream(streamId)
      } else {
        console.warn('⚠️ No digital human stream ID configured')
        return Promise.resolve(false)
      }
    },
    getState: () => {
      const service = ZegoService.getInstance()
      return {
        isInRoom: service.isInRoom(),
        isVideoReady: service.isVideoReady(),
        roomId: service.getCurrentRoomId(),
        userId: service.getCurrentUserId(),
        dhVideoStreamId: (service as any).dhVideoStreamId,
        agentAudioStreamId: (service as any).agentAudioStreamId
      }
    }
  }
  console.log('🔧 ZEGO Debug helpers available:')
  console.log('   window.zegoDebug.getState() - Get current state')
  console.log('   window.zegoDebug.listStreams() - List available streams')
  console.log('   window.zegoDebug.getVideoElement() - Get video element')
  console.log('   window.zegoDebug.forceRetry() - Force retry stream playback')
  console.log('   window.zegoDebug.playStream(streamId) - Manually play a stream')
}
