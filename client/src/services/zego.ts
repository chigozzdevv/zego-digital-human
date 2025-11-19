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
  private dhVideoStreamId: string | null = null
  private dhRemoteView: any = null
  private agentAudioStreamId: string | null = null
  private voiceEnabled = false
  private remoteViews = new Map<string, any>()
  private streamTracks = new Map<string, { videoTracks: number; audioTracks: number }>()
  private playingStreamIds = new Set<string>()
  private audioActivated = new Set<string>()

  static getInstance(): ZegoService {
    if (!ZegoService.instance) ZegoService.instance = new ZegoService()
    return ZegoService.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized || this.isJoining) return
    this.isJoining = true
    try {
      try { ZegoExpressEngine.use(VoiceChanger) } catch { }
      this.zg = new ZegoExpressEngine(parseInt(config.ZEGO_APP_ID), config.ZEGO_SERVER, { scenario: 7 })
      try {
        const rtcSup = await this.zg.checkSystemRequirements('webRTC')
        const micSup = await this.zg.checkSystemRequirements('microphone')
        if (!rtcSup?.result) throw new Error('WebRTC not supported')
        if (!micSup?.result) console.warn('Microphone permission not granted yet')
      } catch { }
      this.setupEventListeners()
      this.setupMediaElements()
      this.isInitialized = true
      console.log('ZEGO initialized')
    } catch (e) {
      console.error('ZEGO initialization failed:', e)
      throw e
    } finally {
      this.isJoining = false
    }
  }

  private setupMediaElements(): void {
    this.audioElement = document.getElementById('ai-audio-output') as HTMLAudioElement
    if (!this.audioElement) {
      this.audioElement = document.createElement('audio')
      this.audioElement.id = 'ai-audio-output'
      this.audioElement.autoplay = true
      this.audioElement.controls = false
      this.audioElement.style.display = 'none'
      document.body.appendChild(this.audioElement)
    }
    // Video element will be created by ZEGO RemoteStreamView
    this.setupMediaEventListeners()
  }

  private setupMediaEventListeners(): void {
    if (this.audioElement) {
      this.audioElement.addEventListener('error', (e) => console.error('Audio error:', e))
    }
    // Video element error listeners will be added after ZEGO creates the video element
  }

  private setupEventListeners(): void {
    if (!this.zg) return

    this.zg.on('recvExperimentalAPI', (result: any) => {
      const { method, content } = result
      if (method === 'onRecvRoomChannelMessage') {
        try { this.handleRoomMessage(JSON.parse(content.msgContent)) } catch (error) { console.error('Parse room message failed:', error) }
      }
    })

    this.zg.on('roomStreamUpdate', async (_roomID: string, updateType: 'ADD' | 'DELETE', streamList: any[]) => {
      if (updateType === 'ADD') {
        for (const stream of streamList) {
          const streamId = stream.streamID
          const userStreamId = this.currentUserId ? `${this.currentUserId}_stream` : null
          if (userStreamId && streamId === userStreamId) continue

          try { console.log('roomStreamUpdate ADD:', streamId) } catch { }
          if (typeof streamId === 'string' && streamId.startsWith('zegoprobe')) continue
          if (this.isStreamPlaying(streamId)) {
            console.log('Stream already playing, skipping:', streamId)
            continue
          }
          // Mark as playing immediately to prevent race condition
          this.markStreamPlaying(streamId)
          try {
            const playOption = { jitterBufferTarget: 500 } as any
            const mediaStream = await this.zg!.startPlayingStream(streamId, playOption)
            if (!mediaStream) continue
            try {
              const v = mediaStream.getVideoTracks()?.length || 0
              const a = mediaStream.getAudioTracks()?.length || 0
              console.log('Remote media tracks:', { streamId, videoTracks: v, audioTracks: a })
              this.streamTracks.set(streamId, { videoTracks: v, audioTracks: a })
            } catch { }
            const remoteView = await (this.zg as any).createRemoteStreamView(mediaStream)
            if (remoteView) {
              // Ensure audio can start under autoplay policies; suppress unhandled rejections
              Promise.resolve(remoteView.playAudio({ enableAutoplayDialog: true }))
                .then((r: any) => { if (r !== false) this.audioActivated.add(streamId) })
                .catch(() => { })
              this.remoteViews.set(streamId, remoteView)
              // Fallback: if a video track already exists, try render immediately
              try {
                const hasVideo = (mediaStream.getVideoTracks?.() || []).length > 0
                console.log(`📹 Stream ${streamId} has video tracks:`, hasVideo)
                if (hasVideo) {
                  const playNow = async (retries = 6) => {
                    const container = document.getElementById('remoteSteamView')
                    if (!container) {
                      if (retries > 0) {
                        console.log(`⏳ Waiting for remoteSteamView container (${retries} retries left)`)
                        return setTimeout(() => playNow(retries - 1), 200)
                      }
                      console.warn('❌ remoteSteamView container not found for video playback')
                      return
                    }
                    try {
                      console.log(`▶️ Attempting to play video in remoteSteamView for stream: ${streamId}`)
                      // Pass the container element, not the ID string
                      const result = await Promise.resolve(remoteView.playVideo(container, { enableAutoplayDialog: false }))
                      console.log(`📺 RemoteView.playVideo result:`, result)

                      // CRITICAL FIX: Verify video element has srcObject attached
                      setTimeout(() => {
                        const videoEl = container.querySelector('video') as HTMLVideoElement
                        if (videoEl) {
                          console.log(`🔍 Checking video element state:`, {
                            hasSrcObject: !!videoEl.srcObject,
                            readyState: videoEl.readyState,
                            paused: videoEl.paused
                          })

                          // If RemoteView didn't attach the stream, do it manually
                          if (!videoEl.srcObject && mediaStream) {
                            console.log('🔧 RemoteView did not attach srcObject, attaching manually...')

                            // CRITICAL: Unmute video tracks before attaching
                            const videoTracks = mediaStream.getVideoTracks()
                            videoTracks.forEach(track => {
                              if (track.muted) {
                                console.log('🔧 Unmuting video track:', track.id)
                                track.enabled = true
                              }
                            })

                            videoEl.srcObject = mediaStream
                            videoEl.muted = false // Unmute the video element itself
                            videoEl.load()
                            videoEl.play()
                              .then(() => {
                                console.log('✅ Manual video playback started successfully')
                                this.setVideoReady(true)
                                this.updateVideoElement()
                              })
                              .catch(err => {
                                console.warn('⚠️ Manual video play failed (may need user interaction):', err)
                                // Still mark as ready since srcObject is attached
                                this.setVideoReady(true)
                                this.updateVideoElement()
                              })
                          } else if (videoEl.srcObject && videoEl.paused) {
                            // srcObject exists but video is paused, try to play
                            console.log('▶️ Video has srcObject but is paused, attempting play...')
                            videoEl.play()
                              .then(() => {
                                console.log('✅ Video playback resumed')
                                this.setVideoReady(true)
                                this.updateVideoElement()
                              })
                              .catch(err => console.warn('⚠️ Auto-play prevented:', err))
                          } else if (videoEl.srcObject && videoEl.readyState === 0) {
                            // CRITICAL: srcObject exists but readyState is 0 - force reload
                            console.log('🔧 CRITICAL: Video has srcObject but readyState is 0, forcing reload...')
                            const stream = videoEl.srcObject as MediaStream
                            const videoTracks = stream.getVideoTracks()
                            console.log(`🔍 MediaStream state:`, {
                              active: stream.active,
                              videoTrackCount: videoTracks.length,
                              videoTrackStates: videoTracks.map(t => ({
                                id: t.id,
                                enabled: t.enabled,
                                muted: t.muted,
                                readyState: t.readyState
                              }))
                            })

                            // Force reload by removing and re-adding srcObject
                            const tempStream = videoEl.srcObject
                            videoEl.srcObject = null
                            setTimeout(() => {
                              videoEl.srcObject = tempStream
                              videoEl.load()
                              videoEl.play()
                                .then(() => {
                                  console.log('✅ Video reloaded and playing')
                                  this.setVideoReady(true)
                                  this.updateVideoElement()
                                })
                                .catch(err => {
                                  console.warn('⚠️ Reload play failed:', err)
                                  this.setVideoReady(true) // Still mark ready
                                  this.updateVideoElement()
                                })
                            }, 50)
                          } else if (result !== false) {
                            console.log('✅ Video playback successful, marking as ready')
                            this.setVideoReady(true)
                            this.updateVideoElement()
                          }
                        } else {
                          console.warn('⚠️ No video element found after playVideo call')
                        }
                      }, 100)

                    } catch (err) {
                      console.warn('❌ Failed to play video in container:', err)
                    }
                  }
                  playNow()
                }
              } catch (err) {
                console.error('Error checking video tracks:', err)
              }
            }
          } catch (error) {
            console.error('Failed starting remote stream via RemoteView:', streamId, error)
          }
        }
      }

      if (updateType === 'DELETE') {
        const userStreamId = this.currentUserId ? `${this.currentUserId}_stream` : null
        for (const stream of streamList) {
          try { console.log('roomStreamUpdate DELETE:', stream.streamID) } catch { }
          if (userStreamId && stream.streamID === userStreamId) continue
          try { this.zg!.stopPlayingStream(stream.streamID) } catch { }
          const rv = this.remoteViews.get(stream.streamID)
          if (rv && typeof rv.destroy === 'function') { try { rv.destroy() } catch { } }
          this.remoteViews.delete(stream.streamID)
          this.streamTracks.delete(stream.streamID)
          this.unmarkStreamPlaying(stream.streamID)
          this.audioActivated.delete(stream.streamID)
          if (this.dhVideoStreamId === stream.streamID) this.setVideoReady(false)
        }
      }
    })

    this.zg.on('remoteCameraStatusUpdate', (streamID: string, status: 'OPEN' | 'MUTE') => {
      try { console.log('remoteCameraStatusUpdate:', streamID, status) } catch { }
      const rv = this.remoteViews.get(streamID)
      if (!rv) return
      if (status !== 'OPEN') { this.setVideoReady(false); return }

      const tryPlay = async (retries = 6) => {
        const container = document.getElementById('remoteSteamView')
        if (!container) {
          if (retries > 0) return setTimeout(() => tryPlay(retries - 1), 200)
          console.warn('remoteSteamView container not found'); this.setVideoReady(false); return
        }
        try {
          const result = await Promise.resolve(rv.playVideo('remoteSteamView', { enableAutoplayDialog: false }))

          // Verify and fix srcObject attachment
          setTimeout(() => {
            const videoEl = container.querySelector('video') as HTMLVideoElement
            if (videoEl) {
              if (!videoEl.srcObject) {
                console.log('🔧 Camera opened but no srcObject, checking for MediaStream...')
                // Try to get the MediaStream from the remote view or playing streams
                const playingStreams = Array.from(this.remoteViews.entries())
                const streamEntry = playingStreams.find(([sid]) => sid === streamID)
                if (streamEntry) {
                  console.log('🔧 Attempting to attach MediaStream manually...')
                  // The MediaStream should be available from startPlayingStream
                  this.zg?.startPlayingStream(streamID).then(ms => {
                    if (ms && videoEl) {
                      videoEl.srcObject = ms
                      videoEl.load()
                      videoEl.play().catch(err => console.warn('Auto-play prevented:', err))
                      this.setVideoReady(true)
                      this.updateVideoElement()
                    }
                  }).catch(err => console.warn('Failed to get MediaStream:', err))
                }
              } else if (videoEl.paused) {
                videoEl.play().catch(err => console.warn('Auto-play prevented:', err))
                this.setVideoReady(true)
                this.updateVideoElement()
              } else if (result !== false) {
                this.setVideoReady(true)
                this.updateVideoElement()
              }
            }
          }, 100)

        } catch (e) {
          console.warn('playVideo failed:', e); this.setVideoReady(false)
        }
      }
      tryPlay()
    })

    this.zg.on('playerStateUpdate', (result: any) => {
      try {
        const payload = { state: String(result?.state || ''), streamID: String(result?.streamID || ''), errorCode: Number(result?.errorCode || 0) }
        this.playerStateListeners.forEach(cb => cb(payload))
      } catch { }
    })
  }

  private handleRoomMessage(message: any): void {
    try { this.messageCallback?.(message) } catch (e) { console.warn('Room message handler error:', e) }
  }

  private setVideoReady(ready: boolean): void {
    this.videoReady = ready
    try { document.dispatchEvent(new CustomEvent('zego-digital-human-video-state', { detail: { ready } })) } catch { }
  }

  private updateVideoElement(): void {
    // After ZEGO creates the video element, find it and update our reference
    try {
      const container = document.getElementById('remoteSteamView')
      if (container) {
        const videoEl = container.querySelector('video')
        if (videoEl) {
          this.videoElement = videoEl as HTMLVideoElement
          console.log('📹 Video element found and updated:', {
            width: videoEl.videoWidth,
            height: videoEl.videoHeight,
            readyState: videoEl.readyState,
            paused: videoEl.paused
          })
          videoEl.addEventListener('error', (e) => console.error('Digital human video error:', e))
        } else {
          console.warn('⚠️ No video element found in remoteSteamView container')
        }
      } else {
        console.warn('⚠️ remoteSteamView container not found')
      }
    } catch (e) {
      console.warn('Failed to update video element reference:', e)
    }
  }

  async joinRoom(roomId: string, userId: string): Promise<boolean> {
    if (!this.zg) return false
    if (this.currentRoomId === roomId && this.currentUserId === userId) return true
    try {
      if (this.currentRoomId) await this.leaveRoom()
      this.currentRoomId = roomId
      this.currentUserId = userId
      const { token } = await digitalHumanAPI.getToken(userId, roomId)
      await this.zg.loginRoom(roomId, token, { userID: userId, userName: userId })
      this.zg.callExperimentalAPI({ method: 'onRecvRoomChannelMessage', params: {} })
      const localStream = await this.zg.createStream({ camera: { video: false, audio: true } })
      this.localStream = localStream
      const streamId = `${userId}_stream`
      await this.zg.startPublishingStream(streamId, localStream, { enableAutoSwitchVideoCodec: true })
      return true
    } catch (error) {
      console.error('Failed to join room:', error)
      this.currentRoomId = null
      this.currentUserId = null
      return false
    }
  }

  async enableMicrophone(enabled: boolean): Promise<boolean> {
    if (!this.zg || !this.localStream) {
      console.warn('Cannot toggle microphone: no stream available')
      return false
    }
    try {
      if (this.localStream.getAudioTracks) {
        const audioTrack = this.localStream.getAudioTracks()[0]
        if (audioTrack) { audioTrack.enabled = enabled; return true }
      }
      return false
    } catch {
      return false
    }
  }

  async leaveRoom(): Promise<void> {
    if (!this.zg || !this.currentRoomId) return
    try {
      if (this.currentUserId && this.localStream) {
        const streamId = `${this.currentUserId}_stream`
        await this.zg.stopPublishingStream(streamId)
      }
      if (this.localStream) { this.zg.destroyStream(this.localStream); this.localStream = null }
      await this.zg.logoutRoom(this.currentRoomId)
      this.setVideoReady(false)
      this.dhVideoStreamId = null
      this.voiceEnabled = false
      for (const [sid, rv] of this.remoteViews.entries()) {
        try { this.zg.stopPlayingStream(sid) } catch { }
        if (rv && typeof rv.destroy === 'function') { try { rv.destroy() } catch { } }
      }
      if (this.dhRemoteView && typeof this.dhRemoteView.destroy === 'function') {
        try { this.dhRemoteView.destroy() } catch { }
      }
      this.dhRemoteView = null
      this.remoteViews.clear(); this.playingStreamIds.clear()
      this.currentRoomId = null; this.currentUserId = null
    } catch (e) {
      console.error('Leave room failed:', e)
      this.currentRoomId = null
      this.currentUserId = null
      this.localStream = null
    }
  }

  onRoomMessage(callback: (message: any) => void): void { this.messageCallback = callback }

  onPlayerStateUpdate(callback: (payload: { state: string; streamID: string; errorCode: number }) => void): () => void {
    this.playerStateListeners.add(callback)
    return () => { this.playerStateListeners.delete(callback) }
  }

  getCurrentRoomId(): string | null { return this.currentRoomId }
  getCurrentUserId(): string | null { return this.currentUserId }
  getEngine(): ZegoExpressEngine | null { return this.zg }
  isInRoom(): boolean { return !!this.currentRoomId && !!this.currentUserId }
  getVideoElement(): HTMLVideoElement | null { return this.videoElement }
  getAudioElement(): HTMLAudioElement | null { return this.audioElement }
  isVideoReady(): boolean { return this.videoReady }

  setDigitalHumanStream(streamId: string | null): void {
    this.dhVideoStreamId = streamId || null
    if (!streamId) {
      if (this.dhRemoteView && typeof this.dhRemoteView.destroy === 'function') {
        try { this.dhRemoteView.destroy() } catch { }
      }
      this.dhRemoteView = null
      this.setVideoReady(false)
      return
    }
    this.startDigitalHumanPlayback(streamId)
  }

  setAgentAudioStream(streamId: string | null): void { this.agentAudioStreamId = streamId || null }

  setVoicePreference(enabled: boolean): void { this.voiceEnabled = enabled; this.updateVoiceState() }

  private updateVoiceState(): void {
    try {
      if (this.agentAudioStreamId && this.zg) {
        if (this.isStreamPlaying(this.agentAudioStreamId) && this.audioActivated.has(this.agentAudioStreamId)) {
          Promise.resolve((this.zg as any).mutePlayStreamAudio(this.agentAudioStreamId, !this.voiceEnabled)).catch(() => { })
        }
      } else if (this.zg) {
        for (const sid of this.remoteViews.keys()) {
          if (this.audioActivated.has(sid)) {
            Promise.resolve((this.zg as any).mutePlayStreamAudio(sid, !this.voiceEnabled)).catch(() => { })
          }
        }
      }
    } catch { }
  }

  ensureVideoContainer(): void { /* RemoteStreamView renders into #remoteSteamView */ }

  async unlockAutoplay(): Promise<void> {
    try { if (this.audioElement) await this.audioElement.play().catch(() => { }) } catch { }
  }

  async listAvailableStreams(): Promise<void> {
    if (!this.zg || !this.currentRoomId) return
    console.log('Streams tracked via roomStreamUpdate events')
  }

  destroy(): void {
    if (this.zg) {
      this.leaveRoom()
      this.zg = null
      this.isInitialized = false
      if (this.audioElement?.parentNode) this.audioElement.parentNode.removeChild(this.audioElement)
      if (this.videoElement?.parentNode) this.videoElement.parentNode.removeChild(this.videoElement)
      this.audioElement = null
      this.videoElement = null
      this.playerStateListeners.clear()
      this.setVideoReady(false)
      this.dhVideoStreamId = null
      this.voiceEnabled = false
      this.streamTracks.clear()
    }
  }

  private isStreamPlaying(streamId: string | null | undefined): boolean { return !!streamId && this.playingStreamIds.has(streamId) }
  private markStreamPlaying(streamId: string | null | undefined): void { if (streamId) this.playingStreamIds.add(streamId) }
  private unmarkStreamPlaying(streamId: string | null | undefined): void { if (streamId) this.playingStreamIds.delete(streamId) }

  private async startDigitalHumanPlayback(streamId: string, attempts = 12): Promise<void> {
    if (!this.zg || !streamId) return
    if (this.isStreamPlaying(streamId)) {
      console.log('Digital human stream already playing, skipping:', streamId)
      return
    }

    // Mark as playing immediately to prevent race condition
    this.markStreamPlaying(streamId)

    const tryStart = async (remaining: number): Promise<void> => {
      if (!this.zg || !this.dhVideoStreamId || streamId !== this.dhVideoStreamId) return
      try {
        const mediaStream = await this.zg.startPlayingStream(streamId)
        if (!mediaStream) {
          this.unmarkStreamPlaying(streamId)
          throw new Error('No media stream returned')
        }
        const videoTracks = mediaStream.getVideoTracks?.().length || 0
        const audioTracks = mediaStream.getAudioTracks?.length || 0
        this.streamTracks.set(streamId, { videoTracks, audioTracks })

        const remoteView = await (this.zg as any).createRemoteStreamView(mediaStream)
        if (!remoteView) {
          this.unmarkStreamPlaying(streamId)
          throw new Error('Failed to create remote view for digital human stream')
        }

        Promise.resolve(remoteView.playAudio({ enableAutoplayDialog: true }))
          .then((result: any) => { if (result !== false) this.audioActivated.add(streamId) })
          .catch(() => { })

        this.remoteViews.set(streamId, remoteView)
        this.dhRemoteView = remoteView

        const attach = async (): Promise<void> => {
          const container = document.getElementById('remoteSteamView')
          if (!container) {
            setTimeout(attach, 200)
            return
          }

          try {
            console.log(`🎬 Starting digital human video playback for stream: ${streamId}`)
            // Pass the container element, not the ID string
            const result = await Promise.resolve(remoteView.playVideo(container, { enableAutoplayDialog: false }))
            console.log(`📺 Digital human playVideo result:`, result)

            // CRITICAL FIX: Verify and ensure srcObject is attached
            setTimeout(() => {
              const videoEl = container.querySelector('video') as HTMLVideoElement
              if (videoEl) {
                console.log(`🔍 Digital human video element state:`, {
                  hasSrcObject: !!videoEl.srcObject,
                  readyState: videoEl.readyState,
                  videoWidth: videoEl.videoWidth,
                  videoHeight: videoEl.videoHeight,
                  paused: videoEl.paused
                })

                const videoTracks = mediaStream.getVideoTracks()
                console.log(`🔍 Found ${videoTracks.length} video tracks`)
                videoTracks.forEach((track, idx) => {
                  console.log(`🔍 Track ${idx}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`)
                  if (track.muted || !track.enabled) {
                    console.log(`🔧 Enabling and unmuting video track ${idx}`)
                    track.enabled = true
                  }
                })

                // If RemoteView didn't attach the stream, do it manually
                if (!videoEl.srcObject && mediaStream) {
                  console.log('🔧 CRITICAL FIX: RemoteView did not attach srcObject for digital human')
                  console.log('🔧 Manually attaching MediaStream to video element...')

                  videoEl.srcObject = mediaStream
                  videoEl.muted = false // Ensure not muted for digital human
                  videoEl.load()

                  // Attempt to play
                  videoEl.play()
                    .then(() => {
                      console.log('✅ Digital human video playback started successfully!')
                      this.setVideoReady(true)
                      this.updateVideoElement()
                    })
                    .catch(() => {
                      this.updateVideoElement()
                    })
                    .catch(err => console.warn('⚠️ Auto-play prevented:', err))
                } else if (videoEl.srcObject && videoEl.readyState === 0) {
                  // CRITICAL: srcObject exists but readyState is 0 - this is the current issue!
                  console.log('🔧 CRITICAL: Digital human video has srcObject but readyState is 0!')
                  const stream = videoEl.srcObject as MediaStream
                  const videoTracks = stream.getVideoTracks()
                  console.log(`🔍 Digital human MediaStream diagnostic:`, {
                    streamActive: stream.active,
                    streamId: stream.id,
                    videoTrackCount: videoTracks.length,
                    tracks: videoTracks.map(t => ({
                      id: t.id,
                      enabled: t.enabled,
                      muted: t.muted,
                      readyState: t.readyState,
                      label: t.label
                    }))
                  })

                  // Strategy: Force reload by removing and re-adding srcObject
                  console.log('🔧 Attempting srcObject reload strategy...')
                  const tempStream = videoEl.srcObject
                  videoEl.srcObject = null
                  setTimeout(() => {
                    videoEl.srcObject = tempStream
                    videoEl.load()
                    videoEl.play()
                      .then(() => {
                        console.log('✅ Digital human video reloaded and playing!')
                        this.setVideoReady(true)
                        this.updateVideoElement()
                      })
                      .catch(err => {
                        console.warn('⚠️ Digital human reload play failed:', err)
                        // Still mark as ready - video might play after user interaction
                        this.setVideoReady(true)
                        this.updateVideoElement()
                      })
                  }, 100)
                } else if (videoEl.srcObject && videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                  // Everything looks good
                  console.log('✅ Digital human video element properly configured')
                  this.setVideoReady(true)
                  this.updateVideoElement()
                } else if (result !== false) {
                  this.setVideoReady(true)
                  this.updateVideoElement()
                } else {
                  console.warn('⚠️ Digital human video element in unexpected state')
                  this.setVideoReady(false)
                }
              } else {
                console.error('❌ No video element found in container after playVideo call')
                this.setVideoReady(false)
              }
            }, 150) // Slightly longer delay to ensure ZEGO has time to create the element

          } catch (error) {
            console.error('❌ Digital human playVideo failed:', error)
            this.setVideoReady(false)
          }
        }

        attach()
      } catch (error) {
        if (remaining > 0) {
          setTimeout(() => void tryStart(remaining - 1), 500)
        } else {
          console.warn('Unable to start digital human stream playback:', error)
        }
      }
    }

    tryStart(attempts)
  }

  getStreamsDebug(): Array<{
    streamId: string
    videoTracks: number
    audioTracks: number
    isDigitalHumanVideo: boolean
    isAgentAudio: boolean
    isUserStream: boolean
    isPlaying: boolean
    audioActivated: boolean
  }> {
    const result: Array<{
      streamId: string
      videoTracks: number
      audioTracks: number
      isDigitalHumanVideo: boolean
      isAgentAudio: boolean
      isUserStream: boolean
      isPlaying: boolean
      audioActivated: boolean
    }> = []

    const userStreamId = this.currentUserId ? `${this.currentUserId}_stream` : null

    for (const [streamId, tracks] of this.streamTracks.entries()) {
      result.push({
        streamId,
        videoTracks: tracks.videoTracks,
        audioTracks: tracks.audioTracks,
        isDigitalHumanVideo: this.dhVideoStreamId === streamId,
        isAgentAudio: this.agentAudioStreamId === streamId,
        isUserStream: userStreamId === streamId,
        isPlaying: this.playingStreamIds.has(streamId),
        audioActivated: this.audioActivated.has(streamId)
      })
    }

    return result
  }
}

if (typeof window !== 'undefined') {
  ; (window as any).zegoDebug = {
    getService: () => ZegoService.getInstance(),
    getState: () => {
      const s = ZegoService.getInstance()
      return {
        isInRoom: s.isInRoom(),
        isVideoReady: s.isVideoReady(),
        roomId: s.getCurrentRoomId(),
        userId: s.getCurrentUserId(),
        dhVideoStreamId: (s as any).dhVideoStreamId,
        agentAudioStreamId: (s as any).agentAudioStreamId,
        streams: s.getStreamsDebug()
      }
    }
  }
}
