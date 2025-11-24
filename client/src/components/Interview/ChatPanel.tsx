import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Message } from '../../types'
import { User, Bot } from 'lucide-react'

interface ChatPanelProps {
    messages: Message[]
    isTyping: boolean
}

export const ChatPanel = ({ messages, isTyping }: ChatPanelProps) => {
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isTyping])

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-slate-900/50 backdrop-blur-sm">
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
                <AnimatePresence initial={false}>
                    {messages.map((message) => (
                        <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {message.sender === 'ai' && (
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center">
                                    <Bot className="w-4 h-4 text-white" />
                                </div>
                            )}

                            <div
                                className={`max-w-[75%] rounded-2xl px-4 py-3 ${message.sender === 'user'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-800 text-slate-100'
                                    }`}
                            >
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                                {message.isStreaming && (
                                    <span className="inline-block w-1 h-4 ml-1 bg-current animate-pulse" />
                                )}
                            </div>

                            {message.sender === 'user' && (
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                                    <User className="w-4 h-4 text-white" />
                                </div>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>

                {isTyping && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex gap-3"
                    >
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-white" />
                        </div>
                        <div className="bg-slate-800 rounded-2xl px-4 py-3">
                            <div className="flex gap-1">
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </motion.div>
                )}

                <div ref={messagesEndRef} />
            </div>
        </div>
    )
}
