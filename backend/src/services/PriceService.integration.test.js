const PriceService = require('./PriceService');

describe('PriceService Integration Tests', () => {
  let priceService;

  beforeAll(() => {
    priceService = new PriceService();
  });

  describe('Real CSV Data Integration', () => {
    it('should successfully process tomato price data from CSV', async () => {
      const result = await priceService.getCurrentPrices('tomato');
      
      expect(result.success).toBe(true);
      expect(result.cropName).toBe('tomato');
      expect(result.totalRecords).toBeGreaterThan(0);
      expect(result.statistics).toBeDefined();
      expect(result.statistics.average).toBeGreaterThan(0);
      expect(result.trendAnalysis).toBeDefined();
      expect(result.fairPriceRange).toBeDefined();
      expect(result.marketAnalysis).toBeDefined();
      expect(result.recommendations).toBeInstanceOf(Array);
    });

    it('should handle non-existent crop gracefully', async () => {
      const result = await priceService.getCurrentPrices('nonexistent');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('No price data found');
      expect(result.suggestions).toBeInstanceOf(Array);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should process onion price data correctly', async () => {
      const result = await priceService.getCurrentPrices('onion');
      
      expect(result.success).toBe(true);
      expect(result.cropName).toBe('onion');
      expect(result.statistics.average).toBe(30); // Based on CSV data
    });

    it('should filter by market correctly', async () => {
      const result = await priceService.getCurrentPrices('tomato', { market: 'Hyderabad' });
      
      expect(result.success).toBe(true);
      expect(result.prices.every(p => p.market === 'Hyderabad')).toBe(true);
    });

    it('should filter by quality correctly', async () => {
      const result = await priceService.getCurrentPrices('tomato', { quality: 'premium' });
      
      expect(result.success).toBe(true);
      expect(result.prices.every(p => p.quality === 'premium')).toBe(true);
    });

    it('should calculate fair price range with confidence levels', async () => {
      const result = await priceService.getCurrentPrices('tomato');
      
      expect(result.fairPriceRange.fairRange).toBeDefined();
      expect(result.fairPriceRange.fairRange.min).toBeGreaterThan(0);
      expect(result.fairPriceRange.fairRange.max).toBeGreaterThanOrEqual(result.fairPriceRange.fairRange.min);
      expect(result.fairPriceRange.confidence).toMatch(/low|medium|high/);
    });

    it('should provide market analysis with supply/demand indicators', async () => {
      const result = await priceService.getCurrentPrices('tomato');
      
      expect(result.marketAnalysis.condition).toBeDefined();
      expect(result.marketAnalysis.supplyIndicators).toBeDefined();
      expect(result.marketAnalysis.demandIndicators).toBeDefined();
      expect(result.marketAnalysis.marketMetrics).toBeDefined();
    });

    it('should cache results for performance', async () => {
      // Clear any existing cache first
      priceService.priceCache.clear();
      
      const start1 = Date.now();
      const result1 = await priceService.getCurrentPrices('tomato');
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      const result2 = await priceService.getCurrentPrices('tomato');
      const time2 = Date.now() - start2;

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      // Check that results are identical (indicating cache hit)
      expect(result1.lastUpdated).toBe(result2.lastUpdated);
      
      // Second call should be significantly faster or at least not slower
      expect(time2).toBeLessThanOrEqual(time1 + 5); // Allow 5ms tolerance
    });
  });

  describe('Statistical Analysis Validation', () => {
    it('should calculate percentiles correctly for multiple crops', async () => {
      const result = await priceService.getCurrentPrices('tomato');
      
      if (result.success && result.totalRecords > 1) {
        const percentiles = result.statistics.percentiles;
        expect(percentiles.p25).toBeLessThanOrEqual(percentiles.p50);
        expect(percentiles.p50).toBeLessThanOrEqual(percentiles.p75);
        expect(percentiles.p10).toBeLessThanOrEqual(percentiles.p90);
      }
    });

    it('should provide quality-based statistics', async () => {
      const result = await priceService.getCurrentPrices('tomato');
      
      expect(result.statistics.qualityStats).toBeDefined();
      expect(Object.keys(result.statistics.qualityStats).length).toBeGreaterThan(0);
    });

    it('should provide market-based statistics', async () => {
      const result = await priceService.getCurrentPrices('tomato');
      
      expect(result.statistics.marketStats).toBeDefined();
      expect(Object.keys(result.statistics.marketStats).length).toBeGreaterThan(0);
    });
  });

  describe('Requirements Validation', () => {
    it('should validate Requirement 2.2: Calculate average prices using available data', async () => {
      const result = await priceService.getCurrentPrices('tomato');
      
      expect(result.success).toBe(true);
      expect(result.statistics.average).toBeGreaterThan(0);
      expect(typeof result.statistics.average).toBe('number');
    });

    it('should validate Requirement 2.3: Suggest fair price range based on market conditions', async () => {
      const result = await priceService.getCurrentPrices('tomato');
      
      expect(result.fairPriceRange).toBeDefined();
      expect(result.fairPriceRange.fairRange).toBeDefined();
      expect(result.fairPriceRange.fairRange.min).toBeGreaterThan(0);
      expect(result.fairPriceRange.fairRange.max).toBeGreaterThan(0);
      expect(result.fairPriceRange.recommendations).toBeInstanceOf(Array);
    });

    it('should validate Requirement 6.2: Use statistical analysis for price computation', async () => {
      const result = await priceService.getCurrentPrices('tomato');
      
      expect(result.statistics).toBeDefined();
      expect(result.statistics.standardDeviation).toBeDefined();
      expect(result.statistics.variance).toBeDefined();
      expect(result.statistics.coefficientOfVariation).toBeDefined();
      expect(result.statistics.percentiles).toBeDefined();
    });
  });
});