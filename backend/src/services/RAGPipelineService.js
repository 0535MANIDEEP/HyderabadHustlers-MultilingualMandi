const VectorEmbeddingService = require('./VectorEmbeddingService');
const PriceService = require('./PriceService');
const BedrockClient = require('./BedrockClient');
const CsvParserService = require('./CsvParserService');

/**
 * RAG Pipeline Service
 * Implements Retrieval-Augmented Generation pipeline for agricultural price queries
 * Connects CSV data to vector embedding generation and provides context-aware query processing
 * Validates Requirement 6.3
 */
class RAGPipelineService {
  constructor(options = {}) {
    this.vectorService = options.vectorService || new VectorEmbeddingService();
    this.priceService = options.priceService || new PriceService();
    this.bedrockClient = options.bedrockClient || new BedrockClient();
    this.csvParser = options.csvParser || new CsvParserService();
    
    // RAG configuration
    this.maxRetrievedDocuments = options.maxRetrievedDocuments || 10;
    this.relevanceThreshold = options.relevanceThreshold || 0.3;
    this.contextWindowSize = options.contextWindowSize || 2000; // tokens
    this.enableReranking = options.enableReranking !== false;
    
    // Query processing configuration
    this.queryExpansionEnabled = options.queryExpansion !== false;
    this.semanticSearchWeight = options.semanticSearchWeight || 0.7;
    this.keywordSearchWeight = options.keywordSearchWeight || 0.3;
    
    // Context templates for different query types
    this.contextTemplates = {
      price_query: `Based on the following agricultural market data, provide accurate price information and recommendations:

{context}

Query: {query}

Please provide:
1. Current price information for the requested crop
2. Price range and market analysis
3. Quality considerations and recommendations
4. Market trends if available

Respond in a helpful, accurate manner focusing on the agricultural context.`,

      comparison_query: `Based on the following agricultural market data, compare the requested crops:

{context}

Query: {query}

Please provide:
1. Price comparison between the crops
2. Quality and variety differences
3. Market availability analysis
4. Recommendations based on current conditions

Focus on practical insights for agricultural decision-making.`,

      market_analysis: `Based on the following agricultural market data, provide market analysis:

{context}

Query: {query}

Please provide:
1. Market condition analysis
2. Supply and demand indicators
3. Price trend analysis
4. Strategic recommendations

Provide actionable insights for agricultural stakeholders.`
    };
    
    this.isInitialized = false;
    console.log('RAGPipelineService initialized');
  }

  /**
   * Initialize the RAG pipeline with CSV data
   * @param {string} csvPath - Path to the CSV file (optional)
   * @returns {Promise<Object>} Initialization result
   */
  async initialize(csvPath = null) {
    try {
      console.log('Initializing RAG pipeline...');
      
      // Parse CSV data
      const parseResult = await this.csvParser.parseMandiPrices(csvPath);
      if (!parseResult.success) {
        throw new Error(`Failed to parse CSV data: ${parseResult.error}`);
      }
      
      console.log(`Parsed ${parseResult.data.length} crop price records`);
      
      // Initialize vector embedding service with crop data
      const vectorInitResult = await this.vectorService.initialize(parseResult.data);
      if (!vectorInitResult.success) {
        throw new Error(`Failed to initialize vector service: ${vectorInitResult.error}`);
      }
      
      console.log(`Vector service initialized with ${vectorInitResult.indexedItems} indexed items`);
      
      // Test Bedrock connection
      const connectionTest = await this.bedrockClient.testConnection();
      if (!connectionTest.success) {
        console.warn('Bedrock connection test failed, RAG will use local embeddings only:', connectionTest.error);
      }
      
      this.isInitialized = true;
      
      return {
        success: true,
        message: 'RAG pipeline initialized successfully',
        statistics: {
          cropRecords: parseResult.data.length,
          indexedItems: vectorInitResult.indexedItems,
          vocabularySize: vectorInitResult.vocabularySize,
          bedrockAvailable: connectionTest.success
        }
      };
    } catch (error) {
      console.error('Error initializing RAG pipeline:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process a query using the RAG pipeline
   * @param {string} query - User query about agricultural prices
   * @param {Object} options - Query processing options
   * @returns {Promise<Object>} RAG response with context and generated answer
   */
  async processQuery(query, options = {}) {
    try {
      if (!this.isInitialized) {
        throw new Error('RAG pipeline not initialized. Call initialize() first.');
      }
      
      const {
        queryType = 'price_query',
        maxResults = this.maxRetrievedDocuments,
        includeContext = true,
        enableReranking = this.enableReranking,
        language = 'en'
      } = options;
      
      console.log(`Processing RAG query: "${query}" (type: ${queryType})`);
      
      // Step 1: Query expansion and preprocessing
      const expandedQuery = await this.expandQuery(query, queryType);
      
      // Step 2: Retrieve relevant documents using semantic search
      const retrievalResult = await this.retrieveRelevantDocuments(expandedQuery, {
        maxResults,
        queryType,
        originalQuery: query
      });
      
      if (!retrievalResult.success) {
        throw new Error(`Document retrieval failed: ${retrievalResult.error}`);
      }
      
      // Step 3: Re-rank documents if enabled
      let rankedDocuments = retrievalResult.documents;
      if (enableReranking && rankedDocuments.length > 1) {
        rankedDocuments = await this.rerankDocuments(query, rankedDocuments);
      }
      
      // Step 4: Build context from retrieved documents
      const context = this.buildContext(rankedDocuments, queryType);
      
      // Step 5: Generate response using Bedrock with context
      const generationResult = await this.generateContextualResponse(query, context, queryType, language);
      
      // Step 6: Post-process and enhance response
      const enhancedResponse = await this.enhanceResponse(generationResult, rankedDocuments, query);
      
      return {
        success: true,
        query: query,
        expandedQuery: expandedQuery,
        queryType: queryType,
        response: enhancedResponse.response,
        context: includeContext ? context : null,
        retrievedDocuments: rankedDocuments.length,
        relevanceScores: rankedDocuments.map(doc => ({
          id: doc.id,
          similarity: doc.similarity,
          relevanceScore: doc.relevanceScore || doc.similarity
        })),
        processingTime: Date.now() - (retrievalResult.startTime || Date.now()),
        metadata: {
          documentsRetrieved: retrievalResult.totalMatches,
          documentsUsed: rankedDocuments.length,
          contextLength: context.length,
          bedrockUsed: generationResult.bedrockUsed,
          language: language
        }
      };
      
    } catch (error) {
      console.error('Error processing RAG query:', error);
      return {
        success: false,
        error: error.message,
        query: query
      };
    }
  }

  /**
   * Expand query with related terms and context
   * @param {string} query - Original query
   * @param {string} queryType - Type of query
   * @returns {Promise<string>} Expanded query
   */
  async expandQuery(query, queryType) {
    if (!this.queryExpansionEnabled) {
      return query;
    }
    
    try {
      // Add agricultural context terms based on query type
      const contextTerms = {
        price_query: ['price', 'cost', 'rate', 'market', 'mandi'],
        comparison_query: ['compare', 'difference', 'versus', 'better', 'choice'],
        market_analysis: ['market', 'trend', 'analysis', 'condition', 'supply', 'demand']
      };
      
      const terms = contextTerms[queryType] || contextTerms.price_query;
      
      // Simple query expansion - add relevant terms if not present
      let expandedQuery = query.toLowerCase();
      terms.forEach(term => {
        if (!expandedQuery.includes(term)) {
          expandedQuery += ` ${term}`;
        }
      });
      
      // Add agricultural domain context
      if (!expandedQuery.includes('agricultural') && !expandedQuery.includes('crop')) {
        expandedQuery += ' agricultural crop';
      }
      
      return expandedQuery;
    } catch (error) {
      console.warn('Query expansion failed, using original query:', error.message);
      return query;
    }
  }

  /**
   * Retrieve relevant documents using semantic and keyword search
   * @param {string} query - Query to search for
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Retrieved documents with relevance scores
   */
  async retrieveRelevantDocuments(query, options = {}) {
    try {
      const startTime = Date.now();
      const { maxResults, queryType, originalQuery } = options;
      
      // Perform semantic search using vector embeddings
      const semanticResults = await this.vectorService.semanticSearch(query, {
        limit: maxResults * 2, // Get more results for reranking
        threshold: this.relevanceThreshold,
        includeEmbeddings: false
      });
      
      if (!semanticResults.success) {
        throw new Error(`Semantic search failed: ${semanticResults.error}`);
      }
      
      // Perform keyword-based search for comparison
      const keywordResults = await this.performKeywordSearch(originalQuery || query, maxResults);
      
      // Combine and deduplicate results
      const combinedResults = this.combineSearchResults(
        semanticResults.results,
        keywordResults,
        this.semanticSearchWeight,
        this.keywordSearchWeight
      );
      
      // Limit to maxResults
      const finalResults = combinedResults.slice(0, maxResults);
      
      return {
        success: true,
        documents: finalResults,
        totalMatches: semanticResults.totalMatches,
        searchTime: Date.now() - startTime,
        startTime: startTime
      };
      
    } catch (error) {
      console.error('Error retrieving documents:', error);
      return {
        success: false,
        error: error.message,
        documents: []
      };
    }
  }

  /**
   * Perform keyword-based search on crop data
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum results to return
   * @returns {Promise<Array>} Keyword search results
   */
  async performKeywordSearch(query, maxResults) {
    try {
      // Parse CSV data for keyword search
      const parseResult = await this.csvParser.parseMandiPrices();
      if (!parseResult.success) {
        return [];
      }
      
      const queryTerms = query.toLowerCase().split(/\s+/);
      const results = [];
      
      parseResult.data.forEach((cropPrice, index) => {
        const searchText = this.vectorService.createTextFromCropPrice(cropPrice).toLowerCase();
        
        // Calculate keyword match score
        let matchScore = 0;
        let matchedTerms = 0;
        
        queryTerms.forEach(term => {
          if (searchText.includes(term)) {
            matchedTerms++;
            // Give higher weight to exact matches in crop name
            if (cropPrice.cropName.toLowerCase().includes(term)) {
              matchScore += 2;
            } else {
              matchScore += 1;
            }
          }
        });
        
        if (matchedTerms > 0) {
          const normalizedScore = matchScore / (queryTerms.length * 2); // Normalize to 0-1
          results.push({
            id: `keyword_${index}`,
            similarity: normalizedScore,
            cropPrice: cropPrice,
            text: searchText,
            matchedTerms: matchedTerms,
            searchType: 'keyword'
          });
        }
      });
      
      // Sort by match score and limit results
      results.sort((a, b) => b.similarity - a.similarity);
      return results.slice(0, maxResults);
      
    } catch (error) {
      console.warn('Keyword search failed:', error.message);
      return [];
    }
  }

  /**
   * Combine semantic and keyword search results
   * @param {Array} semanticResults - Results from semantic search
   * @param {Array} keywordResults - Results from keyword search
   * @param {number} semanticWeight - Weight for semantic results
   * @param {number} keywordWeight - Weight for keyword results
   * @returns {Array} Combined and deduplicated results
   */
  combineSearchResults(semanticResults, keywordResults, semanticWeight, keywordWeight) {
    const combinedMap = new Map();
    
    // Add semantic results
    semanticResults.forEach(result => {
      const key = this.generateDocumentKey(result.cropPrice);
      combinedMap.set(key, {
        ...result,
        combinedScore: result.similarity * semanticWeight,
        sources: ['semantic']
      });
    });
    
    // Add keyword results, combining scores if document already exists
    keywordResults.forEach(result => {
      const key = this.generateDocumentKey(result.cropPrice);
      if (combinedMap.has(key)) {
        const existing = combinedMap.get(key);
        existing.combinedScore += result.similarity * keywordWeight;
        existing.sources.push('keyword');
        existing.keywordScore = result.similarity;
      } else {
        combinedMap.set(key, {
          ...result,
          combinedScore: result.similarity * keywordWeight,
          sources: ['keyword'],
          keywordScore: result.similarity
        });
      }
    });
    
    // Convert to array and sort by combined score
    const combinedResults = Array.from(combinedMap.values());
    combinedResults.sort((a, b) => b.combinedScore - a.combinedScore);
    
    return combinedResults;
  }

  /**
   * Generate a unique key for a document based on crop price data
   * @param {Object} cropPrice - Crop price object
   * @returns {string} Unique document key
   */
  generateDocumentKey(cropPrice) {
    return `${cropPrice.cropName}_${cropPrice.variety}_${cropPrice.market}_${cropPrice.quality}`;
  }

  /**
   * Re-rank documents based on query relevance
   * @param {string} query - Original query
   * @param {Array} documents - Documents to re-rank
   * @returns {Promise<Array>} Re-ranked documents
   */
  async rerankDocuments(query, documents) {
    try {
      // Simple re-ranking based on query-document relevance
      const queryTerms = query.toLowerCase().split(/\s+/);
      
      const rerankedDocs = documents.map(doc => {
        let relevanceScore = doc.combinedScore || doc.similarity;
        
        // Boost score based on query term matches in crop name
        queryTerms.forEach(term => {
          if (doc.cropPrice.cropName.toLowerCase().includes(term)) {
            relevanceScore *= 1.2; // 20% boost for crop name matches
          }
          if (doc.cropPrice.market.toLowerCase().includes(term)) {
            relevanceScore *= 1.1; // 10% boost for market matches
          }
        });
        
        // Boost premium quality items slightly
        if (doc.cropPrice.quality === 'premium') {
          relevanceScore *= 1.05;
        }
        
        return {
          ...doc,
          relevanceScore: relevanceScore
        };
      });
      
      // Sort by relevance score
      rerankedDocs.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      return rerankedDocs;
    } catch (error) {
      console.warn('Document re-ranking failed, using original order:', error.message);
      return documents;
    }
  }

  /**
   * Build context string from retrieved documents
   * @param {Array} documents - Retrieved documents
   * @param {string} queryType - Type of query
   * @returns {string} Context string for generation
   */
  buildContext(documents, queryType) {
    if (!documents || documents.length === 0) {
      return 'No relevant market data found.';
    }
    
    let context = 'Agricultural Market Data:\n\n';
    
    documents.forEach((doc, index) => {
      const crop = doc.cropPrice;
      context += `${index + 1}. ${crop.cropName} (${crop.variety})\n`;
      context += `   Price: ₹${crop.price}/kg\n`;
      context += `   Quality: ${crop.quality}\n`;
      context += `   Market: ${crop.market}, ${crop.state}\n`;
      context += `   Source: ${crop.source}\n`;
      context += `   Date: ${crop.date}\n`;
      if (doc.relevanceScore) {
        context += `   Relevance: ${Math.round(doc.relevanceScore * 100)}%\n`;
      }
      context += '\n';
    });
    
    // Add summary statistics if multiple documents
    if (documents.length > 1) {
      const prices = documents.map(doc => doc.cropPrice.price);
      const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      
      context += `Summary Statistics:\n`;
      context += `Average Price: ₹${Math.round(avgPrice * 100) / 100}/kg\n`;
      context += `Price Range: ₹${minPrice} - ₹${maxPrice}/kg\n`;
      context += `Total Records: ${documents.length}\n\n`;
    }
    
    // Truncate context if too long
    if (context.length > this.contextWindowSize) {
      context = context.substring(0, this.contextWindowSize) + '...\n[Context truncated]';
    }
    
    return context;
  }

  /**
   * Generate contextual response using Bedrock
   * @param {string} query - User query
   * @param {string} context - Retrieved context
   * @param {string} queryType - Type of query
   * @param {string} language - Response language
   * @returns {Promise<Object>} Generated response
   */
  async generateContextualResponse(query, context, queryType, language) {
    try {
      // Select appropriate template
      const template = this.contextTemplates[queryType] || this.contextTemplates.price_query;
      
      // Build the prompt
      const prompt = template
        .replace('{context}', context)
        .replace('{query}', query);
      
      // Add language instruction if not English
      let finalPrompt = prompt;
      if (language !== 'en') {
        const languageNames = {
          'hi': 'Hindi',
          'te': 'Telugu',
          'ta': 'Tamil'
        };
        const langName = languageNames[language] || language;
        finalPrompt += `\n\nPlease respond in ${langName} language.`;
      }
      
      // Generate response using Bedrock
      const response = await this.bedrockClient.invokeModel(finalPrompt, {
        maxTokens: 1000,
        temperature: 0.3 // Lower temperature for more factual responses
      });
      
      return {
        success: true,
        response: response.content,
        bedrockUsed: true,
        usage: response.usage,
        duration: response.duration
      };
      
    } catch (error) {
      console.warn('Bedrock generation failed, using fallback response:', error.message);
      
      // Fallback to simple template-based response
      const fallbackResponse = this.generateFallbackResponse(query, context, queryType);
      
      return {
        success: true,
        response: fallbackResponse,
        bedrockUsed: false,
        fallback: true
      };
    }
  }

  /**
   * Generate fallback response when Bedrock is unavailable
   * @param {string} query - User query
   * @param {string} context - Retrieved context
   * @param {string} queryType - Type of query
   * @returns {string} Fallback response
   */
  generateFallbackResponse(query, context, queryType) {
    const lines = context.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      return `I couldn't find specific market data for your query: "${query}". Please try with a different crop name or market location.`;
    }
    
    // Extract basic information from context
    const priceMatches = context.match(/Price: ₹(\d+(?:\.\d+)?)/g);
    const cropMatches = context.match(/\d+\. ([^(]+)/g);
    
    let response = `Based on available market data:\n\n`;
    
    if (cropMatches && priceMatches) {
      cropMatches.forEach((crop, index) => {
        if (priceMatches[index]) {
          const cropName = crop.replace(/^\d+\.\s*/, '').trim();
          const price = priceMatches[index];
          response += `• ${cropName}: ${price}/kg\n`;
        }
      });
    }
    
    // Add summary if multiple prices
    if (priceMatches && priceMatches.length > 1) {
      const prices = priceMatches.map(p => parseFloat(p.match(/₹(\d+(?:\.\d+)?)/)[1]));
      const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      response += `\nAverage price: ₹${Math.round(avgPrice * 100) / 100}/kg\n`;
    }
    
    response += `\nThis information is based on current market data. Prices may vary by quality, location, and market conditions.`;
    
    return response;
  }

  /**
   * Enhance the generated response with additional insights
   * @param {Object} generationResult - Result from response generation
   * @param {Array} documents - Retrieved documents
   * @param {string} query - Original query
   * @returns {Promise<Object>} Enhanced response
   */
  async enhanceResponse(generationResult, documents, query) {
    try {
      let response = generationResult.response;
      
      // Add confidence indicator based on data quality
      const confidence = this.calculateResponseConfidence(documents, query);
      
      // Add data freshness information
      const dataFreshness = this.assessDataFreshness(documents);
      
      // Add related suggestions if available
      const suggestions = await this.generateRelatedSuggestions(documents, query);
      
      return {
        response: response,
        confidence: confidence,
        dataFreshness: dataFreshness,
        suggestions: suggestions,
        bedrockUsed: generationResult.bedrockUsed,
        fallback: generationResult.fallback || false
      };
      
    } catch (error) {
      console.warn('Response enhancement failed:', error.message);
      return {
        response: generationResult.response,
        bedrockUsed: generationResult.bedrockUsed,
        fallback: generationResult.fallback || false
      };
    }
  }

  /**
   * Calculate confidence score for the response
   * @param {Array} documents - Retrieved documents
   * @param {string} query - Original query
   * @returns {Object} Confidence assessment
   */
  calculateResponseConfidence(documents, query) {
    if (!documents || documents.length === 0) {
      return {
        score: 0.1,
        level: 'very_low',
        reason: 'No relevant data found'
      };
    }
    
    let score = 0.5; // Base score
    
    // Boost confidence based on number of documents
    if (documents.length >= 5) {
      score += 0.2;
    } else if (documents.length >= 3) {
      score += 0.1;
    }
    
    // Boost confidence based on relevance scores
    const avgRelevance = documents.reduce((sum, doc) => sum + (doc.relevanceScore || doc.similarity), 0) / documents.length;
    score += avgRelevance * 0.3;
    
    // Boost confidence if query terms match crop names
    const queryTerms = query.toLowerCase().split(/\s+/);
    const cropNameMatches = documents.filter(doc => 
      queryTerms.some(term => doc.cropPrice.cropName.toLowerCase().includes(term))
    ).length;
    
    if (cropNameMatches > 0) {
      score += (cropNameMatches / documents.length) * 0.2;
    }
    
    // Determine confidence level
    let level = 'low';
    if (score >= 0.8) {
      level = 'high';
    } else if (score >= 0.6) {
      level = 'medium';
    } else if (score >= 0.4) {
      level = 'moderate';
    }
    
    return {
      score: Math.min(score, 1.0),
      level: level,
      factors: {
        documentCount: documents.length,
        averageRelevance: avgRelevance,
        cropNameMatches: cropNameMatches
      }
    };
  }

  /**
   * Assess data freshness of retrieved documents
   * @param {Array} documents - Retrieved documents
   * @returns {Object} Data freshness assessment
   */
  assessDataFreshness(documents) {
    if (!documents || documents.length === 0) {
      return {
        status: 'unknown',
        message: 'No data available'
      };
    }
    
    const now = new Date();
    const dates = documents.map(doc => new Date(doc.cropPrice.date));
    const mostRecent = new Date(Math.max(...dates));
    const daysSinceUpdate = Math.floor((now - mostRecent) / (1000 * 60 * 60 * 24));
    
    let status = 'fresh';
    let message = 'Data is current';
    
    if (daysSinceUpdate > 7) {
      status = 'stale';
      message = `Data is ${daysSinceUpdate} days old`;
    } else if (daysSinceUpdate > 3) {
      status = 'moderate';
      message = `Data is ${daysSinceUpdate} days old`;
    }
    
    return {
      status: status,
      message: message,
      daysSinceUpdate: daysSinceUpdate,
      mostRecentDate: mostRecent.toISOString().split('T')[0]
    };
  }

  /**
   * Generate related suggestions based on retrieved documents
   * @param {Array} documents - Retrieved documents
   * @param {string} query - Original query
   * @returns {Promise<Array>} Related suggestions
   */
  async generateRelatedSuggestions(documents, query) {
    try {
      const suggestions = [];
      
      if (!documents || documents.length === 0) {
        return suggestions;
      }
      
      // Suggest similar crops
      const cropNames = [...new Set(documents.map(doc => doc.cropPrice.cropName))];
      if (cropNames.length > 1) {
        suggestions.push(`Compare prices: ${cropNames.slice(0, 3).join(' vs ')}`);
      }
      
      // Suggest different markets
      const markets = [...new Set(documents.map(doc => doc.cropPrice.market))];
      if (markets.length > 1) {
        suggestions.push(`Check prices in: ${markets.slice(0, 2).join(', ')}`);
      }
      
      // Suggest quality variations
      const qualities = [...new Set(documents.map(doc => doc.cropPrice.quality))];
      if (qualities.length > 1) {
        const mainCrop = cropNames[0];
        suggestions.push(`${mainCrop} quality options: ${qualities.join(', ')}`);
      }
      
      return suggestions.slice(0, 3); // Limit to 3 suggestions
      
    } catch (error) {
      console.warn('Failed to generate suggestions:', error.message);
      return [];
    }
  }

  /**
   * Get RAG pipeline statistics and status
   * @returns {Object} Pipeline statistics
   */
  getStatistics() {
    const vectorStats = this.vectorService.getStatistics();
    const bedrockStatus = this.bedrockClient.getStatus();
    
    return {
      isInitialized: this.isInitialized,
      vectorService: vectorStats,
      bedrockClient: {
        modelId: bedrockStatus.modelId,
        region: bedrockStatus.region,
        queueLength: bedrockStatus.queueLength
      },
      configuration: {
        maxRetrievedDocuments: this.maxRetrievedDocuments,
        relevanceThreshold: this.relevanceThreshold,
        contextWindowSize: this.contextWindowSize,
        enableReranking: this.enableReranking,
        queryExpansionEnabled: this.queryExpansionEnabled
      }
    };
  }

  /**
   * Clear the RAG pipeline and reset state
   */
  clear() {
    this.vectorService.clear();
    this.isInitialized = false;
    console.log('RAG pipeline cleared');
  }
}

module.exports = RAGPipelineService;