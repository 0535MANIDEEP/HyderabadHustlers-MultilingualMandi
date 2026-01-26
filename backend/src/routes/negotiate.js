const express = require('express');
const NegotiationService = require('../services/NegotiationService');
const AIMediationService = require('../services/AIMediationService');
const router = express.Router();

// Initialize services (singleton for this module)
const negotiationService = new NegotiationService();
const aiMediationService = new AIMediationService();

// POST /api/v1/negotiate/session - Create new negotiation session
router.post('/session', async (req, res) => {
  try {
    const session = negotiationService.createSession(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Negotiation session created successfully',
      session: {
        sessionId: session.sessionId,
        vendorId: session.vendorId,
        cropDetails: session.cropDetails,
        status: session.status,
        vendorLanguage: session.vendorLanguage,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt
      }
    });
  } catch (error) {
    console.error('Negotiation session creation error:', error);
    res.status(400).json({ 
      error: 'Failed to create negotiation session',
      message: error.message 
    });
  }
});

// GET /api/v1/negotiate/session/:sessionId - Get session details
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = negotiationService.getSession(sessionId);
    
    res.json({
      success: true,
      session: {
        ...session,
        // Don't include all messages in basic session info
        messageCount: session.messages.length,
        recentMessages: session.messages.slice(-5)
      }
    });
  } catch (error) {
    console.error('Session retrieval error:', error);
    
    if (error.message === 'Session not found') {
      res.status(404).json({ 
        error: 'Session not found',
        message: 'The requested negotiation session does not exist'
      });
    } else {
      res.status(500).json({ 
        error: 'Session retrieval error',
        message: error.message 
      });
    }
  }
});

// POST /api/v1/negotiate/session/:sessionId/join - Join existing session as buyer
router.post('/session/:sessionId/join', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { buyerId, language = 'en' } = req.body;
    
    if (!buyerId) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'buyerId is required'
      });
    }
    
    const session = negotiationService.joinSession(sessionId, buyerId, language);
    
    res.json({
      success: true,
      message: 'Successfully joined negotiation session',
      session: {
        sessionId: session.sessionId,
        vendorId: session.vendorId,
        buyerId: session.buyerId,
        cropDetails: session.cropDetails,
        status: session.status,
        participants: session.participants,
        vendorLanguage: session.vendorLanguage,
        buyerLanguage: session.buyerLanguage
      }
    });
  } catch (error) {
    console.error('Session join error:', error);
    
    if (error.message === 'Session not found') {
      res.status(404).json({ 
        error: 'Session not found',
        message: 'The requested negotiation session does not exist'
      });
    } else if (error.message.includes('Cannot join session') || error.message.includes('already has a buyer')) {
      res.status(409).json({ 
        error: 'Cannot join session',
        message: error.message 
      });
    } else {
      res.status(500).json({ 
        error: 'Session join error',
        message: error.message 
      });
    }
  }
});

// POST /api/v1/negotiate/session/:sessionId/message - Add message to session
router.post('/session/:sessionId/message', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const message = negotiationService.addMessage(sessionId, req.body);
    
    res.status(201).json({
      success: true,
      message: 'Message added successfully',
      messageData: message
    });
  } catch (error) {
    console.error('Message addition error:', error);
    
    if (error.message === 'Session not found') {
      res.status(404).json({ 
        error: 'Session not found',
        message: 'The requested negotiation session does not exist'
      });
    } else if (error.message.includes('Cannot send message') || error.message.includes('not a participant')) {
      res.status(403).json({ 
        error: 'Message not allowed',
        message: error.message 
      });
    } else if (error.message.includes('Invalid message data')) {
      res.status(400).json({ 
        error: 'Invalid message data',
        message: error.message 
      });
    } else {
      res.status(500).json({ 
        error: 'Message addition error',
        message: error.message 
      });
    }
  }
});

// PUT /api/v1/negotiate/session/:sessionId/status - Update session status
router.put('/session/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { status, userId } = req.body;
    
    if (!status || !userId) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'status and userId are required'
      });
    }
    
    const session = negotiationService.updateSessionStatus(sessionId, status, userId);
    
    res.json({
      success: true,
      message: 'Session status updated successfully',
      session: {
        sessionId: session.sessionId,
        status: session.status,
        lastActivity: session.lastActivity
      }
    });
  } catch (error) {
    console.error('Status update error:', error);
    
    if (error.message === 'Session not found') {
      res.status(404).json({ 
        error: 'Session not found',
        message: 'The requested negotiation session does not exist'
      });
    } else if (error.message.includes('not a participant') || error.message.includes('Invalid status')) {
      res.status(400).json({ 
        error: 'Status update not allowed',
        message: error.message 
      });
    } else {
      res.status(500).json({ 
        error: 'Status update error',
        message: error.message 
      });
    }
  }
});

// POST /api/v1/negotiate/session/:sessionId/ai-suggestion - Add AI suggestion
router.post('/session/:sessionId/ai-suggestion', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { suggestion } = req.body;
    
    if (!suggestion) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'suggestion is required'
      });
    }
    
    const session = negotiationService.addAISuggestion(sessionId, suggestion);
    
    res.json({
      success: true,
      message: 'AI suggestion added successfully',
      suggestion: session.aiSuggestions[session.aiSuggestions.length - 1]
    });
  } catch (error) {
    console.error('AI suggestion error:', error);
    
    if (error.message === 'Session not found') {
      res.status(404).json({ 
        error: 'Session not found',
        message: 'The requested negotiation session does not exist'
      });
    } else {
      res.status(500).json({ 
        error: 'AI suggestion error',
        message: error.message 
      });
    }
  }
});

// POST /api/v1/negotiate/session/:sessionId/translate - Translate message
router.post('/session/:sessionId/translate', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { originalText, sourceLang, targetLang, messageType } = req.body;
    
    if (!originalText || !sourceLang || !targetLang) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'originalText, sourceLang, and targetLang are required'
      });
    }
    
    const translationResult = await aiMediationService.translateMessage({
      originalText,
      sourceLang,
      targetLang,
      sessionId,
      messageType: messageType || 'message'
    });
    
    res.json({
      success: translationResult.success,
      translation: translationResult
    });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ 
      error: 'Translation error',
      message: error.message 
    });
  }
});

// POST /api/v1/negotiate/session/:sessionId/generate-suggestions - Generate AI compromise suggestions
router.post('/session/:sessionId/generate-suggestions', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = negotiationService.getSession(sessionId);
    
    const suggestions = await aiMediationService.generateCompromiseSuggestions(session);
    
    // Add suggestions to session if successful
    if (suggestions.success && suggestions.suggestions.length > 0) {
      for (const suggestion of suggestions.suggestions) {
        negotiationService.addAISuggestion(sessionId, suggestion.description);
      }
    }
    
    res.json({
      success: suggestions.success,
      suggestions: suggestions
    });
  } catch (error) {
    console.error('Suggestion generation error:', error);
    
    if (error.message === 'Session not found') {
      res.status(404).json({ 
        error: 'Session not found',
        message: 'The requested negotiation session does not exist'
      });
    } else {
      res.status(500).json({ 
        error: 'Suggestion generation error',
        message: error.message 
      });
    }
  }
});

// POST /api/v1/negotiate/session/:sessionId/analyze - Analyze conversation
router.post('/session/:sessionId/analyze', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = negotiationService.getSession(sessionId);
    
    const analysis = await aiMediationService.analyzeConversation(session);
    
    res.json({
      success: analysis.success,
      analysis: analysis
    });
  } catch (error) {
    console.error('Conversation analysis error:', error);
    
    if (error.message === 'Session not found') {
      res.status(404).json({ 
        error: 'Session not found',
        message: 'The requested negotiation session does not exist'
      });
    } else {
      res.status(500).json({ 
        error: 'Analysis error',
        message: error.message 
      });
    }
  }
});

// GET /api/v1/negotiate/user/:userId/sessions - Get user's sessions
router.get('/user/:userId/sessions', async (req, res) => {
  try {
    const { userId } = req.params;
    const sessions = negotiationService.getUserSessions(userId);
    
    res.json({
      success: true,
      sessions,
      totalSessions: sessions.length
    });
  } catch (error) {
    console.error('User sessions retrieval error:', error);
    res.status(500).json({ 
      error: 'User sessions retrieval error',
      message: error.message 
    });
  }
});

// DELETE /api/v1/negotiate/session/:sessionId/participant/:userId - Remove participant
router.delete('/session/:sessionId/participant/:userId', async (req, res) => {
  try {
    const { sessionId, userId } = req.params;
    const result = negotiationService.removeParticipant(sessionId, userId);
    
    if (result === null) {
      res.json({
        success: true,
        message: 'Participant removed and session deleted (no participants remaining)',
        sessionDeleted: true
      });
    } else {
      res.json({
        success: true,
        message: 'Participant removed successfully',
        session: {
          sessionId: result.sessionId,
          participants: result.participants,
          status: result.status
        }
      });
    }
  } catch (error) {
    console.error('Participant removal error:', error);
    
    if (error.message === 'Session not found') {
      res.status(404).json({ 
        error: 'Session not found',
        message: 'The requested negotiation session does not exist'
      });
    } else {
      res.status(500).json({ 
        error: 'Participant removal error',
        message: error.message 
      });
    }
  }
});

// GET /api/v1/negotiate/stats - Get negotiation statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = negotiationService.getSessionStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Stats retrieval error:', error);
    res.status(500).json({ 
      error: 'Stats retrieval error',
      message: error.message 
    });
  }
});

// Export both router and services for WebSocket integration
module.exports = { router, negotiationService, aiMediationService };