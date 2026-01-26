/**
 * Centralized Error Handling Service for Multilingual Mandi
 * Provides multilingual error messages and standardized error responses
 */

class ErrorHandlingService {
  constructor() {
    this.errorMessages = {
      // Translation errors
      'TRANSLATION_FAILED': {
        en: 'Translation service is currently unavailable. Please try again.',
        hi: 'अनुवाद सेवा वर्तमान में उपलब्ध नहीं है। कृपया पुनः प्रयास करें।',
        te: 'అనువాద సేవ ప్రస్తుతం అందుబాటులో లేదు. దయచేసి మళ్లీ ప్రయత్నించండి.',
        ta: 'மொழிபெயர்ப்பு சேவை தற்போது கிடைக்கவில்லை. தயவுசेய்து மீண்டும் முயற்சிக்கவும்.'
      },
      'INVALID_LANGUAGE': {
        en: 'Unsupported language. Please use Hindi, Telugu, Tamil, or English.',
        hi: 'असमर्थित भाषा। कृपया हिंदी, तेलुगु, तमिल या अंग्रेजी का उपयोग करें।',
        te: 'మద్దతు లేని భాష. దయచేసి హిందీ, తెలుగు, తమిళ్ లేదా ఇంగ్లీష్ ఉపయోగించండి.',
        ta: 'ஆதரிக்கப்படாத மொழி. தயவுசेய்து இந்தி, தெலுங்கு, தமிழ் அல்லது ஆங்கிலம் பயன்படுத்தவும்.'
      },
      
      // Price discovery errors
      'PRICE_DATA_UNAVAILABLE': {
        en: 'Price data is currently unavailable for this crop. Please try another crop.',
        hi: 'इस फसल के लिए मूल्य डेटा वर्तमान में उपलब्ध नहीं है। कृपया दूसरी फसल आज़माएं।',
        te: 'ఈ పంట కోసం ధర డేటా ప్రస్తుతం అందుబాటులో లేదు. దయచేసి మరొక పంటను ప్రయత్నించండి.',
        ta: 'இந்த பயிருக்கான விலை தரவு தற்போது கிடைக்கவில்லை. தயவுசेय்து வேறு பயிரை முயற்சிக்கவும்.'
      },
      'INVALID_CROP_QUERY': {
        en: 'Invalid crop query. Please specify crop name, quantity, and location.',
        hi: 'अमान्य फसल क्वेरी। कृपया फसल का नाम, मात्रा और स्थान निर्दिष्ट करें।',
        te: 'చెల్లని పంట ప్రశ్న. దయచేసి పంట పేరు, పరిమాణం మరియు స్థానాన్ని పేర్కొనండి.',
        ta: 'தவறான பயிர் வினவல். தயவுசेय்து பயிர் பெயர், அளவு மற்றும் இடத்தைக் குறிப்பிடவும்.'
      },
      
      // Negotiation errors
      'SESSION_NOT_FOUND': {
        en: 'Negotiation session not found. Please start a new session.',
        hi: 'बातचीत सत्र नहीं मिला। कृपया एक नया सत्र शुरू करें।',
        te: 'చర్చల సెషన్ కనుగొనబడలేదు. దయచేసి కొత్త సెషన్ ప్రారంభించండి.',
        ta: 'பேச்சுவார்த்தை அமர்வு கிடைக்கவில்லை. தயவுசेय்து புதிய அமர்வைத் தொடங்கவும்.'
      },
      'AI_MEDIATION_FAILED': {
        en: 'AI mediation service is temporarily unavailable. Please continue manually.',
        hi: 'एआई मध्यस्थता सेवा अस्थायी रूप से अनुपलब्ध है। कृपया मैन्युअल रूप से जारी रखें।',
        te: 'AI మధ్యవర్తిత్వ సేవ తాత్కాలికంగా అందుబాటులో లేదు. దయచేసి మాన్యువల్‌గా కొనసాగించండి.',
        ta: 'AI மத்தியஸ்தம் சேவை தற்காலிகமாக கிடைக்கவில்லை. தயவுசेय்து கைமுறையாக தொடரவும்.'
      },
      
      // Voice input errors
      'MICROPHONE_ACCESS_DENIED': {
        en: 'Microphone access denied. Please enable microphone permissions and try again.',
        hi: 'माइक्रोफ़ोन एक्सेस अस्वीकृत। कृपया माइक्रोफ़ोन अनुमतियां सक्षम करें और पुनः प्रयास करें।',
        te: 'మైక్రోఫోన్ యాక్సెస్ తిరస్కరించబడింది. దయచేసి మైక్రోఫోన్ అనుమతులను ప్రారంభించి మళ్లీ ప్రయత్నించండి.',
        ta: 'மைக்ரோஃபோன் அணுகல் மறுக்கப்பட்டது. தயவுசेय்து மைக்ரோஃபோன் அனுமதிகளை இயக்கி மீண்டும் முயற்சிக்கவும்.'
      },
      'SPEECH_RECOGNITION_FAILED': {
        en: 'Speech recognition failed. Please try speaking again or use text input.',
        hi: 'वाक् पहचान असफल। कृपया फिर से बोलने का प्रयास करें या टेक्स्ट इनपुट का उपयोग करें।',
        te: 'వాక్ గుర్తింపు విఫలమైంది. దయచేసి మళ్లీ మాట్లాడటానికి ప్రయత్నించండి లేదా టెక్స్ట్ ఇన్‌పుట్ ఉపయోగించండి.',
        ta: 'பேச்சு அங்கீகாரம் தோல்வியடைந்தது. தயவுசेय்து மீண்டும் பேச முயற்சிக்கவும் அல்லது உரை உள்ளீட்டைப் பயன்படுத்தவும்.'
      },
      
      // System errors
      'NETWORK_ERROR': {
        en: 'Network connection error. Please check your internet connection and try again.',
        hi: 'नेटवर्क कनेक्शन त्रुटि। कृपया अपना इंटरनेट कनेक्शन जांचें और पुनः प्रयास करें।',
        te: 'నెట్‌వర్క్ కనెక్షన్ లోపం. దయచేసి మీ ఇంటర్నెట్ కనెక్షన్‌ను తనిఖీ చేసి మళ్లీ ప్రయత్నించండి.',
        ta: 'நெட்வொர்க் இணைப்பு பிழை. தயவுசेय்து உங்கள் இணைய இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.'
      },
      'SERVER_ERROR': {
        en: 'Server error occurred. Please try again later.',
        hi: 'सर्वर त्रुटि हुई। कृपया बाद में पुनः प्रयास करें।',
        te: 'సర్వర్ లోపం సంభవించింది. దయచేసి తర్వాత మళ్లీ ప్రయత్నించండి.',
        ta: 'சர்வர் பிழை ஏற்பட்டது. தயவுசेय்து பின்னர் மீண்டும் முயற்சிக்கவும்.'
      },
      'RATE_LIMIT_EXCEEDED': {
        en: 'Too many requests. Please wait a moment and try again.',
        hi: 'बहुत सारे अनुरोध। कृपया एक क्षण प्रतीक्षा करें और पुनः प्रयास करें।',
        te: 'చాలా అభ్యర్థనలు. దయచేసి ఒక క్షణం వేచి ఉండి మళ్లీ ప్రయత్నించండి.',
        ta: 'அதிக கோரிக்கைகள். தயவுசेय்து ஒரு கணம் காத்திருந்து மீண்டும் முயற்சிக்கவும்.'
      },
      'ROUTE_NOT_FOUND': {
        en: 'The requested resource was not found.',
        hi: 'अनुरोधित संसाधन नहीं मिला।',
        te: 'అభ్యర్థించిన వనరు కనుగొనబడలేదు.',
        ta: 'கோரப்பட்ட வளம் கிடைக்கவில்லை.'
      }
    };
  }

  /**
   * Get localized error message
   * @param {string} errorCode - Error code
   * @param {string} language - Language code (en, hi, te, ta)
   * @returns {string} Localized error message
   */
  getLocalizedError(errorCode, language = 'en') {
    const errorMessages = this.errorMessages[errorCode];
    if (!errorMessages) {
      return this.errorMessages['SERVER_ERROR'][language] || 'An error occurred';
    }
    
    return errorMessages[language] || errorMessages['en'] || 'An error occurred';
  }

  /**
   * Create standardized error response
   * @param {string} errorCode - Error code
   * @param {string} language - User's language
   * @param {Object} additionalData - Additional error data
   * @returns {Object} Standardized error response
   */
  createErrorResponse(errorCode, language = 'en', additionalData = {}) {
    return {
      success: false,
      error: this.getLocalizedError(errorCode, language),
      errorCode,
      timestamp: new Date().toISOString(),
      ...additionalData
    };
  }

  /**
   * Handle and log errors with context
   * @param {Error} error - The error object
   * @param {string} context - Context where error occurred
   * @param {Object} metadata - Additional metadata
   */
  logError(error, context, metadata = {}) {
    const errorLog = {
      timestamp: new Date().toISOString(),
      context,
      message: error.message,
      stack: error.stack,
      metadata
    };
    
    console.error('Error occurred:', errorLog);
    
    // In production, you might want to send this to a logging service
    // like CloudWatch, Sentry, etc.
  }

  /**
   * Determine error code from error object
   * @param {Error} error - The error object
   * @param {string} context - Context where error occurred
   * @returns {string} Error code
   */
  determineErrorCode(error, context) {
    const message = error.message.toLowerCase();
    
    // Network-related errors
    if (message.includes('network') || message.includes('connection') || 
        message.includes('timeout') || error.code === 'ECONNREFUSED') {
      return 'NETWORK_ERROR';
    }
    
    // Rate limiting
    if (message.includes('rate limit') || message.includes('throttling') || 
        error.status === 429) {
      return 'RATE_LIMIT_EXCEEDED';
    }
    
    // Translation-specific errors
    if (context.includes('translation') || context.includes('bedrock')) {
      return 'TRANSLATION_FAILED';
    }
    
    // Price-related errors
    if (context.includes('price') || context.includes('crop')) {
      return 'PRICE_DATA_UNAVAILABLE';
    }
    
    // Negotiation-related errors
    if (context.includes('negotiation') || context.includes('session')) {
      return 'SESSION_NOT_FOUND';
    }
    
    // Voice-related errors
    if (context.includes('voice') || context.includes('speech')) {
      return 'SPEECH_RECOGNITION_FAILED';
    }
    
    // Default to server error
    return 'SERVER_ERROR';
  }

  /**
   * Create error response with automatic error code detection
   * @param {Error} error - The error object
   * @param {string} context - Context where error occurred
   * @param {string} language - User's language
   * @param {Object} additionalData - Additional error data
   * @returns {Object} Standardized error response
   */
  handleError(error, context, language = 'en', additionalData = {}) {
    this.logError(error, context, additionalData);
    
    const errorCode = this.determineErrorCode(error, context);
    return this.createErrorResponse(errorCode, language, {
      context,
      ...additionalData
    });
  }

  /**
   * Middleware for Express.js error handling
   * @param {Error} err - Error object
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  expressErrorHandler(err, req, res, next) {
    const language = req.headers['accept-language'] || 
                    req.query.lang || 
                    req.body?.language || 
                    'en';
    
    const context = `${req.method} ${req.path}`;
    const errorResponse = this.handleError(err, context, language, {
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent']
    });
    
    // Determine HTTP status code
    let statusCode = 500;
    if (err.status) {
      statusCode = err.status;
    } else if (errorResponse.errorCode === 'RATE_LIMIT_EXCEEDED') {
      statusCode = 429;
    } else if (errorResponse.errorCode === 'INVALID_CROP_QUERY' || 
               errorResponse.errorCode === 'INVALID_LANGUAGE') {
      statusCode = 400;
    } else if (errorResponse.errorCode === 'SESSION_NOT_FOUND') {
      statusCode = 404;
    }
    
    res.status(statusCode).json(errorResponse);
  }

  /**
   * Create retry mechanism for failed operations
   * @param {Function} operation - Operation to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} delay - Delay between retries in ms
   * @returns {Promise} Result of the operation
   */
  async withRetry(operation, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const waitTime = delay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    throw lastError;
  }
}

module.exports = new ErrorHandlingService();