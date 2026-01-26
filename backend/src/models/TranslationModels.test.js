const {
  TranslationRequest,
  TranslationResponse,
  BatchTranslationRequest,
  TranslationUtils,
  SUPPORTED_LANGUAGES,
  LANGUAGE_CODES
} = require('./TranslationModels');

describe('TranslationModels', () => {
  describe('TranslationRequest', () => {
    const validRequestData = {
      sourceText: 'Hello, how are you?',
      sourceLang: 'en',
      targetLang: 'hi',
      context: 'general'
    };

    it('should create a valid translation request', () => {
      const request = new TranslationRequest(validRequestData);
      
      expect(request.sourceText).toBe(validRequestData.sourceText);
      expect(request.sourceLang).toBe(validRequestData.sourceLang);
      expect(request.targetLang).toBe(validRequestData.targetLang);
      expect(request.context).toBe(validRequestData.context);
      expect(request.preserveTerminology).toBe(true);
      expect(request.id).toMatch(/^tr_\d+_[a-z0-9]+$/);
      expect(request.timestamp).toBeDefined();
    });

    it('should generate unique IDs', () => {
      const request1 = new TranslationRequest(validRequestData);
      const request2 = new TranslationRequest(validRequestData);
      
      expect(request1.id).not.toBe(request2.id);
    });

    it('should validate successfully with valid data', () => {
      const request = new TranslationRequest(validRequestData);
      const validation = request.validate();
      
      expect(validation.isValid).toBe(true);
      expect(validation.value).toBeDefined();
    });

    it('should fail validation with missing required fields', () => {
      const request = new TranslationRequest({});
      const validation = request.validate();
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(3); // sourceText, sourceLang, targetLang
      
      const errorFields = validation.errors.map(e => e.field);
      expect(errorFields).toContain('sourceText');
      expect(errorFields).toContain('sourceLang');
      expect(errorFields).toContain('targetLang');
    });

    it('should fail validation with invalid language codes', () => {
      const request = new TranslationRequest({
        ...validRequestData,
        sourceLang: 'invalid',
        targetLang: 'also-invalid'
      });
      const validation = request.validate();
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(2);
      expect(validation.errors[0].field).toBe('sourceLang');
      expect(validation.errors[1].field).toBe('targetLang');
    });

    it('should fail validation when source and target languages are the same', () => {
      const request = new TranslationRequest({
        ...validRequestData,
        sourceLang: 'en',
        targetLang: 'en'
      });
      const validation = request.validate();
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors[0].message).toContain('different from source language');
    });

    it('should fail validation with text too long', () => {
      const request = new TranslationRequest({
        ...validRequestData,
        sourceText: 'a'.repeat(5001)
      });
      const validation = request.validate();
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors[0].field).toBe('sourceText');
      expect(validation.errors[0].message).toContain('cannot exceed 5000 characters');
    });

    it('should fail validation with empty text', () => {
      const request = new TranslationRequest({
        ...validRequestData,
        sourceText: ''
      });
      const validation = request.validate();
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors[0].field).toBe('sourceText');
      expect(validation.errors[0].message).toContain('cannot be empty');
    });

    it('should convert to JSON correctly', () => {
      const request = new TranslationRequest(validRequestData);
      const json = request.toJSON();
      
      expect(json).toEqual({
        id: request.id,
        sourceText: validRequestData.sourceText,
        sourceLang: validRequestData.sourceLang,
        targetLang: validRequestData.targetLang,
        context: validRequestData.context,
        preserveTerminology: true,
        timestamp: request.timestamp,
        metadata: {}
      });
    });
  });

  describe('TranslationResponse', () => {
    const mockRequest = new TranslationRequest({
      sourceText: 'Hello',
      sourceLang: 'en',
      targetLang: 'hi'
    });

    it('should create a successful response', () => {
      const response = TranslationResponse.success(mockRequest, 'नमस्ते', {
        confidence: 0.95,
        processingTime: 1500,
        model: 'claude-3-sonnet'
      });
      
      expect(response.success).toBe(true);
      expect(response.translatedText).toBe('नमस्ते');
      expect(response.confidence).toBe(0.95);
      expect(response.processingTime).toBe(1500);
      expect(response.model).toBe('claude-3-sonnet');
      expect(response.requestId).toBe(mockRequest.id);
      expect(response.error).toBeNull();
    });

    it('should create an error response', () => {
      const error = new Error('Translation failed');
      error.category = 'RATE_LIMITED';
      error.retryable = true;
      
      const response = TranslationResponse.error(mockRequest, error, {
        processingTime: 500,
        model: 'claude-3-sonnet'
      });
      
      expect(response.success).toBe(false);
      expect(response.translatedText).toBeNull();
      expect(response.error).toEqual({
        message: 'Translation failed',
        category: 'RATE_LIMITED',
        retryable: true,
        code: 'Error'
      });
      expect(response.processingTime).toBe(500);
    });

    it('should convert successful response to JSON correctly', () => {
      const response = TranslationResponse.success(mockRequest, 'नमस्ते', {
        confidence: 0.95,
        processingTime: 1500,
        model: 'claude-3-sonnet'
      });
      
      const json = response.toJSON();
      
      expect(json.success).toBe(true);
      expect(json.translatedText).toBe('नमस्ते');
      expect(json.confidence).toBe(0.95);
      expect(json.processingTime).toBe(1500);
      expect(json.model).toBe('claude-3-sonnet');
      expect(json.error).toBeUndefined();
    });

    it('should convert error response to JSON correctly', () => {
      const error = new Error('Translation failed');
      const response = TranslationResponse.error(mockRequest, error);
      
      const json = response.toJSON();
      
      expect(json.success).toBe(false);
      expect(json.translatedText).toBeUndefined();
      expect(json.error).toBeDefined();
      expect(json.error.message).toBe('Translation failed');
    });

    it('should generate appropriate summary for successful translation', () => {
      const response = TranslationResponse.success(mockRequest, 'नमस्ते', {
        processingTime: 1500
      });
      
      const summary = response.getSummary();
      expect(summary).toBe('Translated from English to Hindi in 1500ms');
    });

    it('should generate appropriate summary for failed translation', () => {
      const error = new Error('Translation failed');
      const response = TranslationResponse.error(mockRequest, error);
      
      const summary = response.getSummary();
      expect(summary).toBe('Translation failed: Translation failed');
    });
  });

  describe('BatchTranslationRequest', () => {
    const validBatchData = {
      requests: [
        {
          sourceText: 'Hello',
          sourceLang: 'en',
          targetLang: 'hi'
        },
        {
          sourceText: 'Goodbye',
          sourceLang: 'en',
          targetLang: 'te'
        }
      ]
    };

    it('should create a valid batch translation request', () => {
      const batch = new BatchTranslationRequest(validBatchData);
      
      expect(batch.requests).toHaveLength(2);
      expect(batch.id).toMatch(/^batch_\d+_[a-z0-9]+$/);
      expect(batch.timestamp).toBeDefined();
    });

    it('should validate successfully with valid data', () => {
      const batch = new BatchTranslationRequest(validBatchData);
      const validation = batch.validate();
      
      expect(validation.isValid).toBe(true);
    });

    it('should fail validation with empty requests array', () => {
      const batch = new BatchTranslationRequest({ requests: [] });
      const validation = batch.validate();
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors[0].message).toContain('At least one translation request is required');
    });

    it('should fail validation with too many requests', () => {
      const requests = Array(11).fill({
        sourceText: 'Hello',
        sourceLang: 'en',
        targetLang: 'hi'
      });
      
      const batch = new BatchTranslationRequest({ requests });
      const validation = batch.validate();
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors[0].message).toContain('Maximum 10 translation requests allowed');
    });

    it('should fail validation with invalid individual requests', () => {
      const batch = new BatchTranslationRequest({
        requests: [
          {
            sourceText: 'Hello',
            sourceLang: 'en',
            targetLang: 'hi'
          },
          {
            sourceText: '', // Invalid: empty text
            sourceLang: 'invalid', // Invalid: unsupported language
            targetLang: 'hi'
          }
        ]
      });
      
      const validation = batch.validate();
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(2);
      expect(validation.errors[0].field).toBe('requests[1].sourceText');
      expect(validation.errors[1].field).toBe('requests[1].sourceLang');
    });

    it('should convert to JSON correctly', () => {
      const batch = new BatchTranslationRequest(validBatchData);
      const json = batch.toJSON();
      
      expect(json.id).toBe(batch.id);
      expect(json.requests).toHaveLength(2);
      expect(json.timestamp).toBe(batch.timestamp);
      expect(json.metadata).toEqual({});
    });
  });

  describe('TranslationUtils', () => {
    it('should return supported languages', () => {
      const languages = TranslationUtils.getSupportedLanguages();
      
      expect(languages).toEqual(SUPPORTED_LANGUAGES);
      expect(languages.en).toBe('English');
      expect(languages.hi).toBe('Hindi');
      expect(languages.te).toBe('Telugu');
      expect(languages.ta).toBe('Tamil');
    });

    it('should return language codes', () => {
      const codes = TranslationUtils.getLanguageCodes();
      
      expect(codes).toEqual(LANGUAGE_CODES);
      expect(codes).toContain('en');
      expect(codes).toContain('hi');
      expect(codes).toContain('te');
      expect(codes).toContain('ta');
    });

    it('should check if language is supported', () => {
      expect(TranslationUtils.isLanguageSupported('en')).toBe(true);
      expect(TranslationUtils.isLanguageSupported('hi')).toBe(true);
      expect(TranslationUtils.isLanguageSupported('fr')).toBe(false);
      expect(TranslationUtils.isLanguageSupported('invalid')).toBe(false);
    });

    it('should get language name from code', () => {
      expect(TranslationUtils.getLanguageName('en')).toBe('English');
      expect(TranslationUtils.getLanguageName('hi')).toBe('Hindi');
      expect(TranslationUtils.getLanguageName('invalid')).toBeNull();
    });

    it('should validate translation context', () => {
      expect(TranslationUtils.isValidContext('general')).toBe(true);
      expect(TranslationUtils.isValidContext('price_query')).toBe(true);
      expect(TranslationUtils.isValidContext('negotiation')).toBe(true);
      expect(TranslationUtils.isValidContext('agricultural')).toBe(true);
      expect(TranslationUtils.isValidContext('invalid')).toBe(false);
    });
  });

  describe('Constants', () => {
    it('should have correct supported languages', () => {
      expect(SUPPORTED_LANGUAGES).toEqual({
        'hi': 'Hindi',
        'te': 'Telugu',
        'ta': 'Tamil',
        'en': 'English'
      });
    });

    it('should have correct language codes', () => {
      expect(LANGUAGE_CODES).toEqual(['hi', 'te', 'ta', 'en']);
    });
  });
});