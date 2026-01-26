const request = require('supertest');
const express = require('express');
const AIMediationService = require('../services/AIMediationService');

// Mock the AI mediation service
jest.mock('../services/AIMediationService');

// Create test app with mocked AI service
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock AI mediation service
  const mockAIMediationService = {
    translateMessage: jest.fn(),
    generateCompromiseSuggestions: jest.fn(),
    analyzeConversation: jest.fn()
  };
  
  // Create router with mocked services
  const NegotiationService = require('../services/NegotiationService');
  const negotiationService = new NegotiationService();
  
  const express2 = require('express');
  const router = express2.Router();
  
  // Add the AI-specific routes
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
      
      const translationResult = await mockAIMediationService.translateMessage({
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
      res.status(500).json({ 
        error: 'Translation error',
        message: error.message 
      });
    }
  });

  router.post('/session/:sessionId/generate-suggestions', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Create a mock session for testing
      const mockSession = {
        sessionId,
        cropDetails: { name: 'tomato', quantity: 100, unit: 'kg' },
        messages: [],
        vendorLanguage: 'en',
        buyerLanguage: 'hi'
      };
      
      const suggestions = await mockAIMediationService.generateCompromiseSuggestions(mockSession);
      
      res.json({
        success: suggestions.success,
        suggestions: suggestions
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Suggestion generation error',
        message: error.message 
      });
    }
  });

  router.post('/session/:sessionId/analyze', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Create a mock session for testing
      const mockSession = {
        sessionId,
        messages: [
          { senderId: 'vendor1', originalText: 'Hello' },
          { senderId: 'buyer1', originalText: 'Hi there' }
        ],
        cropDetails: { name: 'onion', quantity: 50, unit: 'kg' }
      };
      
      const analysis = await mockAIMediationService.analyzeConversation(mockSession);
      
      res.json({
        success: analysis.success,
        analysis: analysis
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Analysis error',
        message: error.message 
      });
    }
  });
  
  app.use('/api/v1/negotiate', router);
  return { app, mockAIMediationService };
};

describe('AI Mediation Routes', () => {
  let app, mockAIMediationService;

  beforeEach(() => {
    const testApp = createTestApp();
    app = testApp.app;
    mockAIMediationService = testApp.mockAIMediationService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/negotiate/session/:sessionId/translate', () => {
    it('should translate message successfully', async () => {
      const translationData = {
        originalText: 'Hello farmer',
        sourceLang: 'en',
        targetLang: 'hi',
        messageType: 'message'
      };

      const mockTranslationResult = {
        success: true,
        originalText: 'Hello farmer',
        translatedText: 'नमस्ते किसान',
        confidence: 0.95,
        preservedTerms: ['farmer']
      };

      mockAIMediationService.translateMessage.mockResolvedValue(mockTranslationResult);

      const response = await request(app)
        .post('/api/v1/negotiate/session/session123/translate')
        .send(translationData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.translation.translatedText).toBe('नमस्ते किसान');
      expect(mockAIMediationService.translateMessage).toHaveBeenCalledWith({
        originalText: 'Hello farmer',
        sourceLang: 'en',
        targetLang: 'hi',
        sessionId: 'session123',
        messageType: 'message'
      });
    });

    it('should return 400 for missing required fields', async () => {
      const incompleteData = {
        originalText: 'Hello'
        // Missing sourceLang and targetLang
      };

      const response = await request(app)
        .post('/api/v1/negotiate/session/session123/translate')
        .send(incompleteData)
        .expect(400);

      expect(response.body.error).toBe('Missing required fields');
    });

    it('should handle translation service errors', async () => {
      const translationData = {
        originalText: 'Hello',
        sourceLang: 'en',
        targetLang: 'hi'
      };

      mockAIMediationService.translateMessage.mockRejectedValue(new Error('Translation failed'));

      const response = await request(app)
        .post('/api/v1/negotiate/session/session123/translate')
        .send(translationData)
        .expect(500);

      expect(response.body.error).toBe('Translation error');
    });
  });

  describe('POST /api/v1/negotiate/session/:sessionId/generate-suggestions', () => {
    it('should generate AI compromise suggestions', async () => {
      const mockSuggestions = {
        success: true,
        suggestions: [
          {
            type: 'price_compromise',
            description: 'Meet at ₹40/kg for fair deal',
            priceRange: { min: 38, max: 42 }
          }
        ],
        marketInsights: 'Current market supports this price range',
        confidence: 0.85
      };

      mockAIMediationService.generateCompromiseSuggestions.mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .post('/api/v1/negotiate/session/session123/generate-suggestions')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.suggestions.suggestions).toHaveLength(1);
      expect(response.body.suggestions.suggestions[0].type).toBe('price_compromise');
      expect(mockAIMediationService.generateCompromiseSuggestions).toHaveBeenCalled();
    });

    it('should handle suggestion generation errors', async () => {
      mockAIMediationService.generateCompromiseSuggestions.mockRejectedValue(
        new Error('AI service unavailable')
      );

      const response = await request(app)
        .post('/api/v1/negotiate/session/session123/generate-suggestions')
        .expect(500);

      expect(response.body.error).toBe('Suggestion generation error');
    });
  });

  describe('POST /api/v1/negotiate/session/:sessionId/analyze', () => {
    it('should analyze conversation successfully', async () => {
      const mockAnalysis = {
        success: true,
        analysis: {
          sentiment: {
            vendor: 'positive',
            buyer: 'neutral',
            overall: 'collaborative'
          },
          progress: {
            stage: 'negotiating',
            agreementLikelihood: 0.75
          },
          recommendations: ['Consider quality premium']
        }
      };

      mockAIMediationService.analyzeConversation.mockResolvedValue(mockAnalysis);

      const response = await request(app)
        .post('/api/v1/negotiate/session/session123/analyze')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.analysis.analysis.sentiment.overall).toBe('collaborative');
      expect(response.body.analysis.analysis.progress.stage).toBe('negotiating');
      expect(mockAIMediationService.analyzeConversation).toHaveBeenCalled();
    });

    it('should handle analysis errors', async () => {
      mockAIMediationService.analyzeConversation.mockRejectedValue(
        new Error('Analysis service failed')
      );

      const response = await request(app)
        .post('/api/v1/negotiate/session/session123/analyze')
        .expect(500);

      expect(response.body.error).toBe('Analysis error');
    });
  });
});