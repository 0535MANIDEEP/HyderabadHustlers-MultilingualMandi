const RAGPipelineService = require('./RAGPipelineService');
const path = require('path');
const fs = require('fs');

describe('RAGPipelineService Integration Tests', () => {
  let ragService;
  const testCsvPath = path.join(__dirname, '../../data/mandi_prices.csv');

  beforeAll(() => {
    // Verify test CSV file exists
    if (!fs.existsSync(testCsvPath)) {
      throw new Error(`Test CSV file not found at ${testCsvPath}`);
    }
  });

  beforeEach(() => {
    ragService = new RAGPipelineService({
      maxRetrievedDocuments: 5,
      relevanceThreshold: 0.2,
      enableReranking: true
    });
  });

  afterEach(() => {
    if (ragService) {
      ragService.clear();
    }
  });

  describe('Full Pipeline Integration', () => {
    test('should initialize and process queries end-to-end', async () => {
      // Initialize the RAG pipeline
      const initResult = await ragService.initialize();
      
      expect(initResult.success).toBe(true);
      expect(initResult.statistics.cropRecords).toBeGreaterThan(0);
      expect(ragService.isInitialized).toBe(true);

      // Test basic price query
      const priceQuery = 'What is the price of tomato?';
      const priceResult = await ragService.processQuery(priceQuery);

      expect(priceResult.success).toBe(true);
      expect(priceResult.query).toBe(priceQuery);
      expect(priceResult.queryType).toBe('price_query');
      expect(priceResult.retrievedDocuments).toBeGreaterThan(0);
      expect(priceResult.response).toBeTruthy();
      expect(priceResult.relevanceScores).toBeDefined();
      expect(priceResult.metadata).toBeDefined();

      // Verify response contains relevant information
      expect(priceResult.response.toLowerCase()).toContain('tomato');
      
      console.log('Price Query Result:', {
        query: priceResult.query,
        retrievedDocs: priceResult.retrievedDocuments,
        responseLength: priceResult.response.length,
        confidence: priceResult.metadata
      });
    }, 30000); // 30 second timeout for integration test

    test('should handle comparison queries effectively', async () => {
      await ragService.initialize();

      const comparisonQuery = 'Compare tomato and onion prices';
      const result = await ragService.processQuery(comparisonQuery, {
        queryType: 'comparison_query'
      });

      expect(result.success).toBe(true);
      expect(result.queryType).toBe('comparison_query');
      expect(result.retrievedDocuments).toBeGreaterThan(0);
      
      // Should retrieve documents for both crops
      const relevantCrops = result.relevanceScores.filter(score => score.relevanceScore > 0.3);
      expect(relevantCrops.length).toBeGreaterThan(0);

      console.log('Comparison Query Result:', {
        query: result.query,
        retrievedDocs: result.retrievedDocuments,
        topRelevanceScore: Math.max(...result.relevanceScores.map(s => s.relevanceScore))
      });
    }, 30000);

    test('should provide market analysis for complex queries', async () => {
      await ragService.initialize();

      const analysisQuery = 'Analyze the market conditions for vegetables in Hyderabad';
      const result = await ragService.processQuery(analysisQuery, {
        queryType: 'market_analysis'
      });

      expect(result.success).toBe(true);
      expect(result.queryType).toBe('market_analysis');
      expect(result.retrievedDocuments).toBeGreaterThan(0);

      // Should include context about multiple vegetables
      expect(result.context).toContain('Agricultural Market Data');
      expect(result.context).toContain('Hyderabad');

      console.log('Market Analysis Result:', {
        query: result.query,
        retrievedDocs: result.retrievedDocuments,
        contextLength: result.context ? result.context.length : 0
      });
    }, 30000);

    test('should handle queries for non-existent crops gracefully', async () => {
      await ragService.initialize();

      const nonExistentQuery = 'What is the price of dragon fruit?';
      const result = await ragService.processQuery(nonExistentQuery);

      expect(result.success).toBe(true);
      // Should still provide a response, even if no exact matches
      expect(result.response).toBeTruthy();
      
      // May have low confidence or suggest alternatives
      if (result.retrievedDocuments === 0) {
        expect(result.response).toContain('No relevant market data found');
      }

      console.log('Non-existent Crop Query Result:', {
        query: result.query,
        retrievedDocs: result.retrievedDocuments,
        hasResponse: !!result.response
      });
    }, 30000);

    test('should provide multilingual responses when requested', async () => {
      await ragService.initialize();

      const hindiQuery = 'टमाटर की कीमत क्या है?';
      const result = await ragService.processQuery(hindiQuery, {
        language: 'hi'
      });

      expect(result.success).toBe(true);
      expect(result.metadata.language).toBe('hi');
      expect(result.response).toBeTruthy();

      console.log('Multilingual Query Result:', {
        query: result.query,
        language: result.metadata.language,
        responseLength: result.response.length
      });
    }, 30000);
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple concurrent queries', async () => {
      await ragService.initialize();

      const queries = [
        'tomato price',
        'onion market analysis',
        'compare chili and potato',
        'vegetable prices in Hyderabad',
        'premium quality crops'
      ];

      const startTime = Date.now();
      const results = await Promise.all(
        queries.map(query => ragService.processQuery(query))
      );
      const totalTime = Date.now() - startTime;

      // All queries should succeed
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.query).toBe(queries[index]);
      });

      console.log('Concurrent Queries Performance:', {
        totalQueries: queries.length,
        totalTime: totalTime,
        averageTime: totalTime / queries.length,
        allSuccessful: results.every(r => r.success)
      });

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(60000); // 60 seconds for 5 queries
    }, 60000);

    test('should maintain performance with query expansion and reranking', async () => {
      await ragService.initialize();

      const complexQuery = 'best quality vegetables with competitive prices for restaurant business';
      
      const startTime = Date.now();
      const result = await ragService.processQuery(complexQuery, {
        maxResults: 10,
        enableReranking: true
      });
      const processingTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.retrievedDocuments).toBeGreaterThan(0);
      expect(result.expandedQuery).toBeDefined();
      expect(result.expandedQuery).not.toBe(complexQuery); // Should be expanded

      console.log('Complex Query Performance:', {
        originalQuery: complexQuery,
        expandedQuery: result.expandedQuery,
        processingTime: processingTime,
        retrievedDocs: result.retrievedDocuments
      });

      // Should complete within reasonable time even with complex processing
      expect(processingTime).toBeLessThan(30000); // 30 seconds
    }, 30000);
  });

  describe('Data Quality and Accuracy', () => {
    test('should provide accurate price information for known crops', async () => {
      await ragService.initialize();

      const tomatoQuery = 'tomato price in Hyderabad';
      const result = await ragService.processQuery(tomatoQuery);

      expect(result.success).toBe(true);
      expect(result.retrievedDocuments).toBeGreaterThan(0);

      // Check if the response contains expected price information
      // Based on our test data, tomato should be around ₹40/kg
      const responseText = result.response.toLowerCase();
      expect(responseText).toContain('tomato');
      
      // Should contain price information
      const priceMatch = result.response.match(/₹\d+/);
      expect(priceMatch).toBeTruthy();

      console.log('Accuracy Test Result:', {
        query: result.query,
        response: result.response,
        confidence: result.metadata
      });
    }, 30000);

    test('should provide relevant context for decision making', async () => {
      await ragService.initialize();

      const businessQuery = 'I need to buy vegetables for my restaurant, what are the best options?';
      const result = await ragService.processQuery(businessQuery);

      expect(result.success).toBe(true);
      expect(result.context).toBeTruthy();
      expect(result.context).toContain('Agricultural Market Data');

      // Should include multiple options
      expect(result.retrievedDocuments).toBeGreaterThan(1);

      // Context should include price and quality information
      expect(result.context).toMatch(/Price: ₹\d+/);
      expect(result.context).toMatch(/Quality: (premium|standard|low)/);

      console.log('Business Query Context:', {
        query: result.query,
        contextLength: result.context.length,
        documentsRetrieved: result.retrievedDocuments
      });
    }, 30000);
  });

  describe('Error Recovery and Resilience', () => {
    test('should handle initialization with missing CSV gracefully', async () => {
      const nonExistentPath = '/path/to/nonexistent.csv';
      const result = await ragService.initialize(nonExistentPath);

      // Should fail gracefully
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(ragService.isInitialized).toBe(false);
    });

    test('should continue working when Bedrock is unavailable', async () => {
      // Create service with invalid Bedrock configuration
      const ragServiceWithBadBedrock = new RAGPipelineService({
        bedrockClient: {
          testConnection: () => Promise.resolve({ success: false, error: 'Connection failed' }),
          invokeModel: () => Promise.reject(new Error('Bedrock unavailable'))
        }
      });

      const initResult = await ragServiceWithBadBedrock.initialize();
      expect(initResult.success).toBe(true); // Should still initialize

      const queryResult = await ragServiceWithBadBedrock.processQuery('tomato price');
      expect(queryResult.success).toBe(true); // Should use fallback
      expect(queryResult.metadata.bedrockUsed).toBe(false);
      expect(queryResult.response).toContain('Based on available market data');
    }, 30000);
  });

  describe('Configuration and Customization', () => {
    test('should respect custom configuration parameters', async () => {
      const customService = new RAGPipelineService({
        maxRetrievedDocuments: 3,
        relevanceThreshold: 0.5,
        enableReranking: false,
        queryExpansion: false
      });

      await customService.initialize();

      const result = await customService.processQuery('vegetable prices');

      expect(result.success).toBe(true);
      expect(result.retrievedDocuments).toBeLessThanOrEqual(3);
      expect(result.expandedQuery).toBe('vegetable prices'); // No expansion

      customService.clear();
    }, 30000);

    test('should provide comprehensive statistics', async () => {
      await ragService.initialize();

      const stats = ragService.getStatistics();

      expect(stats.isInitialized).toBe(true);
      expect(stats.vectorService).toBeDefined();
      expect(stats.bedrockClient).toBeDefined();
      expect(stats.configuration).toBeDefined();

      expect(stats.vectorService.totalIndexedItems).toBeGreaterThan(0);
      expect(stats.vectorService.uniqueCrops).toBeGreaterThan(0);
      expect(stats.configuration.maxRetrievedDocuments).toBe(5);

      console.log('RAG Pipeline Statistics:', stats);
    });
  });
});