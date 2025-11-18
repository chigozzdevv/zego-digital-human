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
      try { ZegoExpressEngine.use(VoiceChanger) } catch {}
      this.zg = new ZegoExpressEngine(parseInt(config.ZEGO_APP_ID), config.ZEGO_SERVER, { scenario: 7 })
      try {
        const rtcSup = await this.zg.checkSystemRequirements('webRTC')
        const micSup = await this.zg.checkSystemRequirements('microphone')
        if (!rtcSup?.result) throw new Error('WebRTC not supported')
        if (!micSup?.result) console.warn('Microphone permission not granted yet')
      } catch {}
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
    this.videoElement = document.getElementById('digital-human-video') as HTMLVideoElement
    this.setupMediaEventListeners()
  }

  private setupMediaEventListeners(): void {
    if (this.audioElement) {
      this.audioElement.addEventListener('error', (e) => console.error('Audio error:', e))
    }
    if (this.videoElement) {
      this.videoElement.addEventListener('error', (e) => console.error('Video error:', e))
    }
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
        const userStreamId = this.currentUserId ? `${this.currentUserId}_stream` : null
        for (const stream of streamList) {
          const streamId = stream.streamID
          try { console.log('roomStreamUpdate ADD:', streamId) } catch {}
          if (userStreamId && streamId === userStreamId) continue
          if (typeof streamId === 'string' && streamId.startsWith('zegoprobe')) continue
          if (this.isStreamPlaying(streamId)) continue
          try {
            const playOption = { jitterBufferTarget: 500 } as any
            const mediaStream = await this.zg!.startPlayingStream(streamId, playOption)
            if (!mediaStream) continue
            try {
              const v = mediaStream.getVideoTracks()?.length || 0
              const a = mediaStream.getAudioTracks()?.length || 0
              console.log('Remote media tracks:', { streamId, videoTracks: v, audioTracks: a })
              this.streamTracks.set(streamId, { videoTracks: v, audioTracks: a })
            } catch {}
            const remoteView = await (this.zg as any).createRemoteStreamView(mediaStream)
            if (remoteView) {
              // Ensure audio can start under autoplay policies; suppress unhandled rejections
              Promise.resolve(remoteView.playAudio({ enableAutoplayDialog: true }))
                .then((r: any) => { if (r !== false) this.audioActivated.add(streamId) })
                .catch(() => {})
              this.remoteViews.set(streamId, remoteView)
              this.markStreamPlaying(streamId)
              // Fallback: if a video track already exists, try render immediately
              try {
                const hasVideo = (mediaStream.getVideoTracks?.() || []).length > 0
                if (hasVideo) {
                  const playNow = async (retries = 4) => {
                    const el = document.getElementById('remoteSteamView')
                    if (!el) {
                      if (retries > 0) return setTimeout(() => playNow(retries - 1), 150)
                      return
                    }
                    try {
                      const r = await Promise.resolve(remoteView.playVideo('remoteSteamView', { enableAutoplayDialog: false }))
                      if (r === false) {
                        const r2 = await Promise.resolve(remoteView.playVideo(el, { enableAutoplayDialog: false }))
                        if (r2 === true) this.setVideoReady(true)
                      } else {
                        this.setVideoReady(true)
                      }
                    } catch {}
                  }
                  playNow()
                }
              } catch {}
            }
          } catch (error) {
            console.error('Failed starting remote stream via RemoteView:', streamId, error)
          }
        }
      }

      if (updateType === 'DELETE') {
        const userStreamId = this.currentUserId ? `${this.currentUserId}_stream` : null
        for (const stream of streamList) {
          try { console.log('roomStreamUpdate DELETE:', stream.streamID) } catch {}
          if (userStreamId && stream.streamID === userStreamId) continue
          try { this.zg!.stopPlayingStream(stream.streamID) } catch {}
          const rv = this.remoteViews.get(stream.streamID)
          if (rv && typeof rv.destroy === 'function') { try { rv.destroy() } catch {} }
          this.remoteViews.delete(stream.streamID)
          this.streamTracks.delete(stream.streamID)
          this.unmarkStreamPlaying(stream.streamID)
          this.audioActivated.delete(stream.streamID)
          if (this.dhVideoStreamId === stream.streamID) this.setVideoReady(false)
        }
      }
    })

    this.zg.on('remoteCameraStatusUpdate', (streamID: string, status: 'OPEN' | 'MUTE') => {
      try { console.log('remoteCameraStatusUpdate:', streamID, status) } catch {}
      const rv = this.remoteViews.get(streamID)
      if (!rv) return
      if (status !== 'OPEN') { this.setVideoReady(false); return }

      const tryPlay = async (retries = 6) => {
        const el = document.getElementById('remoteSteamView')
        if (!el) {
          if (retries > 0) return setTimeout(() => tryPlay(retries - 1), 150)
          console.warn('remoteSteamView container not found'); this.setVideoReady(false); return
        }
        try {
          const res = await Promise.resolve(rv.playVideo('remoteSteamView', { enableAutoplayDialog: false }))
          if (res === false) {
            const res2 = await Promise.resolve(rv.playVideo(el, { enableAutoplayDialog: false }))
            this.setVideoReady(res2 === true)
          } else {
            this.setVideoReady(true)
          }
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
      } catch {}
    })
  }

  private handleRoomMessage(message: any): void {
    try { this.messageCallback?.(message) } catch (e) { console.warn('Room message handler error:', e) }
  }

  private setVideoReady(ready: boolean): void {
    this.videoReady = ready
    try { document.dispatchEvent(new CustomEvent('zego-digital-human-video-state', { detail: { ready } })) } catch {}
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
        try { this.zg.stopPlayingStream(sid) } catch {}
        if (rv && typeof rv.destroy === 'function') { try { rv.destroy() } catch {} }
      }
      if (this.dhRemoteView && typeof this.dhRemoteView.destroy === 'function') {
        try { this.dhRemoteView.destroy() } catch {}
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
        try { this.dhRemoteView.destroy() } catch {}
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
          Promise.resolve((this.zg as any).mutePlayStreamAudio(this.agentAudioStreamId, !this.voiceEnabled)).catch(() => {})
        }
      } else if (this.zg) {
        for (const sid of this.remoteViews.keys()) {
          if (this.audioActivated.has(sid)) {
            Promise.resolve((this.zg as any).mutePlayStreamAudio(sid, !this.voiceEnabled)).catch(() => {})
          }
        }
      }
    } catch {}
  }

  ensureVideoContainer(): void { /* RemoteStreamView renders into #remoteSteamView */ }

  async unlockAutoplay(): Promise<void> {
    try { if (this.audioElement) await this.audioElement.play().catch(() => {}) } catch {}
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
    if (this.isStreamPlaying(streamId)) return

    const tryStart = async (remaining: number): Promise<void> => {
      if (!this.zg || !this.dhVideoStreamId || streamId !== this.dhVideoStreamId) return
      try {
        const mediaStream = await this.zg.startPlayingStream(streamId)
        if (!mediaStream) throw new Error('No media stream returned')
        const videoTracks = mediaStream.getVideoTracks?.().length || 0
        const audioTracks = mediaStream.getAudioTracks?.length || 0
        this.streamTracks.set(streamId, { videoTracks, audioTracks })

        const remoteView = await (this.zg as any).createRemoteStreamView(mediaStream)
        if (!remoteView) throw new Error('Failed to create remote view for digital human stream')

        Promise.resolve(remoteView.playAudio({ enableAutoplayDialog: true }))
          .then((result: any) => { if (result !== false) this.audioActivated.add(streamId) })
          .catch(() => {})

        this.remoteViews.set(streamId, remoteView)
        this.markStreamPlaying(streamId)
        this.dhRemoteView = remoteView

        const attach = async (): Promise<void> => {
          const container = document.getElementById('remoteSteamView')
          if (!container) {
            setTimeout(attach, 150)
            return
          }
          try {
            const res = await Promise.resolve(remoteView.playVideo('remoteSteamView', { enableAutoplayDialog: false }))
            if (res === false) {
              const res2 = await Promise.resolve(remoteView.playVideo(container, { enableAutoplayDialog: false }))
              this.setVideoReady(res2 === true)
            } else {
              this.setVideoReady(true)
            }
          } catch (error) {
            console.warn('Digital human playVideo failed:', error)
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
  ;(window as any).zegoDebug = {
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
