export interface Message {
  id: string
  content: string
  sender: 'user' | 'ai'
  timestamp: number
  type: 'text' | 'voice'
  isStreaming?: boolean
  audioUrl?: string
  duration?: number
  transcript?: string
}

export interface ConversationMemory {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  metadata: {
    totalMessages: number
    lastAIResponse: string
    topics: string[]
  }
}

export interface VoiceSettings {
  isEnabled: boolean
  autoPlay: boolean
  speechRate: number
  speechPitch: number
  preferredVoice?: string
}

export interface ChatSession {
  roomId: string
  userId: string
  agentInstanceId?: string
  agentStreamId?: string
  // Digital human session metadata
  digitalHumanTaskId?: string
  digitalHumanVideoStreamId?: string
  digitalHumanId?: string
  isActive: boolean
  conversationId?: string
  voiceSettings: VoiceSettings
}

export interface AIAgent {
  id: string
  name: string
  personality: string
  voiceCharacteristics: {
    language: 'en-US' | 'en-GB'
    gender: 'male' | 'female'
    speed: number
    pitch: number
  }
}

// Digital Human specific types
export interface DigitalHumanSession extends Omit<ChatSession, 'conversationId'> {
  digitalHumanId: string
  configId: 'web' | 'mobile'
  isVideoEnabled: boolean
  isAudioEnabled: boolean
}

// Interview specific types (re-export from interview.ts)
export type { 
  Interview,
  InterviewQuestion,
  InterviewResponse,
  InterviewMetadata,
  DigitalHumanConfig,
  InterviewSession,
  InterviewAnalytics,
  InterviewFeedback,
  InterviewEventType,
  InterviewEvent
} from './interview'

// API Response types
export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface StartSessionResponse {
  agentInstanceId: string
  agentUserId: string
  agentStreamId: string
  userStreamId: string
  digitalHumanId?: string
}

export interface TokenResponse {
  token: string
}

export interface HealthCheckResponse {
  status: string
  timestamp: string
  service?: string
  registered?: boolean
  config?: {
    appId: boolean
    serverSecret: boolean
    dashscope: boolean
  }
  features?: {
    digitalHuman: boolean
    voiceInterview: boolean
    realTimeTranscription: boolean
  }
}

// ZEGO specific types
export interface ZegoStreamInfo {
  streamID: string
  user: {
    userID: string
    userName: string
  }
}

export interface ZegoRoomMessage {
  Cmd: number
  SeqId: number
  Round: number
  Data: {
    Text?: string
    MessageId?: string
    EndFlag?: boolean
    UserId?: string
    Action?: string
  }
  Timestamp: number
}

// Error types
export interface AppError {
  code: string
  message: string
  details?: any
}

export type ErrorCode = 
  | 'CONNECTION_FAILED'
  | 'AUTHENTICATION_FAILED'
  | 'AGENT_START_FAILED'
  | 'DIGITAL_HUMAN_FAILED'
  | 'VOICE_RECORDING_FAILED'
  | 'MESSAGE_SEND_FAILED'
  | 'UNKNOWN_ERROR'

// Component prop types
export interface BaseComponentProps {
  className?: string
  children?: React.ReactNode
}

export interface LoadingState {
  isLoading: boolean
  loadingText?: string
}

export interface ErrorState {
  hasError: boolean
  error?: AppError | string
}

// Utility types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>

// Event handler types
export type MessageHandler = (message: Message) => void
export type ErrorHandler = (error: AppError) => void
export type StatusChangeHandler = (status: 'connected' | 'disconnected' | 'error') => void

// Configuration types
export interface AppConfig {
  ZEGO_APP_ID: string
  ZEGO_SERVER: string
  API_BASE_URL: string
  DEV_MODE?: boolean
  DEBUG_ENABLED?: boolean
}

export interface ServerConfig {
  ZEGO_APP_ID: string
  ZEGO_SERVER_SECRET: string
  ZEGO_API_BASE_URL: string
  DASHSCOPE_API_KEY: string
  PORT: number
  NODE_ENV: string
  SERVER_URL?: string
}
