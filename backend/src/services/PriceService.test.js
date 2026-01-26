const PriceService = require('./PriceService');
const CsvParserService = require('./CsvParserService');
const { CropPrice } = require('../models/CropModels');

// Mock the CsvParserService
jest.mock('./CsvParserService');

describe('PriceService', () => {
  let priceService;
  let mockCsvParser;
  let samplePrices;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock CSV parser
    mockCsvParser = {
      parseMandiPrices: jest.fn(),
      filterCropPrices: jest.fn(),
      calculatePriceStatistics: jest.fn(),
      groupCropPrices: jest.fn()
    };
    
    CsvParserService.mockImplementation(() => mockCsvParser);
    
    priceService = new PriceService();
    
    // Sample price data for testing
    samplePrices = [
      new CropPrice({
        cropName: 'tomato',
        variety: 'hybrid',
        price: 40,
        market: 'Hyderabad',
        state: 'Telangana',
        date: '2024-01-15',
        quality: 'premium',
        source: 'agmarknet',
        coordinates_lat: 17.3850,
        coordinates_lng: 78.4867
      }),
      new CropPrice({
        cropName: 'tomato',
        variety: 'local',
        price: 35,
        market: 'Hyderabad',
        state: 'Telangana',
        date: '2024-01-14',
        quality: 'standard',
        source: 'manual',
        coordinates_lat: 17.3850,
        coordinates_lng: 78.4867
      }),
      new CropPrice({
        cropName: 'tomato',
        variety: 'hybrid',
        price: 45,
        market: 'Bangalore',
        state: 'Karnataka',
        date: '2024-01-16',
        quality: 'premium',
        source: 'agmarknet',
        coordinates_lat: 12.9716,
        coordinates_lng: 77.5946
      })
    ];

    // Mock groupCropPrices to return proper structure
    mockCsvParser.groupCropPrices.mockImplementation((prices, groupBy) => {
      const grouped = {};
      prices.forEach(price => {
        const key = price[groupBy];
        if (!grouped[key]) {
          grouped[key] = {
            prices: [],
            statistics: { count: 0, average: 0, min: 0, max: 0, median: 0 }
          };
        }
        grouped[key].prices.push(price);
        grouped[key].statistics.count++;
      });
      
      // Calculate basic statistics for each group
      Object.keys(grouped).forEach(key => {
        const groupPrices = grouped[key].prices.map(p => p.price);
        const sum = groupPrices.reduce((acc, p) => acc + p, 0);
        grouped[key].statistics.average = sum / groupPrices.length;
        grouped[key].statistics.min = Math.min(...groupPrices);
        grouped[key].statistics.max = Math.max(...groupPrices);
        grouped[key].statistics.median = groupPrices.sort((a, b) => a - b)[Math.floor(groupPrices.length / 2)];
      });
      
      return grouped;
    });
  });

  describe('getCurrentPrices', () => {
    it('should return price data with statistics for valid crop', async () => {
      // Mock CSV parser responses
      mockCsvParser.parseMandiPrices.mockResolvedValue({
        success: true,
        data: samplePrices
      });
      
      mockCsvParser.filterCropPrices.mockReturnValue(samplePrices);
      
      const result = await priceService.getCurrentPrices('tomato');
      
      expect(result.success).toBe(true);
      expect(result.cropName).toBe('tomato');
      expect(result.totalRecords).toBe(3);
      expect(result.statistics).toBeDefined();
      expect(result.trendAnalysis).toBeDefined();
      expect(result.fairPriceRange).toBeDefined();
      expect(result.marketAnalysis).toBeDefined();
    });

    it('should return error when crop not found', async () => {
      mockCsvParser.parseMandiPrices.mockResolvedValue({
        success: true,
        data: samplePrices
      });
      
      mockCsvParser.filterCropPrices.mockReturnValue([]);
      
      const result = await priceService.getCurrentPrices('nonexistent');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('No price data found');
      expect(result.suggestions).toBeDefined();
    });

    it('should handle CSV parsing errors gracefully', async () => {
      mockCsvParser.parseMandiPrices.mockResolvedValue({
        success: false,
        error: 'File not found'
      });
      
      const result = await priceService.getCurrentPrices('tomato');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse price data');
    });

    it('should use cache when available', async () => {
      // First call
      mockCsvParser.parseMandiPrices.mockResolvedValue({
        success: true,
        data: samplePrices
      });
      mockCsvParser.filterCropPrices.mockReturnValue(samplePrices);
      
      await priceService.getCurrentPrices('tomato');
      
      // Second call should use cache
      const result = await priceService.getCurrentPrices('tomato');
      
      expect(mockCsvParser.parseMandiPrices).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });
  });

  describe('calculateAdvancedStatistics', () => {
    it('should calculate correct statistics for price data', () => {
      const stats = priceService.calculateAdvancedStatistics(samplePrices);
      
      expect(stats.count).toBe(3);
      expect(stats.average).toBe(40); // (40 + 35 + 45) / 3
      expect(stats.min).toBe(35);
      expect(stats.max).toBe(45);
      expect(stats.median).toBe(40);
      expect(stats.standardDeviation).toBeGreaterThan(0);
      expect(stats.coefficientOfVariation).toBeGreaterThan(0);
      expect(stats.percentiles).toBeDefined();
      expect(stats.qualityStats).toBeDefined();
      expect(stats.marketStats).toBeDefined();
    });

    it('should return empty statistics for empty data', () => {
      const stats = priceService.calculateAdvancedStatistics([]);
      
      expect(stats.count).toBe(0);
      expect(stats.average).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
    });

    it('should handle single price correctly', () => {
      const singlePrice = [samplePrices[0]];
      const stats = priceService.calculateAdvancedStatistics(singlePrice);
      
      expect(stats.count).toBe(1);
      expect(stats.average).toBe(40);
      expect(stats.min).toBe(40);
      expect(stats.max).toBe(40);
      expect(stats.standardDeviation).toBe(0);
    });
  });

  describe('calculatePercentiles', () => {
    it('should calculate correct percentiles', () => {
      const prices = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const percentiles = priceService.calculatePercentiles(prices);
      
      expect(percentiles.p10).toBe(19);
      expect(percentiles.p25).toBe(32.5);
      expect(percentiles.p50).toBe(55);
      expect(percentiles.p75).toBe(77.5);
      expect(percentiles.p90).toBe(91);
    });

    it('should handle edge cases with few data points', () => {
      const prices = [10, 20];
      const percentiles = priceService.calculatePercentiles(prices);
      
      expect(percentiles.p50).toBe(15); // Median of 10 and 20
    });
  });

  describe('analyzeTrends', () => {
    it('should identify increasing trend', () => {
      const increasingPrices = [
        new CropPrice({ ...samplePrices[0], price: 30, date: '2024-01-10' }),
        new CropPrice({ ...samplePrices[0], price: 40, date: '2024-01-15' }),
        new CropPrice({ ...samplePrices[0], price: 50, date: '2024-01-20' })
      ];
      
      const trend = priceService.analyzeTrends(increasingPrices);
      
      expect(trend.trend).toBe('increasing');
      expect(trend.percentageChange).toBeGreaterThan(5);
      expect(trend.priceChange).toBe(20);
    });

    it('should identify decreasing trend', () => {
      const decreasingPrices = [
        new CropPrice({ ...samplePrices[0], price: 50, date: '2024-01-10' }),
        new CropPrice({ ...samplePrices[0], price: 40, date: '2024-01-15' }),
        new CropPrice({ ...samplePrices[0], price: 30, date: '2024-01-20' })
      ];
      
      const trend = priceService.analyzeTrends(decreasingPrices);
      
      expect(trend.trend).toBe('decreasing');
      expect(trend.percentageChange).toBeLessThan(-5);
      expect(trend.priceChange).toBe(-20);
    });

    it('should identify stable trend', () => {
      const stablePrices = [
        new CropPrice({ ...samplePrices[0], price: 40, date: '2024-01-10' }),
        new CropPrice({ ...samplePrices[0], price: 41, date: '2024-01-15' }),
        new CropPrice({ ...samplePrices[0], price: 39, date: '2024-01-20' })
      ];
      
      const trend = priceService.analyzeTrends(stablePrices);
      
      expect(trend.trend).toBe('stable');
      expect(Math.abs(trend.percentageChange)).toBeLessThan(5);
    });

    it('should handle insufficient data', () => {
      const trend = priceService.analyzeTrends([samplePrices[0]]);
      
      expect(trend.trend).toBe('insufficient_data');
      expect(trend.dataPoints).toBe(1);
    });
  });

  describe('calculateFairPriceRange', () => {
    it('should calculate fair price range with high confidence', () => {
      const stats = priceService.calculateAdvancedStatistics(samplePrices);
      const fairRange = priceService.calculateFairPriceRange(samplePrices, stats);
      
      expect(fairRange.fairRange).toBeDefined();
      expect(fairRange.fairRange.min).toBeGreaterThan(0);
      expect(fairRange.fairRange.max).toBeGreaterThan(fairRange.fairRange.min);
      expect(fairRange.confidence).toBeDefined();
      expect(fairRange.methodology).toBeDefined();
      expect(fairRange.recommendations).toBeInstanceOf(Array);
    });

    it('should return null range for empty data', () => {
      const fairRange = priceService.calculateFairPriceRange([], {});
      
      expect(fairRange.fairRange).toBeNull();
      expect(fairRange.confidence).toBe('low');
      expect(fairRange.message).toContain('Insufficient data');
    });

    it('should adjust confidence based on data quality', () => {
      // Test with limited data
      const limitedPrices = [samplePrices[0], samplePrices[1]];
      const stats = priceService.calculateAdvancedStatistics(limitedPrices);
      const fairRange = priceService.calculateFairPriceRange(limitedPrices, stats);
      
      expect(['low', 'medium']).toContain(fairRange.confidence);
    });
  });

  describe('analyzeMarketConditions', () => {
    it('should analyze market conditions correctly', () => {
      const analysis = priceService.analyzeMarketConditions(samplePrices);
      
      expect(analysis.condition).toBeDefined();
      expect(analysis.message).toBeDefined();
      expect(analysis.volatility).toBeGreaterThanOrEqual(0);
      expect(analysis.supplyIndicators).toBeDefined();
      expect(analysis.demandIndicators).toBeDefined();
      expect(analysis.marketMetrics).toBeDefined();
    });

    it('should handle empty data', () => {
      const analysis = priceService.analyzeMarketConditions([]);
      
      expect(analysis.condition).toBe('unknown');
      expect(analysis.message).toContain('Insufficient data');
    });

    it('should identify volatile market conditions', () => {
      const volatilePrices = [
        new CropPrice({ ...samplePrices[0], price: 10 }),
        new CropPrice({ ...samplePrices[0], price: 100 }),
        new CropPrice({ ...samplePrices[0], price: 20 })
      ];
      
      const analysis = priceService.analyzeMarketConditions(volatilePrices);
      
      expect(analysis.condition).toBe('volatile');
      expect(analysis.volatility).toBeGreaterThan(30);
    });
  });

  describe('calculateMovingAverages', () => {
    it('should calculate moving averages correctly', () => {
      const prices = [10, 20, 30, 40, 50];
      const movingAvg = priceService.calculateMovingAverages(prices, 3);
      
      expect(movingAvg).toHaveLength(3);
      expect(movingAvg[0]).toBe(20); // (10+20+30)/3
      expect(movingAvg[1]).toBe(30); // (20+30+40)/3
      expect(movingAvg[2]).toBe(40); // (30+40+50)/3
    });

    it('should return original prices when window is larger than data', () => {
      const prices = [10, 20];
      const movingAvg = priceService.calculateMovingAverages(prices, 5);
      
      expect(movingAvg).toEqual(prices);
    });
  });

  describe('calculateVolatility', () => {
    it('should calculate volatility correctly', () => {
      const prices = [100, 110, 90, 120, 80];
      const volatility = priceService.calculateVolatility(prices);
      
      expect(volatility).toBeGreaterThan(0);
      expect(typeof volatility).toBe('number');
    });

    it('should return zero volatility for single price', () => {
      const prices = [100];
      const volatility = priceService.calculateVolatility(prices);
      
      expect(volatility).toBe(0);
    });

    it('should return zero volatility for identical prices', () => {
      const prices = [100, 100, 100];
      const volatility = priceService.calculateVolatility(prices);
      
      expect(volatility).toBe(0);
    });
  });

  describe('generateRecommendations', () => {
    it('should generate appropriate recommendations', () => {
      const stats = {
        coefficientOfVariation: 30,
        count: 10,
        qualityStats: {
          premium: { average: 50 },
          standard: { average: 40 }
        }
      };
      
      const trend = { trend: 'increasing' };
      const market = { condition: 'buyer_favorable' };
      
      const recommendations = priceService.generateRecommendations(stats, trend, market);
      
      expect(recommendations).toBeInstanceOf(Array);
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some(rec => rec.includes('volatility'))).toBe(true);
      expect(recommendations.some(rec => rec.includes('upward'))).toBe(true);
    });

    it('should recommend caution for limited data', () => {
      const stats = { coefficientOfVariation: 10, count: 2, qualityStats: {} };
      const trend = { trend: 'stable' };
      const market = { condition: 'stable' };
      
      const recommendations = priceService.generateRecommendations(stats, trend, market);
      
      expect(recommendations.some(rec => rec.includes('Limited data'))).toBe(true);
    });
  });

  describe('getSimilarCrops', () => {
    it('should find similar crops', async () => {
      const allPrices = [
        new CropPrice({ cropName: 'tomato', price: 40 }),
        new CropPrice({ cropName: 'potato', price: 25 }),
        new CropPrice({ cropName: 'onion', price: 30 })
      ];
      
      const similar = await priceService.getSimilarCrops('tom', allPrices);
      
      expect(similar).toContain('tomato');
    });

    it('should return available crops when no similar found', async () => {
      const allPrices = [
        new CropPrice({ cropName: 'tomato', price: 40 }),
        new CropPrice({ cropName: 'potato', price: 25 })
      ];
      
      const similar = await priceService.getSimilarCrops('xyz', allPrices);
      
      expect(similar).toContain('tomato');
      expect(similar).toContain('potato');
    });
  });

  describe('Helper Methods', () => {
    it('should calculate coefficient of variation correctly', () => {
      const prices = [
        new CropPrice({ price: 40 }),
        new CropPrice({ price: 50 }),
        new CropPrice({ price: 30 })
      ];
      
      const cv = priceService.calculateCoefficientOfVariation(prices);
      
      expect(cv).toBeGreaterThan(0);
      expect(typeof cv).toBe('number');
    });

    it('should get quality distribution correctly', () => {
      const distribution = priceService.getQualityDistribution(samplePrices);
      
      expect(distribution.premium).toBeGreaterThan(0);
      expect(distribution.standard).toBeGreaterThan(0);
      expect(distribution.premium + distribution.standard + distribution.low).toBe(100);
    });

    it('should get market distribution correctly', () => {
      const distribution = priceService.getMarketDistribution(samplePrices);
      
      expect(distribution.Hyderabad).toBe(2);
      expect(distribution.Bangalore).toBe(1);
    });
  });

  describe('Cache Management', () => {
    it('should generate consistent cache keys', () => {
      const key1 = priceService.generateCacheKey('current', 'tomato', { market: 'Hyderabad' });
      const key2 = priceService.generateCacheKey('current', 'tomato', { market: 'Hyderabad' });
      
      expect(key1).toBe(key2);
    });

    it('should set and get from cache correctly', () => {
      const testData = { test: 'data' };
      const key = 'test_key';
      
      priceService.setCache(key, testData);
      const retrieved = priceService.getFromCache(key);
      
      expect(retrieved).toEqual(testData);
    });

    it('should return null for expired cache', (done) => {
      const testData = { test: 'data' };
      const key = 'test_key';
      
      // Set cache expiry to 1ms for testing
      priceService.cacheExpiry = 1;
      priceService.setCache(key, testData);
      
      setTimeout(() => {
        const retrieved = priceService.getFromCache(key);
        expect(retrieved).toBeNull();
        done();
      }, 10);
    });
  });
});