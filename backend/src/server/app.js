const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const errorHandler = require('../services/ErrorHandlingService');
const loggingService = require('../services/LoggingService');
const securityService = require('../services/SecurityService');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(securityService.corsMiddleware());
app.use(securityService.securityHeaders());

// Rate limiting with multilingual error messages
const limiter = securityService.createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  handler: (req, res) => {
    const language = req.headers['accept-language'] || req.query.lang || 'en';
    const errorResponse = errorHandler.createErrorResponse('RATE_LIMIT_EXCEEDED', language);
    loggingService.logAudit('rate_limit_exceeded', 'api', null, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path
    });
    res.status(429).json(errorResponse);
  }
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Add request logging middleware
app.use(loggingService.requestLogger());

// Health check endpoint
app.get('/health', (req, res) => {
  const healthData = {
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'multilingual-mandi-backend',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };
  
  loggingService.info('Health check requested', healthData);
  res.status(200).json(healthData);
});

// Monitoring endpoint
app.get('/api/v1/monitoring', (req, res) => {
  try {
    const monitoringData = loggingService.getMonitoringData();
    loggingService.logAudit('monitoring_access', 'system', req.user?.id || 'anonymous', {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip
    });
    res.status(200).json(monitoringData);
  } catch (error) {
    errorHandler.logError(error, 'monitoring endpoint');
    const errorResponse = errorHandler.handleError(error, 'monitoring', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

// API routes (to be implemented)
app.use('/api/v1/auth', require('../routes/auth'));
app.use('/api/v1/translate', require('../routes/translate'));
app.use('/api/v1/prices', require('../routes/prices'));
const { router: negotiateRouter, negotiationService, aiMediationService } = require('../routes/negotiate');
app.use('/api/v1/negotiate', negotiateRouter);
app.use('/api/v1/rag', require('../routes/rag'));
app.use('/api/v1/demo', require('../routes/demo'));

// WebSocket connection handling
io.on('connection', (socket) => {
  loggingService.logWebSocketEvent('connection', socket.id);
  console.log('New client connected:', socket.id);
  
  // Join negotiation session
  socket.on('join-negotiation', (data) => {
    const { sessionId, userId, language } = data;
    const transactionId = loggingService.logTransaction('join_negotiation', data, userId, sessionId);
    
    try {
      socket.join(sessionId);
      socket.userId = userId;
      socket.sessionId = sessionId;
      socket.language = language;
      
      // Get or validate session exists
      const session = negotiationService.getSession(sessionId);
      
      loggingService.logWebSocketEvent('join-negotiation', socket.id, { userId, sessionId });
      loggingService.logAudit('join_negotiation', 'session', userId, {
        sessionId,
        success: true
      });
      
      console.log(`Client ${socket.id} (${userId}) joined negotiation ${sessionId}`);
      
      // Send session info to client
      socket.emit('session-updated', {
        ...session,
        messageCount: session.messages.length,
        recentMessages: session.messages.slice(-10)
      });
      
      // Notify other participants
      socket.to(sessionId).emit('user-joined', {
        userId,
        language,
        timestamp: new Date()
      });
      
      loggingService.updateTransactionStatus(transactionId, 'completed', { sessionId });
    } catch (error) {
      loggingService.updateTransactionStatus(transactionId, 'failed', null, error);
      errorHandler.logError(error, 'WebSocket join-negotiation', { sessionId, userId });
      const errorResponse = errorHandler.createErrorResponse('SESSION_NOT_FOUND', language);
      socket.emit('negotiation-error', errorResponse);
    }
  });
  
  // Handle new messages with AI translation
  socket.on('send-message', async (data) => {
    const { sessionId, message } = data;
    
    try {
      // Add message using negotiation service
      const messageWithId = negotiationService.addMessage(sessionId, message);
      
      // Get session for language information
      const session = negotiationService.getSession(sessionId);
      
      // Perform AI translation if needed
      let translatedMessage = { ...messageWithId };
      
      if (session.vendorLanguage !== session.buyerLanguage) {
        // Determine target language based on sender
        const isVendor = messageWithId.senderId === session.vendorId;
        const targetLang = isVendor ? session.buyerLanguage : session.vendorLanguage;
        
        if (message.language !== targetLang) {
          try {
            const translation = await aiMediationService.translateMessage({
              originalText: message.originalText,
              sourceLang: message.language,
              targetLang: targetLang,
              sessionId: sessionId,
              messageType: message.messageType || 'message'
            });
            
            if (translation.success) {
              translatedMessage.translatedText = translation.translatedText;
              translatedMessage.translationConfidence = translation.confidence;
              translatedMessage.preservedTerms = translation.preservedTerms;
            }
          } catch (translationError) {
            errorHandler.logError(translationError, 'WebSocket message translation', { sessionId });
            // Continue without translation
          }
        }
      }
      
      // Broadcast message to all participants in the session
      io.to(sessionId).emit('new-message', translatedMessage);
      
      console.log(`Message sent in session ${sessionId}:`, message.originalText.substring(0, 50));
    } catch (error) {
      errorHandler.logError(error, 'WebSocket send-message', { sessionId });
      const language = socket.language || 'en';
      const errorResponse = errorHandler.handleError(error, 'send-message', language);
      socket.emit('negotiation-error', errorResponse);
    }
  });
  
  // Handle message translations
  socket.on('message-translation', (data) => {
    const { sessionId, messageId, translation } = data;
    
    // Broadcast translation update to session participants
    socket.to(sessionId).emit('message-updated', {
      messageId,
      translatedText: translation,
      timestamp: new Date()
    });
  });
  
  // Handle AI suggestions
  socket.on('request-ai-suggestion', async (data) => {
    const { sessionId } = data;
    
    try {
      const session = negotiationService.getSession(sessionId);
      
      // Generate AI-mediated compromise suggestions
      const suggestions = await aiMediationService.generateCompromiseSuggestions(session);
      
      if (suggestions.success) {
        // Add suggestions to session
        for (const suggestion of suggestions.suggestions) {
          negotiationService.addAISuggestion(sessionId, suggestion.description);
        }
        
        // Broadcast AI suggestions to session participants
        io.to(sessionId).emit('ai-suggestions', {
          suggestions: suggestions.suggestions,
          marketInsights: suggestions.marketInsights,
          negotiationTips: suggestions.negotiationTips,
          fairPriceRange: suggestions.fairPriceRange,
          confidence: suggestions.confidence,
          timestamp: new Date()
        });
      } else {
        socket.emit('negotiation-error', { 
          message: 'Failed to generate AI suggestions' 
        });
      }
    } catch (error) {
      console.error('Error generating AI suggestion:', error);
      socket.emit('negotiation-error', { 
        message: 'Failed to generate AI suggestion' 
      });
    }
  });
  
  // Handle conversation analysis requests
  socket.on('request-conversation-analysis', async (data) => {
    const { sessionId } = data;
    
    try {
      const session = negotiationService.getSession(sessionId);
      const analysis = await aiMediationService.analyzeConversation(session);
      
      if (analysis.success) {
        // Send analysis to requesting client only (private information)
        socket.emit('conversation-analysis', {
          analysis: analysis.analysis,
          timestamp: new Date()
        });
      } else {
        socket.emit('negotiation-error', { 
          message: 'Failed to analyze conversation' 
        });
      }
    } catch (error) {
      console.error('Error analyzing conversation:', error);
      socket.emit('negotiation-error', { 
        message: 'Failed to analyze conversation' 
      });
    }
  });
  
  // Handle translation requests
  socket.on('request-translation', async (data) => {
    const { sessionId, originalText, sourceLang, targetLang, messageType } = data;
    
    try {
      const translation = await aiMediationService.translateMessage({
        originalText,
        sourceLang,
        targetLang,
        sessionId,
        messageType: messageType || 'message'
      });
      
      socket.emit('translation-result', {
        translation,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error translating message:', error);
      socket.emit('negotiation-error', { 
        message: 'Failed to translate message' 
      });
    }
  });
  
  // Handle typing indicators
  socket.on('typing', (data) => {
    const { sessionId, userId, userName } = data;
    socket.to(sessionId).emit('user-typing', { userId, userName });
  });
  
  socket.on('stop-typing', (data) => {
    const { sessionId, userId } = data;
    socket.to(sessionId).emit('user-stopped-typing', { userId });
  });
  
  // Leave negotiation session
  socket.on('leave-negotiation', (data) => {
    const { sessionId, userId } = data;
    
    try {
      socket.leave(sessionId);
      
      const result = negotiationService.removeParticipant(sessionId, userId);
      
      // Clean up AI mediation context if session is deleted
      if (result === null) {
        aiMediationService.clearConversationContext(sessionId);
      }
      
      console.log(`Client ${socket.id} (${userId}) left negotiation ${sessionId}`);
      
      // Notify other participants
      socket.to(sessionId).emit('user-left', {
        userId,
        timestamp: new Date(),
        sessionDeleted: result === null
      });
    } catch (error) {
      console.error('Error leaving negotiation:', error);
      // Don't emit error for leave operations as user might already be disconnected
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    loggingService.logWebSocketEvent('disconnect', socket.id, { 
      userId: socket.userId, 
      sessionId: socket.sessionId 
    });
    console.log('Client disconnected:', socket.id);
    
    // Clean up user from sessions
    if (socket.userId && socket.sessionId) {
      const sessionId = socket.sessionId;
      const userId = socket.userId;
      
      try {
        const result = negotiationService.removeParticipant(sessionId, userId);
        
        // Clean up AI mediation context if session is deleted
        if (result === null) {
          aiMediationService.clearConversationContext(sessionId);
        }
        
        if (result !== null) {
          // Notify remaining participants
          socket.to(sessionId).emit('user-left', {
            userId,
            timestamp: new Date(),
            sessionDeleted: false
          });
        }
      } catch (error) {
        console.error('Error cleaning up on disconnect:', error);
        // Continue with cleanup even if there's an error
      }
    }
  });
});

// API endpoint to get session info (now handled by negotiate routes)
// Keeping for backward compatibility
app.get('/api/v1/sessions/:sessionId', (req, res) => {
  res.redirect(301, `/api/v1/negotiate/session/${req.params.sessionId}`);
});

// API endpoint to get active sessions (now handled by negotiate routes)
// Keeping for backward compatibility  
app.get('/api/v1/sessions', (req, res) => {
  res.redirect(301, '/api/v1/negotiate/stats');
});

// Error handling middleware - use centralized error handler
app.use(errorHandler.expressErrorHandler.bind(errorHandler));

// 404 handler with multilingual support
app.use('*', (req, res) => {
  const language = req.headers['accept-language'] || req.query.lang || 'en';
  const errorResponse = errorHandler.createErrorResponse('ROUTE_NOT_FOUND', language, {
    path: req.originalUrl,
    method: req.method
  });
  res.status(404).json(errorResponse);
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  loggingService.info('Server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    uptime: process.uptime()
  });
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server, io };