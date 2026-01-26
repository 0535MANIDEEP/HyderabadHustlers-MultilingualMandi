const request = require('supertest');
const express = require('express');
const translateRouter = require('./translate');

describe('Translation Routes', () => {
  let app;
  let mockTranslationService;

  beforeEach(() => {
    // Create mock translation service
    mockTranslationService = {
      translate: jest.fn(),
      detectLanguage: jest.fn(),
      convertToStandardizedFormat: jest.fn(),
      getStatus: jest.fn(),
      testService: jest.fn()
    };

    // Inject mock service
    translateRouter.setTranslationService(mockTranslationService);

    // Create Express app with the router
    app = express();
    app.use(express.json());
    app.use('/api/v1/translate', translateRouter);
  });

  describe('POST /api/v1/translate', () => {
    test('should translate text successfully', async () => {
      const mockResponse = {
        success: true,
        translatedText: 'What is the price of tomatoes?',
        sourceLang: 'hi',
        targetLang: 'en',
        processingTime: 1500,
        toJSON: () => ({
          success: true,
          translatedText: 'What is the price of tomatoes?',
          sourceLang: 'hi',
          targetLang: 'en',
          processingTime: 1500
        })
      };

      mockTranslationService.translate.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/v1/translate')
        .send({
          sourceText: 'टमाटर का भाव क्या है?',
          sourceLang: 'hi',
          targetLang: 'en',
          context: 'price_query'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.translatedText).toBe('What is the price of tomatoes?');
      expect(mockTranslationService.translate).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceText: 'टमाटर का भाव क्या है?',
          sourceLang: 'hi',
          targetLang: 'en',
          context: 'price_query'
        })
      );
    });

    test('should handle translation errors', async () => {
      const mockResponse = {
        success: false,
        error: {
          message: 'Translation failed',
          category: 'VALIDATION_ERROR'
        },
        toJSON: () => ({
          success: false,
          error: {
            message: 'Translation failed',
            category: 'VALIDATION_ERROR'
          }
        })
      };

      mockTranslationService.translate.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/v1/translate')
        .send({
          sourceText: '',
          sourceLang: 'hi',
          targetLang: 'en'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    test('should handle service exceptions', async () => {
      mockTranslationService.translate.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .post('/api/v1/translate')
        .send({
          sourceText: 'test',
          sourceLang: 'hi',
          targetLang: 'en'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Translation service error');
      expect(response.body.message).toBe('Service unavailable');
    });
  });

  describe('GET /api/v1/translate/languages', () => {
    test('should return supported languages', async () => {
      const response = await request(app)
        .get('/api/v1/translate/languages');

      expect(response.status).toBe(200);
      expect(response.body.supported).toEqual(['hi', 'te', 'ta', 'en']);
      expect(response.body.languages).toEqual({
        'hi': 'Hindi',
        'te': 'Telugu',
        'ta': 'Tamil',
        'en': 'English'
      });
    });
  });

  describe('POST /api/v1/translate/detect', () => {
    test('should detect language successfully', async () => {
      const mockDetection = {
        language: 'hi',
        confidence: 0.9,
        method: 'heuristic'
      };

      mockTranslationService.detectLanguage.mockResolvedValue(mockDetection);

      const response = await request(app)
        .post('/api/v1/translate/detect')
        .send({ text: 'टमाटर का भाव' });

      expect(response.status).toBe(200);
      expect(response.body.language).toBe('hi');
      expect(response.body.confidence).toBe(0.9);
      expect(mockTranslationService.detectLanguage).toHaveBeenCalledWith('टमाटर का भाव');
    });

    test('should require text parameter', async () => {
      const response = await request(app)
        .post('/api/v1/translate/detect')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Text is required for language detection');
    });

    test('should handle detection errors', async () => {
      mockTranslationService.detectLanguage.mockRejectedValue(new Error('Detection failed'));

      const response = await request(app)
        .post('/api/v1/translate/detect')
        .send({ text: 'test' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Language detection failed');
    });
  });

  describe('POST /api/v1/translate/standardize', () => {
    test('should standardize query successfully', async () => {
      const mockStandardized = {
        originalQuery: 'टमाटर का भाव',
        originalLanguage: 'hi',
        englishQuery: 'What is the price of tomatoes',
        structured: {
          crop: 'tomato',
          intent: 'price_inquiry'
        }
      };

      mockTranslationService.convertToStandardizedFormat.mockResolvedValue(mockStandardized);

      const response = await request(app)
        .post('/api/v1/translate/standardize')
        .send({
          query: 'टमाटर का भाव',
          language: 'hi'
        });

      expect(response.status).toBe(200);
      expect(response.body.originalQuery).toBe('टमाटर का भाव');
      expect(response.body.structured.crop).toBe('tomato');
      expect(mockTranslationService.convertToStandardizedFormat).toHaveBeenCalledWith('टमाटर का भाव', 'hi');
    });

    test('should require query parameter', async () => {
      const response = await request(app)
        .post('/api/v1/translate/standardize')
        .send({ language: 'hi' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Query is required for standardization');
    });

    test('should require language parameter', async () => {
      const response = await request(app)
        .post('/api/v1/translate/standardize')
        .send({ query: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Language is required for standardization');
    });
  });

  describe('GET /api/v1/translate/status', () => {
    test('should return service status', async () => {
      const mockStatus = {
        bedrockStatus: { status: 'ready' },
        cacheSize: 0,
        supportedLanguages: { hi: 'Hindi', en: 'English' }
      };

      mockTranslationService.getStatus.mockReturnValue(mockStatus);

      const response = await request(app)
        .get('/api/v1/translate/status');

      expect(response.status).toBe(200);
      expect(response.body.bedrockStatus).toBeDefined();
      expect(response.body.supportedLanguages).toBeDefined();
    });

    test('should handle status check errors', async () => {
      mockTranslationService.getStatus.mockImplementation(() => {
        throw new Error('Status check failed');
      });

      const response = await request(app)
        .get('/api/v1/translate/status');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Status check failed');
    });
  });

  describe('POST /api/v1/translate/test', () => {
    test('should run service test successfully', async () => {
      const mockTestResult = {
        success: true,
        message: 'Translation service test successful',
        testTranslation: 'What is the price of tomatoes?'
      };

      mockTranslationService.testService.mockResolvedValue(mockTestResult);

      const response = await request(app)
        .post('/api/v1/translate/test');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.testTranslation).toBeDefined();
    });

    test('should handle test failures', async () => {
      const mockTestResult = {
        success: false,
        message: 'Translation service test failed',
        error: 'Service unavailable'
      };

      mockTranslationService.testService.mockResolvedValue(mockTestResult);

      const response = await request(app)
        .post('/api/v1/translate/test');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });
});