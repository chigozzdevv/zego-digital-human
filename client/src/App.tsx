import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { InterviewRoom } from './components/Interview/InterviewRoom'
import { Button } from './components/UI/Button'
import { Bot, Video, Mic, CheckCircle } from 'lucide-react'

type AppState = 'welcome' | 'interview' | 'completed'

function App() {
  const [appState, setAppState] = useState<AppState>('welcome')
  const [interviewData, setInterviewData] = useState<any>(null)

  const handleStartInterview = () => {
    setAppState('interview')
  }

  const handleInterviewComplete = (data: any) => {
    setInterviewData(data)
    setAppState('completed')
  }

  const handleRestartInterview = () => {
    setInterviewData(null)
    setAppState('welcome')
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <AnimatePresence mode="wait">
        {appState === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="min-h-screen flex items-center justify-center p-6"
          >
            <div className="max-w-2xl mx-auto text-center">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="w-24 h-24 bg-gradient-to-br from-blue-600 to-violet-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg"
              >
                <Bot className="w-12 h-12 text-white" />
              </motion.div>

              <h1 className="text-4xl font-bold text-white mb-4">
                AI Interview Assistant
              </h1>
              <p className="text-xl text-slate-400 mb-8">
                Experience the future of interviews with our AI-powered digital interviewer
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl p-6 border border-slate-800">
                  <Video className="w-8 h-8 text-blue-500 mx-auto mb-3" />
                  <h3 className="font-semibold text-white mb-2">Digital Human</h3>
                  <p className="text-sm text-slate-400">Realistic AI interviewer with natural expressions</p>
                </div>
                <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl p-6 border border-slate-800">
                  <Mic className="w-8 h-8 text-blue-500 mx-auto mb-3" />
                  <h3 className="font-semibold text-white mb-2">Voice Interaction</h3>
                  <p className="text-sm text-slate-400">Natural conversation with real-time responses</p>
                </div>
                <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl p-6 border border-slate-800">
                  <CheckCircle className="w-8 h-8 text-blue-500 mx-auto mb-3" />
                  <h3 className="font-semibold text-white mb-2">Smart Questions</h3>
                  <p className="text-sm text-slate-400">Adaptive questioning based on your responses</p>
                </div>
              </div>

              <Button
                onClick={handleStartInterview}
                size="lg"
                className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white px-8 py-4 text-lg shadow-lg"
              >
                Start Interview
              </Button>

              <p className="text-sm text-slate-500 mt-6">
                Make sure your microphone is enabled for the best experience
              </p>
            </div>
          </motion.div>
        )}

        {appState === 'interview' && (
          <motion.div
            key="interview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-screen"
          >
            <InterviewRoom onComplete={handleInterviewComplete} />
          </motion.div>
        )}

        {appState === 'completed' && (
          <motion.div
            key="completed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="min-h-screen flex items-center justify-center p-6"
          >
            <div className="max-w-2xl mx-auto text-center">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="w-24 h-24 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg"
              >
                <CheckCircle className="w-12 h-12 text-white" />
              </motion.div>

              <h1 className="text-4xl font-bold text-white mb-4">
                Interview Completed!
              </h1>
              <p className="text-xl text-slate-400 mb-8">
                Thank you for participating in the AI interview demonstration
              </p>

              {interviewData && (
                <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl p-6 border border-slate-800 mb-8 text-left">
                  <h3 className="font-semibold text-white mb-4">Interview Summary</h3>
                  <div className="space-y-2 text-sm text-slate-400">
                    <p><strong className="text-slate-300">Duration:</strong> {interviewData.duration || 'N/A'}</p>
                    <p><strong className="text-slate-300">Questions Asked:</strong> {interviewData.questionsCount || 0}</p>
                    <p><strong className="text-slate-300">Responses Given:</strong> {interviewData.responsesCount || 0}</p>
                  </div>
                </div>
              )}

              <Button
                onClick={handleRestartInterview}
                size="lg"
                className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white px-8 py-4 text-lg shadow-lg"
              >
                Try Another Interview
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App