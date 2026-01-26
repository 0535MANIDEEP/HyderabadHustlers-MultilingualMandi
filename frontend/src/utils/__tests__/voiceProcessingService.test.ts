/**
 * @jest-environment jsdom
 */

import VoiceProcessingService from '../voiceProcessingService';

// Mock fetch globally
global.fetch = jest.fn();

describe('VoiceProcessingService', () => {
  let service: VoiceProcessingService;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    service = new VoiceProcessingService('/api/v1');
    mockFetch.mockClear();
  });

  describe('processVoiceInput', () => {
    it('should process a simple English query', async () => {
      // Mock successful language detection
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ language: 'en', confidence: 0.9 })
      } as Response);

      // Mock successful intent analysis
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          isQuery: true,
          queryType: 'price_query',
          confidence: 0.8
        })
      } as Response);

      const result = await service.processVoiceInput('What is the price of tomatoes?', {
        language: 'en',
        autoProcess: true
      });

      expect(result.originalText).toBe('What is the price of tomatoes?');
      expect(result.processedText).toBe('What is the price of tomatoes?');
      expect(result.language).toBe('en');
      expect(result.isQuery).toBe(true);
      expect(result.queryType).toBe('price_query');
      expect(result.shouldAutoSend).toBe(true);
      expect(result.metadata.translationUsed).toBe(false);
    });

    it('should handle Hindi input with translation', async () => {
      // Mock successful language detection
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ language: 'hi', confidence: 0.9 })
      } as Response);

      // Mock successful translation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          translatedText: 'What is the price of tomatoes?'
        })
      } as Response);

      // Mock successful intent analysis
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          isQuery: true,
          queryType: 'price_query',
          confidence: 0.8
        })
      } as Response);

      const result = await service.processVoiceInput('टमाटर का भाव क्या है?', {
        language: 'hi',
        autoProcess: true
      });

      expect(result.originalText).toBe('टमाटर का भाव क्या है?');
      expect(result.processedText).toBe('What is the price of tomatoes?');
      expect(result.language).toBe('hi');
      expect(result.isQuery).toBe(true);
      expect(result.queryType).toBe('price_query');
      expect(result.metadata.translationUsed).toBe(true);
    });

    it('should handle low confidence input', async () => {
      const result = await service.processVoiceInput('um... uh...', {
        language: 'en',
        confidenceThreshold: 0.8
      });

      expect(result.confidence).toBeLessThan(0.8);
      expect(result.shouldAutoSend).toBe(false);
      expect(result.metadata.errors).toBeDefined();
    });

    it('should handle empty input', async () => {
      const result = await service.processVoiceInput('', {
        language: 'en'
      });

      expect(result.confidence).toBe(0.3);
      expect(result.shouldAutoSend).toBe(false);
      expect(result.metadata.errors).toContain('Voice input validation failed: Empty transcript');
    });

    it('should handle network errors gracefully', async () => {
      // Mock network error
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await service.processVoiceInput('um... what?', {
        language: 'en',
        confidenceThreshold: 0.8  // Higher threshold to trigger validation failure
      });

      expect(result.originalText).toBe('um... what?');
      expect(result.processedText).toBe('um... what?');
      expect(result.confidence).toBe(0.3);
      expect(result.metadata.errors).toBeDefined();
    });
  });

  describe('validation', () => {
    it('should validate good quality input', () => {
      const service = new VoiceProcessingService();
      // Access private method for testing
      const validation = (service as any).validateVoiceInput('What is the price of tomatoes today?', {
        language: 'en',
        confidenceThreshold: 0.5
      });

      expect(validation).resolves.toMatchObject({
        isValid: true,
        confidence: expect.any(Number)
      });
    });

    it('should detect speech recognition errors', () => {
      const service = new VoiceProcessingService();
      const hasErrors = (service as any).hasCommonSpeechErrors('um uh what is the er price');
      expect(hasErrors).toBe(true);
    });

    it('should validate language-specific content', () => {
      const service = new VoiceProcessingService();
      
      const hindiValidation = (service as any).validateLanguageSpecific('टमाटर का भाव', 'hi');
      expect(hindiValidation.isValid).toBe(true);
      
      const englishValidation = (service as any).validateLanguageSpecific('What is the price', 'en');
      expect(englishValidation.isValid).toBe(true);
    });
  });

  describe('local analysis', () => {
    it('should identify price queries locally', () => {
      const service = new VoiceProcessingService();
      const analysis = (service as any).analyzeQueryLocally('What is the price of tomatoes?');
      
      expect(analysis.isQuery).toBe(true);
      expect(analysis.queryType).toBe('price_query');
      expect(analysis.confidence).toBeGreaterThan(0.7);
    });

    it('should identify negotiation queries locally', () => {
      const service = new VoiceProcessingService();
      const analysis = (service as any).analyzeQueryLocally('I want to buy tomatoes');
      
      expect(analysis.isQuery).toBe(true);
      expect(analysis.queryType).toBe('negotiation');
      expect(analysis.confidence).toBeGreaterThan(0.7);
    });

    it('should identify general questions locally', () => {
      const service = new VoiceProcessingService();
      const analysis = (service as any).analyzeQueryLocally('How are you today?');
      
      expect(analysis.isQuery).toBe(true);
      expect(analysis.queryType).toBe('general');
      expect(analysis.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('auto-send logic', () => {
    it('should auto-send high confidence queries', () => {
      const service = new VoiceProcessingService();
      const shouldSend = (service as any).shouldAutoSendMessage(
        'What is the price of tomatoes?',
        'What is the price of tomatoes?',
        { isQuery: true, queryType: 'price_query', confidence: 0.9 },
        0.8,
        { autoProcess: true }
      );
      
      expect(shouldSend).toBe(true);
    });

    it('should not auto-send low confidence input', () => {
      const service = new VoiceProcessingService();
      const shouldSend = (service as any).shouldAutoSendMessage(
        'um... what?',
        'um... what?',
        { isQuery: false, confidence: 0.3 },
        0.4,
        { autoProcess: true }
      );
      
      expect(shouldSend).toBe(false);
    });

    it('should not auto-send when disabled', () => {
      const service = new VoiceProcessingService();
      const shouldSend = (service as any).shouldAutoSendMessage(
        'What is the price of tomatoes?',
        'What is the price of tomatoes?',
        { isQuery: true, queryType: 'price_query', confidence: 0.9 },
        0.8,
        { autoProcess: false }
      );
      
      expect(shouldSend).toBe(false);
    });
  });

  describe('utility methods', () => {
    it('should detect if translation is required', () => {
      const service = new VoiceProcessingService();
      
      expect((service as any).requiresTranslation('Hello world')).toBe(false);
      expect((service as any).requiresTranslation('टमाटर का भाव')).toBe(true);
      expect((service as any).requiresTranslation('టమాటో ధర')).toBe(true);
    });

    it('should detect complete sentences', () => {
      const service = new VoiceProcessingService();
      
      expect((service as any).seemsComplete('What is the price of tomatoes?')).toBe(true);
      expect((service as any).seemsComplete('Hello and goodbye.')).toBe(true);
      expect((service as any).seemsComplete('um')).toBe(false);
    });

    it('should detect likely queries', () => {
      const service = new VoiceProcessingService();
      
      expect((service as any).isLikelyQuery('What is the price?')).toBe(true);
      expect((service as any).isLikelyQuery('How much does it cost?')).toBe(true);
      expect((service as any).isLikelyQuery('Hello there')).toBe(false);
    });
  });
});