import { useCallback, useRef, useEffect, useReducer } from 'react'
import type { Message, ChatSession, VoiceSettings, ZegoRoomMessage } from '../types'
import { memoryService } from '../services/memory'
import { ZegoService } from '../services/zego'
import { digitalHumanAPI } from '../services/digitalHumanAPI'

const generateRtcId = (prefix: string): string => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${timestamp}_${random}`
}

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  isEnabled: false,
  autoPlay: true,
  speechRate: 1.0,
  speechPitch: 1.0
}

interface InterviewState {
  messages: Message[]
  session: ChatSession | null
  isLoading: boolean
  isConnected: boolean
  isRecording: boolean
  currentTranscript: string
  agentStatus: 'idle' | 'listening' | 'thinking' | 'speaking'
  error: string | null
  currentQuestion: string
  questionsAsked: number
  isInterviewComplete: boolean
  startTime: number | null
}

type InterviewAction =
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<Message> } }
  | { type: 'SET_SESSION'; payload: ChatSession | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_RECORDING'; payload: boolean }
  | { type: 'SET_TRANSCRIPT'; payload: string }
  | { type: 'SET_AGENT_STATUS'; payload: 'idle' | 'listening' | 'thinking' | 'speaking' }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CURRENT_QUESTION'; payload: string }
  | { type: 'INCREMENT_QUESTIONS_ASKED' }
  | { type: 'SET_INTERVIEW_COMPLETE'; payload: boolean }
  | { type: 'SET_START_TIME'; payload: number }
  | { type: 'RESET_INTERVIEW' }

const initialState: InterviewState = {
  messages: [],
  session: null,
  isLoading: false,
  isConnected: false,
  isRecording: false,
  currentTranscript: '',
  agentStatus: 'idle',
  error: null,
  currentQuestion: '',
  questionsAsked: 0,
  isInterviewComplete: false,
  startTime: null
}

function interviewReducer(state: InterviewState, action: InterviewAction): InterviewState {
  switch (action.type) {
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload }

    case 'ADD_MESSAGE':
      if (state.messages.some(m => m.id === action.payload.id)) {
        return {
          ...state,
          messages: state.messages.map(m =>
            m.id === action.payload.id ? action.payload : m
          )
        }
      }
      return { ...state, messages: [...state.messages, action.payload] }

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.payload.id ? { ...m, ...action.payload.updates } : m
        )
      }

    case 'SET_SESSION':
      return { ...state, session: action.payload }

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }

    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload }

    case 'SET_RECORDING':
      return { ...state, isRecording: action.payload }

    case 'SET_TRANSCRIPT':
      return { ...state, currentTranscript: action.payload }

    case 'SET_AGENT_STATUS':
      return { ...state, agentStatus: action.payload }

    case 'SET_ERROR':
      return { ...state, error: action.payload }

    case 'SET_CURRENT_QUESTION':
      return { ...state, currentQuestion: action.payload }

    case 'INCREMENT_QUESTIONS_ASKED':
      return { ...state, questionsAsked: state.questionsAsked + 1 }

    case 'SET_INTERVIEW_COMPLETE':
      return { ...state, isInterviewComplete: action.payload }

    case 'SET_START_TIME':
      return { ...state, startTime: action.payload }

    case 'RESET_INTERVIEW':
      return { ...initialState }

    default:
      return state
  }
}

export const useInterview = () => {
  const [state, dispatch] = useReducer(interviewReducer, initialState)

  const zegoService = useRef(ZegoService.getInstance())
  const processedMessageIds = useRef(new Set<string>())
  const messageHandlerSetup = useRef(false)
  const cleanupFunctions = useRef<(() => void)[]>([])
  const asrSeqMap = useRef(new Map<string, number>())
  const llmBuffers = useRef(new Map<string, Map<number, string>>())
  const questionTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const voiceDebounceRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const pendingVoiceMessageRef = useRef<Message | null>(null)
  const speakingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const latestSessionRef = useRef<ChatSession | null>(null)
  const isConnectedRef = useRef(false)
  const isRecordingRef = useRef(false)

  const cleanup = useCallback(() => {
    cleanupFunctions.current.forEach(fn => fn())
    cleanupFunctions.current = []
    processedMessageIds.current.clear()
    messageHandlerSetup.current = false
    if (questionTimeoutRef.current) {
      clearTimeout(questionTimeoutRef.current)
    }
    if (voiceDebounceRef.current) {
      clearTimeout(voiceDebounceRef.current)
    }
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current)
    }
    try {
      zegoService.current.setDigitalHumanStream(null)
    } catch (error) {
      console.warn('Failed to reset digital human stream on cleanup:', error)
    }
  }, [])

  useEffect(() => {
    latestSessionRef.current = state.session
  }, [state.session])

  useEffect(() => {
    isConnectedRef.current = state.isConnected
  }, [state.isConnected])

  useEffect(() => {
    isRecordingRef.current = state.isRecording
  }, [state.isRecording])

  const addMessageSafely = useCallback((message: Message) => {
    if (processedMessageIds.current.has(message.id)) return
    processedMessageIds.current.add(message.id)
    dispatch({ type: 'ADD_MESSAGE', payload: message })

    // Auto-detect interview completion
    if (message.sender === 'ai' && message.content.toLowerCase().includes('this concludes our interview')) {
      setTimeout(() => {
        dispatch({ type: 'SET_INTERVIEW_COMPLETE', payload: true })
      }, 2000)
    }
  }, [])

  const setupMessageHandlers = useCallback(() => {
    if (messageHandlerSetup.current) return

    messageHandlerSetup.current = true

    const handleRoomMessage = (data: ZegoRoomMessage) => {
      try {
        const { Cmd, Data: msgData, SeqId } = data

        if (Cmd === 3) {
          const { Text: transcript, EndFlag, MessageId } = msgData

          if (transcript?.trim()) {
            const mid = MessageId || 'asr_default'
            const last = asrSeqMap.current.get(mid) ?? -1

            if (typeof SeqId === 'number' && SeqId < last) return
            if (typeof SeqId === 'number') asrSeqMap.current.set(mid, SeqId)

            dispatch({ type: 'SET_TRANSCRIPT', payload: transcript })
            dispatch({ type: 'SET_AGENT_STATUS', payload: 'listening' })

            if (EndFlag) {
              if (voiceDebounceRef.current) {
                clearTimeout(voiceDebounceRef.current)
              }

              const messageId = MessageId || `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

              const userMessage: Message = {
                id: messageId,
                content: transcript.trim(),
                sender: 'user',
                timestamp: Date.now(),
                type: 'voice',
                transcript: transcript.trim()
              }

              pendingVoiceMessageRef.current = userMessage

              voiceDebounceRef.current = setTimeout(() => {
                if (pendingVoiceMessageRef.current) {
                  addMessageSafely(pendingVoiceMessageRef.current)
                  dispatch({ type: 'SET_TRANSCRIPT', payload: '' })
                  dispatch({ type: 'SET_AGENT_STATUS', payload: 'thinking' })
                  dispatch({ type: 'INCREMENT_QUESTIONS_ASKED' })
                  pendingVoiceMessageRef.current = null
                }
              }, 1500)

              asrSeqMap.current.delete(mid)
            }
          }
        } else if (Cmd === 4) {
          const { Text: content, MessageId, EndFlag } = msgData
          if (!content || !MessageId) return

          const seqId = typeof SeqId === 'number' ? SeqId : 0
          if (!llmBuffers.current.has(MessageId)) {
            llmBuffers.current.set(MessageId, new Map<number, string>())
          }
          llmBuffers.current.get(MessageId)!.set(seqId, content)

          const ordered = Array.from(llmBuffers.current.get(MessageId)!.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, chunk]) => chunk)
            .join('')

          if (EndFlag) {
            if (!processedMessageIds.current.has(MessageId)) {
              const finalMsg: Message = {
                id: MessageId,
                content: ordered,
                sender: 'ai',
                timestamp: Date.now(),
                type: 'text',
                isStreaming: false
              }
              processedMessageIds.current.add(MessageId)
              dispatch({ type: 'ADD_MESSAGE', payload: finalMsg })

              if (ordered.toLowerCase().includes('this concludes our interview')) {
                setTimeout(() => {
                  dispatch({ type: 'SET_INTERVIEW_COMPLETE', payload: true })
                }, 2000)
              }
            } else {
              dispatch({
                type: 'UPDATE_MESSAGE',
                payload: {
                  id: MessageId,
                  updates: { content: ordered, isStreaming: false }
                }
              })
            }

            llmBuffers.current.delete(MessageId)

            const speakingTime = Math.min(ordered.length * 80, 10000) // Cap at 10s max extra wait

            if (speakingTimeoutRef.current) {
              clearTimeout(speakingTimeoutRef.current)
            }

            speakingTimeoutRef.current = setTimeout(() => {
              dispatch({ type: 'SET_AGENT_STATUS', payload: 'listening' })
            }, speakingTime)

          } else {
            if (!processedMessageIds.current.has(MessageId)) {
              const streamingMessage: Message = {
                id: MessageId,
                content: ordered,
                sender: 'ai',
                timestamp: Date.now(),
                type: 'text',
                isStreaming: true
              }
              processedMessageIds.current.add(MessageId)
              dispatch({ type: 'ADD_MESSAGE', payload: streamingMessage })
            } else {
              dispatch({
                type: 'UPDATE_MESSAGE',
                payload: {
                  id: MessageId,
                  updates: { content: ordered, isStreaming: true }
                }
              })
            }
            dispatch({ type: 'SET_AGENT_STATUS', payload: 'speaking' })

            // Fallback: if we stop receiving LLM chunks, assume the agent finished speaking
            if (speakingTimeoutRef.current) {
              clearTimeout(speakingTimeoutRef.current)
            }
          }
        }
      } catch (error) {
        console.error('Error handling room message:', error)
        dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
      }
    }

    zegoService.current.onRoomMessage(handleRoomMessage)

    cleanupFunctions.current.push(() => {
      zegoService.current.onRoomMessage(() => undefined)
    })
  }, [addMessageSafely])

  const startInterview = useCallback(async (): Promise<boolean> => {
    if (state.isLoading || state.isConnected) return false

    dispatch({ type: 'SET_LOADING', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })
    dispatch({ type: 'SET_START_TIME', payload: Date.now() })

    try {
      const rawRoomId = generateRtcId('interview')
      const rawUserId = generateRtcId('candidate')
      const roomId = rawRoomId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || rawRoomId.slice(0, 32)
      const userId = rawUserId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || rawUserId.slice(0, 32)

      await zegoService.current.initialize()

      const result = await digitalHumanAPI.startInterview(roomId, userId)
      const joinedRoomId = result.roomId || roomId

      const joinResult = await zegoService.current.joinRoom(joinedRoomId, userId)
      if (!joinResult) throw new Error('Failed to join ZEGO room')

      if (result.agentStreamId) {
        zegoService.current.setAgentAudioStream(result.agentStreamId)
        console.log('Agent audio stream configured:', result.agentStreamId)
      }

      if (result.digitalHumanVideoStreamId) {
        console.log(' Configuring digital human video stream:', result.digitalHumanVideoStreamId)
        zegoService.current.setDigitalHumanStream(result.digitalHumanVideoStreamId)
        zegoService.current.setVoicePreference(DEFAULT_VOICE_SETTINGS.isEnabled)
        console.log(' Digital human video stream configured')
      } else {
        console.warn(' No digital human video stream ID received from backend')
      }

      const newSession: ChatSession = {
        roomId: joinedRoomId,
        userId,
        agentInstanceId: result.agentInstanceId,
        agentStreamId: result.agentStreamId,
        digitalHumanTaskId: result.digitalHumanTaskId,
        digitalHumanVideoStreamId: result.digitalHumanVideoStreamId,
        digitalHumanId: result.digitalHumanId,
        isActive: true,
        voiceSettings: DEFAULT_VOICE_SETTINGS
      }

      dispatch({ type: 'SET_SESSION', payload: newSession })
      dispatch({ type: 'SET_CONNECTED', payload: true })

      setupMessageHandlers()

      console.log('Interview session created. Waiting for streams:', {
        digitalHumanVideoStreamId: result.digitalHumanVideoStreamId,
        agentStreamId: result.agentStreamId,
        roomId: joinedRoomId
      })

      setupMessageHandlers()

      // Kick off the conversation so the AI starts the interview proactively
      try {
        await digitalHumanAPI.sendMessage(
          newSession.agentInstanceId!,
          'Please start the interview now. Greet the candidate warmly and ask your first introduction question.'
        )
      } catch (error) {
        console.warn('Failed to send initial interview prompt to agent:', error)
      }

      return true
    } catch (error) {
      console.error('Failed to start interview:', error)
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to start interview' })
      return false
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [state.isLoading, state.isConnected, setupMessageHandlers])

  const sendTextMessage = useCallback(async (content: string) => {
    if (!state.session?.agentInstanceId) {
      dispatch({ type: 'SET_ERROR', payload: 'No active session' })
      return
    }

    const trimmedContent = content.trim()
    if (!trimmedContent) return

    try {
      const messageId = `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      const userMessage: Message = {
        id: messageId,
        content: trimmedContent,
        sender: 'user',
        timestamp: Date.now(),
        type: 'text'
      }

      addMessageSafely(userMessage)
      dispatch({ type: 'SET_AGENT_STATUS', payload: 'thinking' })

      await digitalHumanAPI.sendMessage(state.session.agentInstanceId, trimmedContent)

    } catch (error) {
      console.error('Failed to send message:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to send message' })
      dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
    }
  }, [state.session, addMessageSafely])

  const toggleVoiceRecording = useCallback(async () => {
    if (!state.isConnected) return

    try {
      if (state.isRecording) {
        await zegoService.current.enableMicrophone(false)
        dispatch({ type: 'SET_RECORDING', payload: false })
        dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
      } else {
        const success = await zegoService.current.enableMicrophone(true)
        if (success) {
          dispatch({ type: 'SET_RECORDING', payload: true })
          dispatch({ type: 'SET_AGENT_STATUS', payload: 'listening' })
        }
      }
    } catch (error) {
      console.error('Failed to toggle recording:', error)
      dispatch({ type: 'SET_RECORDING', payload: false })
      dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
    }
  }, [state.isConnected, state.isRecording])

  // Auto-gate microphone based on agent speaking/listening state
  useEffect(() => {
    if (!state.isConnected) return
    const micShouldBeOn = state.agentStatus === 'listening'
    zegoService.current.enableMicrophone(micShouldBeOn).then((ok) => {
      if (ok) dispatch({ type: 'SET_RECORDING', payload: micShouldBeOn })
    }).catch((error) => {
      console.warn('Failed to auto-toggle microphone based on agent status:', error)
    })
  }, [state.agentStatus, state.isConnected])

  const toggleVoiceSettings = useCallback(() => {
    if (!state.session) return

    const nextEnabled = !state.session.voiceSettings.isEnabled
    const updatedSession = {
      ...state.session,
      voiceSettings: {
        ...state.session.voiceSettings,
        isEnabled: nextEnabled
      }
    }
    dispatch({ type: 'SET_SESSION', payload: updatedSession })

    try {
      zegoService.current.setVoicePreference(nextEnabled)
    } catch (error) {
      console.warn('Failed to apply voice preference', error)
    }
  }, [state.session])

  const endInterview = useCallback(async () => {
    if (!state.session && !state.isConnected) return

    dispatch({ type: 'SET_LOADING', payload: true })

    try {
      if (state.isRecording) {
        await zegoService.current.enableMicrophone(false)
        dispatch({ type: 'SET_RECORDING', payload: false })
      }
    } catch (error) {
      console.warn('Failed to disable microphone when ending interview:', error)
    }

    try {
      if (state.session?.agentInstanceId) {
        await digitalHumanAPI.stopInterview(state.session.agentInstanceId, state.session.digitalHumanTaskId)
      }
    } catch (e) {
      console.warn('Stop interview failed', e)
    }

    try {
      await zegoService.current.leaveRoom()
    } catch (e) {
      console.warn('Leave room failed', e)
    }

    cleanup()
    try {
      memoryService.clearAllConversations()
    } catch (error) {
      console.warn('Failed to clear stored conversations on interview end:', error)
    }
    dispatch({ type: 'SET_SESSION', payload: null })
    dispatch({ type: 'SET_CONNECTED', payload: false })
    dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
    dispatch({ type: 'SET_TRANSCRIPT', payload: '' })
    dispatch({ type: 'SET_INTERVIEW_COMPLETE', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })
    dispatch({ type: 'SET_LOADING', payload: false })
  }, [state.session, state.isConnected, state.isRecording, cleanup])

  useEffect(() => {
    const service = zegoService.current

    return () => {
      const session = latestSessionRef.current
      const isConnected = isConnectedRef.current
      const isRecording = isRecordingRef.current

      if (isRecording) {
        service.enableMicrophone(false).catch((error) => {
          console.warn('Failed to disable microphone during interview cleanup:', error)
        })
      }

      if (session?.agentInstanceId) {
        digitalHumanAPI
          .stopInterview(session.agentInstanceId, session.digitalHumanTaskId)
          .catch(error => {
            console.warn('Stop interview during cleanup failed', error)
          })
      }

      if (isConnected) {
        service.leaveRoom().catch(error => {
          console.warn('Leave room during cleanup failed', error)
        })
      }

      cleanup()
    }
  }, [cleanup])

  return {
    ...state,
    startInterview,
    sendTextMessage,
    toggleVoiceRecording,
    toggleVoiceSettings,
    endInterview
  }
}
