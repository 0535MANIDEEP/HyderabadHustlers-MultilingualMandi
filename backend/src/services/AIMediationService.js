const BedrockClient = require('./BedrockClient');
const TranslationService = require('./TranslationService');
const PriceService = require('./PriceService');
const { v4: uuidv4 } = require('uuid');

/**
 * AI Mediation Service for Negotiation Support
 * Provides bidirectional translation, compromise suggestions, and conversation management
 * Validates Requirements 3.2, 3.3, 3.4, 3.5
 */
class AIMediationService {
  constructor(options = {}) {
    this.bedrockClient = options.bedrockClient || new BedrockClient();
    this.translationService = options.translationService || new TranslationService();
    this.priceService = options.priceService || new PriceService();
    
    // Conversation context management
    this.conversationContexts = new Map(); // sessionId -> context
    this.maxContextMessages = 10; // Keep last 10 messages for context
    
    // AI mediation prompts
    this.systemPrompts = {
      translator: `You are an expert agricultural translator specializing in Indian crop markets. 
        Translate messages accurately while preserving agricultural terminology, prices, and cultural context.
        Maintain the tone and intent of negotiations. Always respond in valid JSON format.`,
      
      mediator: `You are an AI mediator for agricultural crop negotiations in Indian markets.
        Help buyers and vendors reach fair agreements by suggesting compromises based on market data.
        Consider cultural context, seasonal factors, and fair pricing. Be respectful and neutral.
        Always respond in valid JSON format with practical suggestions.`,
      
      analyzer: `You are an expert in agricultural market analysis. Analyze negotiation conversations
        to identify key points, potential compromises, and fair price ranges based on market conditions.
        Consider crop quality, quantity, seasonal factors, and regional pricing patterns.`
    };
  }

  /**
   * Translate a negotiation message bidirectionally
   * @param {Object} messageData - Message data with text and languages
   * @returns {Object} Translation result with original and translated text
   */
  async translateMessage(messageData) {
    const { originalText, sourceLang, targetLang, sessionId, messageType = 'message' } = messageData;
    
    try {
      // Get conversation context for better translation
      const context = this.getConversationContext(sessionId);
      
      const prompt = `${this.systemPrompts.translator}

Context: This is a ${messageType} in an agricultural crop negotiation.
Previous conversation context: ${context.recentMessages.slice(-3).map(m => `${m.language}: ${m.text}`).join('\n')}

Translate the following ${sourceLang} text to ${targetLang}, preserving agricultural terms and negotiation context:
"${originalText}"

Respond in JSON format:
{
  "translatedText": "translated message",
  "confidence": 0.95,
  "preservedTerms": ["term1", "term2"],
  "culturalNotes": "any cultural context notes"
}`;

      const response = await this.bedrockClient.invokeModel(prompt);
      const result = this.parseAIResponse(response);
      
      // Update conversation context
      this.updateConversationContext(sessionId, {
        originalText,
        translatedText: result.translatedText,
        sourceLang,
        targetLang,
        messageType,
        timestamp: new Date()
      });
      
      return {
        success: true,
        originalText,
        translatedText: result.translatedText,
        sourceLang,
        targetLang,
        confidence: result.confidence || 0.9,
        preservedTerms: result.preservedTerms || [],
        culturalNotes: result.culturalNotes,
        messageId: uuidv4(),
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error('Translation error:', error);
      
      // Fallback to basic translation service
      try {
        const fallbackResult = await this.translationService.translateText(originalText, sourceLang, targetLang);
        return {
          success: true,
          originalText,
          translatedText: fallbackResult.translatedText,
          sourceLang,
          targetLang,
          confidence: 0.7,
          preservedTerms: [],
          culturalNotes: 'Fallback translation used',
          messageId: uuidv4(),
          timestamp: new Date(),
          fallback: true
        };
      } catch (fallbackError) {
        return {
          success: false,
          error: 'Translation failed',
          originalText,
          sourceLang,
          targetLang,
          timestamp: new Date()
        };
      }
    }
  }

  /**
   * Generate AI-mediated compromise suggestions
   * @param {Object} sessionData - Session data with conversation history
   * @returns {Object} Compromise suggestions and analysis
   */
  async generateCompromiseSuggestions(sessionData) {
    const { sessionId, cropDetails, currentOffer, messages, vendorLanguage, buyerLanguage } = sessionData;
    
    try {
      // Get market data for context
      const marketData = await this.priceService.getCropPrices(cropDetails.name);
      const priceAnalysis = await this.priceService.calculatePriceStatistics(cropDetails.name);
      
      // Prepare conversation summary
      const conversationSummary = messages.slice(-5).map(msg => 
        `${msg.senderId}: ${msg.originalText} (${msg.language})`
      ).join('\n');
      
      const prompt = `${this.systemPrompts.mediator}

Negotiation Context:
- Crop: ${cropDetails.name} (${cropDetails.quantity} ${cropDetails.unit}, ${cropDetails.quality} quality)
- Current Offer: ${currentOffer ? `₹${currentOffer.price}/${cropDetails.unit}` : 'No offer yet'}
- Market Average: ₹${priceAnalysis.averagePrice}/${cropDetails.unit}
- Price Range: ₹${priceAnalysis.minPrice} - ₹${priceAnalysis.maxPrice}/${cropDetails.unit}
- Vendor Language: ${vendorLanguage}
- Buyer Language: ${buyerLanguage}

Recent Conversation:
${conversationSummary}

Analyze this negotiation and suggest fair compromises. Consider:
1. Market prices and seasonal factors
2. Quality and quantity being negotiated
3. Cultural negotiation patterns in Indian markets
4. Fair profit margins for both parties

Respond in JSON format:
{
  "suggestions": [
    {
      "type": "price_compromise",
      "description": "Suggested compromise explanation",
      "priceRange": {"min": 35, "max": 40},
      "reasoning": "Why this is fair for both parties"
    }
  ],
  "marketInsights": "Current market conditions analysis",
  "negotiationTips": "Cultural and practical negotiation advice",
  "fairPriceRange": {"min": 35, "max": 42},
  "confidence": 0.85
}`;

      const response = await this.bedrockClient.invokeModel(prompt);
      const result = this.parseAIResponse(response);
      
      // Translate suggestions to both languages if needed
      const translatedSuggestions = await this.translateSuggestions(result, vendorLanguage, buyerLanguage);
      
      return {
        success: true,
        sessionId,
        suggestions: translatedSuggestions.suggestions,
        marketInsights: translatedSuggestions.marketInsights,
        negotiationTips: translatedSuggestions.negotiationTips,
        fairPriceRange: result.fairPriceRange,
        confidence: result.confidence || 0.8,
        timestamp: new Date(),
        basedOnMarketData: {
          averagePrice: priceAnalysis.averagePrice,
          priceRange: { min: priceAnalysis.minPrice, max: priceAnalysis.maxPrice },
          sampleSize: marketData.length
        }
      };
      
    } catch (error) {
      console.error('AI mediation error:', error);
      
      // Fallback to basic price-based suggestions
      return this.generateFallbackSuggestions(sessionData);
    }
  }

  /**
   * Analyze conversation sentiment and negotiation progress
   * @param {Object} sessionData - Session data with messages
   * @returns {Object} Conversation analysis
   */
  async analyzeConversation(sessionData) {
    const { sessionId, messages, cropDetails } = sessionData;
    
    try {
      const conversationText = messages.map(msg => 
        `${msg.senderId}: ${msg.originalText}`
      ).join('\n');
      
      const prompt = `${this.systemPrompts.analyzer}

Analyze this agricultural negotiation conversation for:
1. Sentiment and tone of both parties
2. Negotiation progress and likelihood of agreement
3. Key sticking points or areas of disagreement
4. Suggested next steps for resolution

Crop being negotiated: ${cropDetails.name} (${cropDetails.quantity} ${cropDetails.unit})

Conversation:
${conversationText}

Respond in JSON format:
{
  "sentiment": {
    "vendor": "positive/neutral/negative",
    "buyer": "positive/neutral/negative",
    "overall": "collaborative/competitive/tense"
  },
  "progress": {
    "stage": "initial/negotiating/near_agreement/stalled",
    "agreementLikelihood": 0.75,
    "keyIssues": ["price", "quality", "delivery"]
  },
  "recommendations": [
    "Specific actionable suggestions for moving forward"
  ],
  "riskFactors": ["Potential deal breakers or concerns"]
}`;

      const response = await this.bedrockClient.invokeModel(prompt);
      const result = this.parseAIResponse(response);
      
      return {
        success: true,
        sessionId,
        analysis: result,
        timestamp: new Date(),
        messageCount: messages.length
      };
      
    } catch (error) {
      console.error('Conversation analysis error:', error);
      return {
        success: false,
        error: 'Analysis failed',
        sessionId,
        timestamp: new Date()
      };
    }
  }

  /**
   * Manage conversation context for better AI responses
   * @param {string} sessionId - Session ID
   * @returns {Object} Conversation context
   */
  getConversationContext(sessionId) {
    if (!this.conversationContexts.has(sessionId)) {
      this.conversationContexts.set(sessionId, {
        sessionId,
        recentMessages: [],
        keyTerms: new Set(),
        languages: new Set(),
        createdAt: new Date()
      });
    }
    return this.conversationContexts.get(sessionId);
  }

  /**
   * Update conversation context with new message
   * @param {string} sessionId - Session ID
   * @param {Object} messageData - Message data
   */
  updateConversationContext(sessionId, messageData) {
    const context = this.getConversationContext(sessionId);
    
    // Add message to recent messages
    context.recentMessages.push({
      text: messageData.originalText,
      translatedText: messageData.translatedText,
      language: messageData.sourceLang,
      targetLanguage: messageData.targetLang,
      timestamp: messageData.timestamp
    });
    
    // Keep only recent messages
    if (context.recentMessages.length > this.maxContextMessages) {
      context.recentMessages = context.recentMessages.slice(-this.maxContextMessages);
    }
    
    // Track languages and key terms
    context.languages.add(messageData.sourceLang);
    context.languages.add(messageData.targetLang);
    
    // Extract and store key agricultural terms
    if (messageData.preservedTerms) {
      messageData.preservedTerms.forEach(term => context.keyTerms.add(term));
    }
  }

  /**
   * Translate AI suggestions to multiple languages
   * @param {Object} suggestions - AI suggestions object
   * @param {string} vendorLang - Vendor language
   * @param {string} buyerLang - Buyer language
   * @returns {Object} Translated suggestions
   */
  async translateSuggestions(suggestions, vendorLang, buyerLang) {
    try {
      const languages = [vendorLang, buyerLang].filter((lang, index, arr) => 
        lang !== 'en' && arr.indexOf(lang) === index
      );
      
      const translatedSuggestions = { ...suggestions };
      
      // Translate suggestions if needed
      if (languages.length > 0) {
        for (const lang of languages) {
          if (suggestions.suggestions) {
            for (let i = 0; i < suggestions.suggestions.length; i++) {
              const suggestion = suggestions.suggestions[i];
              if (suggestion.description) {
                const translated = await this.translationService.translateText(
                  suggestion.description, 'en', lang
                );
                suggestion[`description_${lang}`] = translated.translatedText;
              }
            }
          }
          
          // Translate market insights and tips
          if (suggestions.marketInsights) {
            const translated = await this.translationService.translateText(
              suggestions.marketInsights, 'en', lang
            );
            translatedSuggestions[`marketInsights_${lang}`] = translated.translatedText;
          }
          
          if (suggestions.negotiationTips) {
            const translated = await this.translationService.translateText(
              suggestions.negotiationTips, 'en', lang
            );
            translatedSuggestions[`negotiationTips_${lang}`] = translated.translatedText;
          }
        }
      }
      
      return translatedSuggestions;
    } catch (error) {
      console.error('Translation of suggestions failed:', error);
      return suggestions; // Return original if translation fails
    }
  }

  /**
   * Generate fallback suggestions when AI fails
   * @param {Object} sessionData - Session data
   * @returns {Object} Basic suggestions based on market data
   */
  async generateFallbackSuggestions(sessionData) {
    try {
      const { cropDetails, currentOffer } = sessionData;
      const priceAnalysis = await this.priceService.calculatePriceStatistics(cropDetails.name);
      
      const midPrice = (priceAnalysis.minPrice + priceAnalysis.maxPrice) / 2;
      const suggestions = [];
      
      if (currentOffer && currentOffer.price) {
        if (currentOffer.price > priceAnalysis.maxPrice) {
          suggestions.push({
            type: 'price_reduction',
            description: `Consider reducing price to ₹${midPrice}/${cropDetails.unit} (market average)`,
            priceRange: { min: priceAnalysis.averagePrice, max: priceAnalysis.maxPrice },
            reasoning: 'Current offer is above market maximum'
          });
        } else if (currentOffer.price < priceAnalysis.minPrice) {
          suggestions.push({
            type: 'price_increase',
            description: `Consider increasing price to ₹${midPrice}/${cropDetails.unit} (market average)`,
            priceRange: { min: priceAnalysis.minPrice, max: priceAnalysis.averagePrice },
            reasoning: 'Current offer is below market minimum'
          });
        } else {
          suggestions.push({
            type: 'price_acceptable',
            description: `Current price is within market range. Consider finalizing the deal.`,
            priceRange: { min: currentOffer.price - 2, max: currentOffer.price + 2 },
            reasoning: 'Price is fair based on current market conditions'
          });
        }
      } else {
        suggestions.push({
          type: 'initial_offer',
          description: `Start negotiation around ₹${midPrice}/${cropDetails.unit}`,
          priceRange: { min: priceAnalysis.averagePrice, max: priceAnalysis.maxPrice },
          reasoning: 'Based on current market average'
        });
      }
      
      return {
        success: true,
        sessionId: sessionData.sessionId,
        suggestions,
        marketInsights: `Market average: ₹${priceAnalysis.averagePrice}/${cropDetails.unit}`,
        negotiationTips: 'Consider quality, quantity, and delivery terms in your negotiation.',
        fairPriceRange: { min: priceAnalysis.minPrice, max: priceAnalysis.maxPrice },
        confidence: 0.6,
        timestamp: new Date(),
        fallback: true,
        basedOnMarketData: {
          averagePrice: priceAnalysis.averagePrice,
          priceRange: { min: priceAnalysis.minPrice, max: priceAnalysis.maxPrice }
        }
      };
    } catch (error) {
      console.error('Fallback suggestions failed:', error);
      return {
        success: false,
        error: 'Unable to generate suggestions',
        sessionId: sessionData.sessionId,
        timestamp: new Date()
      };
    }
  }

  /**
   * Parse AI response and handle JSON parsing
   * @param {string} response - AI response text
   * @returns {Object} Parsed response object
   */
  parseAIResponse(response) {
    try {
      // Clean up response text (remove markdown code blocks if present)
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/```\n?/, '').replace(/\n?```$/, '');
      }
      
      return JSON.parse(cleanResponse);
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      console.error('Response was:', response);
      
      // Return a basic structure if parsing fails
      return {
        error: 'Failed to parse AI response',
        rawResponse: response
      };
    }
  }

  /**
   * Clear conversation context for a session
   * @param {string} sessionId - Session ID to clear
   */
  clearConversationContext(sessionId) {
    this.conversationContexts.delete(sessionId);
  }

  /**
   * Get conversation statistics
   * @returns {Object} Service statistics
   */
  getServiceStats() {
    return {
      activeContexts: this.conversationContexts.size,
      totalLanguages: Array.from(this.conversationContexts.values())
        .reduce((langs, context) => {
          context.languages.forEach(lang => langs.add(lang));
          return langs;
        }, new Set()).size,
      averageMessagesPerContext: this.conversationContexts.size > 0 
        ? Array.from(this.conversationContexts.values())
            .reduce((sum, context) => sum + context.recentMessages.length, 0) / this.conversationContexts.size
        : 0
    };
  }
}

module.exports = AIMediationService;