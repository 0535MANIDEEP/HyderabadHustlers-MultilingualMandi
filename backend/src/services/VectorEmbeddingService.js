const natural = require('natural');
const stopword = require('stopword');
const { Matrix } = require('ml-matrix');
const BedrockClient = require('./BedrockClient');

/**
 * Vector Embedding Service
 * Implements text embedding generation for crop descriptions and price contexts
 * Sets up in-memory vector store for MVP and provides semantic search functionality
 * Validates Requirement 6.3
 */
class VectorEmbeddingService {
  constructor(options = {}) {
    this.bedrockClient = options.bedrockClient || new BedrockClient();
    this.vectorStore = new Map(); // In-memory vector store for MVP
    this.embeddingCache = new Map(); // Cache for embeddings
    this.cacheExpiry = options.cacheExpiry || 24 * 60 * 60 * 1000; // 24 hours
    
    // TF-IDF vectorizer for local embeddings as fallback
    this.tfidf = new natural.TfIdf();
    this.vocabulary = new Set();
    this.isInitialized = false;
    
    // Agricultural terminology dictionary for enhanced processing
    this.agriculturalTerms = new Set([
      'tomato', 'onion', 'chili', 'potato', 'rice', 'wheat', 'corn', 'maize',
      'premium', 'standard', 'low', 'quality', 'grade', 'fresh', 'organic',
      'mandi', 'market', 'price', 'rate', 'cost', 'wholesale', 'retail',
      'kg', 'quintal', 'ton', 'kilogram', 'weight', 'quantity',
      'hyderabad', 'mumbai', 'delhi', 'bangalore', 'chennai', 'kolkata',
      'telangana', 'maharashtra', 'karnataka', 'tamil nadu', 'west bengal'
    ]);
    
    console.log('VectorEmbeddingService initialized');
  }

  /**
   * Initialize the vector embedding service with existing data
   * @param {Array<Object>} cropPrices - Array of crop price objects to index
   * @returns {Promise<Object>} Initialization result
   */
  async initialize(cropPrices = []) {
    try {
      console.log('Initializing VectorEmbeddingService with', cropPrices.length, 'crop prices');
      
      // Build vocabulary and TF-IDF index from existing data
      await this.buildVocabulary(cropPrices);
      
      // Generate embeddings for existing crop data
      for (const cropPrice of cropPrices) {
        await this.indexCropPrice(cropPrice);
      }
      
      this.isInitialized = true;
      
      return {
        success: true,
        message: 'VectorEmbeddingService initialized successfully',
        indexedItems: this.vectorStore.size,
        vocabularySize: this.vocabulary.size
      };
    } catch (error) {
      console.error('Error initializing VectorEmbeddingService:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build vocabulary from crop price data
   * @param {Array<Object>} cropPrices - Array of crop price objects
   */
  async buildVocabulary(cropPrices) {
    for (const cropPrice of cropPrices) {
      const text = this.createTextFromCropPrice(cropPrice);
      const tokens = this.tokenizeText(text);
      
      tokens.forEach(token => this.vocabulary.add(token));
      // Add tokens to TF-IDF for document tracking (simplified)
      this.tfidf.addDocument(tokens.join(' '));
    }
    
    console.log('Built vocabulary with', this.vocabulary.size, 'unique terms');
  }

  /**
   * Generate embedding for text using AWS Bedrock or local TF-IDF
   * @param {string} text - Text to generate embedding for
   * @param {Object} options - Generation options
   * @returns {Promise<Array<number>>} Vector embedding
   */
  async generateEmbedding(text, options = {}) {
    try {
      const cacheKey = this.getCacheKey(text);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      let embedding;
      
      // Try AWS Bedrock first for high-quality embeddings
      if (options.useBedrockEmbedding !== false) {
        try {
          embedding = await this.generateBedrockEmbedding(text);
        } catch (error) {
          console.warn('Bedrock embedding failed, falling back to local TF-IDF:', error.message);
          embedding = this.generateTfIdfEmbedding(text);
        }
      } else {
        embedding = this.generateTfIdfEmbedding(text);
      }
      
      this.setCache(cacheKey, embedding);
      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embedding using AWS Bedrock
   * @param {string} text - Text to generate embedding for
   * @returns {Promise<Array<number>>} Vector embedding
   */
  async generateBedrockEmbedding(text) {
    const prompt = `Generate a numerical vector representation for the following agricultural text. 
    Focus on semantic meaning related to crops, prices, markets, and quality.
    Text: "${text}"
    
    Please provide a dense vector representation as a JSON array of 384 floating-point numbers between -1 and 1.
    The vector should capture the semantic meaning of agricultural terms, crop types, quality indicators, and market context.`;

    const response = await this.bedrockClient.invokeModel(prompt, {
      maxTokens: 2000,
      temperature: 0.1 // Low temperature for consistent embeddings
    });

    // Parse the response to extract the vector
    const embedding = this.parseEmbeddingFromResponse(response.content);
    
    if (!embedding || embedding.length === 0) {
      throw new Error('Failed to parse embedding from Bedrock response');
    }
    
    return embedding;
  }

  /**
   * Parse embedding vector from Bedrock response
   * @param {string} response - Bedrock response content
   * @returns {Array<number>} Parsed embedding vector
   */
  parseEmbeddingFromResponse(response) {
    try {
      // Look for JSON array in the response
      const jsonMatch = response.match(/\[[\d\s,.-]+\]/);
      if (jsonMatch) {
        const embedding = JSON.parse(jsonMatch[0]);
        if (Array.isArray(embedding) && embedding.length > 0) {
          return embedding.map(val => parseFloat(val));
        }
      }
      
      // Fallback: extract numbers from response
      const numbers = response.match(/-?\d+\.?\d*/g);
      if (numbers && numbers.length >= 100) {
        return numbers.slice(0, 384).map(val => parseFloat(val));
      }
      
      throw new Error('No valid embedding found in response');
    } catch (error) {
      console.error('Error parsing embedding from response:', error);
      throw error;
    }
  }

  /**
   * Generate embedding using local TF-IDF
   * @param {string} text - Text to generate embedding for
   * @returns {Array<number>} TF-IDF vector embedding
   */
  generateTfIdfEmbedding(text) {
    const tokens = this.tokenizeText(text);
    const vocabularyArray = Array.from(this.vocabulary);
    const embedding = new Array(Math.max(vocabularyArray.length, 100)).fill(0);
    
    if (tokens.length === 0 || vocabularyArray.length === 0) {
      return embedding;
    }
    
    // Create TF-IDF vector
    const termFreq = {};
    tokens.forEach(token => {
      termFreq[token] = (termFreq[token] || 0) + 1;
    });
    
    vocabularyArray.forEach((term, index) => {
      if (termFreq[term]) {
        const tf = termFreq[term] / tokens.length;
        // Simple IDF calculation - use vocabulary size as document count
        const idf = Math.log(vocabularyArray.length / (this.getTermFrequency(term) + 1));
        embedding[index] = tf * idf;
      }
    });
    
    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return embedding.map(val => val / magnitude);
    }
    
    return embedding;
  }

  /**
   * Get term frequency in vocabulary (simplified)
   * @param {string} term - Term to check
   * @returns {number} Term frequency
   */
  getTermFrequency(term) {
    // Simple frequency based on vocabulary presence
    return this.vocabulary.has(term) ? 1 : 0;
  }

  /**
   * Tokenize and preprocess text for embedding generation
   * @param {string} text - Text to tokenize
   * @returns {Array<string>} Processed tokens
   */
  tokenizeText(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }
    
    // Convert to lowercase and remove special characters
    let processed = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Tokenize
    let tokens = new natural.WordTokenizer().tokenize(processed) || [];
    
    // Remove stopwords but keep agricultural terms
    tokens = stopword.removeStopwords(tokens, stopword.en).filter(token => 
      token.length > 1 && (this.agriculturalTerms.has(token) || token.length > 2)
    );
    
    // Add back important agricultural terms that might have been removed
    const originalTokens = new natural.WordTokenizer().tokenize(processed) || [];
    originalTokens.forEach(token => {
      const lowerToken = token.toLowerCase();
      if (this.agriculturalTerms.has(lowerToken) && !tokens.includes(lowerToken)) {
        tokens.push(lowerToken);
      }
    });
    
    // Apply stemming
    tokens = tokens.map(token => natural.PorterStemmer.stem(token));
    
    return tokens;
  }

  /**
   * Create searchable text from crop price object
   * @param {Object} cropPrice - Crop price object
   * @returns {string} Searchable text representation
   */
  createTextFromCropPrice(cropPrice) {
    const parts = [
      cropPrice.cropName || '',
      cropPrice.variety || '',
      cropPrice.quality || '',
      cropPrice.market || '',
      cropPrice.state || '',
      cropPrice.source || '',
      `price ${cropPrice.price || 0} rupees per kg`,
      `${cropPrice.quality || 'standard'} quality`,
      `${cropPrice.market || 'unknown'} market`,
      `${cropPrice.state || 'unknown'} state`
    ];
    
    return parts.filter(part => part && part.trim()).join(' ');
  }

  /**
   * Index a crop price object in the vector store
   * @param {Object} cropPrice - Crop price object to index
   * @returns {Promise<string>} Index ID
   */
  async indexCropPrice(cropPrice) {
    try {
      const text = this.createTextFromCropPrice(cropPrice);
      const embedding = await this.generateEmbedding(text, { useBedrockEmbedding: false });
      
      const indexId = this.generateIndexId(cropPrice);
      
      this.vectorStore.set(indexId, {
        id: indexId,
        embedding,
        cropPrice,
        text,
        indexedAt: new Date()
      });
      
      return indexId;
    } catch (error) {
      console.error('Error indexing crop price:', error);
      throw error;
    }
  }

  /**
   * Generate unique index ID for crop price
   * @param {Object} cropPrice - Crop price object
   * @returns {string} Unique index ID
   */
  generateIndexId(cropPrice) {
    const parts = [
      cropPrice.cropName || 'unknown',
      cropPrice.variety || 'default',
      cropPrice.market || 'unknown',
      cropPrice.quality || 'standard',
      (cropPrice.date || new Date()).toISOString().split('T')[0]
    ];
    
    return parts.join('_').toLowerCase().replace(/[^\w]/g, '_');
  }

  /**
   * Perform semantic search for similar crop prices
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array<Object>>} Search results with similarity scores
   */
  async semanticSearch(query, options = {}) {
    try {
      const {
        limit = 10,
        threshold = 0.1,
        includeEmbeddings = false,
        filters = {}
      } = options;
      
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query, { useBedrockEmbedding: false });
      
      // Calculate similarities with all indexed items
      const similarities = [];
      
      for (const [id, item] of this.vectorStore.entries()) {
        // Apply filters if specified
        if (!this.matchesFilters(item.cropPrice, filters)) {
          continue;
        }
        
        const similarity = this.calculateCosineSimilarity(queryEmbedding, item.embedding);
        
        if (similarity >= threshold) {
          similarities.push({
            id,
            similarity,
            cropPrice: item.cropPrice,
            text: item.text,
            indexedAt: item.indexedAt,
            ...(includeEmbeddings && { embedding: item.embedding })
          });
        }
      }
      
      // Sort by similarity (descending) and limit results
      similarities.sort((a, b) => b.similarity - a.similarity);
      const results = similarities.slice(0, limit);
      
      return {
        success: true,
        query,
        results,
        totalMatches: similarities.length,
        searchTime: Date.now()
      };
    } catch (error) {
      console.error('Error performing semantic search:', error);
      return {
        success: false,
        error: error.message,
        query,
        results: []
      };
    }
  }

  /**
   * Check if crop price matches the specified filters
   * @param {Object} cropPrice - Crop price object
   * @param {Object} filters - Filter criteria
   * @returns {boolean} Whether the crop price matches filters
   */
  matchesFilters(cropPrice, filters) {
    if (filters.cropName && !cropPrice.cropName.toLowerCase().includes(filters.cropName.toLowerCase())) {
      return false;
    }
    
    if (filters.market && !cropPrice.market.toLowerCase().includes(filters.market.toLowerCase())) {
      return false;
    }
    
    if (filters.state && !cropPrice.state.toLowerCase().includes(filters.state.toLowerCase())) {
      return false;
    }
    
    if (filters.quality && cropPrice.quality !== filters.quality) {
      return false;
    }
    
    if (filters.priceRange) {
      if (filters.priceRange.min && cropPrice.price < filters.priceRange.min) {
        return false;
      }
      if (filters.priceRange.max && cropPrice.price > filters.priceRange.max) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param {Array<number>} vectorA - First vector
   * @param {Array<number>} vectorB - Second vector
   * @returns {number} Cosine similarity score (0-1)
   */
  calculateCosineSimilarity(vectorA, vectorB) {
    if (!vectorA || !vectorB || vectorA.length !== vectorB.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      magnitudeA += vectorA[i] * vectorA[i];
      magnitudeB += vectorB[i] * vectorB[i];
    }
    
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }
    
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Find similar crops based on semantic similarity
   * @param {string} cropName - Name of the crop to find similar crops for
   * @param {Object} options - Search options
   * @returns {Promise<Array<Object>>} Similar crops with similarity scores
   */
  async findSimilarCrops(cropName, options = {}) {
    const query = `${cropName} crop agricultural produce`;
    return await this.semanticSearch(query, {
      ...options,
      filters: { ...options.filters }
    });
  }

  /**
   * Get price context for a specific crop and market condition
   * @param {string} cropName - Name of the crop
   * @param {string} context - Market context (e.g., "high demand", "oversupply")
   * @param {Object} options - Search options
   * @returns {Promise<Array<Object>>} Contextual price information
   */
  async getPriceContext(cropName, context, options = {}) {
    const query = `${cropName} ${context} market price agricultural`;
    return await this.semanticSearch(query, {
      ...options,
      limit: options.limit || 5
    });
  }

  /**
   * Get vector store statistics
   * @returns {Object} Statistics about the vector store
   */
  getStatistics() {
    const embeddings = Array.from(this.vectorStore.values());
    const cropTypes = new Set(embeddings.map(item => item.cropPrice.cropName));
    const markets = new Set(embeddings.map(item => item.cropPrice.market));
    const qualities = new Set(embeddings.map(item => item.cropPrice.quality));
    
    return {
      totalIndexedItems: this.vectorStore.size,
      uniqueCrops: cropTypes.size,
      uniqueMarkets: markets.size,
      uniqueQualities: qualities.size,
      vocabularySize: this.vocabulary.size,
      cacheSize: this.embeddingCache.size,
      isInitialized: this.isInitialized,
      cropTypes: Array.from(cropTypes),
      markets: Array.from(markets),
      qualities: Array.from(qualities)
    };
  }

  /**
   * Clear the vector store and cache
   */
  clear() {
    this.vectorStore.clear();
    this.embeddingCache.clear();
    this.vocabulary.clear();
    this.tfidf = new natural.TfIdf();
    this.isInitialized = false;
    console.log('VectorEmbeddingService cleared');
  }

  // Cache management methods
  getCacheKey(text) {
    return `embedding_${Buffer.from(text).toString('base64').slice(0, 32)}`;
  }

  getFromCache(key) {
    const cached = this.embeddingCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.embedding;
    }
    return null;
  }

  setCache(key, embedding) {
    this.embeddingCache.set(key, {
      embedding,
      timestamp: Date.now()
    });
  }
}

module.exports = VectorEmbeddingService;