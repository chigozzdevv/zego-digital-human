# AI Interview Assistant with Digital Human

A real-time AI-powered interview platform featuring digital human interviewers, voice interaction, and natural conversation flow built with ZEGOCLOUD AI Agent platform.

## ✨ Features

- **Digital Human Interviewer**: Realistic AI interviewer with natural expressions and lip-sync
- **Real-time Voice Interaction**: Natural conversation with voice recognition and TTS
- **Smart Question Flow**: Structured interview progression with adaptive questioning
- **Multi-modal Input**: Support for both voice and text responses
- **Real-time Transcription**: Live transcription of conversation
- **Professional Interface**: Clean, interview-focused UI/UX

## 🏗️ Architecture

```
├── client/                 # React frontend application
│   ├── src/
│   │   ├── components/     # UI components
│   │   │   ├── Interview/  # Interview-specific components
│   │   │   ├── Chat/       # Chat components (reused)
│   │   │   ├── Voice/      # Voice input components
│   │   │   └── UI/         # Shared UI components
│   │   ├── hooks/          # React hooks for state management
│   │   ├── services/       # API services and integrations
│   │   ├── types/          # TypeScript definitions
│   │   └── data/           # Static data (questions, etc.)
│   └── package.json
└── server/                 # Node.js backend
    ├── src/
    │   └── server.ts       # Express server with ZEGO integration
    └── package.json
```

## 🚀 Quick Start

### Prerequisites

1. **ZEGO Account**: Sign up at [ZEGO Console](https://console.zegocloud.com) and get:
   - AppID
   - ServerSecret
   - Enable AI Agent service

2. **Node.js 18+** installed on your system

### 1. Clone and Setup

```bash
git clone <repository-url>
cd ai-interview-assistant
```

### 2. Backend Setup

```bash
cd server
npm install
```

Create `server/.env`:
```env
ZEGO_APP_ID=your_zego_app_id
ZEGO_SERVER_SECRET=your_zego_server_secret
DASHSCOPE_API_KEY=your_dashscope_key  # Optional, defaults to test mode
PORT=8080
```

Start the server:
```bash
npm run dev
```

### 3. Frontend Setup

```bash
cd ../client
npm install
```

Create `client/.env`:
```env
VITE_ZEGO_APP_ID=your_zego_app_id
VITE_ZEGO_SERVER=your_zego_websocket_url
VITE_API_BASE_URL=http://localhost:8080
```

Start the client:
```bash
npm run dev
```

### 4. Access the Application

Open `http://localhost:5173` in your browser and click "Start Interview" to begin!

## 📋 Interview Flow

1. **Welcome Screen**: Introduction and feature overview
2. **Interview Session**: 
   - Digital human asks structured questions
   - Candidate responds via voice or text
   - Real-time transcription and interaction
   - Natural conversation flow with interruption support
3. **Completion**: Interview summary and results

## 🔧 Configuration

### Digital Human Settings

The application uses ZEGO's digital human service with:
- **Digital Human ID**: `c4b56d5c-db98-4d91-86d4-5a97b507da97` (test ID)
- **Config ID**: `web` (optimized for web browsers)
- **Video Quality**: 1080P with real-time lip-sync
- **Response Time**: <2s end-to-end latency

### Interview Questions

Questions are defined in `client/src/data/questions.ts`:
- 5 structured questions covering introduction, experience, and goals
- Easily customizable for different interview types
- Support for technical, behavioral, and situational questions

### Voice Settings

- **ASR (Speech Recognition)**: Real-time transcription with hot words
- **TTS (Text-to-Speech)**: CosyVoice with natural intonation
- **Voice Interruption**: Natural 500ms interruption detection
- **Audio Processing**: AI noise reduction and echo cancellation

## 🛠️ Development

### Running in Development Mode

Backend:
```bash
cd server
npm run dev  # Uses tsx for hot reload
```

Frontend:
```bash
cd client
npm run dev  # Vite dev server with HMR
```

### Building for Production

Backend:
```bash
cd server
npm run build
npm start
```

Frontend:
```bash
cd client
npm run build
npm run preview
```

### Environment Variables

**Client (.env):**
- `VITE_ZEGO_APP_ID`: Your ZEGO application ID
- `VITE_ZEGO_SERVER`: ZEGO WebSocket server URL
- `VITE_API_BASE_URL`: Backend API URL

**Server (.env):**
- `ZEGO_APP_ID`: Your ZEGO application ID
- `ZEGO_SERVER_SECRET`: Your ZEGO server secret (32 chars)
- `DASHSCOPE_API_KEY`: DashScope API key (optional)
- `PORT`: Server port (default: 8080)

## 📖 API Reference

### Start Digital Human Interview
```http
POST /api/start-digital-human
Content-Type: application/json

{
  "room_id": "interview_123",
  "user_id": "candidate_456", 
  "digital_human_id": "c4b56d5c-db98-4d91-86d4-5a97b507da97",
  "config_id": "web"
}
```

### Send Message to AI
```http
POST /api/send-message
Content-Type: application/json

{
  "agent_instance_id": "instance_789",
  "message": "Hello, I'm excited to be here"
}
```

### Stop Interview
```http
POST /api/stop
Content-Type: application/json

{
  "agent_instance_id": "instance_789"
}
```

## 🎯 Use Cases

- **Remote Interviews**: Conduct professional interviews with AI assistance
- **Interview Practice**: Help candidates prepare with realistic mock interviews
- **HR Screening**: Automate initial screening rounds
- **Assessment Tools**: Evaluate communication and presentation skills
- **Training Simulations**: Practice interview scenarios in safe environment

## 🔧 Troubleshooting

### Common Issues

**Digital Human not showing:**
- Verify ZEGO console has AI Agent and Digital Human services enabled
- Check browser supports WebRTC and camera permissions
- Ensure correct digital_human_id and config_id

**Voice not working:**
- Use HTTPS in production (required for microphone access)
- Check browser microphone permissions
- Verify audio elements are properly configured

**Connection issues:**
- Confirm ZEGO credentials are correct
- Check server logs for authentication errors
- Verify network connectivity and firewall settings

### Debug Mode

Enable debug mode by setting:
```env
VITE_DEBUG_ENABLED=true
```

This will show additional logging and debug panels.

## 📝 License

This project is licensed under the MIT License. See LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📞 Support

For technical support or questions:
- Check the [ZEGO Documentation](https://docs.zegocloud.com)
- Review the troubleshooting section above
- Submit issues via GitHub Issues

---

Built with ❤️ using ZEGOCLOUD AI Agent Platform