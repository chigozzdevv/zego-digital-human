import axios from 'axios'
import { config } from '../config'

const api = axios.create({
  baseURL: config.API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use((cfg) => {
  console.log('[API] →', (cfg.method || 'get').toUpperCase(), cfg.url)
  return cfg
}, (e) => Promise.reject(e))

api.interceptors.response.use((res) => {
  console.log('[API] ←', res.status, res.config.url)
  return res
}, (e) => Promise.reject(e))

export const agentAPI = {
  async startSession(roomId: string, userId: string): Promise<{ agentInstanceId: string }> {
    try {
      const requestData = {
        room_id: roomId,
        user_id: userId,
        user_stream_id: `${userId}_stream`,
      }
      
      console.log('Starting session with data:', requestData)
      
      const response = await api.post('/api/start', requestData)
      
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.error || 'Session start failed')
      }
      
      if (!response.data.agentInstanceId) {
        throw new Error('No agent instance ID returned')
      }
      
      console.log('Session started successfully:', response.data.agentInstanceId)
      
      return {
        agentInstanceId: response.data.agentInstanceId
      }
    } catch (error: any) {
      console.error('Start session failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Failed to start session')
    }
  },

  async sendMessage(agentInstanceId: string, message: string): Promise<void> {
    if (!agentInstanceId) {
      throw new Error('Agent instance ID is required')
    }
    
    if (!message || !message.trim()) {
      throw new Error('Message content is required')
    }

    try {
      const requestData = {
        agent_instance_id: agentInstanceId,
        message: message.trim(),
      }
      
      console.log('Sending message:', {
        agentInstanceId,
        messageLength: message.length,
        messagePreview: message.substring(0, 50) + (message.length > 50 ? '...' : '')
      })
      
      const response = await api.post('/api/send-message', requestData)
      
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.error || 'Message send failed')
      }
      
      console.log('Message sent successfully')
    } catch (error: any) {
      console.error('Send message failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Failed to send message')
    }
  },

  async stopSession(agentInstanceId: string): Promise<void> {
    if (!agentInstanceId) {
      console.warn('No agent instance ID provided for stop session')
      return
    }

    try {
      const requestData = {
        agent_instance_id: agentInstanceId,
      }
      
      console.log('Stopping session:', agentInstanceId)
      
      const response = await api.post('/api/stop', requestData)
      
      if (!response.data || !response.data.success) {
        console.warn('Session stop returned non-success:', response.data)
      } else {
        console.log('Session stopped successfully')
      }
    } catch (error: any) {
      console.error('Stop session failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Failed to stop session')
    }
  },

  async getToken(userId: string, roomId?: string): Promise<{ token: string }> {
    if (!userId) {
      throw new Error('User ID is required')
    }

    try {
      console.log('Getting token for user:', userId, 'roomId:', roomId)

      const params = new URLSearchParams({ user_id: userId })
      if (roomId) {
        params.append('room_id', roomId)
      }

      const response = await api.get(`/api/token?${params.toString()}`)

      if (!response.data || !response.data.token) {
        throw new Error('No token returned')
      }

      console.log('Token received successfully')

      return { token: response.data.token }
    } catch (error: any) {
      console.error('Get token failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Failed to get token')
    }
  },

  async healthCheck(): Promise<{ status: string }> {
    try {
      console.log('Checking backend health')
      
      const response = await api.get('/health')
      
      console.log('Backend health check successful:', response.data)
      
      return response.data
    } catch (error: any) {
      console.error('Backend health check failed:', error.response?.data || error.message)
      throw new Error(error.response?.data?.error || error.message || 'Backend health check failed')
    }
  }
}
