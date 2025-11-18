import axios from 'axios'
import { config } from '../config'

const api = axios.create({
  // Always use configured API base URL so dev can target Render or local
  baseURL: config.API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use(
  (config) => {
    console.log('Digital Human API Request:', config.method?.toUpperCase(), config.url)
    if (config.data && config.method !== 'get') {
      console.log('Request Data:', config.data)
    }
    return config
  },
  (error) => {
    console.error('API Request Error:', error)
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => {
    console.log('Digital Human API Response:', response.status, response.config.url)
    if (response.data) {
      console.log('Response Data:', response.data)
    }
    return response
  },
  (error) => {
    console.error('API Response Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method
    })
    return Promise.reject(error)
  }
)

export const digitalHumanAPI = {
  async startInterview(roomId: string, userId: string): Promise<{ agentInstanceId: string; agentStreamId?: string; digitalHumanTaskId?: string; digitalHumanVideoStreamId: string; roomId: string; digitalHumanId?: string; unifiedDigitalHuman?: boolean }> {
    try {
      const requestData = {
        room_id: roomId,
        user_id: userId,
        user_stream_id: `${userId}_stream`,
        digital_human_id: 'c4b56d5c-db98-4d91-86d4-5a97b507da97' // Test digital human ID
      }

      console.log('Starting digital human interview with AI Agent and video stream:', requestData)

      const response = await api.post('/api/start-digital-human', requestData)

      if (!response.data || !response.data.success) {
        throw new Error(response.data?.error || 'Digital human interview start failed')
      }

      if (!response.data.agentInstanceId || !response.data.digitalHumanVideoStreamId) {
        throw new Error('Missing required IDs in response')
      }

      console.log('Digital human interview started successfully:', {
        agentInstanceId: response.data.agentInstanceId,
        digitalHumanTaskId: response.data.digitalHumanTaskId || 'N/A (unified)',
        digitalHumanVideoStreamId: response.data.digitalHumanVideoStreamId,
        unifiedDigitalHuman: response.data.unifiedDigitalHuman
      })

      return {
        agentInstanceId: response.data.agentInstanceId,
        agentStreamId: response.data.agentStreamId,
        digitalHumanTaskId: response.data.digitalHumanTaskId,
        digitalHumanVideoStreamId: response.data.digitalHumanVideoStreamId,
        roomId: response.data.roomId || roomId,
        digitalHumanId: response.data.digitalHumanId,
        unifiedDigitalHuman: response.data.unifiedDigitalHuman
      }
    } catch (error: any) {
      console.error('Start digital human interview failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Failed to start digital human interview')
    }
  },

  async stopInterview(agentInstanceId: string, digitalHumanTaskId?: string): Promise<void> {
    if (!agentInstanceId) {
      console.warn('Missing agent instance ID')
      return
    }

    try {
      // Stop AI Agent
      console.log('Stopping AI Agent instance:', agentInstanceId)
      const agentResponse = await api.post('/api/stop', {
        agent_instance_id: agentInstanceId
      })
      
      if (agentResponse.data?.success) {
        console.log('AI Agent stopped successfully')
      } else {
        console.warn('AI Agent stop returned non-success:', agentResponse.data)
      }

      // Stop Digital Human if task id provided
      if (digitalHumanTaskId) {
        console.log('Stopping Digital Human stream task:', digitalHumanTaskId)
        const digitalHumanResponse = await api.post('/api/stop-digital-human', {
          task_id: digitalHumanTaskId
        })
        
        if (digitalHumanResponse.data?.success) {
          console.log('Digital Human stream task stopped successfully')
        } else {
          console.warn('Digital Human stream task stop returned non-success:', digitalHumanResponse.data)
        }
      } else {
        console.warn('No digital human task id provided; skipping video stop')
      }

    } catch (error: any) {
      console.error('Stop digital human interview failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Failed to stop digital human interview')
    }
  },

  async sendMessage(agentInstanceId: string, message: string): Promise<void> {
    if (!agentInstanceId) throw new Error('Agent instance ID is required')
    const trimmed = (message || '').trim()
    if (!trimmed) throw new Error('Message content is required')

    try {
      console.log('Sending message to agent instance:', agentInstanceId)
      const response = await api.post('/api/send-message', {
        agent_instance_id: agentInstanceId,
        message: trimmed
      })
      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Message send failed')
      }
      console.log('Message sent successfully')
    } catch (error: any) {
      console.error('Send message failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Failed to send message')
    }
  },

  async getToken(userId: string, roomId?: string): Promise<{ token: string }> {
    if (!userId) {
      throw new Error('User ID is required')
    }

    try {
      console.log('Getting token for digital human user:', userId, 'roomId:', roomId)

      const params = new URLSearchParams({ user_id: userId })
      if (roomId) {
        params.append('room_id', roomId)
      }

      const response = await api.get(`/api/token?${params.toString()}`)

      if (!response.data || !response.data.token) {
        throw new Error('No token returned')
      }

      console.log('Digital human token received successfully')

      return { token: response.data.token }
    } catch (error: any) {
      console.error('Get digital human token failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Failed to get digital human token')
    }
  },

  async healthCheck(): Promise<{ status: string }> {
    try {
      console.log('Checking digital human backend health')
      
      const response = await api.get('/health')
      
      console.log('Digital human backend health check successful:', response.data)
      
      return response.data
    } catch (error: any) {
      console.error('Digital human backend health check failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Digital human backend health check failed')
    }
  }
}
