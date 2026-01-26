const express = require('express');
const TranslationService = require('../services/TranslationService');
const { TranslationRequest, TranslationUtils } = require('../models/TranslationModels');

const router = express.Router();

// Create translation service instance (will be mocked in tests)
let translationService;
const getTranslationService = () => {
  if (!translationService) {
    translationService = new TranslationService();
  }
  return translationService;
};

// POST /api/v1/translate
router.post('/', async (req, res) => {
  try {
    const { sourceText, sourceLang, targetLang, context, preserveTerminology } = req.body;

    // Create translation request
    const translationRequest = new TranslationRequest({
      sourceText,
      sourceLang,
      targetLang,
      context: context || 'general',
      preserveTerminology: preserveTerminology !== false // Default to true
    });

    // Perform translation
    const response = await getTranslationService().translate(translationRequest);
    
    if (response.success) {
      res.json(response.toJSON());
    } else {
      res.status(400).json(response.toJSON());
    }

  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ 
      error: 'Translation service error',
      message: error.message 
    });
  }
});

// GET /api/v1/translate/languages
router.get('/languages', (req, res) => {
  res.json({
    supported: TranslationUtils.getLanguageCodes(),
    languages: TranslationUtils.getSupportedLanguages()
  });
});

// POST /api/v1/translate/detect-language
router.post('/detect-language', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({
        error: 'Text is required for language detection'
      });
    }

    const detection = await getTranslationService().detectLanguage(text);
    res.json(detection);

  } catch (error) {
    console.error('Language detection error:', error);
    res.status(500).json({
      error: 'Language detection failed',
      message: error.message
    });
  }
});

// POST /api/v1/translate/detect (legacy endpoint)
router.post('/detect', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({
        error: 'Text is required for language detection'
      });
    }

    const detection = await getTranslationService().detectLanguage(text);
    res.json(detection);

  } catch (error) {
    console.error('Language detection error:', error);
    res.status(500).json({
      error: 'Language detection failed',
      message: error.message
    });
  }
});

// POST /api/v1/translate/standardize
router.post('/standardize', async (req, res) => {
  try {
    const { query, language } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Query is required for standardization'
      });
    }

    if (!language) {
      return res.status(400).json({
        error: 'Language is required for standardization'
      });
    }

    const standardized = await getTranslationService().convertToStandardizedFormat(query, language);
    res.json(standardized);

  } catch (error) {
    console.error('Query standardization error:', error);
    res.status(500).json({
      error: 'Query standardization failed',
      message: error.message
    });
  }
});

// GET /api/v1/translate/status
router.get('/status', (req, res) => {
  try {
    const status = getTranslationService().getStatus();
    res.json(status);
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      error: 'Status check failed',
      message: error.message
    });
  }
});

// POST /api/v1/translate/test
router.post('/test', async (req, res) => {
  try {
    const testResult = await getTranslationService().testService();
    
    if (testResult.success) {
      res.json(testResult);
    } else {
      res.status(500).json(testResult);
    }

  } catch (error) {
    console.error('Service test error:', error);
    res.status(500).json({
      success: false,
      message: 'Service test failed',
      error: error.message
    });
  }
});

module.exports = router;

// Export for testing
module.exports.setTranslationService = (service) => {
  translationService = service;
};