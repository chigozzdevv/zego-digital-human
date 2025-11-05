import express, { type Request, type Response, type NextFunction } from 'express'
import crypto from 'crypto'
import axios from 'axios'
import cors from 'cors'
import dotenv from 'dotenv'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { generateToken04 } = require('../zego-token.cjs')

dotenv.config()

const app = express()
app.use(express.json())

// CORS: allow production and local dev; override via ALLOWED_ORIGINS env (comma-separated)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://zego-digital-human.vercel.app,http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    const allowed = ALLOWED_ORIGINS.includes(origin)
    return allowed ? callback(null, true) : callback(new Error(`CORS blocked for origin: ${origin}`), false)
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
}
app.use(cors(corsOptions))

const CONFIG = {
  ZEGO_APP_ID: process.env.ZEGO_APP_ID!,
  ZEGO_SERVER_SECRET: process.env.ZEGO_SERVER_SECRET!,
  ZEGO_AIAGENT_API_BASE_URL: 'https://aigc-aiagent-api.zegotech.cn',
  ZEGO_DIGITAL_HUMAN_API_BASE_URL: 'https://aigc-digitalhuman-api.zegotech.cn',
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
  PORT: parseInt(process.env.PORT || '8080', 10)
}

let REGISTERED_AGENT_ID: string | null = null
const ACTIVE_DH_TASKS = new Map<string, string>()
const ACTIVE_DH_TASK_DETAILS = new Map<string, { taskId: string, agentInstanceId: string }>()
const MAX_DH_CREATE_RETRY = 2

// Agent configuration
const AGENT_CONFIG = {
  LLM: {
    Url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    ApiKey: 'zego_test',
    Model: 'qwen-plus',
    SystemPrompt: 'You are a professional AI interviewer conducting a job interview. Be conversational, encouraging, and ask follow-up questions when appropriate. Keep responses concise and interview-focused. Speak naturally as if you are a real interviewer.',
    Temperature: 0.7,
    TopP: 0.9,
    Params: { max_tokens: 400 }
  },
  TTS: {
    Vendor: 'ByteDance',
    Params: {
      app: {
        appid: 'zego_test',
        token: 'zego_test',
        cluster: 'volcano_tts'
      },
      speed_ratio: 1,
      volume_ratio: 1,
      pitch_ratio: 1,
      audio: {
        rate: 24000
      }
    },
    FilterText: [
      { BeginCharacters: '(', EndCharacters: ')' },
      { BeginCharacters: '[', EndCharacters: ']' }
    ],
    TerminatorText: '#'
  },
  ASR: {
    Vendor: 'Tencent',
    Params: {
      engine_model_type: '16k_en',
      hotword_list: 'interview|10,experience|8,project|8,team|8,challenge|8,skills|8'
    },
    VADSilenceSegmentation: 1500,
    PauseInterval: 2000
  }
}

// Helper functions
function shortHash(input: string, len = 24): string {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, Math.max(1, Math.min(len, 40)))
}

function sanitizeRTCId(id: string, maxLen = 128): string {
  const s = String(id || '').replace(/[^A-Za-z0-9_.-]/g, '')
  return s ? s.slice(0, maxLen) : 'room' + shortHash(id || '', 8)
}

function buildAgentIdentifiers(roomId: string) {
  const hash = shortHash(roomId, 24)
  const suffix = `${Date.now().toString(36).slice(-4)}${crypto.randomBytes(2).toString('hex')}`
  // AgentUserId must be alphanumeric only, <= 32
  let agentUserId = `agt${hash}${suffix}`.replace(/[^a-zA-Z0-9]/g, '')
  if (agentUserId.length > 32) agentUserId = agentUserId.slice(0, 32)

  // AgentStreamId allows letters, digits, '_' and '-', <= 128
  let agentStreamId = `agt_s_${hash}_${suffix}`.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  if (agentStreamId.length > 128) agentStreamId = agentStreamId.slice(0, 128)

  return { agentUserId, agentStreamId }
}

function logAxiosError(prefix: string, err: any, extra?: Record<string, any>) {
  const data = err?.response?.data
  console.error(`${prefix}`, {
    status: err?.response?.status,
    statusText: err?.response?.statusText,
    method: err?.config?.method,
    requestId: data?.RequestId || data?.request_id,
    response: typeof data === 'string' ? data : JSON.stringify(data),
    ...(extra || {})
  })
}

// Generate signature for ZegoCloud API authentication (md5(AppId + SignatureNonce + ServerSecret + Timestamp))
function generateZegoSignature(action: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomBytes(8).toString('hex')
  const signString = CONFIG.ZEGO_APP_ID + nonce + CONFIG.ZEGO_SERVER_SECRET + timestamp
  const signature = crypto.createHash('md5').update(signString).digest('hex')

  return {
    Action: action,
    AppId: CONFIG.ZEGO_APP_ID,
    SignatureNonce: nonce,
    SignatureVersion: '2.0',
    Timestamp: timestamp,
    Signature: signature
  }
}

async function makeZegoRequest(action: string, body: object = {}, apiType: 'aiagent' | 'digitalhuman' = 'aiagent'): Promise<any> {
  const queryParams = generateZegoSignature(action)
  const queryString = Object.entries(queryParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')

  const baseUrl = apiType === 'digitalhuman' 
    ? CONFIG.ZEGO_DIGITAL_HUMAN_API_BASE_URL 
    : CONFIG.ZEGO_AIAGENT_API_BASE_URL

  const url = `${baseUrl}?${queryString}`

  try {
    const safeQuery = { ...queryParams, Signature: '***' }
    console.log('➡️ ZEGO API Request', {
      action,
      apiType,
      urlBase: baseUrl,
      query: safeQuery,
      body
    })
    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    })
    console.log('⬅️ ZEGO API Response', {
      action,
      apiType,
      status: response.status,
      requestId: response.data?.RequestId,
      code: response.data?.Code,
      message: response.data?.Message
    })
    return response.data
  } catch (error: any) {
    logAxiosError('ZEGO API HTTP Error', error, { action, apiType })
    throw error
  }
}

function clampVideoDimensions(width: number, height: number) {
  const MAX_W = 1920
  const MAX_H = 2560
  const MAX_PIXELS = 1920 * 1080
  let w = Math.max(1, Math.min(MAX_W, Math.floor(width)))
  let h = Math.max(1, Math.min(MAX_H, Math.floor(height)))
  const pixels = w * h
  if (pixels > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / pixels)
    w = Math.max(1, Math.min(MAX_W, Math.floor(w * scale)))
    h = Math.max(1, Math.min(MAX_H, Math.floor(h * scale)))
    while (w * h > MAX_PIXELS && w > 1 && h > 1) {
      if (w >= h) w--
      else h--
    }
  }
  return { width: w, height: h }
}

function uniqueStreamId(base: string) {
  const ts = Date.now().toString(36)
  const rand = crypto.randomBytes(3).toString('hex')
  let id = `${base}_v_${ts}_${rand}`.toLowerCase()
  if (id.length > 128) id = id.slice(0, 128)
  return id
}

// Register AI agent once per server startup (includes LLM, TTS, ASR configs)
async function registerAgent(): Promise<string> {
  if (REGISTERED_AGENT_ID) {
    console.log('♻️ Reusing existing agent:', REGISTERED_AGENT_ID)
    return REGISTERED_AGENT_ID
  }

  const agentId = `interview_agent_${Date.now()}`
  const registerPayload = {
    AgentId: agentId,
    Name: 'AI Interview Assistant',
    ...AGENT_CONFIG
  }
  
  console.log('➡️ RegisterAgent')
  const result = await makeZegoRequest('RegisterAgent', registerPayload)
  console.log('⬅️ RegisterAgent:', { code: result?.Code, msg: result?.Message })

  if (result.Code !== 0) {
    console.error('❌ RegisterAgent failed. Message:', result.Message)
    throw new Error(`RegisterAgent failed: ${result.Code} ${result.Message}`)
  }

  REGISTERED_AGENT_ID = agentId
  console.log('✅ Agent registered:', agentId)
  return agentId
}

// Start AI Agent (voice-only conversation)
app.post('/api/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const { room_id, user_id, user_stream_id } = req.body

    if (!room_id || !user_id) {
      res.status(400).json({ error: 'room_id and user_id required' })
      return
    }

    const agentId = await registerAgent()
    const roomIdRTC = sanitizeRTCId(room_id)
    const userStreamId = (user_stream_id || `${user_id}_stream`)
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '')
      .slice(0, 128)
    const { agentUserId, agentStreamId } = buildAgentIdentifiers(roomIdRTC)

    // Prepare CreateAgentInstance payloads (fallbacks for RTC schema differences)
    const sanitizedUserId = String(user_id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'user' + shortHash(user_id, 8)

    const buildInstancePayload = (uid: string) => {
      const normalizedUserId = String(uid).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || `user${shortHash(uid, 8)}`
      const rtc = {
        RoomId: roomIdRTC,
        AgentUserId: agentUserId,
        AgentStreamId: agentStreamId,
        UserStreamId: userStreamId
      }

      return {
        AgentId: agentId,
        UserId: normalizedUserId,
        MessageHistory: {
          SyncMode: 1,
          Messages: [],
          WindowSize: 10
        },
        AdvancedConfig: {
          InterruptMode: 0
        },
        RTC: rtc
      }
    }

    const payloadAttempts = [buildInstancePayload(sanitizedUserId)]

    console.log('🧪 CreateAgentInstance identifiers:', {
      roomId: roomIdRTC,
      userId: user_id,
      agentUserId,
      agentStreamId,
      userStreamId,
      lengths: {
        userId: String(user_id || '').length,
        agentUserId: agentUserId.length,
        agentStreamId: agentStreamId.length,
        userStreamId: userStreamId.length
      }
    })
    let result: any = null
    for (let i = 0; i < payloadAttempts.length; i++) {
      const attemptBody = payloadAttempts[i]
      console.log(`➡️ CreateAgentInstance attempt #${i + 1}`)
      try {
        result = await makeZegoRequest('CreateAgentInstance', attemptBody, 'aiagent')
        console.log(`📥 CreateAgentInstance response (attempt #${i + 1}):`, JSON.stringify(result, null, 2))
        if (result?.Code === 0) break
      } catch (e: any) {
        console.warn(`⚠️ CreateAgentInstance attempt #${i + 1} error:`, e?.message || e)
      }
    }

    if (!result || result.Code !== 0) {
      console.error('❌ CreateAgentInstance failed. Message:', result.Message)
      res.status(400).json({ 
        error: result.Message || 'Failed to create instance', 
        code: result.Code, 
        requestId: result.RequestId 
      })
      return
    }

    console.log('✅ AI Agent instance created:', result.Data?.AgentInstanceId)
    res.json({
      success: true,
      agentInstanceId: result.Data?.AgentInstanceId,
      agentUserId,
      agentStreamId,
      userStreamId
    })

  } catch (error: any) {
    logAxiosError('❌ Start agent error', error)
    res.status(500).json({ error: error.message || 'Internal error' })
  }
})


// Start AI Agent + Digital Human (voice + video interview)
app.post('/api/start-digital-human', async (req: Request, res: Response): Promise<void> => {
  try {
    const { room_id, user_id, user_stream_id, digital_human_id } = req.body
    // Optional overrides to align with ZEGOCLOUD Digital Human API
    const reqLayout = req.body?.layout as { Top?: number; Left?: number; Width?: number; Height?: number; Layer?: number } | undefined
    const reqVideo = req.body?.video as { Width?: number; Height?: number; Bitrate?: number } | undefined
    const reqAssets = req.body?.assets as Array<{ AssetType: number; AssetUrl: string; Layout: { Top: number; Left: number; Width: number; Height: number; Layer?: number } }> | undefined
    const reqBackgroundColor = (req.body?.backgroundColor as string | undefined) || undefined
    const reqTTL = (req.body?.ttl as number | undefined)

    if (!room_id || !user_id) {
      res.status(400).json({ error: 'room_id and user_id required' })
      return
    }

    const roomIdRTC = sanitizeRTCId(room_id)
    const userStreamId = (user_stream_id || `${user_id}_stream`)
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '')
      .slice(0, 128)
    const { agentUserId, agentStreamId } = buildAgentIdentifiers(roomIdRTC)
    const digitalHumanId = digital_human_id || 'c4b56d5c-db98-4d91-86d4-5a97b507da97'

    console.log('🎭 Starting digital human interview:', { room_id: roomIdRTC, digitalHumanId })

    const agentId = await registerAgent()

    const sanitizedUserIdDH = String(user_id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'user' + shortHash(user_id, 8)

    const buildInstancePayloadDH = (uid: string) => {
      const normalizedUserId = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || `user${shortHash(uid, 8)}`
      const rtc = {
        RoomId: roomIdRTC,
        AgentUserId: agentUserId,
        AgentStreamId: agentStreamId,
        UserStreamId: userStreamId
      }

      return {
        AgentId: agentId,
        UserId: normalizedUserId,
        MessageHistory: {
          SyncMode: 1,
          Messages: [],
          WindowSize: 10
        },
        AdvancedConfig: {
          InterruptMode: 0
        },
        RTC: rtc
      }
    }

    const payloadAttempts = [buildInstancePayloadDH(sanitizedUserIdDH)]

    console.log('🧪 CreateAgentInstance identifiers:', {
      roomId: roomIdRTC,
      userId: user_id,
      agentUserId,
      agentStreamId,
      userStreamId,
      lengths: {
        userId: String(user_id || '').length,
        agentUserId: agentUserId.length,
        agentStreamId: agentStreamId.length,
        userStreamId: userStreamId.length
      }
    })

    // Step 2: Create AI Agent instance (voice/audio only)
    let agentResult: any = null
    for (let i = 0; i < payloadAttempts.length; i++) {
      const attemptBody = payloadAttempts[i]
      console.log(`➡️ CreateAgentInstance attempt #${i + 1}`)
      try {
        agentResult = await makeZegoRequest('CreateAgentInstance', attemptBody, 'aiagent')
        console.log(`📥 CreateAgentInstance response (attempt #${i + 1}):`, JSON.stringify(agentResult, null, 2))
        if (agentResult?.Code === 0) break
      } catch (e: any) {
        console.warn(`⚠️ CreateAgentInstance attempt #${i + 1} error:`, e?.message || e)
      }
    }

    if (!agentResult || agentResult.Code !== 0) {
      console.error('❌ CreateAgentInstance failed. Message:', agentResult?.Message)
      res.status(400).json({
        error: agentResult?.Message || 'Failed to create AI agent instance',
        code: agentResult?.Code,
        requestId: agentResult?.RequestId
      })
      return
    }

    console.log('✅ AI Agent instance created:', agentResult.Data?.AgentInstanceId)

    // Step 3: Create Digital Human video stream task (separate from audio agent)
    const defaultWidth = reqVideo?.Width ?? 1280
    const defaultHeight = reqVideo?.Height ?? 720
    const clamped = clampVideoDimensions(defaultWidth, defaultHeight)
    const videoStreamId = uniqueStreamId(agentStreamId)
    console.log('🧮 Digital human video config', {
      requested: { width: defaultWidth, height: defaultHeight },
      clamped
    })
    const digitalHumanConfig: any = {
      DigitalHumanConfig: {
        DigitalHumanId: digitalHumanId,
        ConfigId: 'web',
        ...(reqBackgroundColor ? { BackgroundColor: reqBackgroundColor } : {}),
        Layout: {
          Top: reqLayout?.Top ?? 0,
          Left: reqLayout?.Left ?? 0,
          Width: Math.min(reqLayout?.Width ?? clamped.width, clamped.width),
          Height: Math.min(reqLayout?.Height ?? clamped.height, clamped.height),
          Layer: reqLayout?.Layer ?? 2
        }
      },
      RTCConfig: {
        RoomId: roomIdRTC,
        StreamId: videoStreamId
      },
      VideoConfig: {
        Width: clamped.width,
        Height: clamped.height,
        Bitrate: reqVideo?.Bitrate ?? 2000000
      },
      Assets: (reqAssets && Array.isArray(reqAssets) && reqAssets.length > 0)
        ? reqAssets
        : [{
            AssetType: 1, // Image background (required by API)
            // Use an HTTP placeholder to comply with "URL" requirement
            AssetUrl: `https://via.placeholder.com/${clamped.width}x${clamped.height}.png?text=Digital+Human+Background`,
            Layout: {
              Top: 0,
              Left: 0,
              Width: clamped.width,
              Height: clamped.height,
              Layer: 1
            }
          }]
    }
    if (typeof reqTTL === 'number' && reqTTL >= 10 && reqTTL <= 86400) {
      digitalHumanConfig.TTL = reqTTL
    }

    console.log('🎭 Creating digital human video stream task...')
    console.log('📊 Digital Human Config:', {
      videoStreamId,
      digitalHumanId,
      roomId: roomIdRTC,
      agentStreamId,
      videoConfig: digitalHumanConfig.VideoConfig,
      rtcConfig: digitalHumanConfig.RTCConfig
    })
    console.log('➡️ CreateDigitalHumanStreamTask')

    let digitalHumanResult = await makeZegoRequest('CreateDigitalHumanStreamTask', digitalHumanConfig, 'digitalhuman')
    console.log('⬅️ CreateDigitalHumanStreamTask:', { code: digitalHumanResult?.Code, msg: digitalHumanResult?.Message, taskId: digitalHumanResult?.Data?.TaskId })
    let createAttempts = 1

    while (digitalHumanResult?.Code === 400000008 && createAttempts < MAX_DH_CREATE_RETRY) {
      console.warn('⚠️ CreateDigitalHumanStreamTask hit concurrent limit, attempting cleanup')
      await cleanupActiveDigitalHumanTasks('concurrent_limit')
      await new Promise(resolve => setTimeout(resolve, 800))
      createAttempts += 1
      digitalHumanResult = await makeZegoRequest('CreateDigitalHumanStreamTask', digitalHumanConfig, 'digitalhuman')
    }

    if (digitalHumanResult.Code !== 0) {
      console.error('❌ CreateDigitalHumanStreamTask failed:', {
        code: digitalHumanResult.Code,
        message: digitalHumanResult.Message,
        requestId: digitalHumanResult.RequestId,
        data: digitalHumanResult.Data
      })

      // Cleanup agent instance
      await makeZegoRequest('DeleteAgentInstance', {
        AgentInstanceId: agentResult.Data?.AgentInstanceId
      }, 'aiagent').catch(console.warn)

      res.status(400).json({
        error: digitalHumanResult.Message || 'Failed to create digital human stream task',
        code: digitalHumanResult.Code,
        requestId: digitalHumanResult.RequestId
      })
      return
    }

    console.log('✅ Digital Human video stream created:', {
      taskId: digitalHumanResult.Data?.TaskId,
      videoStreamId,
      width: digitalHumanConfig.VideoConfig.Width,
      height: digitalHumanConfig.VideoConfig.Height
    })

    if (agentResult?.Data?.AgentInstanceId && digitalHumanResult?.Data?.TaskId) {
      ACTIVE_DH_TASKS.set(agentResult.Data.AgentInstanceId, digitalHumanResult.Data.TaskId)
      ACTIVE_DH_TASK_DETAILS.set(digitalHumanResult.Data.TaskId, {
        taskId: digitalHumanResult.Data.TaskId,
        agentInstanceId: agentResult.Data.AgentInstanceId
      })
    }

    res.json({
      success: true,
      agentInstanceId: agentResult.Data?.AgentInstanceId,
      digitalHumanTaskId: digitalHumanResult.Data?.TaskId,
      agentUserId,
      agentStreamId,
      digitalHumanVideoStreamId: videoStreamId,
      userStreamId,
      digitalHumanId,
      roomId: roomIdRTC,
      unifiedDigitalHuman: false,  // Separate audio and video streams
      note: 'agentStreamId = audio only, digitalHumanVideoStreamId = video only'
    })

  } catch (error: any) {
    logAxiosError('❌ Start digital human error', error)
    res.status(500).json({ error: error.message || 'Internal error' })
  }
})

// Stop AI Agent instance
app.post('/api/stop', async (req: Request, res: Response): Promise<void> => {
  try {
    const { agent_instance_id } = req.body

    if (!agent_instance_id) {
      res.status(400).json({ error: 'agent_instance_id required' })
      return
    }

    // Optional: Log performance metrics
    try {
      const status = await makeZegoRequest('QueryAgentInstanceStatus', {
        AgentInstanceId: agent_instance_id
      })
      console.log('📊 Performance metrics:', {
        llmFirstToken: status.Data?.LLMFirstTokenLatency + 'ms',
        llmSpeed: status.Data?.LLMOutputSpeed + ' tokens/s',
        ttsFirstAudio: status.Data?.TTSFirstAudioLatency + 'ms'
      })
    } catch (e) {
      console.warn('Could not fetch metrics')
    }

    const dhTaskId = ACTIVE_DH_TASKS.get(agent_instance_id)
    if (dhTaskId) {
      try {
        await makeZegoRequest('StopDigitalHumanStreamTask', { TaskId: dhTaskId }, 'digitalhuman')
        ACTIVE_DH_TASK_DETAILS.delete(dhTaskId)
      } catch (e) {
        console.warn('StopDigitalHumanStreamTask failed (ignored)', (e as any)?.message)
      } finally {
        ACTIVE_DH_TASKS.delete(agent_instance_id)
      }
    }

    const result = await makeZegoRequest('DeleteAgentInstance', {
      AgentInstanceId: agent_instance_id
    })

    if (result.Code !== 0) {
      res.status(400).json({ error: result.Message || 'Failed to delete instance' })
      return
    }

    console.log('✅ AI Agent stopped:', agent_instance_id.substring(0, 20) + '...')
    res.json({ success: true })

  } catch (error: any) {
    logAxiosError('❌ Stop agent error', error)
    res.status(500).json({ error: error.message || 'Internal error' })
  }
})

// Stop digital human video stream task
app.post('/api/stop-digital-human', async (req: Request, res: Response): Promise<void> => {
  try {
    const { task_id } = req.body

    if (!task_id) {
      res.status(400).json({ error: 'task_id required' })
      return
    }

    const result = await makeZegoRequest('StopDigitalHumanStreamTask', {
      TaskId: task_id
    }, 'digitalhuman')
    if (result?.Code === 0) {
      ACTIVE_DH_TASK_DETAILS.delete(task_id)
      for (const [agentInstanceId, storedTaskId] of ACTIVE_DH_TASKS.entries()) {
        if (storedTaskId === task_id) {
          ACTIVE_DH_TASKS.delete(agentInstanceId)
          break
        }
      }
    }

    if (result.Code !== 0) {
      console.error('❌ StopDigitalHumanStreamTask failed:', result)
      res.status(400).json({ 
        error: result.Message || 'Failed to stop digital human stream task',
        code: result.Code,
        requestId: result.RequestId
      })
      return
    }

    console.log('✅ Digital Human video stream stopped:', task_id.substring(0, 20) + '...')
    for (const [agentInstanceId, storedTaskId] of ACTIVE_DH_TASKS.entries()) {
      if (storedTaskId === task_id) {
        ACTIVE_DH_TASKS.delete(agentInstanceId)
        break
      }
    }
    res.json({ success: true })

  } catch (error: any) {
    logAxiosError('❌ Stop digital human error', error)
    res.status(500).json({ error: error.message || 'Internal error' })
  }
})

// Get available digital humans in account
app.get('/api/digital-humans', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await makeZegoRequest('GetDigitalHumanList', {}, 'digitalhuman')
    
    if (result.Code !== 0) {
      console.error('❌ GetDigitalHumanList failed:', result)
      res.status(400).json({
        error: result.Message || 'Failed to query digital humans',
        code: result.Code,
        requestId: result.RequestId
      })
      return
    }

    const count = result.Data?.List?.length || 0
    console.log('✅ Digital humans queried:', count, 'found')
    res.json({
      success: true,
      digitalHumans: result.Data?.List || []
    })

  } catch (error: any) {
    logAxiosError('❌ Query digital humans error', error)
    res.status(500).json({ error: error.message || 'Internal error' })
  }
})

// Send text message to AI agent
app.post('/api/send-message', async (req: Request, res: Response): Promise<void> => {
  try {
    const { agent_instance_id, message } = req.body

    if (!agent_instance_id || !message) {
      res.status(400).json({ error: 'agent_instance_id and message required' })
      return
    }

    const result = await makeZegoRequest('SendAgentInstanceLLM', {
      AgentInstanceId: agent_instance_id,
      Text: message,
      AddQuestionToHistory: false, // User message not added (comes via ASR)
      AddAnswerToHistory: true     // Store AI response in history
    })

    if (result.Code !== 0) {
      res.status(400).json({ error: result.Message || 'Failed to send message' })
      return
    }

    res.json({ success: true })

  } catch (error: any) {
    logAxiosError('❌ Send message error', error)
    res.status(500).json({ error: error.message || 'Internal error' })
  }
})

// Generate authentication token for client
app.get('/api/token', (req: Request, res: Response): void => {
  try {
    const userId = ((req.query.user_id as string) || '').trim()
    const roomId = ((req.query.room_id as string) || '').trim()

    if (!userId) {
      res.status(400).json({ error: 'user_id required' })
      return
    }

    const appId = Number(CONFIG.ZEGO_APP_ID)
    const secret = CONFIG.ZEGO_SERVER_SECRET

    if (!appId || Number.isNaN(appId)) {
      res.status(500).json({ error: 'ZEGO_APP_ID missing or invalid' })
      return
    }
    if (!secret || secret.length !== 32) {
      res.status(500).json({ error: `ZEGO_SERVER_SECRET must be 32 chars (got ${secret?.length || 0})` })
      return
    }

    const payload = {
      room_id: roomId,
    privilege: { 1: 1, 2: 1, 3: 1 },
      stream_id_list: null
    }

    const token = generateToken04(appId, userId, secret, 3600, JSON.stringify(payload))
    res.json({ token })

  } catch (error: any) {
    console.error('❌ Token generation error:', error)
    res.status(500).json({ error: error.message || 'Failed to generate token' })
  }
})

// Get predefined interview questions
app.get('/api/interview/questions', (_req: Request, res: Response): void => {
  const questions = [
    "Hello! Thank you for joining today's interview. Please start by introducing yourself and telling me a bit about your background.",
    "What interests you most about this position, and why do you think you'd be a good fit for our team?",
    "Can you describe a challenging project or situation you've worked on recently? How did you approach it and what was the outcome?",
    "Where do you see yourself professionally in the next few years, and how does this role align with your career goals?",
    "Do you have any questions about the role, our company, or anything else you'd like to know? Thank you for your time today!"
  ]
  res.json({ questions })
})

// Receive callbacks from ZegoCloud (optional monitoring)
app.post('/api/callbacks', (req: Request, res: Response): void => {
  const { Event, Data, AgentInstanceId, RoomId } = req.body

  console.log(`📞 Callback [${Event}]:`, { AgentInstanceId: AgentInstanceId?.substring(0, 20), RoomId })

  switch (Event) {
    case 'Exception':
      console.error('❌ Exception:', Data.Message)
      break
    case 'AgentSpeakAction':
      console.log('🗣️ Agent:', Data.Action === 'SPEAK_BEGIN' ? 'Started' : 'Ended')
      break
    case 'UserSpeakAction':
      console.log('🎤 User:', Data.Action === 'SPEAK_BEGIN' ? 'Started' : 'Ended')
      break
    case 'Interrupted':
      console.log('✋ Agent interrupted')
      break
    case 'ASRResult':
      if (Data.EndFlag) console.log('🎯 ASR:', Data.Text?.substring(0, 50))
      break
    case 'LLMResult':
      if (Data.EndFlag) console.log('🤖 LLM:', Data.Text?.substring(0, 50))
      break
  }

  res.status(200).json({ success: true })
})

// Health check endpoint
app.get('/health', (_req: Request, res: Response): void => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ai-interview-assistant',
    registered: !!REGISTERED_AGENT_ID,
    config: {
      appId: !!CONFIG.ZEGO_APP_ID,
      serverSecret: !!CONFIG.ZEGO_SERVER_SECRET,
      dashscope: !!CONFIG.DASHSCOPE_API_KEY
    },
    features: {
      digitalHuman: true,
      voiceInterview: true,
      realTimeTranscription: true
    }
  })
})

app.post('/api/admin/cleanup-digital-human', async (req: Request, res: Response): Promise<void> => {
  try {
    const manualTaskIds = Array.isArray(req.body?.task_ids) ? req.body.task_ids.filter((id: unknown) => typeof id === 'string' && id.trim().length > 0) : []
    const manualAgentIds = Array.isArray(req.body?.agent_instance_ids) ? req.body.agent_instance_ids.filter((id: unknown) => typeof id === 'string' && id.trim().length > 0) : []

    const activeCount = ACTIVE_DH_TASK_DETAILS.size
    await cleanupActiveDigitalHumanTasks('manual_endpoint')

    const manualStopResults: Array<{ id: string; type: 'task' | 'agent'; success: boolean; error?: string }> = []

    for (const taskId of manualTaskIds) {
      try {
        await stopDigitalHumanTask(taskId)
        manualStopResults.push({ id: taskId, type: 'task', success: true })
      } catch (error) {
        manualStopResults.push({ id: taskId, type: 'task', success: false, error: (error as Error)?.message })
      }
    }

    for (const agentId of manualAgentIds) {
      try {
        await stopAgentInstance(agentId)
        manualStopResults.push({ id: agentId, type: 'agent', success: true })
      } catch (error) {
        manualStopResults.push({ id: agentId, type: 'agent', success: false, error: (error as Error)?.message })
      }
    }

    res.json({
      success: true,
      clearedTrackedTasks: activeCount,
      manualStopResults
    })
  } catch (error: any) {
    console.error('❌ Manual cleanup error:', error)
    res.status(500).json({ error: error.message || 'Failed to cleanup digital human tasks' })
  }
})

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('❌ Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// Start server
app.listen(CONFIG.PORT, () => {
  console.log(`🎤 AI Interview Assistant server running on port ${CONFIG.PORT}`)
  console.log(`🤖 Features: Digital Human + Voice Interaction`)
  console.log(`📡 Endpoints: /api/start, /api/start-digital-human, /api/token`)
})
async function stopDigitalHumanTask(taskId: string): Promise<void> {
  if (!taskId) return
  try {
    await makeZegoRequest('StopDigitalHumanStreamTask', { TaskId: taskId }, 'digitalhuman')
  } catch (error) {
    console.warn('⚠️ stopDigitalHumanTask failed', { taskId, message: (error as Error)?.message })
  }
}

async function stopAgentInstance(agentInstanceId: string): Promise<void> {
  if (!agentInstanceId) return
  try {
    await makeZegoRequest('DeleteAgentInstance', { AgentInstanceId: agentInstanceId }, 'aiagent')
  } catch (error) {
    console.warn('⚠️ stopAgentInstance failed', { agentInstanceId, message: (error as Error)?.message })
  }
}

async function cleanupActiveDigitalHumanTasks(reason = 'unspecified'): Promise<void> {
  if (ACTIVE_DH_TASK_DETAILS.size === 0) return
  console.warn('🧹 Cleaning up digital human tasks due to', reason, {
    count: ACTIVE_DH_TASK_DETAILS.size
  })
  const stopPromises: Array<Promise<void>> = []
  for (const { taskId } of ACTIVE_DH_TASK_DETAILS.values()) {
    stopPromises.push(stopDigitalHumanTask(taskId))
  }
  await Promise.allSettled(stopPromises)
  ACTIVE_DH_TASK_DETAILS.clear()
  ACTIVE_DH_TASKS.clear()
}
