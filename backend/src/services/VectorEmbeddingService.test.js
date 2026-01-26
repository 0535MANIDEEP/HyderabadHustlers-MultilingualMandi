const VectorEmbeddingService = require('./VectorEmbeddingService');
const BedrockClient = require('./BedrockClient');
const { CropPrice } = require('../models/CropModels');

// Mock BedrockClient
jest.mock('./BedrockClient');

describe('VectorEmbeddingService', () => {
  let vectorService;
  let mockBedrockClient;
  let sampleCropPrices;

  beforeEach(() => {
    mockBedrockClient = {
      invokeModel: jest.fn()
    };
    BedrockClient.mockImplementation(() => mockBedrockClient);
    
    vectorService = new VectorEmbeddingService({
      bedrockClient: mockBedrockClient,
      cacheExpiry: 1000 // 1 second for testing
    });

    // Sample crop price data
    sampleCropPrices = [
      new CropPrice({
        crop_name: 'tomato',
        variety: 'hybrid',
        price_per_kg: 40,
        market: 'Hyderabad',
        state: 'Telangana',
        date: '2024-01-15',
        quality: 'premium',
        source: 'agmarknet'
      }),
      new CropPrice({
        crop_name: 'onion',
        variety: 'red',
        price_per_kg: 30,
        market: 'Hyderabad',
        state: 'Telangana',
        date: '2024-01-15',
        quality: 'standard',
        source: 'agmarknet'
      }),
      new CropPrice({
        crop_name: 'chili',
        variety: 'green',
        price_per_kg: 100,
        market: 'Hyderabad',
        state: 'Telangana',
        date: '2024-01-15',
        quality: 'premium',
        source: 'agmarknet'
      })
    ];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      expect(vectorService).toBeDefined();
      expect(vectorService.vectorStore).toBeInstanceOf(Map);
      expect(vectorService.embeddingCache).toBeInstanceOf(Map);
      expect(vectorService.isInitialized).toBe(false);
    });

    test('should initialize with crop price data', async () => {
      const result = await vectorService.initialize(sampleCropPrices);
      
      expect(result.success).toBe(true);
      expect(result.indexedItems).toBe(3);
      expect(vectorService.isInitialized).toBe(true);
      expect(vectorService.vectorStore.size).toBe(3);
    });

    test('should handle initialization errors gracefully', async () => {
      const invalidCropPrices = [{ invalid: 'data' }];
      const result = await vectorService.initialize(invalidCropPrices);
      
      // The service should still succeed but with 0 indexed items since invalid data is handled gracefully
      expect(result.success).toBe(true);
      expect(result.indexedItems).toBe(1); // It will still index the invalid data with default values
    });
  });

  describe('Text Processing', () => {
    test('should tokenize text correctly', () => {
      const text = 'Premium tomato from Hyderabad market at ₹40 per kg';
      const tokens = vectorService.tokenizeText(text);
      
      expect(tokens).toContain('premium');
      expect(tokens).toContain('tomato');
      expect(tokens).toContain('hyderabad');
      expect(tokens).toContain('market');
      expect(tokens).not.toContain('at'); // stopword should be removed
      // Note: 'per' might be kept if it's considered important for agricultural context
    });

    test('should handle empty or invalid text', () => {
      expect(vectorService.tokenizeText('')).toEqual([]);
      expect(vectorService.tokenizeText(null)).toEqual([]);
      expect(vectorService.tokenizeText(undefined)).toEqual([]);
    });

    test('should create searchable text from crop price', () => {
      const cropPrice = sampleCropPrices[0];
      const text = vectorService.createTextFromCropPrice(cropPrice);
      
      expect(text).toContain('tomato');
      expect(text).toContain('hybrid');
      expect(text).toContain('premium');
      expect(text).toContain('Hyderabad');
      expect(text).toContain('40');
    });
  });

  describe('Embedding Generation', () => {
    test('should generate TF-IDF embedding for text', () => {
      const text = 'premium tomato from hyderabad market';
      const embedding = vectorService.generateTfIdfEmbedding(text);
      
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
      expect(embedding.every(val => typeof val === 'number')).toBe(true);
    });

    test('should generate embedding using local method when Bedrock fails', async () => {
      mockBedrockClient.invokeModel.mockRejectedValue(new Error('Bedrock unavailable'));
      
      const text = 'premium tomato from hyderabad market';
      const embedding = await vectorService.generateEmbedding(text);
      
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
    });

    test('should cache embeddings', async () => {
      const text = 'premium tomato from hyderabad market';
      
      // First call
      const embedding1 = await vectorService.generateEmbedding(text, { useBedrockEmbedding: false });
      
      // Second call should use cache
      const embedding2 = await vectorService.generateEmbedding(text, { useBedrockEmbedding: false });
      
      expect(embedding1).toEqual(embedding2);
    });

    test('should expire cached embeddings', async () => {
      const text = 'premium tomato from hyderabad market';
      
      // Generate embedding
      await vectorService.generateEmbedding(text, { useBedrockEmbedding: false });
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should regenerate embedding
      const embedding = await vectorService.generateEmbedding(text, { useBedrockEmbedding: false });
      expect(Array.isArray(embedding)).toBe(true);
    });
  });

  describe('Bedrock Integration', () => {
    test('should parse embedding from Bedrock response', () => {
      const response = 'Here is the vector: [0.1, 0.2, 0.3, 0.4, 0.5]';
      const embedding = vectorService.parseEmbeddingFromResponse(response);
      
      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    test('should handle malformed Bedrock response', () => {
      const response = 'No valid vector in this response';
      
      expect(() => {
        vectorService.parseEmbeddingFromResponse(response);
      }).toThrow('No valid embedding found in response');
    });

    test('should generate Bedrock embedding successfully', async () => {
      const mockResponse = {
        content: 'Vector representation: [0.1, 0.2, 0.3, 0.4, 0.5]'
      };
      mockBedrockClient.invokeModel.mockResolvedValue(mockResponse);
      
      const text = 'premium tomato from hyderabad market';
      const embedding = await vectorService.generateBedrockEmbedding(text);
      
      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
      expect(mockBedrockClient.invokeModel).toHaveBeenCalledWith(
        expect.stringContaining(text),
        expect.objectContaining({
          maxTokens: 2000,
          temperature: 0.1
        })
      );
    });
  });

  describe('Vector Store Operations', () => {
    beforeEach(async () => {
      await vectorService.initialize(sampleCropPrices);
    });

    test('should index crop price successfully', async () => {
      const newCropPrice = new CropPrice({
        crop_name: 'potato',
        variety: 'local',
        price_per_kg: 25,
        market: 'Mumbai',
        state: 'Maharashtra',
        date: '2024-01-16',
        quality: 'standard',
        source: 'manual'
      });

      const indexId = await vectorService.indexCropPrice(newCropPrice);
      
      expect(indexId).toBeDefined();
      expect(vectorService.vectorStore.has(indexId)).toBe(true);
      
      const indexed = vectorService.vectorStore.get(indexId);
      expect(indexed.cropPrice).toEqual(newCropPrice);
      expect(indexed.embedding).toBeDefined();
      expect(indexed.text).toContain('potato');
    });

    test('should generate unique index IDs', () => {
      const cropPrice1 = sampleCropPrices[0];
      const cropPrice2 = { ...sampleCropPrices[0], variety: 'different' };
      
      const id1 = vectorService.generateIndexId(cropPrice1);
      const id2 = vectorService.generateIndexId(cropPrice2);
      
      expect(id1).not.toEqual(id2);
      expect(id1).toContain('tomato');
      expect(id1).toContain('hybrid');
      expect(id2).toContain('different');
    });
  });

  describe('Semantic Search', () => {
    beforeEach(async () => {
      await vectorService.initialize(sampleCropPrices);
    });

    test('should perform semantic search successfully', async () => {
      const query = 'premium tomato hyderabad';
      const result = await vectorService.semanticSearch(query);
      
      expect(result.success).toBe(true);
      expect(result.query).toBe(query);
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results.length).toBeGreaterThan(0);
      
      // Results should be sorted by similarity
      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i-1].similarity).toBeGreaterThanOrEqual(result.results[i].similarity);
      }
    });

    test('should apply filters in semantic search', async () => {
      const query = 'vegetable crop';
      const filters = { quality: 'premium' };
      const result = await vectorService.semanticSearch(query, { filters });
      
      expect(result.success).toBe(true);
      result.results.forEach(item => {
        expect(item.cropPrice.quality).toBe('premium');
      });
    });

    test('should limit search results', async () => {
      const query = 'crop';
      const result = await vectorService.semanticSearch(query, { limit: 2 });
      
      expect(result.success).toBe(true);
      expect(result.results.length).toBeLessThanOrEqual(2);
    });

    test('should apply similarity threshold', async () => {
      const query = 'completely unrelated query about cars';
      const result = await vectorService.semanticSearch(query, { threshold: 0.8 });
      
      expect(result.success).toBe(true);
      result.results.forEach(item => {
        expect(item.similarity).toBeGreaterThanOrEqual(0.8);
      });
    });

    test('should handle search errors gracefully', async () => {
      // Mock an error in embedding generation
      jest.spyOn(vectorService, 'generateEmbedding').mockRejectedValue(new Error('Embedding error'));
      
      const result = await vectorService.semanticSearch('test query');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.results).toEqual([]);
    });
  });

  describe('Similarity Calculation', () => {
    test('should calculate cosine similarity correctly', () => {
      const vectorA = [1, 0, 0];
      const vectorB = [0, 1, 0];
      const vectorC = [1, 0, 0];
      
      expect(vectorService.calculateCosineSimilarity(vectorA, vectorB)).toBe(0);
      expect(vectorService.calculateCosineSimilarity(vectorA, vectorC)).toBe(1);
    });

    test('should handle edge cases in similarity calculation', () => {
      const zeroVector = [0, 0, 0];
      const normalVector = [1, 2, 3];
      
      expect(vectorService.calculateCosineSimilarity(zeroVector, normalVector)).toBe(0);
      expect(vectorService.calculateCosineSimilarity([], [])).toBe(0);
      expect(vectorService.calculateCosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });
  });

  describe('Filter Matching', () => {
    test('should match filters correctly', () => {
      const cropPrice = sampleCropPrices[0]; // tomato, premium, Hyderabad
      
      expect(vectorService.matchesFilters(cropPrice, {})).toBe(true);
      expect(vectorService.matchesFilters(cropPrice, { cropName: 'tomato' })).toBe(true);
      expect(vectorService.matchesFilters(cropPrice, { cropName: 'onion' })).toBe(false);
      expect(vectorService.matchesFilters(cropPrice, { quality: 'premium' })).toBe(true);
      expect(vectorService.matchesFilters(cropPrice, { quality: 'standard' })).toBe(false);
      expect(vectorService.matchesFilters(cropPrice, { market: 'hyderabad' })).toBe(true);
      expect(vectorService.matchesFilters(cropPrice, { priceRange: { min: 30, max: 50 } })).toBe(true);
      expect(vectorService.matchesFilters(cropPrice, { priceRange: { min: 50 } })).toBe(false);
    });
  });

  describe('Specialized Search Methods', () => {
    beforeEach(async () => {
      await vectorService.initialize(sampleCropPrices);
    });

    test('should find similar crops', async () => {
      const result = await vectorService.findSimilarCrops('tomato');
      
      expect(result.success).toBe(true);
      expect(result.results.length).toBeGreaterThan(0);
      
      // Should find the tomato entry
      const tomatoResult = result.results.find(r => r.cropPrice.cropName === 'tomato');
      expect(tomatoResult).toBeDefined();
    });

    test('should get price context', async () => {
      const result = await vectorService.getPriceContext('tomato', 'high demand');
      
      expect(result.success).toBe(true);
      expect(result.results.length).toBeLessThanOrEqual(5); // Default limit
    });
  });

  describe('Statistics and Management', () => {
    beforeEach(async () => {
      await vectorService.initialize(sampleCropPrices);
    });

    test('should provide accurate statistics', () => {
      const stats = vectorService.getStatistics();
      
      expect(stats.totalIndexedItems).toBe(3);
      expect(stats.uniqueCrops).toBe(3);
      expect(stats.uniqueMarkets).toBe(1); // All from Hyderabad
      expect(stats.uniqueQualities).toBe(2); // premium and standard
      expect(stats.isInitialized).toBe(true);
      expect(Array.isArray(stats.cropTypes)).toBe(true);
      expect(stats.cropTypes).toContain('tomato');
      expect(stats.cropTypes).toContain('onion');
      expect(stats.cropTypes).toContain('chili');
    });

    test('should clear vector store and cache', () => {
      vectorService.clear();
      
      expect(vectorService.vectorStore.size).toBe(0);
      expect(vectorService.embeddingCache.size).toBe(0);
      expect(vectorService.vocabulary.size).toBe(0);
      expect(vectorService.isInitialized).toBe(false);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty vector store in search', async () => {
      const emptyService = new VectorEmbeddingService();
      const result = await emptyService.semanticSearch('test query');
      
      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
      expect(result.totalMatches).toBe(0);
    });

    test('should handle invalid crop price data', async () => {
      const invalidCropPrice = { invalid: 'data' };
      
      // The service handles invalid data gracefully by using default values
      const indexId = await vectorService.indexCropPrice(invalidCropPrice);
      expect(typeof indexId).toBe('string');
      expect(indexId.length).toBeGreaterThan(0);
    });

    test('should handle missing agricultural terms gracefully', () => {
      const nonAgriculturalText = 'computer software programming';
      const tokens = vectorService.tokenizeText(nonAgriculturalText);
      
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBeGreaterThan(0);
    });
  });
});