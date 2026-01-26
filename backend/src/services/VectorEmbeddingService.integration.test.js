const VectorEmbeddingService = require('./VectorEmbeddingService');
const PriceService = require('./PriceService');
const CsvParserService = require('./CsvParserService');

describe('VectorEmbeddingService Integration', () => {
  let vectorService;
  let priceService;
  let csvParser;

  beforeAll(async () => {
    csvParser = new CsvParserService();
    priceService = new PriceService();
    vectorService = new VectorEmbeddingService();
  });

  afterEach(() => {
    vectorService.clear();
  });

  describe('Integration with PriceService', () => {
    test('should initialize with real CSV data and perform semantic search', async () => {
      // Parse real CSV data
      const parseResult = await csvParser.parseMandiPrices();
      expect(parseResult.success).toBe(true);
      expect(parseResult.data.length).toBeGreaterThan(0);

      // Initialize vector service with real data
      const initResult = await vectorService.initialize(parseResult.data);
      expect(initResult.success).toBe(true);
      expect(initResult.indexedItems).toBe(parseResult.data.length);

      // Perform semantic search for tomato
      const searchResult = await vectorService.semanticSearch('premium tomato hyderabad market');
      expect(searchResult.success).toBe(true);
      expect(searchResult.results.length).toBeGreaterThan(0);

      // Verify that tomato results are found
      const tomatoResults = searchResult.results.filter(r => 
        r.cropPrice.cropName.toLowerCase().includes('tomato')
      );
      expect(tomatoResults.length).toBeGreaterThan(0);
    });

    test('should find similar crops using semantic search', async () => {
      // Parse real CSV data
      const parseResult = await csvParser.parseMandiPrices();
      await vectorService.initialize(parseResult.data);

      // Find similar crops to onion
      const similarCrops = await vectorService.findSimilarCrops('onion', { limit: 3 });
      expect(similarCrops.success).toBe(true);
      expect(similarCrops.results.length).toBeGreaterThan(0);

      // Should find onion in the results
      const onionResult = similarCrops.results.find(r => 
        r.cropPrice.cropName.toLowerCase().includes('onion')
      );
      expect(onionResult).toBeDefined();
      expect(onionResult.similarity).toBeGreaterThan(0);
    });

    test('should provide price context for market conditions', async () => {
      // Parse real CSV data
      const parseResult = await csvParser.parseMandiPrices();
      await vectorService.initialize(parseResult.data);

      // Get price context for high demand scenario
      const priceContext = await vectorService.getPriceContext('chili', 'high demand premium quality');
      expect(priceContext.success).toBe(true);
      expect(priceContext.results.length).toBeGreaterThan(0);

      // Results should be relevant to the query
      priceContext.results.forEach(result => {
        expect(result.similarity).toBeGreaterThan(0);
        expect(result.cropPrice).toBeDefined();
      });
    });

    test('should filter search results by quality and market', async () => {
      // Parse real CSV data
      const parseResult = await csvParser.parseMandiPrices();
      await vectorService.initialize(parseResult.data);

      // Search with filters
      const filteredSearch = await vectorService.semanticSearch('vegetable crop', {
        filters: {
          market: 'Hyderabad',
          quality: 'premium'
        },
        limit: 5
      });

      expect(filteredSearch.success).toBe(true);
      
      // All results should match the filters
      filteredSearch.results.forEach(result => {
        expect(result.cropPrice.market.toLowerCase()).toContain('hyderabad');
        expect(result.cropPrice.quality).toBe('premium');
      });
    });

    test('should provide accurate statistics about indexed data', async () => {
      // Parse real CSV data
      const parseResult = await csvParser.parseMandiPrices();
      await vectorService.initialize(parseResult.data);

      const stats = vectorService.getStatistics();
      
      expect(stats.totalIndexedItems).toBe(parseResult.data.length);
      expect(stats.isInitialized).toBe(true);
      expect(stats.vocabularySize).toBeGreaterThan(0);
      expect(Array.isArray(stats.cropTypes)).toBe(true);
      expect(Array.isArray(stats.markets)).toBe(true);
      expect(Array.isArray(stats.qualities)).toBe(true);

      // Should have the expected crop types from CSV
      expect(stats.cropTypes).toContain('tomato');
      expect(stats.cropTypes).toContain('onion');
      expect(stats.cropTypes).toContain('chili');
    });

    test('should handle empty search results gracefully', async () => {
      // Parse real CSV data
      const parseResult = await csvParser.parseMandiPrices();
      await vectorService.initialize(parseResult.data);

      // Search for something that doesn't exist
      const searchResult = await vectorService.semanticSearch('nonexistent crop xyz', {
        threshold: 0.9 // High threshold to ensure no matches
      });

      expect(searchResult.success).toBe(true);
      expect(searchResult.results).toEqual([]);
      expect(searchResult.totalMatches).toBe(0);
    });

    test('should maintain performance with multiple searches', async () => {
      // Parse real CSV data
      const parseResult = await csvParser.parseMandiPrices();
      await vectorService.initialize(parseResult.data);

      const queries = [
        'premium tomato',
        'standard onion',
        'chili pepper',
        'hyderabad market',
        'telangana state'
      ];

      const startTime = Date.now();
      
      // Perform multiple searches
      const searchPromises = queries.map(query => 
        vectorService.semanticSearch(query, { limit: 3 })
      );
      
      const results = await Promise.all(searchPromises);
      const endTime = Date.now();
      
      // All searches should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Should complete reasonably quickly (less than 1 second for all searches)
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(1000);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle corrupted CSV data gracefully', async () => {
      // Create a service with minimal data
      const minimalData = [{
        cropName: 'test',
        variety: 'test',
        price: 10,
        market: 'test',
        state: 'test',
        date: new Date(),
        quality: 'standard',
        source: 'test'
      }];

      const initResult = await vectorService.initialize(minimalData);
      expect(initResult.success).toBe(true);

      const searchResult = await vectorService.semanticSearch('test crop');
      expect(searchResult.success).toBe(true);
    });

    test('should handle very large similarity threshold', async () => {
      const parseResult = await csvParser.parseMandiPrices();
      await vectorService.initialize(parseResult.data);

      const searchResult = await vectorService.semanticSearch('tomato', {
        threshold: 0.99 // Very high threshold
      });

      expect(searchResult.success).toBe(true);
      // May or may not have results, but should not error
    });

    test('should handle special characters in search queries', async () => {
      const parseResult = await csvParser.parseMandiPrices();
      await vectorService.initialize(parseResult.data);

      const searchResult = await vectorService.semanticSearch('tomato @ ₹40/kg #premium');
      expect(searchResult.success).toBe(true);
      // Should handle special characters gracefully
    });
  });
});