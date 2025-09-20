import { useState, useCallback } from 'react'

interface DigitalHumanState {
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  isLoading: boolean
  error: string | null
}

export const useDigitalHuman = () => {
  const [state, setState] = useState<DigitalHumanState>({
    isVideoEnabled: true,
    isAudioEnabled: true,
    isLoading: false,
    error: null
  })

  const toggleVideo = useCallback(() => {
    setState(prev => ({
      ...prev,
      isVideoEnabled: !prev.isVideoEnabled
    }))
    
    // Find and toggle video element
    const videoElement = document.getElementById('digital-human-video') as HTMLVideoElement
    if (videoElement) {
      videoElement.style.display = state.isVideoEnabled ? 'none' : 'block'
    }
  }, [state.isVideoEnabled])

  const toggleAudio = useCallback(() => {
    setState(prev => ({
      ...prev,
      isAudioEnabled: !prev.isAudioEnabled
    }))
    
    // Find and toggle audio for digital human video
    const videoElement = document.getElementById('digital-human-video') as HTMLVideoElement
    if (videoElement) {
      videoElement.muted = state.isAudioEnabled
    }
    
    // Also toggle the main AI audio output
    const audioElement = document.getElementById('ai-audio-output') as HTMLAudioElement
    if (audioElement) {
      audioElement.muted = state.isAudioEnabled
    }
  }, [state.isAudioEnabled])

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({
      ...prev,
      isLoading: loading
    }))
  }, [])

  const setError = useCallback((error: string | null) => {
    setState(prev => ({
      ...prev,
      error
    }))
  }, [])

  return {
    ...state,
    toggleVideo,
    toggleAudio,
    setLoading,
    setError
  }
}