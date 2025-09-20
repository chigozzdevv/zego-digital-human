export interface Interview {
  id: string
  status: 'setup' | 'active' | 'completed'
  startTime: number
  endTime?: number
  candidateId: string
  questions: InterviewQuestion[]
  responses: InterviewResponse[]
  metadata: InterviewMetadata
}

export interface InterviewQuestion {
  id: string
  text: string
  type: 'introduction' | 'behavioral' | 'technical' | 'situational' | 'closing'
  category?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  timeLimit?: number // seconds
  askedAt?: number // timestamp
}

export interface InterviewResponse {
  id: string
  questionId: string
  content: string
  type: 'voice' | 'text'
  duration?: number // seconds for voice responses
  timestamp: number
  confidence?: number // 0-1 scale
  sentiment?: 'positive' | 'neutral' | 'negative'
  wordCount?: number
}

export interface InterviewMetadata {
  totalDuration: number // seconds
  questionsAsked: number
  questionsAnswered: number
  averageResponseTime: number // seconds
  voiceResponseCount: number
  textResponseCount: number
  interviewType: string
  completionRate: number // 0-1 scale
}

export interface DigitalHumanConfig {
  digitalHumanId: string
  configId: 'web' | 'mobile'
  voice: {
    enabled: boolean
    volume: number
    speed: number
  }
  video: {
    enabled: boolean
    quality: 'low' | 'medium' | 'high'
    resolution: '720p' | '1080p'
  }
  expressions: {
    enabled: boolean
    intensity: number
  }
}

export interface InterviewSession extends Omit<import('./index').ChatSession, 'conversationId'> {
  interviewId: string
  digitalHumanConfig?: DigitalHumanConfig
  currentQuestionIndex: number
  questionsAsked: number
  isCompleted: boolean
}

export interface InterviewAnalytics {
  responseTimeMetrics: {
    average: number
    median: number
    min: number
    max: number
  }
  speechMetrics: {
    wordsPerMinute: number
    pauseCount: number
    fillerWordCount: number
  }
  engagementMetrics: {
    eyeContactPercentage?: number
    energyLevel?: number
    confidenceLevel?: number
  }
  contentAnalysis: {
    keywordMatches: string[]
    relevanceScore: number
    clarityScore: number
  }
}

export interface InterviewFeedback {
  overallScore: number // 0-100
  strengths: string[]
  areasForImprovement: string[]
  recommendations: string[]
  detailedFeedback: {
    communication: number
    technicalKnowledge: number
    problemSolving: number
    culturalFit: number
  }
}

export type InterviewEventType = 
  | 'interview_started'
  | 'question_asked'
  | 'response_received'
  | 'question_skipped'
  | 'interview_paused'
  | 'interview_resumed'
  | 'interview_completed'
  | 'technical_issue'

export interface InterviewEvent {
  id: string
  type: InterviewEventType
  timestamp: number
  data: any
  metadata?: Record<string, any>
}