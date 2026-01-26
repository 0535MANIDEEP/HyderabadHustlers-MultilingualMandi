const AIMediationService = require('./AIMediationService');
const BedrockClient = require('./BedrockClient');
const TranslationService = require('./TranslationService');
const PriceService = require('./PriceService');

// Mock the dependencies
jest.mock('./BedrockClient');
jest.mock('./TranslationService');
jest.mock('./PriceService');

describe('AIMediationService', () => {
  let aiMediationService;
  let mockBedrockClient;
  let mockTranslationService;
  let mockPriceService;

  beforeEach(() => {
    // Create mock instances
    mockBedrockClient = {
      invokeModel: jest.fn()
    };
    mockTranslationService = {
      translateText: jest.fn()
    };
    mockPriceService = {
      getCropPrices: jest.fn(),
      calculatePriceStatistics: jest.fn()
    };

    // Create service with mocked dependencies
    aiMediationService = new AIMediationService({
      bedrockClient: mockBedrockClient,
      translationService: mockTranslationService,
      priceService: mockPriceService
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('translateMessage', () => {
    it('should translate message successfully', async () => {
      const messageData = {
        originalText: 'मैं टमाटर बेचना चाहता हूं',
        sourceLang: 'hi',
        targetLang: 'en',
        sessionId: 'session123',
        messageType: 'message'
      };

      const mockAIResponse = JSON.stringify({
        translatedText: 'I want to sell tomatoes',
        confidence: 0.95,
        preservedTerms: ['टमाटर'],
        culturalNotes: 'Direct translation of agricultural intent'
      });

      mockBedrockClient.invokeModel.mockResolvedValue(mockAIResponse);

      const result = await aiMediationService.translateMessage(messageData);

      expect(result.success).toBe(true);
      expect(result.translatedText).toBe('I want to sell tomatoes');
      expect(result.confidence).toBe(0.95);
      expect(result.preservedTerms).toContain('टमाटर');
      expect(mockBedrockClient.invokeModel).toHaveBeenCalledWith(
        expect.stringContaining('मैं टमाटर बेचना चाहता हूं')
      );
    });

    it('should fallback to translation service on AI failure', async () => {
      const messageData = {
        originalText: 'Hello farmer',
        sourceLang: 'en',
        targetLang: 'hi',
        sessionId: 'session123'
      };

      mockBedrockClient.invokeModel.mockRejectedValue(new Error('AI service unavailable'));
      mockTranslationService.translateText.mockResolvedValue({
        translatedText: 'नमस्ते किसान',
        confidence: 0.8
      });

      const result = await aiMediationService.translateMessage(messageData);

      expect(result.success).toBe(true);
      expect(result.translatedText).toBe('नमस्ते किसान');
      expect(result.fallback).toBe(true);
      expect(mockTranslationService.translateText).toHaveBeenCalledWith('Hello farmer', 'en', 'hi');
    });

    it('should handle complete translation failure', async () => {
      const messageData = {
        originalText: 'Test message',
        sourceLang: 'en',
        targetLang: 'hi',
        sessionId: 'session123'
      };

      mockBedrockClient.invokeModel.mockRejectedValue(new Error('AI failure'));
      mockTranslationService.translateText.mockRejectedValue(new Error('Translation failure'));

      const result = await aiMediationService.translateMessage(messageData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Translation failed');
    });
  });

  describe('generateCompromiseSuggestions', () => {
    it('should generate compromise suggestions with market data', async () => {
      const sessionData = {
        sessionId: 'session123',
        cropDetails: { name: 'tomato', quantity: 100, unit: 'kg', quality: 'premium' },
        currentOffer: { price: 45, quantity: 100 },
        messages: [
          { senderId: 'vendor1', originalText: 'I offer ₹45/kg', language: 'en' },
          { senderId: 'buyer1', originalText: 'Too expensive, ₹35/kg', language: 'en' }
        ],
        vendorLanguage: 'en',
        buyerLanguage: 'hi'
      };

      const mockMarketData = [
        { price: 40, quality: 'premium' },
        { price: 38, quality: 'standard' }
      ];

      const mockPriceStats = {
        averagePrice: 39,
        minPrice: 35,
        maxPrice: 45
      };

      const mockAIResponse = JSON.stringify({
        suggestions: [
          {
            type: 'price_compromise',
            description: 'Meet at ₹40/kg considering premium quality',
            priceRange: { min: 38, max: 42 },
            reasoning: 'Fair price for premium tomatoes'
          }
        ],
        marketInsights: 'Current market supports ₹38-42/kg for premium tomatoes',
        negotiationTips: 'Consider quality premium and seasonal demand',
        fairPriceRange: { min: 38, max: 42 },
        confidence: 0.85
      });

      mockPriceService.getCropPrices.mockResolvedValue(mockMarketData);
      mockPriceService.calculatePriceStatistics.mockResolvedValue(mockPriceStats);
      mockBedrockClient.invokeModel.mockResolvedValue(mockAIResponse);
      mockTranslationService.translateText.mockResolvedValue({
        translatedText: 'Translated suggestion'
      });

      const result = await aiMediationService.generateCompromiseSuggestions(sessionData);

      expect(result.success).toBe(true);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].type).toBe('price_compromise');
      expect(result.fairPriceRange).toEqual({ min: 38, max: 42 });
      expect(result.basedOnMarketData.averagePrice).toBe(39);
    });

    it('should generate fallback suggestions when AI fails', async () => {
      const sessionData = {
        sessionId: 'session123',
        cropDetails: { name: 'onion', quantity: 50, unit: 'kg', quality: 'standard' },
        currentOffer: { price: 35 },
        messages: [],
        vendorLanguage: 'en',
        buyerLanguage: 'en'
      };

      const mockPriceStats = {
        averagePrice: 30,
        minPrice: 25,
        maxPrice: 35
      };

      mockPriceService.getCropPrices.mockResolvedValue([]);
      mockPriceService.calculatePriceStatistics.mockResolvedValue(mockPriceStats);
      mockBedrockClient.invokeModel.mockRejectedValue(new Error('AI failure'));

      const result = await aiMediationService.generateCompromiseSuggestions(sessionData);

      expect(result.success).toBe(true);
      expect(result.fallback).toBe(true);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].type).toBe('price_acceptable');
    });
  });

  describe('analyzeConversation', () => {
    it('should analyze conversation sentiment and progress', async () => {
      const sessionData = {
        sessionId: 'session123',
        messages: [
          { senderId: 'vendor1', originalText: 'I have good quality tomatoes' },
          { senderId: 'buyer1', originalText: 'What is your price?' },
          { senderId: 'vendor1', originalText: '₹45 per kg' },
          { senderId: 'buyer1', originalText: 'Too expensive, can you do ₹35?' }
        ],
        cropDetails: { name: 'tomato', quantity: 100, unit: 'kg' }
      };

      const mockAIResponse = JSON.stringify({
        sentiment: {
          vendor: 'positive',
          buyer: 'neutral',
          overall: 'collaborative'
        },
        progress: {
          stage: 'negotiating',
          agreementLikelihood: 0.75,
          keyIssues: ['price']
        },
        recommendations: [
          'Vendor could offer a small discount for bulk purchase',
          'Buyer could consider quality premium'
        ],
        riskFactors: ['Price gap may be too large']
      });

      mockBedrockClient.invokeModel.mockResolvedValue(mockAIResponse);

      const result = await aiMediationService.analyzeConversation(sessionData);

      expect(result.success).toBe(true);
      expect(result.analysis.sentiment.overall).toBe('collaborative');
      expect(result.analysis.progress.stage).toBe('negotiating');
      expect(result.analysis.recommendations).toHaveLength(2);
    });

    it('should handle conversation analysis failure', async () => {
      const sessionData = {
        sessionId: 'session123',
        messages: [],
        cropDetails: { name: 'tomato', quantity: 100, unit: 'kg' }
      };

      mockBedrockClient.invokeModel.mockRejectedValue(new Error('Analysis failed'));

      const result = await aiMediationService.analyzeConversation(sessionData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Analysis failed');
    });
  });

  describe('conversation context management', () => {
    it('should create and update conversation context', () => {
      const sessionId = 'session123';
      const messageData = {
        originalText: 'Hello',
        translatedText: 'नमस्ते',
        sourceLang: 'en',
        targetLang: 'hi',
        timestamp: new Date(),
        preservedTerms: ['farmer']
      };

      // Get initial context
      const context1 = aiMediationService.getConversationContext(sessionId);
      expect(context1.recentMessages).toHaveLength(0);

      // Update context
      aiMediationService.updateConversationContext(sessionId, messageData);

      // Get updated context
      const context2 = aiMediationService.getConversationContext(sessionId);
      expect(context2.recentMessages).toHaveLength(1);
      expect(context2.languages.has('en')).toBe(true);
      expect(context2.languages.has('hi')).toBe(true);
      expect(context2.keyTerms.has('farmer')).toBe(true);
    });

    it('should limit context to maximum messages', () => {
      const sessionId = 'session123';
      
      // Add more messages than the limit
      for (let i = 0; i < 15; i++) {
        aiMediationService.updateConversationContext(sessionId, {
          originalText: `Message ${i}`,
          translatedText: `Translated ${i}`,
          sourceLang: 'en',
          targetLang: 'hi',
          timestamp: new Date()
        });
      }

      const context = aiMediationService.getConversationContext(sessionId);
      expect(context.recentMessages.length).toBeLessThanOrEqual(10);
    });

    it('should clear conversation context', () => {
      const sessionId = 'session123';
      
      // Create context
      aiMediationService.getConversationContext(sessionId);
      expect(aiMediationService.conversationContexts.has(sessionId)).toBe(true);

      // Clear context
      aiMediationService.clearConversationContext(sessionId);
      expect(aiMediationService.conversationContexts.has(sessionId)).toBe(false);
    });
  });

  describe('parseAIResponse', () => {
    it('should parse valid JSON response', () => {
      const response = '{"test": "value", "number": 42}';
      const result = aiMediationService.parseAIResponse(response);
      
      expect(result.test).toBe('value');
      expect(result.number).toBe(42);
    });

    it('should handle JSON with markdown code blocks', () => {
      const response = '```json\n{"test": "value"}\n```';
      const result = aiMediationService.parseAIResponse(response);
      
      expect(result.test).toBe('value');
    });

    it('should handle invalid JSON gracefully', () => {
      const response = 'invalid json {';
      const result = aiMediationService.parseAIResponse(response);
      
      expect(result.error).toBe('Failed to parse AI response');
      expect(result.rawResponse).toBe(response);
    });
  });

  describe('getServiceStats', () => {
    it('should return service statistics', () => {
      // Create some contexts
      aiMediationService.getConversationContext('session1');
      aiMediationService.getConversationContext('session2');
      
      // Add messages to contexts
      aiMediationService.updateConversationContext('session1', {
        originalText: 'Test',
        sourceLang: 'en',
        targetLang: 'hi',
        timestamp: new Date()
      });

      const stats = aiMediationService.getServiceStats();
      
      expect(stats.activeContexts).toBe(2);
      expect(stats.totalLanguages).toBeGreaterThan(0);
      expect(typeof stats.averageMessagesPerContext).toBe('number');
    });
  });
});