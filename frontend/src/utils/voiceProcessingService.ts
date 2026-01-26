/**
 * Voice Processing Service
 * Handles voice input processing, validation, and backend integration
 * Validates Requirements 4.4 - Voice input backend processing
 */

interface VoiceProcessingOptions {
  language: string;
  autoProcess?: boolean;
  confidenceThreshold?: number;
  maxRetries?: number;
}

interface ProcessedVoiceInput {
  originalText: string;
  processedText: string;
  language: string;
  confidence: number;
  isQuery: boolean;
  queryType?: 'price_query' | 'negotiation' | 'general';
  shouldAutoSend: boolean;
  metadata: {
    processingTime: number;
    detectedLanguage?: string;
    translationUsed: boolean;
    errors?: string[];
  };
}

interface VoiceValidationResult {
  isValid: boolean;
  confidence: number;
  errors: string[];
  suggestions?: string[];
}

class VoiceProcessingService {
  private baseUrl: string;
  private retryCount: number = 0;
  private maxRetries: number = 3;

  constructor(baseUrl: string = '/api/v1') {
    this.baseUrl = baseUrl;
  }

  /**
   * Process voice input through backend services
   */
  async processVoiceInput(
    transcript: string, 
    options: VoiceProcessingOptions
  ): Promise<ProcessedVoiceInput> {
    const startTime = Date.now();
    const errors: string[] = [];
    let translationUsed = false;
    let detectedLanguage = options.language;

    try {
      // Step 1: Validate voice input
      const validation = await this.validateVoiceInput(transcript, options);
      if (!validation.isValid) {
        throw new Error(`Voice input validation failed: ${validation.errors.join(', ')}`);
      }

      // Step 2: Detect language if different from expected
      if (options.language !== 'auto') {
        const languageDetection = await this.detectLanguage(transcript);
        if (languageDetection.language !== options.language && languageDetection.confidence > 0.7) {
          detectedLanguage = languageDetection.language;
          console.log(`Language mismatch detected: expected ${options.language}, detected ${detectedLanguage}`);
        }
      }

      // Step 3: Translate if necessary
      let processedText = transcript;
      if (detectedLanguage !== 'en' && this.requiresTranslation(transcript)) {
        const translation = await this.translateVoiceInput(transcript, detectedLanguage, 'en');
        if (translation.success) {
          processedText = translation.translatedText;
          translationUsed = true;
        } else {
          errors.push('Translation failed, using original text');
        }
      }

      // Step 4: Analyze query type and intent
      const queryAnalysis = await this.analyzeQueryIntent(processedText, detectedLanguage);

      // Step 5: Determine if auto-send is appropriate
      const shouldAutoSend = this.shouldAutoSendMessage(
        transcript, 
        processedText, 
        queryAnalysis, 
        validation.confidence,
        options
      );

      return {
        originalText: transcript,
        processedText,
        language: detectedLanguage,
        confidence: validation.confidence,
        isQuery: queryAnalysis.isQuery,
        queryType: queryAnalysis.queryType,
        shouldAutoSend,
        metadata: {
          processingTime: Date.now() - startTime,
          detectedLanguage,
          translationUsed,
          errors: errors.length > 0 ? errors : undefined
        }
      };

    } catch (error) {
      console.error('Voice processing failed:', error);
      
      // Return fallback result
      return {
        originalText: transcript,
        processedText: transcript,
        language: options.language,
        confidence: 0.3, // Always low confidence for errors
        isQuery: this.isLikelyQuery(transcript),
        shouldAutoSend: false,
        metadata: {
          processingTime: Date.now() - startTime,
          translationUsed: false,
          errors: [error instanceof Error ? error.message : 'Unknown processing error']
        }
      };
    }
  }

  /**
   * Validate voice input quality and content
   */
  private async validateVoiceInput(
    transcript: string, 
    options: VoiceProcessingOptions
  ): Promise<VoiceValidationResult> {
    const errors: string[] = [];
    let confidence = 1.0;

    // Basic validation
    if (!transcript || transcript.trim().length === 0) {
      errors.push('Empty transcript');
      return { isValid: false, confidence: 0, errors };
    }

    if (transcript.trim().length < 3) {
      errors.push('Transcript too short');
      confidence *= 0.5;
    }

    // Check for common speech recognition errors
    if (this.hasCommonSpeechErrors(transcript)) {
      errors.push('Possible speech recognition errors detected');
      confidence *= 0.7;
    }

    // Check confidence threshold
    if (confidence < (options.confidenceThreshold || 0.5)) {
      errors.push('Confidence below threshold');
      return { isValid: false, confidence, errors };
    }

    // Language-specific validation
    const languageValidation = this.validateLanguageSpecific(transcript, options.language);
    if (!languageValidation.isValid) {
      errors.push(...languageValidation.errors);
      confidence *= 0.8;
    }

    return {
      isValid: errors.length === 0 || confidence >= 0.6,
      confidence,
      errors,
      suggestions: this.generateValidationSuggestions(transcript, errors)
    };
  }

  /**
   * Detect language of voice input
   */
  private async detectLanguage(transcript: string): Promise<{ language: string; confidence: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/translate/detect-language`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: transcript }),
      });

      if (!response.ok) {
        throw new Error(`Language detection failed: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        language: result.language || 'en',
        confidence: result.confidence || 0.5
      };
    } catch (error) {
      console.warn('Language detection failed, using fallback:', error);
      return { language: 'en', confidence: 0.3 };
    }
  }

  /**
   * Translate voice input using backend translation service
   */
  private async translateVoiceInput(
    text: string, 
    sourceLang: string, 
    targetLang: string
  ): Promise<{ success: boolean; translatedText: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceText: text,
          sourceLang,
          targetLang,
          context: 'voice_input',
          preserveTerminology: true
        }),
      });

      if (!response.ok) {
        throw new Error(`Translation failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        return {
          success: true,
          translatedText: result.translatedText
        };
      } else {
        return {
          success: false,
          translatedText: text,
          error: result.error?.message || 'Translation failed'
        };
      }
    } catch (error) {
      console.error('Translation request failed:', error);
      return {
        success: false,
        translatedText: text,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  /**
   * Analyze query intent and type
   */
  private async analyzeQueryIntent(
    text: string, 
    language: string
  ): Promise<{ isQuery: boolean; queryType: 'price_query' | 'negotiation' | 'general'; confidence: number }> {
    try {
      // Use local analysis first for speed
      const localAnalysis = this.analyzeQueryLocally(text);
      
      // For high-confidence local results, return immediately
      if (localAnalysis.confidence > 0.8) {
        return localAnalysis;
      }

      // Use backend analysis for ambiguous cases
      const response = await fetch(`${this.baseUrl}/rag/analyze-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: text,
          language,
          context: 'voice_input'
        }),
      });

      if (!response.ok) {
        return localAnalysis; // Fallback to local analysis
      }

      const result = await response.json();
      
      return {
        isQuery: result.isQuery || localAnalysis.isQuery,
        queryType: result.queryType || localAnalysis.queryType,
        confidence: result.confidence || localAnalysis.confidence
      };

    } catch (error) {
      console.warn('Backend intent analysis failed, using local analysis:', error);
      return this.analyzeQueryLocally(text);
    }
  }

  /**
   * Local query analysis for fast processing
   */
  private analyzeQueryLocally(text: string): { isQuery: boolean; queryType: 'price_query' | 'negotiation' | 'general'; confidence: number } {
    const lowerText = text.toLowerCase();
    
    // Negotiation indicators (check first to avoid conflicts)
    const negotiationKeywords = ['buy', 'sell', 'offer', 'deal', 'negotiate', 'खरीद', 'बेच', 'सौदा', 'కొను', 'అమ్ము', 'வாங்கு', 'விற்று'];
    const hasNegotiationKeyword = negotiationKeywords.some(keyword => lowerText.includes(keyword));
    
    if (hasNegotiationKeyword) {
      return {
        isQuery: true,
        queryType: 'negotiation',
        confidence: 0.8
      };
    }
    
    // Price query indicators
    const priceKeywords = ['price', 'cost', 'rate', 'how much', 'भाव', 'दाम', 'कीमत', 'ధర', 'விலை'];
    const cropKeywords = ['tomato', 'onion', 'potato', 'rice', 'wheat', 'टमाटर', 'प्याज', 'आलू', 'టమాటో', 'ఉల్లిపాయ', 'தக்காளி', 'வெங்காயம்'];
    
    const hasPriceKeyword = priceKeywords.some(keyword => lowerText.includes(keyword));
    const hasCropKeyword = cropKeywords.some(keyword => lowerText.includes(keyword));
    
    if (hasPriceKeyword || hasCropKeyword) {
      return {
        isQuery: true,
        queryType: 'price_query',
        confidence: (hasPriceKeyword && hasCropKeyword) ? 0.9 : 0.7
      };
    }

    // Question indicators
    const questionWords = ['what', 'how', 'when', 'where', 'why', 'which', 'क्या', 'कैसे', 'कब', 'ఎలా', 'ఎప్పుడు', 'எப்படி', 'எப்போது'];
    const hasQuestionWord = questionWords.some(word => lowerText.includes(word));
    const hasQuestionMark = text.includes('?');
    
    if (hasQuestionWord || hasQuestionMark) {
      return {
        isQuery: true,
        queryType: 'general',
        confidence: 0.6
      };
    }

    return {
      isQuery: false,
      queryType: 'general',
      confidence: 0.5
    };
  }

  /**
   * Determine if message should be auto-sent
   */
  private shouldAutoSendMessage(
    originalText: string,
    processedText: string,
    queryAnalysis: any,
    confidence: number,
    options: VoiceProcessingOptions
  ): boolean {
    // Don't auto-send if disabled
    if (options.autoProcess === false) {
      return false;
    }

    // Don't auto-send if confidence is too low
    if (confidence < 0.6) {
      return false;
    }

    // Auto-send for clear queries
    if (queryAnalysis.isQuery && queryAnalysis.confidence > 0.7) {
      return true;
    }

    // Auto-send for complete sentences with question indicators
    if (originalText.includes('?') || processedText.includes('?')) {
      return true;
    }

    // Auto-send for longer, complete-sounding statements
    if (processedText.trim().length > 15 && this.seemsComplete(processedText)) {
      return true;
    }

    return false;
  }

  /**
   * Check if text requires translation
   */
  private requiresTranslation(text: string): boolean {
    // Simple heuristic: if text contains non-Latin characters, it likely needs translation
    return /[^\u0000-\u007F]/.test(text);
  }

  /**
   * Check for common speech recognition errors
   */
  private hasCommonSpeechErrors(text: string): boolean {
    const errorPatterns = [
      /\b(um|uh|er|ah)\b/gi,  // Filler words
      /\b\w{1,2}\b.*\b\w{1,2}\b/,  // Too many short words
      /[a-z][A-Z]/,  // Inconsistent capitalization
      /\d+[a-zA-Z]+\d+/  // Mixed numbers and letters
    ];
    
    return errorPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Language-specific validation
   */
  private validateLanguageSpecific(text: string, language: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    switch (language) {
      case 'hi':
        if (!/[\u0900-\u097F]/.test(text) && text.length > 10) {
          errors.push('Expected Hindi text but no Devanagari script detected');
        }
        break;
      case 'te':
        if (!/[\u0C00-\u0C7F]/.test(text) && text.length > 10) {
          errors.push('Expected Telugu text but no Telugu script detected');
        }
        break;
      case 'ta':
        if (!/[\u0B80-\u0BFF]/.test(text) && text.length > 10) {
          errors.push('Expected Tamil text but no Tamil script detected');
        }
        break;
      case 'en':
        if (!/^[a-zA-Z0-9\s.,!?'"()-]+$/.test(text) && text.length > 10) {
          errors.push('Expected English text but non-Latin characters detected');
        }
        break;
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate validation suggestions
   */
  private generateValidationSuggestions(text: string, errors: string[]): string[] {
    const suggestions: string[] = [];
    
    if (errors.includes('Transcript too short')) {
      suggestions.push('Try speaking more clearly or for a longer duration');
    }
    
    if (errors.includes('Possible speech recognition errors detected')) {
      suggestions.push('Try speaking more slowly and clearly');
      suggestions.push('Reduce background noise if possible');
    }
    
    if (errors.some(e => e.includes('script detected'))) {
      suggestions.push('Make sure you are speaking in the selected language');
      suggestions.push('Check your language settings');
    }
    
    return suggestions;
  }

  /**
   * Simple heuristic to check if text seems complete
   */
  private seemsComplete(text: string): boolean {
    const completionIndicators = [
      text.endsWith('.'),
      text.endsWith('?'),
      text.endsWith('!'),
      text.includes(' and '),
      text.includes(' or '),
      text.split(' ').length >= 4
    ];
    
    return completionIndicators.filter(Boolean).length >= 2;
  }

  /**
   * Simple heuristic to check if text is likely a query
   */
  private isLikelyQuery(text: string): boolean {
    const queryIndicators = [
      text.includes('?'),
      text.toLowerCase().startsWith('what'),
      text.toLowerCase().startsWith('how'),
      text.toLowerCase().startsWith('when'),
      text.toLowerCase().startsWith('where'),
      text.toLowerCase().includes('price'),
      text.toLowerCase().includes('cost')
    ];
    
    return queryIndicators.some(Boolean);
  }

  /**
   * Retry mechanism for failed requests
   */
  private async retryRequest<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.maxRetries
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  /**
   * Get processing statistics
   */
  getStats(): { retryCount: number; maxRetries: number } {
    return {
      retryCount: this.retryCount,
      maxRetries: this.maxRetries
    };
  }
}

export default VoiceProcessingService;
export type { VoiceProcessingOptions, ProcessedVoiceInput, VoiceValidationResult };