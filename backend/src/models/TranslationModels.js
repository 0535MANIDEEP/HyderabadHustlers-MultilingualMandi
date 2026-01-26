const Joi = require('joi');

/**
 * Translation Request and Response Models
 * Defines the data structures and validation schemas for translation operations
 */

/**
 * Supported languages configuration
 */
const SUPPORTED_LANGUAGES = {
  'hi': 'Hindi',
  'te': 'Telugu',
  'ta': 'Tamil',
  'en': 'English'
};

const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES);

/**
 * Translation Request Model
 */
class TranslationRequest {
  constructor(data) {
    this.id = data.id || this.generateId();
    this.sourceText = data.sourceText;
    this.sourceLang = data.sourceLang;
    this.targetLang = data.targetLang;
    this.context = data.context || 'general';
    this.preserveTerminology = data.preserveTerminology !== false; // Default to true
    this.timestamp = data.timestamp || new Date().toISOString();
    this.metadata = data.metadata || {};
  }

  generateId() {
    return `tr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate the translation request
   * @returns {Object} - Validation result
   */
  validate() {
    const schema = Joi.object({
      id: Joi.string().optional(),
      sourceText: Joi.string().required().min(1).max(5000).messages({
        'string.empty': 'Source text cannot be empty',
        'string.max': 'Source text cannot exceed 5000 characters',
        'any.required': 'Source text is required'
      }),
      sourceLang: Joi.string().valid(...LANGUAGE_CODES).required().messages({
        'any.only': `Source language must be one of: ${LANGUAGE_CODES.join(', ')}`,
        'any.required': 'Source language is required'
      }),
      targetLang: Joi.string().valid(...LANGUAGE_CODES).required().messages({
        'any.only': `Target language must be one of: ${LANGUAGE_CODES.join(', ')}`,
        'any.required': 'Target language is required'
      }),
      context: Joi.string().valid('general', 'price_query', 'negotiation', 'agricultural').default('general'),
      preserveTerminology: Joi.boolean().default(true),
      timestamp: Joi.string().isoDate().optional(),
      metadata: Joi.object().optional()
    });

    const { error, value } = schema.validate(this, { abortEarly: false });
    
    if (error) {
      return {
        isValid: false,
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context.value
        }))
      };
    }

    // Additional business logic validation
    if (value.sourceLang === value.targetLang) {
      return {
        isValid: false,
        errors: [{
          field: 'targetLang',
          message: 'Target language must be different from source language',
          value: value.targetLang
        }]
      };
    }

    return { isValid: true, value };
  }

  /**
   * Convert to plain object for API responses
   * @returns {Object} - Plain object representation
   */
  toJSON() {
    return {
      id: this.id,
      sourceText: this.sourceText,
      sourceLang: this.sourceLang,
      targetLang: this.targetLang,
      context: this.context,
      preserveTerminology: this.preserveTerminology,
      timestamp: this.timestamp,
      metadata: this.metadata
    };
  }
}

/**
 * Translation Response Model
 */
class TranslationResponse {
  constructor(data) {
    this.id = data.id;
    this.requestId = data.requestId;
    this.sourceText = data.sourceText;
    this.translatedText = data.translatedText;
    this.sourceLang = data.sourceLang;
    this.targetLang = data.targetLang;
    this.context = data.context;
    this.confidence = data.confidence || null;
    this.preservedTerms = data.preservedTerms || [];
    this.processingTime = data.processingTime;
    this.model = data.model;
    this.timestamp = data.timestamp || new Date().toISOString();
    this.metadata = data.metadata || {};
    this.success = data.success !== false; // Default to true
    this.error = data.error || null;
  }

  /**
   * Create a successful translation response
   * @param {TranslationRequest} request - Original request
   * @param {string} translatedText - Translated text
   * @param {Object} options - Additional options
   * @returns {TranslationResponse} - Success response
   */
  static success(request, translatedText, options = {}) {
    return new TranslationResponse({
      id: `resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      requestId: request.id,
      sourceText: request.sourceText,
      translatedText,
      sourceLang: request.sourceLang,
      targetLang: request.targetLang,
      context: request.context,
      confidence: options.confidence,
      preservedTerms: options.preservedTerms || [],
      processingTime: options.processingTime,
      model: options.model,
      metadata: {
        ...request.metadata,
        ...options.metadata
      },
      success: true
    });
  }

  /**
   * Create an error translation response
   * @param {TranslationRequest} request - Original request
   * @param {Error} error - Error that occurred
   * @param {Object} options - Additional options
   * @returns {TranslationResponse} - Error response
   */
  static error(request, error, options = {}) {
    return new TranslationResponse({
      id: `resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      requestId: request.id,
      sourceText: request.sourceText,
      translatedText: null,
      sourceLang: request.sourceLang,
      targetLang: request.targetLang,
      context: request.context,
      processingTime: options.processingTime,
      model: options.model,
      metadata: {
        ...request.metadata,
        ...options.metadata
      },
      success: false,
      error: {
        message: error.message,
        category: error.category || 'UNKNOWN_ERROR',
        retryable: error.retryable || false,
        code: error.code || error.name
      }
    });
  }

  /**
   * Convert to plain object for API responses
   * @returns {Object} - Plain object representation
   */
  toJSON() {
    const response = {
      id: this.id,
      requestId: this.requestId,
      sourceText: this.sourceText,
      sourceLang: this.sourceLang,
      targetLang: this.targetLang,
      context: this.context,
      success: this.success,
      timestamp: this.timestamp,
      metadata: this.metadata
    };

    if (this.success) {
      response.translatedText = this.translatedText;
      response.confidence = this.confidence;
      response.preservedTerms = this.preservedTerms;
      response.processingTime = this.processingTime;
      response.model = this.model;
    } else {
      response.error = this.error;
      if (this.processingTime) response.processingTime = this.processingTime;
      if (this.model) response.model = this.model;
    }

    return response;
  }

  /**
   * Get a user-friendly summary of the translation
   * @returns {string} - Summary text
   */
  getSummary() {
    if (!this.success) {
      return `Translation failed: ${this.error.message}`;
    }

    const sourceLangName = SUPPORTED_LANGUAGES[this.sourceLang];
    const targetLangName = SUPPORTED_LANGUAGES[this.targetLang];
    
    return `Translated from ${sourceLangName} to ${targetLangName} in ${this.processingTime}ms`;
  }
}

/**
 * Batch Translation Request Model
 */
class BatchTranslationRequest {
  constructor(data) {
    this.id = data.id || this.generateId();
    this.requests = data.requests || [];
    this.timestamp = data.timestamp || new Date().toISOString();
    this.metadata = data.metadata || {};
  }

  generateId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate the batch translation request
   * @returns {Object} - Validation result
   */
  validate() {
    const schema = Joi.object({
      id: Joi.string().optional(),
      requests: Joi.array().items(Joi.object()).min(1).max(10).required().messages({
        'array.min': 'At least one translation request is required',
        'array.max': 'Maximum 10 translation requests allowed per batch',
        'any.required': 'Translation requests array is required'
      }),
      timestamp: Joi.string().isoDate().optional(),
      metadata: Joi.object().optional()
    });

    const { error, value } = schema.validate(this, { abortEarly: false });
    
    if (error) {
      return {
        isValid: false,
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context.value
        }))
      };
    }

    // Validate individual requests
    const requestValidationErrors = [];
    value.requests.forEach((requestData, index) => {
      const request = new TranslationRequest(requestData);
      const validation = request.validate();
      if (!validation.isValid) {
        validation.errors.forEach(error => {
          requestValidationErrors.push({
            field: `requests[${index}].${error.field}`,
            message: error.message,
            value: error.value
          });
        });
      }
    });

    if (requestValidationErrors.length > 0) {
      return {
        isValid: false,
        errors: requestValidationErrors
      };
    }

    return { isValid: true, value };
  }

  /**
   * Convert to plain object for API responses
   * @returns {Object} - Plain object representation
   */
  toJSON() {
    return {
      id: this.id,
      requests: this.requests.map(req => req instanceof TranslationRequest ? req.toJSON() : req),
      timestamp: this.timestamp,
      metadata: this.metadata
    };
  }
}

/**
 * Utility functions for translation models
 */
const TranslationUtils = {
  /**
   * Get supported languages
   * @returns {Object} - Supported languages object
   */
  getSupportedLanguages() {
    return { ...SUPPORTED_LANGUAGES };
  },

  /**
   * Get language codes
   * @returns {Array} - Array of language codes
   */
  getLanguageCodes() {
    return [...LANGUAGE_CODES];
  },

  /**
   * Check if a language is supported
   * @param {string} langCode - Language code to check
   * @returns {boolean} - Whether the language is supported
   */
  isLanguageSupported(langCode) {
    return LANGUAGE_CODES.includes(langCode);
  },

  /**
   * Get language name from code
   * @param {string} langCode - Language code
   * @returns {string} - Language name or null if not found
   */
  getLanguageName(langCode) {
    return SUPPORTED_LANGUAGES[langCode] || null;
  },

  /**
   * Validate translation context
   * @param {string} context - Context to validate
   * @returns {boolean} - Whether the context is valid
   */
  isValidContext(context) {
    const validContexts = ['general', 'price_query', 'negotiation', 'agricultural'];
    return validContexts.includes(context);
  }
};

module.exports = {
  TranslationRequest,
  TranslationResponse,
  BatchTranslationRequest,
  TranslationUtils,
  SUPPORTED_LANGUAGES,
  LANGUAGE_CODES
};