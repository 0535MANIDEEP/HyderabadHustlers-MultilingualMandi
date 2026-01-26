const TranslationService = require('./TranslationService');
const BedrockClient = require('./BedrockClient');
const { TranslationRequest, TranslationUtils } = require('../models/TranslationModels');

// Mock BedrockClient for testing
jest.mock('./BedrockClient');

describe('TranslationService', () => {
  let translationService;
  let mockBedrockClient;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock Bedrock client
    mockBedrockClient = {
      invokeModel: jest.fn(),
      modelId: 'test-model',
      getStatus: jest.fn().mockReturnValue({ status: 'ready' })
    };

    BedrockClient.mockImplementation(() => mockBedrockClient);
    
    // Create translation service instance
    translationService = new TranslationService({
      bedrockClient: mockBedrockClient
    });
  });

  describe('Language Detection', () => {
    test('should detect Hindi text using heuristics', async () => {
      const hindiText = 'टमाटर का भाव क्या है?';
      const result = await translationService.detectLanguage(hindiText);
      
      expect(result.language).toBe('hi');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.method).toBe('heuristic');
    });

    test('should detect Telugu text using heuristics', async () => {
      const teluguText = 'టమాటో ధర ఎంత?';
      const result = await translationService.detectLanguage(teluguText);
      
      expect(result.language).toBe('te');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.method).toBe('heuristic');
    });

    test('should detect Tamil text using heuristics', async () => {
      const tamilText = 'தக்காளி விலை என்ன?';
      const result = await translationService.detectLanguage(tamilText);
      
      expect(result.language).toBe('ta');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.method).toBe('heuristic');
    });

    test('should detect English text using heuristics', async () => {
      const englishText = 'What is the price of tomatoes?';
      const result = await translationService.detectLanguage(englishText);
      
      expect(result.language).toBe('en');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.method).toBe('heuristic');
    });

    test('should boost confidence for agricultural terms', async () => {
      const hindiTextWithAgriTerms = 'मंडी में टमाटर का भाव';
      const result = await translationService.detectLanguage(hindiTextWithAgriTerms);
      
      expect(result.language).toBe('hi');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    test('should use AI detection for low confidence heuristic results', async () => {
      const ambiguousText = 'price 100';
      
      mockBedrockClient.invokeModel.mockResolvedValue({
        content: 'Language: en\nConfidence: 0.8'
      });

      const result = await translationService.detectLanguage(ambiguousText);
      
      expect(mockBedrockClient.invokeModel).toHaveBeenCalled();
      expect(result.method).toBe('ai');
    });

    test('should handle AI detection failure gracefully', async () => {
      const ambiguousText = 'price 100';
      
      mockBedrockClient.invokeModel.mockRejectedValue(new Error('AI service unavailable'));

      const result = await translationService.detectLanguage(ambiguousText);
      
      expect(result.language).toBe('en');
      expect(result.method).toBe('fallback');
      expect(result.confidence).toBe(0.3);
    });

    test('should throw error for empty text', async () => {
      await expect(translationService.detectLanguage('')).rejects.toThrow('Text is required for language detection');
      await expect(translationService.detectLanguage(null)).rejects.toThrow('Text is required for language detection');
      await expect(translationService.detectLanguage(undefined)).rejects.toThrow('Text is required for language detection');
    });
  });

  describe('Language Validation', () => {
    test('should validate supported language codes', () => {
      expect(translationService.validateLanguage('hi')).toEqual({
        isValid: true,
        normalizedCode: 'hi',
        languageName: 'Hindi'
      });

      expect(translationService.validateLanguage('EN')).toEqual({
        isValid: true,
        normalizedCode: 'en',
        languageName: 'English'
      });
    });

    test('should reject unsupported language codes', () => {
      const result = translationService.validateLanguage('fr');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unsupported language code');
    });

    test('should reject invalid input types', () => {
      expect(translationService.validateLanguage(null).isValid).toBe(false);
      expect(translationService.validateLanguage(undefined).isValid).toBe(false);
      expect(translationService.validateLanguage(123).isValid).toBe(false);
    });
  });

  describe('Translation', () => {
    test('should translate Hindi to English successfully', async () => {
      const request = new TranslationRequest({
        sourceText: 'टमाटर का भाव क्या है?',
        sourceLang: 'hi',
        targetLang: 'en',
        context: 'price_query'
      });

      mockBedrockClient.invokeModel.mockResolvedValue({
        content: 'What is the price of tomatoes?',
        duration: 1500
      });

      const response = await translationService.translate(request);

      expect(response.success).toBe(true);
      expect(response.translatedText).toBe('What is the price of tomatoes?');
      expect(response.sourceLang).toBe('hi');
      expect(response.targetLang).toBe('en');
      expect(response.context).toBe('price_query');
      expect(response.processingTime).toBeGreaterThan(0);
    });

    test('should preserve agricultural terminology', async () => {
      const request = new TranslationRequest({
        sourceText: 'मंडी में टमाटर 40 रुपये किलो',
        sourceLang: 'hi',
        targetLang: 'en',
        context: 'price_query',
        preserveTerminology: true
      });

      mockBedrockClient.invokeModel.mockResolvedValue({
        content: 'Tomatoes are 40 rupees per kg in the mandi',
        duration: 1200
      });

      const response = await translationService.translate(request);

      expect(response.success).toBe(true);
      expect(response.preservedTerms).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            english: 'tomato',
            category: 'agricultural'
          })
        ])
      );
    });

    test('should handle translation errors gracefully', async () => {
      const request = new TranslationRequest({
        sourceText: 'Test text',
        sourceLang: 'hi',
        targetLang: 'en'
      });

      const error = new Error('Bedrock service unavailable');
      error.category = 'TEMPORARY_ERROR';
      error.retryable = true;

      mockBedrockClient.invokeModel.mockRejectedValue(error);

      const response = await translationService.translate(request);

      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Bedrock service unavailable');
      expect(response.error.category).toBe('TEMPORARY_ERROR');
      expect(response.error.retryable).toBe(true);
    });

    test('should use cache for repeated translations', async () => {
      const request = new TranslationRequest({
        sourceText: 'टमाटर',
        sourceLang: 'hi',
        targetLang: 'en'
      });

      mockBedrockClient.invokeModel.mockResolvedValue({
        content: 'Tomato',
        duration: 1000
      });

      // First translation
      const response1 = await translationService.translate(request);
      expect(mockBedrockClient.invokeModel).toHaveBeenCalledTimes(1);

      // Second translation (should use cache)
      const response2 = await translationService.translate(request);
      expect(mockBedrockClient.invokeModel).toHaveBeenCalledTimes(1); // No additional call
      expect(response2.translatedText).toBe(response1.translatedText);
    });

    test('should validate translation request', async () => {
      const invalidRequest = new TranslationRequest({
        sourceText: '', // Empty text
        sourceLang: 'hi',
        targetLang: 'en'
      });

      const response = await translationService.translate(invalidRequest);

      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Invalid translation request');
    });
  });

  describe('Query Standardization', () => {
    test('should standardize Hindi price query', async () => {
      const query = 'टमाटर का भाव क्या है?';
      const language = 'hi';

      // Mock translation to English
      mockBedrockClient.invokeModel
        .mockResolvedValueOnce({
          content: 'What is the price of tomatoes?',
          duration: 1000
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            crop: 'tomato',
            quantity: null,
            unit: null,
            location: null,
            intent: 'price_inquiry',
            confidence: 0.9
          })
        });

      const result = await translationService.convertToStandardizedFormat(query, language);

      expect(result.originalQuery).toBe(query);
      expect(result.originalLanguage).toBe('hi');
      expect(result.englishQuery).toBe('What is the price of tomatoes?');
      expect(result.structured.crop).toBe('tomato');
      expect(result.structured.intent).toBe('price_inquiry');
    });

    test('should handle English queries directly', async () => {
      const query = 'What is the price of onions?';
      const language = 'en';

      mockBedrockClient.invokeModel.mockResolvedValue({
        content: JSON.stringify({
          crop: 'onion',
          quantity: null,
          unit: null,
          location: null,
          intent: 'price_inquiry',
          confidence: 0.9
        })
      });

      const result = await translationService.convertToStandardizedFormat(query, language);

      expect(result.originalQuery).toBe(query);
      expect(result.originalLanguage).toBe('en');
      expect(result.englishQuery).toBe(query);
      expect(result.structured.crop).toBe('onion');
    });

    test('should handle malformed AI responses gracefully', async () => {
      const query = 'टमाटर';
      const language = 'hi';

      mockBedrockClient.invokeModel
        .mockResolvedValueOnce({
          content: 'Tomato',
          duration: 1000
        })
        .mockResolvedValueOnce({
          content: 'Invalid JSON response'
        });

      const result = await translationService.convertToStandardizedFormat(query, language);

      expect(result.structured.crop).toBeNull();
      expect(result.structured.intent).toBe('general');
      expect(result.structured.confidence).toBe(0.3);
    });

    test('should validate input parameters', async () => {
      await expect(translationService.convertToStandardizedFormat('', 'hi'))
        .rejects.toThrow('Query is required for standardization');

      await expect(translationService.convertToStandardizedFormat('test', 'invalid'))
        .rejects.toThrow('Unsupported language code');
    });
  });

  describe('Agricultural Terms Preservation', () => {
    test('should identify preserved terms in translation', () => {
      const sourceText = 'मंडी में टमाटर और प्याज';
      const translatedText = 'Tomatoes and onions in the mandi';
      const sourceLang = 'hi';
      const targetLang = 'en';

      const preservedTerms = translationService.extractPreservedTerms(
        sourceText, translatedText, sourceLang, targetLang
      );

      expect(preservedTerms).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'टमाटर',
            english: 'tomato',
            category: 'agricultural'
          }),
          expect.objectContaining({
            source: 'प्याज',
            english: 'onion',
            category: 'agricultural'
          })
        ])
      );
    });

    test('should handle cross-language term preservation', () => {
      const sourceText = 'టమాటో ధర';
      const translatedText = 'தக்காளி விலை';
      const sourceLang = 'te';
      const targetLang = 'ta';

      const preservedTerms = translationService.extractPreservedTerms(
        sourceText, translatedText, sourceLang, targetLang
      );

      expect(preservedTerms).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'టమాటో',
            target: 'தக்காளி',
            english: 'tomato',
            category: 'agricultural'
          })
        ])
      );
    });
  });

  describe('Cache Management', () => {
    test('should generate consistent cache keys', () => {
      const request1 = new TranslationRequest({
        sourceText: 'test',
        sourceLang: 'hi',
        targetLang: 'en'
      });

      const request2 = new TranslationRequest({
        sourceText: 'test',
        sourceLang: 'hi',
        targetLang: 'en'
      });

      const key1 = translationService.generateCacheKey(request1);
      const key2 = translationService.generateCacheKey(request2);

      expect(key1).toBe(key2);
    });

    test('should clear cache', async () => {
      translationService.cache.set('test', { data: 'test' });
      expect(translationService.cache.size).toBe(1);

      await translationService.clearCache();
      expect(translationService.cache.size).toBe(0);
    });

    test('should respect cache TTL', () => {
      const service = new TranslationService({
        bedrockClient: mockBedrockClient,
        cacheTTL: 100 // 100ms TTL for testing
      });

      const cacheKey = 'test-key';
      const response = { test: 'data' };

      service.addToCache(cacheKey, response);
      expect(service.getFromCache(cacheKey)).toBe(response);

      // Wait for TTL to expire
      setTimeout(() => {
        expect(service.getFromCache(cacheKey)).toBeNull();
      }, 150);
    });
  });

  describe('Service Status and Testing', () => {
    test('should return service status', () => {
      const status = translationService.getStatus();

      expect(status).toHaveProperty('bedrockStatus');
      expect(status).toHaveProperty('cacheSize');
      expect(status).toHaveProperty('supportedLanguages');
      expect(status).toHaveProperty('agriculturalTermsCount');
      expect(status.agriculturalTermsCount).toBeGreaterThan(0);
    });

    test('should test service functionality', async () => {
      mockBedrockClient.invokeModel.mockResolvedValue({
        content: 'What is the price of tomatoes?',
        duration: 1000
      });

      const testResult = await translationService.testService();

      expect(testResult.success).toBe(true);
      expect(testResult.testTranslation).toBe('What is the price of tomatoes?');
      expect(testResult.processingTime).toBeGreaterThan(0);
    });

    test('should handle service test failures', async () => {
      mockBedrockClient.invokeModel.mockRejectedValue(new Error('Service unavailable'));

      const testResult = await translationService.testService();

      expect(testResult.success).toBe(false);
      expect(testResult.error).toBeDefined();
    });
  });

  describe('System Message and Prompt Building', () => {
    test('should build appropriate system message for price query context', () => {
      const systemMessage = translationService.buildSystemMessage('hi', 'en', 'price_query', true);

      expect(systemMessage).toContain('agricultural and marketplace terminology');
      expect(systemMessage).toContain('price query context');
      expect(systemMessage).toContain('Preserve the semantic meaning');
    });

    test('should build appropriate system message for negotiation context', () => {
      const systemMessage = translationService.buildSystemMessage('te', 'en', 'negotiation', true);

      expect(systemMessage).toContain('negotiation context');
      expect(systemMessage).toContain('Polite and respectful tone');
    });

    test('should build translation prompt correctly', () => {
      const prompt = translationService.buildTranslationPrompt('टमाटर', 'hi', 'en', 'general');

      expect(prompt).toContain('Translate the following Hindi text to English');
      expect(prompt).toContain('टमाटर');
      expect(prompt).toContain('Requirements:');
    });
  });

  describe('Text Extraction and Cleaning', () => {
    test('should extract clean translated text from AI response', () => {
      const testCases = [
        {
          input: 'Translation: What is the price?',
          expected: 'What is the price?'
        },
        {
          input: '"What is the price?"',
          expected: 'What is the price?'
        },
        {
          input: 'What is the price?\nSome additional text',
          expected: 'What is the price?'
        },
        {
          input: '  What is the price?  ',
          expected: 'What is the price?'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = translationService.extractTranslatedText(input);
        expect(result).toBe(expected);
      });
    });
  });
});