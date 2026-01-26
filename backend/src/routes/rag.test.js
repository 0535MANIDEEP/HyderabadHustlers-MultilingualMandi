const request = require('supertest');
const express = require('express');

// Mock the RAGPipelineService before importing the router
jest.mock('../services/RAGPipelineService');
const RAGPipelineService = require('../services/RAGPipelineService');

describe('RAG API Routes', () => {
  let app;
  let mockRagService;
  let ragRouter;

  beforeAll(() => {
    // Create mock RAG service instance
    mockRagService = {
      initialize: jest.fn(),
      processQuery: jest.fn(),
      getStatistics: jest.fn(),
      clear: jest.fn(),
      vectorService: {
        semanticSearch: jest.fn(),
        findSimilarCrops: jest.fn()
      }
    };

    // Mock the constructor to return our mock instance
    RAGPipelineService.mockImplementation(() => mockRagService);

    // Setup default successful initialization
    mockRagService.initialize.mockResolvedValue({
      success: true,
      statistics: {
        cropRecords: 10,
        indexedItems: 10,
        vocabularySize: 100
      }
    });

    // Now import the router after mocking
    ragRouter = require('./rag');

    // Create Express app with RAG routes
    app = express();
    app.use(express.json());
    app.use('/api/rag', ragRouter);
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup default successful initialization
    mockRagService.initialize.mockResolvedValue({
      success: true,
      statistics: {
        cropRecords: 10,
        indexedItems: 10,
        vocabularySize: 100
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/rag/query', () => {
    test('should process a valid query successfully', async () => {
      const mockResponse = {
        success: true,
        query: 'tomato price',
        queryType: 'price_query',
        response: 'Tomato is priced at ₹40/kg in Hyderabad market.',
        retrievedDocuments: 3,
        relevanceScores: [
          { id: 'doc1', similarity: 0.9, relevanceScore: 0.9 }
        ],
        metadata: {
          bedrockUsed: true,
          language: 'en'
        }
      };

      mockRagService.processQuery.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/rag/query')
        .send({
          query: 'tomato price',
          queryType: 'price_query',
          language: 'en'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResponse);
      expect(mockRagService.processQuery).toHaveBeenCalledWith('tomato price', {
        queryType: 'price_query',
        language: 'en'
      });
    });

    test('should handle missing query parameter', async () => {
      const response = await request(app)
        .post('/api/rag/query')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Query is required');
    });

    test('should handle empty query string', async () => {
      const response = await request(app)
        .post('/api/rag/query')
        .send({ query: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Query is required');
    });

    test('should handle RAG service errors', async () => {
      mockRagService.processQuery.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/api/rag/query')
        .send({ query: 'tomato price' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Internal server error');
    });

    test('should handle initialization failure', async () => {
      // Reset the initialization state by clearing the module cache
      delete require.cache[require.resolve('./rag')];
      
      // Set up mock to fail initialization
      mockRagService.initialize.mockResolvedValue({
        success: false,
        error: 'Initialization failed'
      });

      // Re-import the router to get fresh state
      const freshRagRouter = require('./rag');
      const freshApp = express();
      freshApp.use(express.json());
      freshApp.use('/api/rag', freshRagRouter);

      const response = await request(freshApp)
        .post('/api/rag/query')
        .send({ query: 'tomato price' });

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('RAG pipeline is not available');
    });

    test('should process multilingual queries', async () => {
      const mockResponse = {
        success: true,
        query: 'टमाटर की कीमत',
        queryType: 'price_query',
        response: 'टमाटर की कीमत ₹40/किलो है।',
        retrievedDocuments: 2,
        metadata: {
          bedrockUsed: true,
          language: 'hi'
        }
      };

      mockRagService.processQuery.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/rag/query')
        .send({
          query: 'टमाटर की कीमत',
          language: 'hi'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResponse);
      expect(mockRagService.processQuery).toHaveBeenCalledWith('टमाटर की कीमत', {
        queryType: 'price_query',
        language: 'hi'
      });
    });

    test('should handle comparison queries', async () => {
      const mockResponse = {
        success: true,
        query: 'compare tomato and onion prices',
        queryType: 'comparison_query',
        response: 'Tomato is ₹40/kg while onion is ₹30/kg.',
        retrievedDocuments: 4,
        metadata: {
          bedrockUsed: true,
          language: 'en'
        }
      };

      mockRagService.processQuery.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/rag/query')
        .send({
          query: 'compare tomato and onion prices',
          queryType: 'comparison_query'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResponse);
      expect(mockRagService.processQuery).toHaveBeenCalledWith('compare tomato and onion prices', {
        queryType: 'comparison_query',
        language: 'en'
      });
    });
  });

  describe('GET /api/rag/status', () => {
    test('should return RAG pipeline status', async () => {
      const mockStatistics = {
        isInitialized: true,
        vectorService: {
          totalIndexedItems: 10,
          uniqueCrops: 5,
          vocabularySize: 100
        },
        bedrockClient: {
          modelId: 'claude-3-sonnet',
          region: 'us-east-1'
        }
      };

      mockRagService.getStatistics.mockReturnValue(mockStatistics);

      const response = await request(app)
        .get('/api/rag/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.statistics).toEqual(mockStatistics);
      expect(response.body.timestamp).toBeDefined();
    });

    test('should handle statistics errors', async () => {
      mockRagService.getStatistics.mockImplementation(() => {
        throw new Error('Statistics error');
      });

      const response = await request(app)
        .get('/api/rag/status');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Internal server error');
    });
  });

  describe('POST /api/rag/initialize', () => {
    test('should initialize RAG pipeline successfully', async () => {
      const mockInitResult = {
        success: true,
        message: 'RAG pipeline initialized successfully',
        statistics: {
          cropRecords: 15,
          indexedItems: 15,
          vocabularySize: 120
        }
      };

      mockRagService.initialize.mockResolvedValue(mockInitResult);

      const response = await request(app)
        .post('/api/rag/initialize')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockInitResult);
      expect(mockRagService.clear).toHaveBeenCalled();
      expect(mockRagService.initialize).toHaveBeenCalledWith(undefined);
    });

    test('should initialize with custom CSV path', async () => {
      const mockInitResult = {
        success: true,
        message: 'RAG pipeline initialized successfully',
        statistics: {
          cropRecords: 20,
          indexedItems: 20,
          vocabularySize: 150
        }
      };

      mockRagService.initialize.mockResolvedValue(mockInitResult);

      const response = await request(app)
        .post('/api/rag/initialize')
        .send({ csvPath: '/custom/path/data.csv' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockInitResult);
      expect(mockRagService.initialize).toHaveBeenCalledWith('/custom/path/data.csv');
    });

    test('should handle initialization errors', async () => {
      mockRagService.initialize.mockRejectedValue(new Error('Init error'));

      const response = await request(app)
        .post('/api/rag/initialize')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Internal server error');
    });
  });

  describe('POST /api/rag/search', () => {
    test('should perform semantic search successfully', async () => {
      const mockSearchResult = {
        success: true,
        query: 'tomato',
        results: [
          {
            id: 'tomato_hybrid_hyderabad_premium',
            similarity: 0.9,
            cropPrice: {
              cropName: 'tomato',
              variety: 'hybrid',
              price: 40,
              market: 'Hyderabad'
            }
          }
        ],
        totalMatches: 1
      };

      mockRagService.vectorService.semanticSearch.mockResolvedValue(mockSearchResult);

      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'tomato',
          limit: 5,
          threshold: 0.3
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSearchResult);
      expect(mockRagService.vectorService.semanticSearch).toHaveBeenCalledWith('tomato', {
        limit: 5,
        threshold: 0.3,
        filters: {}
      });
    });

    test('should handle missing search query', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Query is required');
    });

    test('should handle search with filters', async () => {
      const mockSearchResult = {
        success: true,
        query: 'vegetables',
        results: [],
        totalMatches: 0
      };

      mockRagService.vectorService.semanticSearch.mockResolvedValue(mockSearchResult);

      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'vegetables',
          filters: { quality: 'premium', market: 'Hyderabad' }
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSearchResult);
      expect(mockRagService.vectorService.semanticSearch).toHaveBeenCalledWith('vegetables', {
        limit: 10,
        threshold: 0.3,
        filters: { quality: 'premium', market: 'Hyderabad' }
      });
    });
  });

  describe('GET /api/rag/crops', () => {
    test('should return available crops information', async () => {
      const mockStatistics = {
        vectorService: {
          cropTypes: ['tomato', 'onion', 'chili', 'potato'],
          markets: ['Hyderabad', 'Mumbai', 'Delhi'],
          qualities: ['premium', 'standard', 'low'],
          totalIndexedItems: 12
        }
      };

      mockRagService.getStatistics.mockReturnValue(mockStatistics);

      const response = await request(app)
        .get('/api/rag/crops');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.crops).toEqual(['tomato', 'onion', 'chili', 'potato']);
      expect(response.body.markets).toEqual(['Hyderabad', 'Mumbai', 'Delhi']);
      expect(response.body.qualities).toEqual(['premium', 'standard', 'low']);
      expect(response.body.totalRecords).toBe(12);
    });

    test('should handle missing statistics gracefully', async () => {
      mockRagService.getStatistics.mockReturnValue({
        vectorService: {}
      });

      const response = await request(app)
        .get('/api/rag/crops');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.crops).toEqual([]);
      expect(response.body.markets).toEqual([]);
      expect(response.body.qualities).toEqual([]);
      expect(response.body.totalRecords).toBe(0);
    });
  });

  describe('POST /api/rag/similar', () => {
    test('should find similar crops successfully', async () => {
      const mockSimilarResult = {
        success: true,
        query: 'tomato crop agricultural produce',
        results: [
          {
            id: 'tomato_hybrid_hyderabad_premium',
            similarity: 0.95,
            cropPrice: { cropName: 'tomato', variety: 'hybrid' }
          },
          {
            id: 'potato_local_hyderabad_standard',
            similarity: 0.7,
            cropPrice: { cropName: 'potato', variety: 'local' }
          }
        ]
      };

      mockRagService.vectorService.findSimilarCrops.mockResolvedValue(mockSimilarResult);

      const response = await request(app)
        .post('/api/rag/similar')
        .send({
          cropName: 'tomato',
          limit: 5
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSimilarResult);
      expect(mockRagService.vectorService.findSimilarCrops).toHaveBeenCalledWith('tomato', {
        limit: 5
      });
    });

    test('should handle missing crop name', async () => {
      const response = await request(app)
        .post('/api/rag/similar')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Crop name is required');
    });

    test('should handle empty crop name', async () => {
      const response = await request(app)
        .post('/api/rag/similar')
        .send({ cropName: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Crop name is required');
    });

    test('should use default limit when not provided', async () => {
      const mockSimilarResult = {
        success: true,
        results: []
      };

      mockRagService.vectorService.findSimilarCrops.mockResolvedValue(mockSimilarResult);

      const response = await request(app)
        .post('/api/rag/similar')
        .send({ cropName: 'onion' });

      expect(response.status).toBe(200);
      expect(mockRagService.vectorService.findSimilarCrops).toHaveBeenCalledWith('onion', {
        limit: 5
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle service unavailable when initialization fails', async () => {
      // Reset the initialization state by clearing the module cache
      delete require.cache[require.resolve('./rag')];
      
      // Set up mock to fail initialization
      mockRagService.initialize.mockResolvedValue({
        success: false,
        error: 'CSV file not found'
      });

      // Re-import the router to get fresh state
      const freshRagRouter = require('./rag');
      const freshApp = express();
      freshApp.use(express.json());
      freshApp.use('/api/rag', freshRagRouter);

      const response = await request(freshApp)
        .post('/api/rag/query')
        .send({ query: 'test query' });

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('RAG pipeline is not available');
    });

    test('should handle unexpected errors in routes', async () => {
      mockRagService.processQuery.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const response = await request(app)
        .post('/api/rag/query')
        .send({ query: 'test query' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Internal server error');
    });
  });

  describe('Input Validation', () => {
    test('should validate query parameter types', async () => {
      const response = await request(app)
        .post('/api/rag/query')
        .send({ query: 123 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Query is required and must be a non-empty string');
    });

    test('should validate search query parameter types', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({ query: null });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Query is required and must be a non-empty string');
    });

    test('should validate crop name parameter types', async () => {
      const response = await request(app)
        .post('/api/rag/similar')
        .send({ cropName: 123 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Crop name is required and must be a non-empty string');
    });
  });
});