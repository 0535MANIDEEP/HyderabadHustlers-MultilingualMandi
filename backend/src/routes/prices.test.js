const request = require('supertest');
const express = require('express');
const pricesRouter = require('./prices');
const PriceService = require('../services/PriceService');

// Mock the PriceService
jest.mock('../services/PriceService');

const app = express();
app.use(express.json());
app.use('/api/v1/prices', pricesRouter);

describe('Prices Routes', () => {
  let mockGetCurrentPrices;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockGetCurrentPrices = jest.fn();
    
    PriceService.mockImplementation(() => ({
      getCurrentPrices: mockGetCurrentPrices
    }));
  });

  describe('GET /api/v1/prices', () => {
    it('should return price data for valid crop', async () => {
      const mockResponse = {
        success: true,
        cropName: 'tomato',
        totalRecords: 3,
        statistics: { average: 40, min: 35, max: 45 },
        trendAnalysis: { trend: 'stable' },
        fairPriceRange: { min: 35, max: 45 },
        marketAnalysis: { condition: 'stable' },
        recommendations: ['Market conditions are stable']
      };

      mockGetCurrentPrices.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/v1/prices?crop=tomato')
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockGetCurrentPrices).toHaveBeenCalledWith('tomato', {});
    });

    it('should return 400 when crop parameter is missing', async () => {
      const response = await request(app)
        .get('/api/v1/prices')
        .expect(400);

      expect(response.body.error).toBe('Crop name is required');
    });

    it('should return 404 when crop is not found', async () => {
      const mockResponse = {
        success: false,
        message: 'No price data found for nonexistent',
        suggestions: ['tomato', 'onion']
      };

      mockGetCurrentPrices.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/v1/prices?crop=nonexistent')
        .expect(404);

      expect(response.body).toEqual(mockResponse);
    });

    it('should pass query parameters as options', async () => {
      const mockResponse = { success: true, cropName: 'tomato' };
      mockGetCurrentPrices.mockResolvedValue(mockResponse);

      await request(app)
        .get('/api/v1/prices?crop=tomato&market=Hyderabad&state=Telangana&quality=premium')
        .expect(200);

      expect(mockGetCurrentPrices).toHaveBeenCalledWith('tomato', {
        market: 'Hyderabad',
        state: 'Telangana',
        quality: 'premium'
      });
    });

    it('should handle service errors', async () => {
      mockGetCurrentPrices.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/v1/prices?crop=tomato')
        .expect(500);

      expect(response.body.error).toBe('Price discovery service error');
    });
  });

  describe('POST /api/v1/prices/query', () => {
    it('should process valid price query', async () => {
      const mockResponse = {
        success: true,
        cropName: 'tomato',
        statistics: { average: 40 }
      };

      mockGetCurrentPrices.mockResolvedValue(mockResponse);

      const queryData = {
        cropName: 'tomato',
        market: 'Hyderabad',
        state: 'Telangana',
        quality: 'premium'
      };

      const response = await request(app)
        .post('/api/v1/prices/query')
        .send(queryData)
        .expect(200);

      expect(response.body).toEqual(mockResponse);
    });

    it('should return 400 for invalid query data', async () => {
      const invalidQuery = {
        // Missing required cropName
        market: 'Hyderabad'
      };

      const response = await request(app)
        .post('/api/v1/prices/query')
        .send(invalidQuery)
        .expect(400);

      expect(response.body.error).toBe('Invalid query parameters');
    });
  });

  describe('GET /api/v1/prices/analytics/:crop', () => {
    it('should return analytics data for crop', async () => {
      const mockResponse = {
        success: true,
        cropName: 'tomato',
        statistics: { average: 40, min: 35, max: 45 },
        trendAnalysis: { trend: 'stable' },
        fairPriceRange: { min: 35, max: 45 },
        marketAnalysis: { condition: 'stable' },
        recommendations: ['Market conditions are stable'],
        lastUpdated: '2024-01-15T10:00:00.000Z'
      };

      mockGetCurrentPrices.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/v1/prices/analytics/tomato')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.statistics).toBeDefined();
      expect(response.body.trendAnalysis).toBeDefined();
      expect(response.body.fairPriceRange).toBeDefined();
      expect(response.body.marketAnalysis).toBeDefined();
      expect(response.body.prices).toBeUndefined(); // Should not include raw price data
    });
  });

  describe('GET /api/v1/prices/fair-range/:crop', () => {
    it('should return fair price range for crop', async () => {
      const mockResponse = {
        success: true,
        cropName: 'tomato',
        fairPriceRange: {
          fairRange: { min: 35, max: 45, average: 40 },
          confidence: 'high',
          recommendations: ['Fair price range: ₹35 - ₹45 per kg']
        },
        recommendations: [
          'Fair price range: ₹35 - ₹45 per kg',
          'Market conditions are stable',
          'Consider quality premium'
        ],
        lastUpdated: '2024-01-15T10:00:00.000Z'
      };

      mockGetCurrentPrices.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/v1/prices/fair-range/tomato')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.fairPriceRange).toBeDefined();
      expect(response.body.recommendations).toBeDefined();
      expect(response.body.recommendations.length).toBe(1); // Only price-related recommendations
      expect(response.body.statistics).toBeUndefined(); // Should not include statistics
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      mockGetCurrentPrices.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/v1/prices?crop=tomato')
        .expect(500);

      expect(response.body.error).toBe('Price discovery service error');
      expect(response.body.message).toBe('Database connection failed');
    });
  });
});