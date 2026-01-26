const request = require('supertest');
const express = require('express');
const NegotiationService = require('../services/NegotiationService');

// Create test app with fresh negotiation service for each test
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Create fresh negotiation service instance
  const negotiationService = new NegotiationService();
  
  // Create router with fresh service
  const express2 = require('express');
  const router = express2.Router();
  
  // Copy the route handlers but use the fresh service
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
      res.status(400).json({ 
        error: 'Failed to create negotiation session',
        message: error.message 
      });
    }
  });

  router.get('/session/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = negotiationService.getSession(sessionId);
      
      res.json({
        success: true,
        session: {
          ...session,
          messageCount: session.messages.length,
          recentMessages: session.messages.slice(-5)
        }
      });
    } catch (error) {
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
      res.status(500).json({ 
        error: 'User sessions retrieval error',
        message: error.message 
      });
    }
  });

  router.get('/stats', async (req, res) => {
    try {
      const stats = negotiationService.getSessionStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Stats retrieval error',
        message: error.message 
      });
    }
  });
  
  app.use('/api/v1/negotiate', router);
  return { app, negotiationService };
};

describe('Negotiate Routes', () => {
  let app, negotiationService;

  beforeEach(() => {
    const testApp = createTestApp();
    app = testApp.app;
    negotiationService = testApp.negotiationService;
  });

  afterEach(() => {
    // Clean up intervals
    if (negotiationService.cleanupInterval) {
      clearInterval(negotiationService.cleanupInterval);
    }
  });
  describe('POST /api/v1/negotiate/session', () => {
    it('should create a new negotiation session', async () => {
      const sessionData = {
        vendorId: 'vendor123',
        cropDetails: {
          name: 'tomato',
          quantity: 100,
          unit: 'kg',
          quality: 'premium'
        },
        vendorLanguage: 'hi'
      };

      const response = await request(app)
        .post('/api/v1/negotiate/session')
        .send(sessionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.session).toHaveProperty('sessionId');
      expect(response.body.session.vendorId).toBe('vendor123');
      expect(response.body.session.status).toBe('waiting');
    });

    it('should return 400 for invalid session data', async () => {
      const invalidData = {
        vendorId: 'vendor123'
        // Missing required cropDetails
      };

      const response = await request(app)
        .post('/api/v1/negotiate/session')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Failed to create negotiation session');
    });
  });

  describe('GET /api/v1/negotiate/session/:sessionId', () => {
    let sessionId;

    beforeEach(async () => {
      const sessionData = {
        vendorId: 'vendor123',
        cropDetails: {
          name: 'onion',
          quantity: 50,
          unit: 'kg'
        }
      };

      const createResponse = await request(app)
        .post('/api/v1/negotiate/session')
        .send(sessionData);

      sessionId = createResponse.body.session.sessionId;
    });

    it('should retrieve session details', async () => {
      const response = await request(app)
        .get(`/api/v1/negotiate/session/${sessionId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.session.sessionId).toBe(sessionId);
      expect(response.body.session.vendorId).toBe('vendor123');
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .get('/api/v1/negotiate/session/invalid-session')
        .expect(404);

      expect(response.body.error).toBe('Session not found');
    });
  });

  describe('POST /api/v1/negotiate/session/:sessionId/join', () => {
    let sessionId;

    beforeEach(async () => {
      const sessionData = {
        vendorId: 'vendor123',
        cropDetails: {
          name: 'chili',
          quantity: 25,
          unit: 'kg'
        }
      };

      const createResponse = await request(app)
        .post('/api/v1/negotiate/session')
        .send(sessionData);

      sessionId = createResponse.body.session.sessionId;
    });

    it('should allow buyer to join session', async () => {
      const joinData = {
        buyerId: 'buyer456',
        language: 'te'
      };

      const response = await request(app)
        .post(`/api/v1/negotiate/session/${sessionId}/join`)
        .send(joinData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.session.buyerId).toBe('buyer456');
      expect(response.body.session.status).toBe('active');
    });

    it('should return 400 for missing buyerId', async () => {
      const response = await request(app)
        .post(`/api/v1/negotiate/session/${sessionId}/join`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Missing required field');
    });
  });

  describe('POST /api/v1/negotiate/session/:sessionId/message', () => {
    let sessionId;

    beforeEach(async () => {
      // Create session and join as buyer
      const sessionData = {
        vendorId: 'vendor123',
        cropDetails: {
          name: 'potato',
          quantity: 200,
          unit: 'kg'
        }
      };

      const createResponse = await request(app)
        .post('/api/v1/negotiate/session')
        .send(sessionData);

      sessionId = createResponse.body.session.sessionId;

      await request(app)
        .post(`/api/v1/negotiate/session/${sessionId}/join`)
        .send({ buyerId: 'buyer456' });
    });

    it('should add message to session', async () => {
      const messageData = {
        senderId: 'vendor123',
        originalText: 'Hello, I have fresh potatoes',
        language: 'en',
        messageType: 'message'
      };

      const response = await request(app)
        .post(`/api/v1/negotiate/session/${sessionId}/message`)
        .send(messageData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.messageData).toHaveProperty('messageId');
      expect(response.body.messageData.senderId).toBe('vendor123');
    });

    it('should handle offer messages', async () => {
      const offerMessage = {
        senderId: 'vendor123',
        originalText: 'I offer 200kg at ₹30/kg',
        language: 'en',
        messageType: 'offer',
        offerDetails: {
          price: 30,
          quantity: 200,
          terms: 'Fresh quality'
        }
      };

      const response = await request(app)
        .post(`/api/v1/negotiate/session/${sessionId}/message`)
        .send(offerMessage)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.messageData.messageType).toBe('offer');
    });
  });

  describe('PUT /api/v1/negotiate/session/:sessionId/status', () => {
    let sessionId;

    beforeEach(async () => {
      const sessionData = {
        vendorId: 'vendor123',
        cropDetails: {
          name: 'tomato',
          quantity: 75,
          unit: 'kg'
        }
      };

      const createResponse = await request(app)
        .post('/api/v1/negotiate/session')
        .send(sessionData);

      sessionId = createResponse.body.session.sessionId;
    });

    it('should update session status', async () => {
      const statusData = {
        status: 'cancelled',
        userId: 'vendor123'
      };

      const response = await request(app)
        .put(`/api/v1/negotiate/session/${sessionId}/status`)
        .send(statusData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.session.status).toBe('cancelled');
    });

    it('should return 400 for missing fields', async () => {
      const response = await request(app)
        .put(`/api/v1/negotiate/session/${sessionId}/status`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Missing required fields');
    });
  });

  describe('GET /api/v1/negotiate/user/:userId/sessions', () => {
    beforeEach(async () => {
      // Create multiple sessions for the user
      const sessionData1 = {
        vendorId: 'vendor123',
        cropDetails: { name: 'tomato', quantity: 50, unit: 'kg' }
      };
      const sessionData2 = {
        vendorId: 'vendor123',
        cropDetails: { name: 'onion', quantity: 100, unit: 'kg' }
      };

      await request(app).post('/api/v1/negotiate/session').send(sessionData1);
      await request(app).post('/api/v1/negotiate/session').send(sessionData2);
    });

    it('should return user sessions', async () => {
      const response = await request(app)
        .get('/api/v1/negotiate/user/vendor123/sessions')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sessions).toHaveLength(2);
      expect(response.body.totalSessions).toBe(2);
    });
  });

  describe('GET /api/v1/negotiate/stats', () => {
    it('should return negotiation statistics', async () => {
      const response = await request(app)
        .get('/api/v1/negotiate/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats).toHaveProperty('totalSessions');
      expect(response.body.stats).toHaveProperty('activeSessions');
    });
  });
});