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
    setState(prev => {
      const newVideoEnabled = !prev.isVideoEnabled

      setTimeout(() => {
        // Find the dynamically created video element
        const container = document.getElementById('remoteSteamView')
        const videoElement = container?.querySelector('video') as HTMLVideoElement
        if (videoElement) {
          videoElement.style.display = newVideoEnabled ? 'block' : 'none'
          console.log(`📹 Digital human video ${newVideoEnabled ? 'enabled' : 'disabled'}`)
        }
      }, 0)

      return { ...prev, isVideoEnabled: newVideoEnabled }
    })
  }, [])

  const toggleAudio = useCallback(() => {
    setState(prev => {
      const newAudioEnabled = !prev.isAudioEnabled

      setTimeout(() => {
        const audioElement = document.getElementById('ai-audio-output') as HTMLAudioElement
        if (audioElement) {
          audioElement.muted = !newAudioEnabled
        }

        console.log(`Digital human audio ${newAudioEnabled ? 'enabled' : 'disabled'}`)
      }, 0)

      return { ...prev, isAudioEnabled: newAudioEnabled }
    })
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }))
  }, [])

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }))
  }, [])

  return {
    ...state,
    toggleVideo,
    toggleAudio,
    setLoading,
    setError
  }
}
