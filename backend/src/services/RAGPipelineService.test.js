const RAGPipelineService = require('./RAGPipelineService');
const VectorEmbeddingService = require('./VectorEmbeddingService');
const PriceService = require('./PriceService');
const BedrockClient = require('./BedrockClient');
const CsvParserService = require('./CsvParserService');
const { CropPrice } = require('../models/CropModels');

// Mock dependencies
jest.mock('./VectorEmbeddingService');
jest.mock('./PriceService');
jest.mock('./BedrockClient');
jest.mock('./CsvParserService');

describe('RAGPipelineService', () => {
  let ragService;
  let mockVectorService;
  let mockPriceService;
  let mockBedrockClient;
  let mockCsvParser;
  let sampleCropData;

  beforeEach(() => {
    // Create mock instances
    mockVectorService = new VectorEmbeddingService();
    mockPriceService = new PriceService();
    mockBedrockClient = new BedrockClient();
    mockCsvParser = new CsvParserService();

    // Sample crop data for testing
    sampleCropData = [
      new CropPrice({
        cropName: 'tomato',
        variety: 'hybrid',
        price: 40,
        market: 'Hyderabad',
        state: 'Telangana',
        quality: 'premium',
        source: 'agmarknet',
        date: new Date('2024-01-15')
      }),
      new CropPrice({
        cropName: 'onion',
        variety: 'red',
        price: 30,
        market: 'Hyderabad',
        state: 'Telangana',
        quality: 'standard',
        source: 'agmarknet',
        date: new Date('2024-01-15')
      }),
      new CropPrice({
        cropName: 'chili',
        variety: 'green',
        price: 100,
        market: 'Hyderabad',
        state: 'Telangana',
        quality: 'premium',
        source: 'agmarknet',
        date: new Date('2024-01-15')
      })
    ];

    // Setup default mocks
    mockCsvParser.parseMandiPrices.mockResolvedValue({
      success: true,
      data: sampleCropData
    });

    mockVectorService.initialize.mockResolvedValue({
      success: true,
      indexedItems: sampleCropData.length,
      vocabularySize: 50
    });

    mockBedrockClient.testConnection.mockResolvedValue({
      success: true,
      message: 'Connection successful'
    });

    mockVectorService.createTextFromCropPrice.mockImplementation((cropPrice) => {
      return `${cropPrice.cropName} ${cropPrice.variety} ${cropPrice.quality} ${cropPrice.market} price ${cropPrice.price} rupees per kg`;
    });

    // Create RAG service with mocked dependencies
    ragService = new RAGPipelineService({
      vectorService: mockVectorService,
      priceService: mockPriceService,
      bedrockClient: mockBedrockClient,
      csvParser: mockCsvParser
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with default configuration', () => {
      const service = new RAGPipelineService();
      expect(service.maxRetrievedDocuments).toBe(10);
      expect(service.relevanceThreshold).toBe(0.3);
      expect(service.enableReranking).toBe(true);
      expect(service.queryExpansionEnabled).toBe(true);
      expect(service.isInitialized).toBe(false);
    });

    test('should accept custom configuration options', () => {
      const options = {
        maxRetrievedDocuments: 5,
        relevanceThreshold: 0.5,
        enableReranking: false,
        queryExpansion: false
      };
      
      const service = new RAGPipelineService(options);
      expect(service.maxRetrievedDocuments).toBe(5);
      expect(service.relevanceThreshold).toBe(0.5);
      expect(service.enableReranking).toBe(false);
      expect(service.queryExpansionEnabled).toBe(false);
    });
  });

  describe('initialize', () => {
    test('should successfully initialize RAG pipeline', async () => {
      const result = await ragService.initialize();

      expect(result.success).toBe(true);
      expect(result.message).toBe('RAG pipeline initialized successfully');
      expect(result.statistics.cropRecords).toBe(3);
      expect(result.statistics.indexedItems).toBe(3);
      expect(ragService.isInitialized).toBe(true);

      expect(mockCsvParser.parseMandiPrices).toHaveBeenCalledWith(null);
      expect(mockVectorService.initialize).toHaveBeenCalledWith(sampleCropData);
      expect(mockBedrockClient.testConnection).toHaveBeenCalled();
    });

    test('should handle CSV parsing failure', async () => {
      mockCsvParser.parseMandiPrices.mockResolvedValue({
        success: false,
        error: 'File not found'
      });

      const result = await ragService.initialize();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse CSV data: File not found');
      expect(ragService.isInitialized).toBe(false);
    });

    test('should handle vector service initialization failure', async () => {
      mockVectorService.initialize.mockResolvedValue({
        success: false,
        error: 'Vector initialization failed'
      });

      const result = await ragService.initialize();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to initialize vector service: Vector initialization failed');
      expect(ragService.isInitialized).toBe(false);
    });

    test('should continue initialization even if Bedrock connection fails', async () => {
      mockBedrockClient.testConnection.mockResolvedValue({
        success: false,
        error: 'Connection failed'
      });

      const result = await ragService.initialize();

      expect(result.success).toBe(true);
      expect(result.statistics.bedrockAvailable).toBe(false);
      expect(ragService.isInitialized).toBe(true);
    });
  });

  describe('processQuery', () => {
    beforeEach(async () => {
      await ragService.initialize();
    });

    test('should process a basic price query successfully', async () => {
      const query = 'What is the price of tomato?';
      
      // Mock semantic search results
      mockVectorService.semanticSearch.mockResolvedValue({
        success: true,
        results: [
          {
            id: 'tomato_hybrid_hyderabad_premium',
            similarity: 0.9,
            cropPrice: sampleCropData[0],
            text: 'tomato hybrid premium hyderabad price 40 rupees per kg'
          }
        ],
        totalMatches: 1
      });

      // Mock Bedrock response
      mockBedrockClient.invokeModel.mockResolvedValue({
        content: 'Based on the market data, tomato (hybrid variety) is priced at ₹40/kg in Hyderabad market with premium quality.',
        usage: { inputTokens: 100, outputTokens: 50 },
        duration: 1500
      });

      const result = await ragService.processQuery(query);

      expect(result.success).toBe(true);
      expect(result.query).toBe(query);
      expect(result.queryType).toBe('price_query');
      expect(result.response).toContain('tomato');
      expect(result.response).toContain('₹40/kg');
      expect(result.retrievedDocuments).toBeGreaterThanOrEqual(1);
      expect(result.metadata.bedrockUsed).toBe(true);

      expect(mockVectorService.semanticSearch).toHaveBeenCalled();
      expect(mockBedrockClient.invokeModel).toHaveBeenCalled();
    });

    test('should handle query when not initialized', async () => {
      const uninitializedService = new RAGPipelineService({
        vectorService: mockVectorService,
        bedrockClient: mockBedrockClient,
        csvParser: mockCsvParser
      });

      const result = await uninitializedService.processQuery('test query');

      expect(result.success).toBe(false);
      expect(result.error).toContain('RAG pipeline not initialized');
    });

    test('should handle semantic search failure', async () => {
      mockVectorService.semanticSearch.mockResolvedValue({
        success: false,
        error: 'Search failed'
      });

      const result = await ragService.processQuery('tomato price');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Document retrieval failed: Semantic search failed: Search failed');
    });

    test('should use fallback response when Bedrock fails', async () => {
      mockVectorService.semanticSearch.mockResolvedValue({
        success: true,
        results: [
          {
            id: 'tomato_hybrid_hyderabad_premium',
            similarity: 0.9,
            cropPrice: sampleCropData[0],
            text: 'tomato hybrid premium hyderabad price 40 rupees per kg'
          }
        ],
        totalMatches: 1
      });

      mockBedrockClient.invokeModel.mockRejectedValue(new Error('Bedrock unavailable'));

      const result = await ragService.processQuery('tomato price');

      expect(result.success).toBe(true);
      expect(result.metadata.bedrockUsed).toBe(false);
      expect(result.response).toContain('Based on available market data');
      expect(result.response).toContain('tomato');
    });

    test('should process comparison query type', async () => {
      mockVectorService.semanticSearch.mockResolvedValue({
        success: true,
        results: [
          {
            id: 'tomato_hybrid_hyderabad_premium',
            similarity: 0.9,
            cropPrice: sampleCropData[0],
            text: 'tomato hybrid premium hyderabad price 40 rupees per kg'
          },
          {
            id: 'onion_red_hyderabad_standard',
            similarity: 0.8,
            cropPrice: sampleCropData[1],
            text: 'onion red standard hyderabad price 30 rupees per kg'
          }
        ],
        totalMatches: 2
      });

      mockBedrockClient.invokeModel.mockResolvedValue({
        content: 'Comparing tomato and onion prices: Tomato is ₹40/kg while onion is ₹30/kg.',
        usage: { inputTokens: 150, outputTokens: 75 },
        duration: 1800
      });

      const result = await ragService.processQuery('compare tomato and onion prices', {
        queryType: 'comparison_query'
      });

      expect(result.success).toBe(true);
      expect(result.queryType).toBe('comparison_query');
      expect(result.retrievedDocuments).toBe(2);
    });

    test('should handle multilingual queries', async () => {
      mockVectorService.semanticSearch.mockResolvedValue({
        success: true,
        results: [
          {
            id: 'tomato_hybrid_hyderabad_premium',
            similarity: 0.9,
            cropPrice: sampleCropData[0],
            text: 'tomato hybrid premium hyderabad price 40 rupees per kg'
          }
        ],
        totalMatches: 1
      });

      mockBedrockClient.invokeModel.mockResolvedValue({
        content: 'टमाटर की कीमत ₹40/किलो है।',
        usage: { inputTokens: 120, outputTokens: 30 },
        duration: 1600
      });

      const result = await ragService.processQuery('tomato price', {
        language: 'hi'
      });

      expect(result.success).toBe(true);
      expect(result.metadata.language).toBe('hi');
      expect(mockBedrockClient.invokeModel).toHaveBeenCalledWith(
        expect.stringContaining('Please respond in Hindi language'),
        expect.any(Object)
      );
    });
  });

  describe('expandQuery', () => {
    test('should expand price query with relevant terms', async () => {
      const expanded = await ragService.expandQuery('tomato', 'price_query');
      
      expect(expanded).toContain('tomato');
      expect(expanded).toContain('price');
      expect(expanded).toContain('agricultural crop');
    });

    test('should expand comparison query appropriately', async () => {
      const expanded = await ragService.expandQuery('tomato vs onion', 'comparison_query');
      
      expect(expanded).toContain('tomato vs onion');
      expect(expanded).toContain('compare');
      expect(expanded).toContain('agricultural crop');
    });

    test('should return original query if expansion is disabled', async () => {
      ragService.queryExpansionEnabled = false;
      const expanded = await ragService.expandQuery('tomato', 'price_query');
      
      expect(expanded).toBe('tomato');
    });
  });

  describe('retrieveRelevantDocuments', () => {
    beforeEach(async () => {
      await ragService.initialize();
    });

    test('should retrieve and combine semantic and keyword results', async () => {
      const semanticResults = [
        {
          id: 'semantic_1',
          similarity: 0.9,
          cropPrice: sampleCropData[0],
          text: 'tomato hybrid premium'
        }
      ];

      mockVectorService.semanticSearch.mockResolvedValue({
        success: true,
        results: semanticResults,
        totalMatches: 1
      });

      const result = await ragService.retrieveRelevantDocuments('tomato price', {
        maxResults: 5,
        queryType: 'price_query'
      });

      expect(result.success).toBe(true);
      expect(result.documents).toBeDefined();
      expect(result.totalMatches).toBe(1);
      expect(mockVectorService.semanticSearch).toHaveBeenCalled();
    });

    test('should handle semantic search failure', async () => {
      mockVectorService.semanticSearch.mockResolvedValue({
        success: false,
        error: 'Search failed'
      });

      const result = await ragService.retrieveRelevantDocuments('tomato price');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Semantic search failed: Search failed');
    });
  });

  describe('performKeywordSearch', () => {
    beforeEach(async () => {
      await ragService.initialize();
    });

    test('should perform keyword search on crop data', async () => {
      const results = await ragService.performKeywordSearch('tomato', 5);

      expect(Array.isArray(results)).toBe(true);
      expect(mockCsvParser.parseMandiPrices).toHaveBeenCalled();
    });

    test('should handle CSV parsing failure gracefully', async () => {
      mockCsvParser.parseMandiPrices.mockResolvedValue({
        success: false,
        error: 'Parse failed'
      });

      const results = await ragService.performKeywordSearch('tomato', 5);

      expect(results).toEqual([]);
    });
  });

  describe('combineSearchResults', () => {
    test('should combine semantic and keyword results correctly', () => {
      const semanticResults = [
        {
          id: 'semantic_1',
          similarity: 0.9,
          cropPrice: { cropName: 'tomato', variety: 'hybrid', market: 'Hyderabad', quality: 'premium' }
        }
      ];

      const keywordResults = [
        {
          id: 'keyword_1',
          similarity: 0.7,
          cropPrice: { cropName: 'tomato', variety: 'hybrid', market: 'Hyderabad', quality: 'premium' }
        }
      ];

      const combined = ragService.combineSearchResults(
        semanticResults,
        keywordResults,
        0.7,
        0.3
      );

      expect(combined).toHaveLength(1);
      expect(combined[0].combinedScore).toBeCloseTo(0.9 * 0.7 + 0.7 * 0.3);
      expect(combined[0].sources).toEqual(['semantic', 'keyword']);
    });

    test('should handle empty result arrays', () => {
      const combined = ragService.combineSearchResults([], [], 0.7, 0.3);
      expect(combined).toEqual([]);
    });
  });

  describe('rerankDocuments', () => {
    test('should re-rank documents based on query relevance', async () => {
      const documents = [
        {
          id: 'doc1',
          similarity: 0.8,
          cropPrice: { cropName: 'onion', market: 'Mumbai', quality: 'standard' }
        },
        {
          id: 'doc2',
          similarity: 0.7,
          cropPrice: { cropName: 'tomato', market: 'Hyderabad', quality: 'premium' }
        }
      ];

      const reranked = await ragService.rerankDocuments('tomato price', documents);

      expect(reranked).toHaveLength(2);
      expect(reranked[0].cropPrice.cropName).toBe('tomato'); // Should be ranked higher due to query match
      expect(reranked[0].relevanceScore).toBeGreaterThan(reranked[1].relevanceScore);
    });

    test('should handle empty document array', async () => {
      const reranked = await ragService.rerankDocuments('tomato', []);
      expect(reranked).toEqual([]);
    });
  });

  describe('buildContext', () => {
    test('should build context string from documents', () => {
      const documents = [
        {
          id: 'doc1',
          similarity: 0.9,
          cropPrice: sampleCropData[0]
        },
        {
          id: 'doc2',
          similarity: 0.8,
          cropPrice: sampleCropData[1]
        }
      ];

      const context = ragService.buildContext(documents, 'price_query');

      expect(context).toContain('Agricultural Market Data');
      expect(context).toContain('tomato');
      expect(context).toContain('onion');
      expect(context).toContain('₹40/kg');
      expect(context).toContain('₹30/kg');
      expect(context).toContain('Summary Statistics');
    });

    test('should handle empty documents array', () => {
      const context = ragService.buildContext([], 'price_query');
      expect(context).toBe('No relevant market data found.');
    });

    test('should truncate context if too long', () => {
      ragService.contextWindowSize = 100; // Set small window for testing
      
      const documents = [
        {
          id: 'doc1',
          similarity: 0.9,
          cropPrice: sampleCropData[0]
        }
      ];

      const context = ragService.buildContext(documents, 'price_query');
      expect(context.length).toBeLessThanOrEqual(130); // Allow for truncation message
      expect(context).toContain('[Context truncated]');
    });
  });

  describe('generateFallbackResponse', () => {
    test('should generate fallback response from context', () => {
      const context = `Agricultural Market Data:

1. tomato (hybrid)
   Price: ₹40/kg
   Quality: premium
   Market: Hyderabad, Telangana

2. onion (red)
   Price: ₹30/kg
   Quality: standard
   Market: Hyderabad, Telangana`;

      const response = ragService.generateFallbackResponse('tomato price', context, 'price_query');

      expect(response).toContain('Based on available market data');
      expect(response).toContain('tomato');
      expect(response).toContain('₹40/kg');
      expect(response).toContain('onion');
      expect(response).toContain('₹30/kg');
      expect(response).toContain('Average price: ₹35/kg');
    });

    test('should handle empty context', () => {
      const response = ragService.generateFallbackResponse('tomato price', '', 'price_query');
      expect(response).toContain("I couldn't find specific market data");
    });
  });

  describe('calculateResponseConfidence', () => {
    test('should calculate high confidence for good data', () => {
      const documents = [
        {
          id: 'doc1',
          similarity: 0.9,
          relevanceScore: 0.95,
          cropPrice: { cropName: 'tomato', market: 'Hyderabad' }
        },
        {
          id: 'doc2',
          similarity: 0.8,
          relevanceScore: 0.85,
          cropPrice: { cropName: 'tomato', market: 'Mumbai' }
        },
        {
          id: 'doc3',
          similarity: 0.7,
          relevanceScore: 0.75,
          cropPrice: { cropName: 'tomato', market: 'Delhi' }
        }
      ];

      const confidence = ragService.calculateResponseConfidence(documents, 'tomato price');

      expect(confidence.level).toBe('high');
      expect(confidence.score).toBeGreaterThan(0.8);
      expect(confidence.factors.cropNameMatches).toBe(3);
    });

    test('should calculate low confidence for poor data', () => {
      const documents = [
        {
          id: 'doc1',
          similarity: 0.3,
          relevanceScore: 0.3,
          cropPrice: { cropName: 'onion', market: 'Hyderabad' }
        }
      ];

      const confidence = ragService.calculateResponseConfidence(documents, 'tomato price');

      expect(confidence.level).toBe('moderate');
      expect(confidence.score).toBeLessThan(0.6);
      expect(confidence.factors.cropNameMatches).toBe(0);
    });

    test('should handle empty documents', () => {
      const confidence = ragService.calculateResponseConfidence([], 'tomato price');

      expect(confidence.level).toBe('very_low');
      expect(confidence.score).toBe(0.1);
      expect(confidence.reason).toBe('No relevant data found');
    });
  });

  describe('assessDataFreshness', () => {
    test('should assess fresh data correctly', () => {
      const documents = [
        {
          cropPrice: { date: new Date() } // Today's date
        }
      ];

      const freshness = ragService.assessDataFreshness(documents);

      expect(freshness.status).toBe('fresh');
      expect(freshness.daysSinceUpdate).toBe(0);
    });

    test('should assess stale data correctly', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago

      const documents = [
        {
          cropPrice: { date: oldDate }
        }
      ];

      const freshness = ragService.assessDataFreshness(documents);

      expect(freshness.status).toBe('stale');
      expect(freshness.daysSinceUpdate).toBe(10);
    });

    test('should handle empty documents', () => {
      const freshness = ragService.assessDataFreshness([]);

      expect(freshness.status).toBe('unknown');
      expect(freshness.message).toBe('No data available');
    });
  });

  describe('generateRelatedSuggestions', () => {
    test('should generate relevant suggestions', async () => {
      const documents = [
        {
          cropPrice: { cropName: 'tomato', market: 'Hyderabad', quality: 'premium' }
        },
        {
          cropPrice: { cropName: 'onion', market: 'Mumbai', quality: 'standard' }
        },
        {
          cropPrice: { cropName: 'tomato', market: 'Delhi', quality: 'low' }
        }
      ];

      const suggestions = await ragService.generateRelatedSuggestions(documents, 'tomato price');

      expect(suggestions).toContain('Compare prices: tomato vs onion');
      expect(suggestions).toContain('Check prices in: Hyderabad, Mumbai');
      expect(suggestions).toContain('tomato quality options: premium, standard, low');
    });

    test('should handle empty documents', async () => {
      const suggestions = await ragService.generateRelatedSuggestions([], 'tomato price');
      expect(suggestions).toEqual([]);
    });
  });

  describe('getStatistics', () => {
    test('should return comprehensive statistics', () => {
      mockVectorService.getStatistics.mockReturnValue({
        totalIndexedItems: 10,
        uniqueCrops: 5,
        vocabularySize: 100
      });

      mockBedrockClient.getStatus.mockReturnValue({
        modelId: 'claude-3-sonnet',
        region: 'us-east-1',
        queueLength: 0
      });

      const stats = ragService.getStatistics();

      expect(stats.isInitialized).toBe(false);
      expect(stats.vectorService.totalIndexedItems).toBe(10);
      expect(stats.bedrockClient.modelId).toBe('claude-3-sonnet');
      expect(stats.configuration.maxRetrievedDocuments).toBe(10);
    });
  });

  describe('clear', () => {
    test('should clear the RAG pipeline', () => {
      ragService.isInitialized = true;
      ragService.clear();

      expect(ragService.isInitialized).toBe(false);
      expect(mockVectorService.clear).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle unexpected errors in processQuery', async () => {
      await ragService.initialize();
      
      mockVectorService.semanticSearch.mockRejectedValue(new Error('Unexpected error'));

      const result = await ragService.processQuery('tomato price');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unexpected error');
    });

    test('should handle errors in query expansion gracefully', async () => {
      // Mock a method that might throw during expansion
      const originalExpandQuery = ragService.expandQuery;
      ragService.expandQuery = jest.fn().mockRejectedValue(new Error('Expansion failed'));

      await ragService.initialize();
      
      mockVectorService.semanticSearch.mockResolvedValue({
        success: true,
        results: [],
        totalMatches: 0
      });

      const result = await ragService.processQuery('tomato price');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Expansion failed');
    });
  });
});