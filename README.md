# Multilingual Mandi — AI-Powered Agricultural Marketplace

Multilingual marketplace platform enabling Indian agricultural vendors and buyers to communicate across language barriers with AI-powered translation, price discovery, and negotiation mediation.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Material-UI |
| Voice | Web Speech API, React Speech Recognition |
| Backend | Node.js, Express, Socket.io |
| AI | AWS Bedrock (Claude 3 Sonnet) |
| NLP | Natural, Stopword, ML-Matrix |
| Data | CSV Parser, PapaParse |
| Cache | Redis |
| Auth | JWT, bcryptjs |
| Validation | Joi |
| Logging | Winston |
| Security | Helmet, Express Rate Limit, Compression |
| Testing | Jest, Supertest, Fast-check |
| Deployment | Docker, AWS CloudFormation |

## Features

### Multilingual Support
- Real-time translation across Indian languages (Telugu, Hindi, English, and more)
- Language detection and automatic switching
- Agricultural terminology preservation during translation

### Price Discovery
- RAG-based mandi pricing pipeline with vector embeddings
- Fair price range calculation across markets
- Trend analysis and market recommendations
- CSV-based crop price database (75 crops, 5 markets)

### AI Negotiation
- Cross-language mediated negotiations between vendors and buyers
- AI compromise suggestion generation
- Conversation analysis and sentiment tracking
- Session management with real-time messaging via WebSocket

### Voice Interface
- Voice input with speech-to-text processing
- Multilingual voice queries for price lookups
- Intent analysis for voice commands

### Data Pipeline
- Semantic search over agricultural data
- Vector embeddings for crop similarity
- Query standardization across languages

## Architecture

```
multilingual-mandi/
├── frontend/                  # React + TypeScript + MUI
│   └── src/
│       ├── components/        # Dashboard, ChatInterface, Header
│       ├── contexts/          # LanguageContext, SocketContext
│       ├── services/          # API service layer
│       └── utils/             # Voice processing, error handling
├── backend/                   # Node.js + Express
│   └── src/
│       ├── routes/            # prices, negotiate, translate, rag, auth
│       ├── services/          # PriceService, TranslationService,
│       │                      # NegotiationService, AIMediationService,
│       │                      # RAGPipelineService, VectorEmbeddingService
│       ├── models/            # CropModels, TranslationModels
│       ├── server/            # Express app setup
│       └── lambda/            # AWS Lambda handler
├── aws-deployment/            # CloudFormation templates
├── docker-compose.yml
└── nginx/                     # Reverse proxy config
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/prices?crop=` | Get current crop prices |
| POST | `/api/v1/prices/query` | Advanced price query |
| GET | `/api/v1/prices/analytics/:crop` | Price analytics and trends |
| GET | `/api/v1/prices/fair-range/:crop` | Fair price range |
| POST | `/api/v1/translate` | Translate text between languages |
| POST | `/api/v1/translate/detect-language` | Detect input language |
| GET | `/api/v1/translate/languages` | List supported languages |
| POST | `/api/v1/negotiate/session` | Create negotiation session |
| POST | `/api/v1/negotiate/session/:id/join` | Join session as buyer |
| POST | `/api/v1/negotiate/session/:id/message` | Send message |
| POST | `/api/v1/negotiate/session/:id/generate-suggestions` | AI compromise suggestions |
| POST | `/api/rag/query` | RAG-based crop query |
| POST | `/api/rag/search` | Semantic search |
| GET | `/api/rag/crops` | Available crops and markets |

## Setup

### Prerequisites
- Node.js v18+
- Redis (optional, for caching)
- AWS credentials (for Bedrock AI)

### Docker (Recommended)

```bash
git clone https://github.com/HyderabadHustlers/MultilingualMandi.git
cd MultilingualMandi
docker-compose up -d
```

### Manual Setup

```bash
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
npm run dev
```

Frontend: `http://localhost:3000`
Backend: `http://localhost:5000`

## Environment Variables

Backend (`.env`):

```env
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
BEDROCK_MAX_TOKENS=4096
BEDROCK_TEMPERATURE=0.7

REDIS_URL=redis://localhost:6379

JWT_SECRET=your_jwt_secret
AGMARKNET_API_KEY=
```

## Deployed URL

[https://multilingual-mandi.vercel.app](https://multilingual-mandi.vercel.app)
