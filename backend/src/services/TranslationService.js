const BedrockClient = require('./BedrockClient');
const CacheService = require('./CacheService');
const { TranslationRequest, TranslationResponse, TranslationUtils } = require('../models/TranslationModels');

/**
 * Translation Service with Multilingual Support
 * Provides language detection, validation, and agricultural terminology preservation
 * for Hindi, Telugu, Tamil, and English languages
 * Validates Requirements 1.1, 1.5, 8.1, 9.5 (with caching)
 */
class TranslationService {
  constructor(options = {}) {
    this.bedrockClient = options.bedrockClient || new BedrockClient();
    this.cacheService = options.cacheService || new CacheService();
    
    // Legacy in-memory cache as fallback
    this.cache = new Map();
    this.cacheMaxSize = options.cacheMaxSize || 1000;
    this.cacheTTL = options.cacheTTL || 3600000; // 1 hour in milliseconds
    
    // Agricultural terminology dictionary for preservation
    this.agriculturalTerms = {
      'hi': {
        'टमाटर': 'tomato',
        'प्याज': 'onion', 
        'मिर्च': 'chili',
        'आलू': 'potato',
        'गेहूं': 'wheat',
        'चावल': 'rice',
        'दाल': 'lentil',
        'मंडी': 'mandi',
        'किसान': 'farmer',
        'फसल': 'crop',
        'बाजार': 'market',
        'भाव': 'price',
        'क्विंटल': 'quintal',
        'किलो': 'kg'
      },
      'te': {
        'టమాటో': 'tomato',
        'ఉల్లిపాయ': 'onion',
        'మిర్చి': 'chili', 
        'బంగాళాదుంప': 'potato',
        'గోధుమ': 'wheat',
        'బియ్యం': 'rice',
        'పప్పు': 'lentil',
        'మండి': 'mandi',
        'రైతు': 'farmer',
        'పంట': 'crop',
        'మార్కెట్': 'market',
        'ధర': 'price',
        'క్వింటల్': 'quintal',
        'కిలో': 'kg'
      },
      'ta': {
        'தக்காளி': 'tomato',
        'வெங்காயம்': 'onion',
        'மிளகாய்': 'chili',
        'உருளைக்கிழங்கு': 'potato', 
        'கோதுமை': 'wheat',
        'அரிசி': 'rice',
        'பருப்பு': 'lentil',
        'மண்டி': 'mandi',
        'விவசாயி': 'farmer',
        'பயிர்': 'crop',
        'சந்தை': 'market',
        'விலை': 'price',
        'குவிண்டல்': 'quintal',
        'கிலோ': 'kg'
      },
      'en': {
        'tomato': 'tomato',
        'onion': 'onion',
        'chili': 'chili',
        'potato': 'potato',
        'wheat': 'wheat',
        'rice': 'rice',
        'lentil': 'lentil',
        'mandi': 'mandi',
        'farmer': 'farmer',
        'crop': 'crop',
        'market': 'market',
        'price': 'price',
        'quintal': 'quintal',
        'kg': 'kg'
      }
    };

    console.log('TranslationService initialized with agricultural terminology support');
  }

  /**
   * Detect language of input text
   * @param {string} text - Text to analyze
   * @returns {Promise<Object>} - Detection result with language and confidence
   */
  async detectLanguage(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Text is required for language detection');
    }

    // Simple heuristic-based detection for supported languages
    const detectionResult = this.heuristicLanguageDetection(text);
    
    // If confidence is low, use AI-powered detection
    if (detectionResult.confidence < 0.7) {
      return await this.aiLanguageDetection(text);
    }
    
    return detectionResult;
  }

  /**
   * Heuristic-based language detection using character patterns and keywords
   * @param {string} text - Text to analyze
   * @returns {Object} - Detection result
   */
  heuristicLanguageDetection(text) {
    const cleanText = text.toLowerCase().trim();
    
    // Character-based detection patterns
    const patterns = {
      'hi': /[\u0900-\u097F]/, // Devanagari script
      'te': /[\u0C00-\u0C7F]/, // Telugu script
      'ta': /[\u0B80-\u0BFF]/, // Tamil script
      'en': /^[a-zA-Z0-9\s.,!?'"()-]+$/ // English characters only
    };

    // Count matches for each language
    const scores = {};
    let totalChars = cleanText.length;
    
    for (const [lang, pattern] of Object.entries(patterns)) {
      if (lang === 'en') {
        // For English, check if text contains only English characters
        scores[lang] = pattern.test(cleanText) ? 0.8 : 0;
      } else {
        // For other languages, count script-specific characters
        const matches = cleanText.match(new RegExp(pattern.source, 'g'));
        scores[lang] = matches ? matches.length / totalChars : 0;
      }
    }

    // Check for agricultural terminology
    for (const [lang, terms] of Object.entries(this.agriculturalTerms)) {
      for (const term of Object.keys(terms)) {
        if (cleanText.includes(term.toLowerCase())) {
          scores[lang] = (scores[lang] || 0) + 0.3; // Boost score for agricultural terms
        }
      }
    }

    // Find the language with highest score
    const detectedLang = Object.keys(scores).reduce((a, b) => 
      scores[a] > scores[b] ? a : b
    );

    let confidence = Math.min(scores[detectedLang], 1.0);
    
    // Lower confidence for ambiguous cases like "price 100"
    if (cleanText.match(/^[a-z0-9\s]+$/i) && cleanText.split(' ').length <= 3) {
      confidence = Math.min(confidence, 0.6);
    }

    return {
      language: detectedLang,
      confidence: confidence,
      scores: scores,
      method: 'heuristic'
    };
  }

  /**
   * AI-powered language detection using Bedrock
   * @param {string} text - Text to analyze
   * @returns {Promise<Object>} - Detection result
   */
  async aiLanguageDetection(text) {
    const prompt = `Detect the language of the following text. The text may be in Hindi, Telugu, Tamil, or English. 
    Focus on agricultural and marketplace terminology if present.
    
    Text: "${text}"
    
    Respond with only the language code (hi, te, ta, or en) and confidence score (0.0-1.0) in this format:
    Language: [code]
    Confidence: [score]`;

    try {
      const response = await this.bedrockClient.invokeModel(prompt, {
        maxTokens: 100,
        temperature: 0.1
      });

      const content = response.content.toLowerCase();
      const langMatch = content.match(/language:\s*([a-z]{2})/);
      const confMatch = content.match(/confidence:\s*([0-9.]+)/);

      const language = langMatch ? langMatch[1] : 'en';
      const confidence = confMatch ? parseFloat(confMatch[1]) : 0.5;

      // Validate detected language is supported
      if (!TranslationUtils.isLanguageSupported(language)) {
        return {
          language: 'en',
          confidence: 0.3,
          method: 'ai_fallback'
        };
      }

      return {
        language: language,
        confidence: confidence,
        method: 'ai'
      };

    } catch (error) {
      console.warn('AI language detection failed, falling back to English:', error.message);
      return {
        language: 'en',
        confidence: 0.3,
        method: 'fallback'
      };
    }
  }

  /**
   * Validate language code
   * @param {string} langCode - Language code to validate
   * @returns {Object} - Validation result
   */
  validateLanguage(langCode) {
    if (!langCode || typeof langCode !== 'string') {
      return {
        isValid: false,
        error: 'Language code is required and must be a string'
      };
    }

    const normalizedCode = langCode.toLowerCase().trim();
    
    if (!TranslationUtils.isLanguageSupported(normalizedCode)) {
      return {
        isValid: false,
        error: `Unsupported language code: ${langCode}. Supported languages: ${TranslationUtils.getLanguageCodes().join(', ')}`
      };
    }

    return {
      isValid: true,
      normalizedCode: normalizedCode,
      languageName: TranslationUtils.getLanguageName(normalizedCode)
    };
  }

  /**
   * Translate text with agricultural terminology preservation
   * @param {TranslationRequest} request - Translation request
   * @returns {Promise<TranslationResponse>} - Translation response
   */
  async translate(request) {
    const startTime = Date.now();

    try {
      // Validate request
      const validation = request.validate();
      if (!validation.isValid) {
        throw new Error(`Invalid translation request: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      // Check Redis cache first
      const cachedTranslation = await this.cacheService.getCachedTranslation(
        request.sourceText,
        request.sourceLang,
        request.targetLang
      );
      
      if (cachedTranslation) {
        console.log('Translation served from Redis cache');
        return TranslationResponse.success(request, cachedTranslation.translatedText, {
          confidence: cachedTranslation.confidence || 0.9,
          preservedTerms: cachedTranslation.preservedTerms || [],
          processingTime: Date.now() - startTime,
          model: cachedTranslation.model || this.bedrockClient.modelId,
          fromCache: true
        });
      }

      // Check legacy cache as fallback
      const cacheKey = this.generateCacheKey(request);
      const legacyCached = this.getFromCache(cacheKey);
      if (legacyCached) {
        console.log('Translation served from legacy cache');
        return legacyCached;
      }

      console.log(`Cache miss for translation: ${request.sourceText.substring(0, 50)}...`);

      // Perform translation
      const translatedText = await this.performTranslation(request);
      
      // Extract preserved terms
      const preservedTerms = this.extractPreservedTerms(request.sourceText, translatedText, request.sourceLang, request.targetLang);

      // Create successful response
      const response = TranslationResponse.success(request, translatedText, {
        confidence: 0.9, // High confidence for AI translation
        preservedTerms: preservedTerms,
        processingTime: Date.now() - startTime,
        model: this.bedrockClient.modelId
      });

      // Cache in both Redis and legacy cache
      await this.cacheService.cacheTranslation(
        request.sourceText,
        request.sourceLang,
        request.targetLang,
        {
          translatedText,
          confidence: 0.9,
          preservedTerms,
          model: this.bedrockClient.modelId
        }
      );
      this.addToCache(cacheKey, response);

      return response;

    } catch (error) {
      console.error('Translation failed:', error);
      return TranslationResponse.error(request, error, {
        processingTime: Date.now() - startTime,
        model: this.bedrockClient.modelId
      });
    }
  }

  /**
   * Perform the actual translation using Bedrock
   * @param {TranslationRequest} request - Translation request
   * @returns {Promise<string>} - Translated text
   */
  async performTranslation(request) {
    const { sourceText, sourceLang, targetLang, context, preserveTerminology } = request;
    
    // Build system message for agricultural context
    const systemMessage = this.buildSystemMessage(sourceLang, targetLang, context, preserveTerminology);
    
    // Build translation prompt
    const prompt = this.buildTranslationPrompt(sourceText, sourceLang, targetLang, context);

    const response = await this.bedrockClient.invokeModel(prompt, {
      systemMessage: systemMessage,
      maxTokens: 2000,
      temperature: 0.3 // Lower temperature for more consistent translations
    });

    // Extract and clean the translated text
    return this.extractTranslatedText(response.content);
  }

  /**
   * Build system message for translation context
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language  
   * @param {string} context - Translation context
   * @param {boolean} preserveTerminology - Whether to preserve agricultural terms
   * @returns {string} - System message
   */
  buildSystemMessage(sourceLang, targetLang, context, preserveTerminology) {
    const sourceLangName = TranslationUtils.getLanguageName(sourceLang);
    const targetLangName = TranslationUtils.getLanguageName(targetLang);
    
    let systemMessage = `You are an expert translator specializing in Indian agricultural and marketplace terminology. 
    You translate text from ${sourceLangName} to ${targetLangName} with high accuracy and cultural sensitivity.`;

    if (preserveTerminology) {
      systemMessage += `\n\nIMPORTANT: Preserve the semantic meaning of agricultural terms such as crop names, market terminology, quantities, and prices. 
      Maintain consistency with standard agricultural vocabulary used in Indian markets.`;
    }

    if (context === 'price_query') {
      systemMessage += `\n\nThis is a price query context. Pay special attention to:
      - Crop names and varieties
      - Quantities and units (kg, quintal, ton)
      - Price-related terms
      - Market locations and names`;
    } else if (context === 'negotiation') {
      systemMessage += `\n\nThis is a negotiation context. Maintain:
      - Polite and respectful tone
      - Clear communication of offers and terms
      - Cultural appropriateness for business communication`;
    } else if (context === 'agricultural') {
      systemMessage += `\n\nThis is agricultural context. Focus on:
      - Technical agricultural terminology
      - Farming practices and methods
      - Seasonal and regional variations`;
    }

    return systemMessage;
  }

  /**
   * Build translation prompt
   * @param {string} sourceText - Text to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} context - Translation context
   * @returns {string} - Translation prompt
   */
  buildTranslationPrompt(sourceText, sourceLang, targetLang, context) {
    const sourceLangName = TranslationUtils.getLanguageName(sourceLang);
    const targetLangName = TranslationUtils.getLanguageName(targetLang);

    return `Translate the following ${sourceLangName} text to ${targetLangName}:

"${sourceText}"

Requirements:
1. Maintain the original meaning and intent
2. Use appropriate ${targetLangName} vocabulary for the context
3. Preserve agricultural and market terminology accuracy
4. Ensure cultural appropriateness
5. Return only the translated text without explanations

Translation:`;
  }

  /**
   * Extract translated text from AI response
   * @param {string} content - AI response content
   * @returns {string} - Cleaned translated text
   */
  extractTranslatedText(content) {
    // Remove common AI response prefixes and clean up
    let translatedText = content
      .replace(/^(Translation:|Translated text:|Result:)/i, '')
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .trim();

    // If the response contains multiple lines, take the first substantial line
    const lines = translatedText.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 0) {
      translatedText = lines[0].trim();
    }

    return translatedText;
  }

  /**
   * Extract preserved agricultural terms from translation
   * @param {string} sourceText - Original text
   * @param {string} translatedText - Translated text
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @returns {Array} - Array of preserved terms
   */
  extractPreservedTerms(sourceText, translatedText, sourceLang, targetLang) {
    const preservedTerms = [];
    const sourceTerms = this.agriculturalTerms[sourceLang] || {};
    const targetTerms = this.agriculturalTerms[targetLang] || {};

    // Check for agricultural terms in source text
    for (const [sourceTerm, englishTerm] of Object.entries(sourceTerms)) {
      if (sourceText.toLowerCase().includes(sourceTerm.toLowerCase())) {
        // Find corresponding term in target language
        const targetTerm = Object.keys(targetTerms).find(
          key => targetTerms[key] === englishTerm
        );

        if (targetTerm && translatedText.toLowerCase().includes(targetTerm.toLowerCase())) {
          preservedTerms.push({
            source: sourceTerm,
            target: targetTerm,
            english: englishTerm,
            category: 'agricultural'
          });
        }
      }
    }

    return preservedTerms;
  }

  /**
   * Convert query to standardized format
   * @param {string} query - Input query
   * @param {string} language - Query language
   * @returns {Promise<Object>} - Standardized query format
   */
  async convertToStandardizedFormat(query, language) {
    if (!query || typeof query !== 'string') {
      throw new Error('Query is required for standardization');
    }

    const langValidation = this.validateLanguage(language);
    if (!langValidation.isValid) {
      throw new Error(langValidation.error);
    }

    try {
      // First, translate to English if not already in English
      let englishQuery = query;
      if (langValidation.normalizedCode !== 'en') {
        const translationRequest = new TranslationRequest({
          sourceText: query,
          sourceLang: langValidation.normalizedCode,
          targetLang: 'en',
          context: 'price_query',
          preserveTerminology: true
        });

        const translationResponse = await this.translate(translationRequest);
        if (!translationResponse.success) {
          throw new Error(`Translation failed: ${translationResponse.error.message}`);
        }
        englishQuery = translationResponse.translatedText;
      }

      // Extract structured information from the query
      const structuredQuery = await this.extractQueryStructure(englishQuery);

      return {
        originalQuery: query,
        originalLanguage: langValidation.normalizedCode,
        englishQuery: englishQuery,
        structured: structuredQuery,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Query standardization failed:', error);
      throw new Error(`Failed to standardize query: ${error.message}`);
    }
  }

  /**
   * Extract structured information from English query
   * @param {string} englishQuery - Query in English
   * @returns {Promise<Object>} - Structured query information
   */
  async extractQueryStructure(englishQuery) {
    const prompt = `Extract structured information from this agricultural market query. 
    Identify crop name, quantity, unit, location, and intent (price inquiry, selling, buying).

Query: "${englishQuery}"

Respond in this JSON format:
{
  "crop": "crop name or null",
  "quantity": "number or null", 
  "unit": "kg/quintal/ton or null",
  "location": "market/city name or null",
  "intent": "price_inquiry/selling/buying/general",
  "confidence": 0.0-1.0
}`;

    try {
      const response = await this.bedrockClient.invokeModel(prompt, {
        maxTokens: 300,
        temperature: 0.1
      });

      // Try to parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const structured = JSON.parse(jsonMatch[0]);
        return structured;
      }

      // Fallback to basic structure
      return {
        crop: null,
        quantity: null,
        unit: null,
        location: null,
        intent: 'general',
        confidence: 0.3
      };

    } catch (error) {
      console.warn('Query structure extraction failed:', error.message);
      return {
        crop: null,
        quantity: null,
        unit: null,
        location: null,
        intent: 'general',
        confidence: 0.1
      };
    }
  }

  /**
   * Generate cache key for translation request
   * @param {TranslationRequest} request - Translation request
   * @returns {string} - Cache key
   */
  generateCacheKey(request) {
    const keyData = {
      sourceText: request.sourceText,
      sourceLang: request.sourceLang,
      targetLang: request.targetLang,
      context: request.context,
      preserveTerminology: request.preserveTerminology
    };
    
    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  /**
   * Get translation from cache
   * @param {string} cacheKey - Cache key
   * @returns {TranslationResponse|null} - Cached response or null
   */
  getFromCache(cacheKey) {
    const cached = this.cache.get(cacheKey);
    if (!cached) return null;

    // Check if cache entry has expired
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.response;
  }

  /**
   * Add translation to cache
   * @param {string} cacheKey - Cache key
   * @param {TranslationResponse} response - Translation response
   */
  addToCache(cacheKey, response) {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(cacheKey, {
      response: response,
      timestamp: Date.now()
    });
  }

  /**
   * Clear translation cache
   */
  clearCache() {
    this.cache.clear();
    console.log('Translation cache cleared');
  }

  /**
   * Get service status and statistics
   * @returns {Object} - Service status
   */
  getStatus() {
    return {
      bedrockStatus: this.bedrockClient.getStatus(),
      cacheSize: this.cache.size,
      cacheMaxSize: this.cacheMaxSize,
      cacheTTL: this.cacheTTL,
      supportedLanguages: TranslationUtils.getSupportedLanguages(),
      agriculturalTermsCount: Object.keys(this.agriculturalTerms).reduce(
        (total, lang) => total + Object.keys(this.agriculturalTerms[lang]).length, 0
      )
    };
  }

  /**
   * Test the translation service
   * @returns {Promise<Object>} - Test result
   */
  async testService() {
    try {
      // Test basic translation
      const testRequest = new TranslationRequest({
        sourceText: 'टमाटर का भाव क्या है?',
        sourceLang: 'hi',
        targetLang: 'en',
        context: 'price_query'
      });

      const result = await this.translate(testRequest);
      
      return {
        success: result.success,
        message: result.success ? 'Translation service test successful' : 'Translation service test failed',
        testTranslation: result.success ? result.translatedText : null,
        processingTime: result.processingTime,
        error: result.success ? null : result.error
      };

    } catch (error) {
      return {
        success: false,
        message: 'Translation service test failed',
        error: error.message
      };
    }
  }
  /**
   * Get translation cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      redis: this.cacheService.getStats(),
      legacy: {
        size: this.cache.size,
        maxSize: this.cacheMaxSize,
        keys: Array.from(this.cache.keys()).slice(0, 10) // Show first 10 keys
      }
    };
  }

  /**
   * Clear translation cache
   * @param {string} sourceLang - Source language (optional)
   * @param {string} targetLang - Target language (optional)
   * @returns {Promise<boolean>} Success status
   */
  async clearCache(sourceLang = null, targetLang = null) {
    try {
      if (sourceLang && targetLang) {
        // Clear specific language pair
        await this.cacheService.invalidateTranslations(sourceLang, targetLang);
      } else {
        // Clear all translations
        await this.cacheService.invalidatePattern('trans:*');
      }
      
      // Clear legacy cache
      this.cache.clear();
      
      console.log('Translation cache cleared');
      return true;
    } catch (error) {
      console.error('Error clearing translation cache:', error);
      return false;
    }
  }

  /**
   * Warm up translation cache with common phrases
   * @param {Array<Object>} phrases - Array of {text, sourceLang, targetLang} objects
   * @returns {Promise<Object>} Warm-up results
   */
  async warmUpCache(phrases = []) {
    const defaultPhrases = [
      { text: 'Hello farmer', sourceLang: 'en', targetLang: 'hi' },
      { text: 'What is the price?', sourceLang: 'en', targetLang: 'hi' },
      { text: 'Good quality tomatoes', sourceLang: 'en', targetLang: 'te' },
      { text: 'Market price today', sourceLang: 'en', targetLang: 'ta' },
      { text: 'नमस्ते किसान', sourceLang: 'hi', targetLang: 'en' },
      { text: 'भाव क्या है?', sourceLang: 'hi', targetLang: 'en' }
    ];

    const phrasesToCache = phrases.length > 0 ? phrases : defaultPhrases;
    const results = {
      success: 0,
      failed: 0,
      phrases: {}
    };

    for (const phrase of phrasesToCache) {
      try {
        const request = new TranslationRequest(
          phrase.text,
          phrase.sourceLang,
          phrase.targetLang,
          'agricultural'
        );
        
        const result = await this.translate(request);
        if (result.success) {
          results.success++;
          results.phrases[phrase.text] = 'cached';
        } else {
          results.failed++;
          results.phrases[phrase.text] = 'failed';
        }
      } catch (error) {
        console.error(`Failed to cache phrase "${phrase.text}":`, error);
        results.failed++;
        results.phrases[phrase.text] = 'error';
      }
    }

    console.log(`Translation cache warm-up completed: ${results.success} success, ${results.failed} failed`);
    return results;
  }

  /**
   * Simple translateText method for backward compatibility
   * @param {string} text - Text to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @returns {Promise<Object>} Translation result
   */
  async translateText(text, sourceLang, targetLang) {
    try {
      const request = new TranslationRequest(text, sourceLang, targetLang, 'agricultural');
      const response = await this.translate(request);
      
      return {
        success: response.success,
        translatedText: response.translatedText,
        confidence: response.confidence,
        preservedTerms: response.preservedTerms,
        error: response.error
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        translatedText: text // Return original text as fallback
      };
    }
  }
}

module.exports = TranslationService;