import { useCallback, useRef, useEffect, useReducer } from 'react'
import type { Message, ChatSession, VoiceSettings } from '../types'
import { ZegoService } from '../services/zego'
import { digitalHumanAPI } from '../services/digitalHumanAPI'
import { INTERVIEW_QUESTIONS } from '../data/questions'

const generateRtcId = (prefix: string): string => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${timestamp}_${random}`
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
      const exists = state.messages.some(m => m.id === action.payload.id)
      if (exists) {
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
  const streamingMessages = useRef(new Map<string, string>())
  const asrSeqMap = useRef(new Map<string, number>()) // MessageId -> last SeqId (ASR only)
  const llmBuffers = useRef(new Map<string, Map<number, string>>()) // MessageId -> (SeqId -> chunk)
  const questionTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)

  const defaultVoiceSettings: VoiceSettings = {
    isEnabled: true,
    autoPlay: true,
    speechRate: 1.0,
    speechPitch: 1.0,
  }

  const cleanup = useCallback(() => {
    cleanupFunctions.current.forEach(fn => fn())
    cleanupFunctions.current = []
    processedMessageIds.current.clear()
    messageHandlerSetup.current = false
    streamingMessages.current.clear()
    if (questionTimeoutRef.current) {
      clearTimeout(questionTimeoutRef.current)
    }
  }, [])

  const addMessageSafely = useCallback((message: Message) => {
    if (processedMessageIds.current.has(message.id)) {
      return
    }

    processedMessageIds.current.add(message.id)
    dispatch({ type: 'ADD_MESSAGE', payload: message })
  }, [])

  const askNextQuestion = useCallback(() => {
    const nextQuestionIndex = state.questionsAsked
    
    if (nextQuestionIndex >= INTERVIEW_QUESTIONS.length) {
      // Interview complete
      dispatch({ type: 'SET_INTERVIEW_COMPLETE', payload: true })
      dispatch({ type: 'SET_CURRENT_QUESTION', payload: '' })
      return
    }

    const nextQuestion = INTERVIEW_QUESTIONS[nextQuestionIndex]
    dispatch({ type: 'SET_CURRENT_QUESTION', payload: nextQuestion })
    dispatch({ type: 'INCREMENT_QUESTIONS_ASKED' })

    // Send question to AI agent after a brief delay
    if (state.session?.agentInstanceId) {
      questionTimeoutRef.current = setTimeout(async () => {
        try {
          await digitalHumanAPI.sendMessage(state.session!.agentInstanceId!, nextQuestion)
        } catch (error) {
          console.error('Failed to send question:', error)
        }
      }, 1000)
    }
  }, [state.questionsAsked, state.session?.agentInstanceId])

  const setupMessageHandlers = useCallback(() => {
    if (messageHandlerSetup.current) return

    messageHandlerSetup.current = true

    const handleRoomMessage = (data: any) => {
      try {
        const { Cmd, Data: msgData, SeqId } = data
        
        if (Cmd === 3) {
          // ASR results - user speech
          const { Text: transcript, EndFlag, MessageId } = msgData
          
          if (transcript && transcript.trim()) {
            // Keep only the latest by SeqId per MessageId
            const mid = MessageId || 'asr_default'
            const last = asrSeqMap.current.get(mid) ?? -1
            if (typeof SeqId === 'number' && SeqId < last) {
              return
            }
            if (typeof SeqId === 'number') asrSeqMap.current.set(mid, SeqId)

            // ASR is full text per message; replace current transcript
            dispatch({ type: 'SET_TRANSCRIPT', payload: transcript })
            dispatch({ type: 'SET_AGENT_STATUS', payload: 'listening' })
            
            if (EndFlag) {
              const messageId = MessageId || `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
              
              const userMessage: Message = {
                id: messageId,
                content: transcript.trim(),
                sender: 'user',
                timestamp: Date.now(),
                type: 'voice',
                transcript: transcript.trim()
              }
              
              addMessageSafely(userMessage)
              dispatch({ type: 'SET_TRANSCRIPT', payload: '' })
              dispatch({ type: 'SET_AGENT_STATUS', payload: 'thinking' })
              
              // Wait for AI response, then ask next question
              setTimeout(() => {
                askNextQuestion()
              }, 3000)
              // Clear ASR tracker for this round
              asrSeqMap.current.delete(mid)
            }
          }
        } else if (Cmd === 4) {
          // LLM results - AI response
          const { Text: content, MessageId, EndFlag } = msgData
          if (!content || !MessageId) return

          // Build ordered buffer by SeqId per MessageId
          const seqId = typeof SeqId === 'number' ? SeqId : 0
          if (!llmBuffers.current.has(MessageId)) {
            llmBuffers.current.set(MessageId, new Map<number, string>())
          }
          llmBuffers.current.get(MessageId)!.set(seqId, content)

          // Reconstruct in order
          const ordered = Array.from(llmBuffers.current.get(MessageId)!.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, chunk]) => chunk)
            .join('')

          if (EndFlag) {
            // Finalize message content
            if (!processedMessageIds.current.has(MessageId)) {
              // If we somehow never added it, add final
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
            } else {
              dispatch({ type: 'UPDATE_MESSAGE', payload: {
                id: MessageId,
                updates: { content: ordered, isStreaming: false }
              }})
            }
            llmBuffers.current.delete(MessageId)
            streamingMessages.current.delete(MessageId)
            dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
          } else {
            // Streaming update
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
              dispatch({ type: 'UPDATE_MESSAGE', payload: {
                id: MessageId,
                updates: { content: ordered, isStreaming: true }
              }})
            }
            dispatch({ type: 'SET_AGENT_STATUS', payload: 'speaking' })
          }
        }
      } catch (error) {
        console.error('Error handling room message:', error)
        dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
      }
    }

    zegoService.current.onRoomMessage(handleRoomMessage)
    
    cleanupFunctions.current.push(() => {
      zegoService.current.onRoomMessage(() => {})
    })
  }, [addMessageSafely, askNextQuestion])

  const startInterview = useCallback(async (): Promise<boolean> => {
    if (state.isLoading || state.isConnected) return false
    
    dispatch({ type: 'SET_LOADING', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })
    dispatch({ type: 'SET_START_TIME', payload: Date.now() })
    
    try {
      const roomId = generateRtcId('interview')
      const userId = generateRtcId('candidate')

      await zegoService.current.initialize()
      
      const joinResult = await zegoService.current.joinRoom(roomId, userId)
      if (!joinResult) throw new Error('Failed to join ZEGO room')

      const result = await digitalHumanAPI.startInterview(roomId, userId)
      
      const newSession: ChatSession = {
        roomId,
        userId,
        agentInstanceId: result.agentInstanceId,
        isActive: true,
        voiceSettings: defaultVoiceSettings
      }
      
      dispatch({ type: 'SET_SESSION', payload: newSession })
      dispatch({ type: 'SET_CONNECTED', payload: true })
      
      setupMessageHandlers()
      
      // Start the interview with first question after a brief delay
      setTimeout(() => {
        askNextQuestion()
      }, 2000)
      
      return true
    } catch (error) {
      console.error('Failed to start interview:', error)
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to start interview' })
      return false
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [state.isLoading, state.isConnected, setupMessageHandlers, askNextQuestion])

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
      // Send text to agent (LLM trigger)
      await digitalHumanAPI.sendMessage(state.session.agentInstanceId, trimmedContent)
      // Optionally schedule next scripted question slightly later
      setTimeout(() => {
        askNextQuestion()
      }, 2000)
      
    } catch (error) {
      console.error('Failed to send message:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Failed to send message' })
      dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
    }
  }, [state.session, addMessageSafely, askNextQuestion])

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

  const toggleVoiceSettings = useCallback(() => {
    if (state.session) {
      const updatedSession = {
        ...state.session,
        voiceSettings: {
          ...state.session.voiceSettings,
          isEnabled: !state.session.voiceSettings.isEnabled
        }
      }
      dispatch({ type: 'SET_SESSION', payload: updatedSession })
    }
  }, [state.session])

  const endInterview = useCallback(async () => {
    if (!state.session && !state.isConnected) return
    
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      
      if (state.isRecording) {
        await zegoService.current.enableMicrophone(false)
        dispatch({ type: 'SET_RECORDING', payload: false })
      }
      
      if (state.session?.agentInstanceId) {
        await digitalHumanAPI.stopInterview(state.session.agentInstanceId)
      }
      
      await zegoService.current.leaveRoom()
      
      cleanup()
      dispatch({ type: 'SET_SESSION', payload: null })
      dispatch({ type: 'SET_CONNECTED', payload: false })
      dispatch({ type: 'SET_AGENT_STATUS', payload: 'idle' })
      dispatch({ type: 'SET_TRANSCRIPT', payload: '' })
      dispatch({ type: 'SET_INTERVIEW_COMPLETE', payload: true })
      dispatch({ type: 'SET_ERROR', payload: null })
      
    } catch (error) {
      console.error('Failed to end interview:', error)
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [state.session, state.isConnected, state.isRecording, cleanup])

  useEffect(() => {
    return () => {
      if (state.session?.isActive || state.isConnected) {
        endInterview()
      }
      cleanup()
    }
  }, [])

  return {
    ...state,
    startInterview,
    sendTextMessage,
    toggleVoiceRecording,
    toggleVoiceSettings,
    endInterview,
    askNextQuestion
  }
}
