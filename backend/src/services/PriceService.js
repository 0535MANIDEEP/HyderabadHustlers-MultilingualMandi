const CsvParserService = require('./CsvParserService');
const CacheService = require('./CacheService');
const { CropPrice } = require('../models/CropModels');

/**
 * Price Service
 * Handles price calculation, analytics, and market data analysis for agricultural crops
 * Validates Requirements 2.2, 2.3, 6.2, 9.5 (with caching)
 */
class PriceService {
  constructor(options = {}) {
    this.csvParser = new CsvParserService();
    this.cacheService = options.cacheService || new CacheService();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache for fallback
    
    // Legacy in-memory cache as fallback
    this.priceCache = new Map();
  }

  /**
   * Gets current market prices for a specific crop
   * @param {string} cropName - Name of the crop
   * @param {Object} options - Query options (market, state, quality, etc.)
   * @returns {Promise<Object>} Price data with statistics and analysis
   */
  async getCurrentPrices(cropName, options = {}) {
    try {
      // Try Redis cache first
      const market = options.market || 'all';
      const cachedPrice = await this.cacheService.getCachedPrice(cropName, market);
      if (cachedPrice) {
        console.log(`Cache hit for ${cropName} in ${market}`);
        return cachedPrice;
      }

      // Fallback to legacy cache
      const cacheKey = this.generateCacheKey('current', cropName, options);
      const legacyCached = this.getFromCache(cacheKey);
      if (legacyCached) {
        console.log(`Legacy cache hit for ${cropName}`);
        return legacyCached;
      }

      console.log(`Cache miss for ${cropName}, fetching fresh data`);

      // Parse CSV data
      const parseResult = await this.csvParser.parseMandiPrices();
      if (!parseResult.success) {
        throw new Error(`Failed to parse price data: ${parseResult.error}`);
      }

      // Filter prices based on crop name and options
      const filters = {
        cropName,
        ...options
      };
      
      const filteredPrices = this.csvParser.filterCropPrices(parseResult.data, filters);
      
      if (filteredPrices.length === 0) {
        const result = {
          success: false,
          message: `No price data found for ${cropName}`,
          suggestions: await this.getSimilarCrops(cropName, parseResult.data)
        };
        
        // Cache negative results for shorter time
        await this.cacheService.cachePrice(cropName, market, result);
        return result;
      }

      // Calculate statistics and analysis
      const statistics = this.calculateAdvancedStatistics(filteredPrices);
      const trendAnalysis = this.analyzeTrends(filteredPrices);
      const fairPriceRange = this.calculateFairPriceRange(filteredPrices, statistics);
      const marketAnalysis = this.analyzeMarketConditions(filteredPrices);

      const result = {
        success: true,
        cropName,
        totalRecords: filteredPrices.length,
        prices: filteredPrices.map(p => p.toObject()),
        statistics,
        trendAnalysis,
        fairPriceRange,
        marketAnalysis,
        recommendations: this.generateRecommendations(statistics, trendAnalysis, marketAnalysis),
        lastUpdated: new Date().toISOString()
      };

      // Cache in both Redis and legacy cache
      await this.cacheService.cachePrice(cropName, market, result);
      this.setCache(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('Error getting current prices:', error);
      return {
        success: false,
        error: error.message,
        cropName
      };
    }
  }

  /**
   * Calculates advanced statistics for crop prices
   * @param {Array<CropPrice>} prices - Array of crop price objects
   * @returns {Object} Advanced statistics including percentiles and variance
   */
  calculateAdvancedStatistics(prices) {
    if (!prices || prices.length === 0) {
      return this.getEmptyStatistics();
    }

    const priceValues = prices.map(p => p.price).sort((a, b) => a - b);
    const count = priceValues.length;
    const sum = priceValues.reduce((acc, price) => acc + price, 0);
    const average = sum / count;

    // Calculate variance and standard deviation
    const variance = priceValues.reduce((acc, price) => acc + Math.pow(price - average, 2), 0) / count;
    const standardDeviation = Math.sqrt(variance);

    // Calculate percentiles
    const percentiles = this.calculatePercentiles(priceValues);

    // Calculate coefficient of variation (CV)
    const coefficientOfVariation = (standardDeviation / average) * 100;

    // Group by quality and calculate quality-based statistics
    const qualityStats = this.calculateQualityStatistics(prices);

    // Group by market and calculate market-based statistics
    const marketStats = this.calculateMarketStatistics(prices);

    return {
      count,
      sum: Math.round(sum * 100) / 100,
      average: Math.round(average * 100) / 100,
      min: priceValues[0],
      max: priceValues[count - 1],
      median: percentiles.p50,
      variance: Math.round(variance * 100) / 100,
      standardDeviation: Math.round(standardDeviation * 100) / 100,
      coefficientOfVariation: Math.round(coefficientOfVariation * 100) / 100,
      percentiles,
      qualityStats,
      marketStats,
      priceDistribution: this.calculatePriceDistribution(priceValues)
    };
  }

  /**
   * Calculates percentiles for price data
   * @param {Array<number>} sortedPrices - Sorted array of prices
   * @returns {Object} Percentile values
   */
  calculatePercentiles(sortedPrices) {
    const getPercentile = (arr, percentile) => {
      const index = (percentile / 100) * (arr.length - 1);
      if (Math.floor(index) === index) {
        return arr[index];
      } else {
        const lower = arr[Math.floor(index)];
        const upper = arr[Math.ceil(index)];
        return lower + (upper - lower) * (index - Math.floor(index));
      }
    };

    return {
      p10: Math.round(getPercentile(sortedPrices, 10) * 100) / 100,
      p25: Math.round(getPercentile(sortedPrices, 25) * 100) / 100,
      p50: Math.round(getPercentile(sortedPrices, 50) * 100) / 100,
      p75: Math.round(getPercentile(sortedPrices, 75) * 100) / 100,
      p90: Math.round(getPercentile(sortedPrices, 90) * 100) / 100
    };
  }

  /**
   * Calculates statistics grouped by quality
   * @param {Array<CropPrice>} prices - Array of crop price objects
   * @returns {Object} Quality-based statistics
   */
  calculateQualityStatistics(prices) {
    const grouped = this.csvParser.groupCropPrices(prices, 'quality');
    const qualityStats = {};

    if (!grouped) {
      return qualityStats;
    }

    Object.keys(grouped).forEach(quality => {
      const groupData = grouped[quality];
      qualityStats[quality] = {
        count: groupData.statistics.count,
        average: groupData.statistics.average,
        min: groupData.statistics.min,
        max: groupData.statistics.max,
        median: groupData.statistics.median
      };
    });

    return qualityStats;
  }

  /**
   * Calculates statistics grouped by market
   * @param {Array<CropPrice>} prices - Array of crop price objects
   * @returns {Object} Market-based statistics
   */
  calculateMarketStatistics(prices) {
    const grouped = this.csvParser.groupCropPrices(prices, 'market');
    const marketStats = {};

    if (!grouped) {
      return marketStats;
    }

    Object.keys(grouped).forEach(market => {
      const groupData = grouped[market];
      marketStats[market] = {
        count: groupData.statistics.count,
        average: groupData.statistics.average,
        min: groupData.statistics.min,
        max: groupData.statistics.max,
        median: groupData.statistics.median,
        state: groupData.prices[0]?.state || 'Unknown'
      };
    });

    return marketStats;
  }

  /**
   * Calculates price distribution into ranges
   * @param {Array<number>} prices - Array of price values
   * @returns {Object} Price distribution data
   */
  calculatePriceDistribution(prices) {
    if (!prices || prices.length === 0) {
      return [];
    }

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min;
    
    if (range === 0) {
      return [{
        range: `₹${min}`,
        count: prices.length,
        percentage: 100
      }];
    }

    const bucketSize = range / 5; // Create 5 buckets

    const buckets = Array(5).fill(0).map((_, i) => ({
      range: `₹${Math.round((min + i * bucketSize) * 100) / 100} - ₹${Math.round((min + (i + 1) * bucketSize) * 100) / 100}`,
      count: 0,
      percentage: 0
    }));

    prices.forEach(price => {
      const bucketIndex = Math.min(Math.floor((price - min) / bucketSize), 4);
      buckets[bucketIndex].count++;
    });

    buckets.forEach(bucket => {
      bucket.percentage = Math.round((bucket.count / prices.length) * 100 * 100) / 100;
    });

    return buckets;
  }

  /**
   * Analyzes price trends and patterns
   * @param {Array<CropPrice>} prices - Array of crop price objects
   * @returns {Object} Trend analysis data
   */
  analyzeTrends(prices) {
    if (!prices || prices.length < 2) {
      return {
        trend: 'insufficient_data',
        message: 'Insufficient data for trend analysis',
        dataPoints: prices.length
      };
    }

    // Sort by date
    const sortedPrices = prices.sort((a, b) => a.date - b.date);
    const priceValues = sortedPrices.map(p => p.price);

    // Calculate moving averages
    const movingAverages = this.calculateMovingAverages(priceValues, 3);

    // Determine overall trend
    const firstPrice = priceValues[0];
    const lastPrice = priceValues[priceValues.length - 1];
    const priceChange = lastPrice - firstPrice;
    const percentageChange = (priceChange / firstPrice) * 100;

    let trend = 'stable';
    if (percentageChange > 5) {
      trend = 'increasing';
    } else if (percentageChange < -5) {
      trend = 'decreasing';
    }

    // Calculate volatility
    const volatility = this.calculateVolatility(priceValues);

    // Identify seasonal patterns (if enough data)
    const seasonalPatterns = this.identifySeasonalPatterns(sortedPrices);

    return {
      trend,
      priceChange: Math.round(priceChange * 100) / 100,
      percentageChange: Math.round(percentageChange * 100) / 100,
      volatility: Math.round(volatility * 100) / 100,
      movingAverages,
      seasonalPatterns,
      dataPoints: prices.length,
      dateRange: {
        from: sortedPrices[0].date,
        to: sortedPrices[sortedPrices.length - 1].date
      }
    };
  }

  /**
   * Calculates moving averages for price data
   * @param {Array<number>} prices - Array of price values
   * @param {number} window - Moving average window size
   * @returns {Array<number>} Moving averages
   */
  calculateMovingAverages(prices, window = 3) {
    if (prices.length < window) {
      return prices;
    }

    const movingAverages = [];
    for (let i = window - 1; i < prices.length; i++) {
      const sum = prices.slice(i - window + 1, i + 1).reduce((acc, price) => acc + price, 0);
      movingAverages.push(Math.round((sum / window) * 100) / 100);
    }

    return movingAverages;
  }

  /**
   * Calculates price volatility
   * @param {Array<number>} prices - Array of price values
   * @returns {number} Volatility measure
   */
  calculateVolatility(prices) {
    if (prices.length < 2) {
      return 0;
    }

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      const returnValue = (prices[i] - prices[i - 1]) / prices[i - 1];
      returns.push(returnValue);
    }

    const avgReturn = returns.reduce((acc, ret) => acc + ret, 0) / returns.length;
    const variance = returns.reduce((acc, ret) => acc + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * 100; // Convert to percentage
  }

  /**
   * Identifies seasonal patterns in price data
   * @param {Array<CropPrice>} sortedPrices - Sorted array of crop prices
   * @returns {Object} Seasonal pattern analysis
   */
  identifySeasonalPatterns(sortedPrices) {
    if (sortedPrices.length < 12) {
      return {
        hasSeasonalData: false,
        message: 'Insufficient data for seasonal analysis'
      };
    }

    const monthlyPrices = {};
    sortedPrices.forEach(price => {
      const month = price.date.getMonth();
      if (!monthlyPrices[month]) {
        monthlyPrices[month] = [];
      }
      monthlyPrices[month].push(price.price);
    });

    const monthlyAverages = {};
    Object.keys(monthlyPrices).forEach(month => {
      const prices = monthlyPrices[month];
      monthlyAverages[month] = prices.reduce((acc, price) => acc + price, 0) / prices.length;
    });

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const seasonalData = Object.keys(monthlyAverages).map(month => ({
      month: monthNames[parseInt(month)],
      averagePrice: Math.round(monthlyAverages[month] * 100) / 100,
      dataPoints: monthlyPrices[month].length
    }));

    return {
      hasSeasonalData: true,
      monthlyAverages: seasonalData,
      peakMonth: seasonalData.reduce((max, current) => 
        current.averagePrice > max.averagePrice ? current : max
      ),
      lowMonth: seasonalData.reduce((min, current) => 
        current.averagePrice < min.averagePrice ? current : min
      )
    };
  }

  /**
   * Calculates fair price range based on market data and statistics
   * @param {Array<CropPrice>} prices - Array of crop price objects
   * @param {Object} statistics - Price statistics
   * @returns {Object} Fair price range with recommendations
   */
  calculateFairPriceRange(prices, statistics) {
    if (!prices || prices.length === 0) {
      return {
        fairRange: null,
        confidence: 'low',
        message: 'Insufficient data for fair price calculation'
      };
    }

    const { average, standardDeviation, percentiles } = statistics;

    // Method 1: Statistical approach using standard deviation
    const statRange = {
      min: Math.max(0, average - standardDeviation),
      max: average + standardDeviation
    };

    // Method 2: Percentile-based approach (25th to 75th percentile)
    const percentileRange = {
      min: percentiles.p25,
      max: percentiles.p75
    };

    // Method 3: Quality-adjusted range
    const qualityRange = this.calculateQualityAdjustedRange(prices, statistics);

    // Method 4: Market-adjusted range
    const marketRange = this.calculateMarketAdjustedRange(prices, statistics);

    // Combine methods to get final fair range
    const combinedMin = Math.max(
      statRange.min,
      percentileRange.min * 0.95, // Allow 5% below 25th percentile
      qualityRange.min
    );

    const combinedMax = Math.min(
      statRange.max,
      percentileRange.max * 1.05, // Allow 5% above 75th percentile
      qualityRange.max
    );

    // Determine confidence level
    const dataPoints = prices.length;
    const cv = statistics.coefficientOfVariation;
    
    let confidence = 'low';
    if (dataPoints >= 10 && cv < 20) {
      confidence = 'high';
    } else if (dataPoints >= 5 && cv < 30) {
      confidence = 'medium';
    }

    return {
      fairRange: {
        min: Math.round(combinedMin * 100) / 100,
        max: Math.round(combinedMax * 100) / 100,
        average: Math.round(average * 100) / 100
      },
      confidence,
      methodology: {
        statistical: statRange,
        percentile: percentileRange,
        qualityAdjusted: qualityRange,
        marketAdjusted: marketRange
      },
      factors: {
        dataPoints,
        coefficientOfVariation: cv,
        qualityDistribution: this.getQualityDistribution(prices),
        marketDistribution: this.getMarketDistribution(prices)
      },
      recommendations: this.generatePriceRecommendations(combinedMin, combinedMax, average, confidence)
    };
  }

  /**
   * Calculates quality-adjusted price range
   * @param {Array<CropPrice>} prices - Array of crop price objects
   * @param {Object} statistics - Price statistics
   * @returns {Object} Quality-adjusted range
   */
  calculateQualityAdjustedRange(prices, statistics) {
    const qualityStats = statistics.qualityStats;
    const qualityPremiums = {
      premium: 1.2,  // 20% premium
      standard: 1.0, // Base price
      low: 0.8       // 20% discount
    };

    let adjustedMin = statistics.average;
    let adjustedMax = statistics.average;

    Object.keys(qualityStats).forEach(quality => {
      const premium = qualityPremiums[quality] || 1.0;
      const qualityAvg = qualityStats[quality].average;
      const adjustedPrice = qualityAvg * premium;
      
      adjustedMin = Math.min(adjustedMin, adjustedPrice * 0.9);
      adjustedMax = Math.max(adjustedMax, adjustedPrice * 1.1);
    });

    return {
      min: adjustedMin,
      max: adjustedMax
    };
  }

  /**
   * Calculates market-adjusted price range
   * @param {Array<CropPrice>} prices - Array of crop price objects
   * @param {Object} statistics - Price statistics
   * @returns {Object} Market-adjusted range
   */
  calculateMarketAdjustedRange(prices, statistics) {
    const marketStats = statistics.marketStats;
    const marketPrices = Object.values(marketStats).map(stat => stat.average);
    
    if (marketPrices.length === 0) {
      return {
        min: statistics.average * 0.9,
        max: statistics.average * 1.1
      };
    }

    const marketMin = Math.min(...marketPrices);
    const marketMax = Math.max(...marketPrices);

    return {
      min: marketMin * 0.95,
      max: marketMax * 1.05
    };
  }

  /**
   * Analyzes market conditions and provides insights
   * @param {Array<CropPrice>} prices - Array of crop price objects
   * @returns {Object} Market analysis data
   */
  analyzeMarketConditions(prices) {
    if (!prices || prices.length === 0) {
      return {
        condition: 'unknown',
        message: 'Insufficient data for market analysis'
      };
    }

    const statistics = this.csvParser.calculatePriceStatistics(prices);
    const cv = this.calculateCoefficientOfVariation(prices);
    
    // Analyze supply indicators
    const supplyIndicators = this.analyzeSupplyIndicators(prices);
    
    // Analyze demand indicators
    const demandIndicators = this.analyzeDemandIndicators(prices);
    
    // Determine overall market condition
    let condition = 'stable';
    let message = 'Market conditions appear stable';
    
    if (cv > 30) {
      condition = 'volatile';
      message = 'High price volatility indicates unstable market conditions';
    } else if (supplyIndicators.oversupply) {
      condition = 'buyer_favorable';
      message = 'Market conditions favor buyers with good supply availability';
    } else if (demandIndicators.highDemand) {
      condition = 'seller_favorable';
      message = 'Market conditions favor sellers with strong demand';
    }

    return {
      condition,
      message,
      volatility: cv,
      supplyIndicators,
      demandIndicators,
      marketMetrics: {
        averagePrice: statistics.average,
        priceRange: statistics.max - statistics.min,
        marketCount: new Set(prices.map(p => p.market)).size,
        qualityDistribution: this.getQualityDistribution(prices)
      }
    };
  }

  /**
   * Analyzes supply indicators from price data
   * @param {Array<CropPrice>} prices - Array of crop price objects
   * @returns {Object} Supply analysis
   */
  analyzeSupplyIndicators(prices) {
    const qualityDistribution = this.getQualityDistribution(prices);
    const marketCount = new Set(prices.map(p => p.market)).size;
    const averagePrice = prices.reduce((sum, p) => sum + p.price, 0) / prices.length;
    
    // High supply indicators
    const highStandardQuality = qualityDistribution.standard > 60;
    const multipleMarkets = marketCount > 3;
    const belowAveragePrice = averagePrice < 50; // Arbitrary threshold for demo
    
    const oversupply = highStandardQuality && multipleMarkets && belowAveragePrice;
    
    return {
      oversupply,
      marketAvailability: marketCount,
      qualityAvailability: qualityDistribution,
      supplyScore: this.calculateSupplyScore(qualityDistribution, marketCount, averagePrice)
    };
  }

  /**
   * Analyzes demand indicators from price data
   * @param {Array<CropPrice>} prices - Array of crop price objects
   * @returns {Object} Demand analysis
   */
  analyzeDemandIndicators(prices) {
    const qualityDistribution = this.getQualityDistribution(prices);
    const averagePrice = prices.reduce((sum, p) => sum + p.price, 0) / prices.length;
    
    // High demand indicators
    const highPremiumQuality = qualityDistribution.premium > 30;
    const aboveAveragePrice = averagePrice > 50; // Arbitrary threshold for demo
    const limitedLowQuality = qualityDistribution.low < 20;
    
    const highDemand = highPremiumQuality && aboveAveragePrice && limitedLowQuality;
    
    return {
      highDemand,
      premiumDemand: qualityDistribution.premium,
      priceLevel: aboveAveragePrice ? 'high' : 'moderate',
      demandScore: this.calculateDemandScore(qualityDistribution, averagePrice)
    };
  }

  /**
   * Generates recommendations based on analysis
   * @param {Object} statistics - Price statistics
   * @param {Object} trendAnalysis - Trend analysis data
   * @param {Object} marketAnalysis - Market analysis data
   * @returns {Array<string>} Array of recommendations
   */
  generateRecommendations(statistics, trendAnalysis, marketAnalysis) {
    const recommendations = [];

    // Price-based recommendations
    if (statistics.coefficientOfVariation > 25) {
      recommendations.push('High price volatility detected. Consider waiting for more stable conditions.');
    }

    // Trend-based recommendations
    if (trendAnalysis.trend === 'increasing') {
      recommendations.push('Prices are trending upward. Sellers may benefit from current market conditions.');
    } else if (trendAnalysis.trend === 'decreasing') {
      recommendations.push('Prices are trending downward. Buyers may find favorable conditions.');
    }

    // Market condition recommendations
    if (marketAnalysis.condition === 'buyer_favorable') {
      recommendations.push('Market conditions favor buyers with good supply availability.');
    } else if (marketAnalysis.condition === 'seller_favorable') {
      recommendations.push('Market conditions favor sellers with strong demand indicators.');
    }

    // Quality-based recommendations
    const qualityStats = statistics.qualityStats;
    if (qualityStats.premium && qualityStats.standard) {
      const premiumPremium = ((qualityStats.premium.average - qualityStats.standard.average) / qualityStats.standard.average) * 100;
      if (premiumPremium > 20) {
        recommendations.push(`Premium quality commands ${Math.round(premiumPremium)}% higher prices.`);
      }
    }

    // Data quality recommendations
    if (statistics.count < 5) {
      recommendations.push('Limited data available. Consider gathering more market information for better insights.');
    }

    return recommendations;
  }

  /**
   * Gets similar crops when requested crop is not found
   * @param {string} cropName - Name of the requested crop
   * @param {Array<CropPrice>} allPrices - All available price data
   * @returns {Array<string>} Array of similar crop names
   */
  async getSimilarCrops(cropName, allPrices) {
    const availableCrops = [...new Set(allPrices.map(p => p.cropName.toLowerCase()))];
    const searchTerm = cropName.toLowerCase();
    
    // Simple similarity matching
    const similar = availableCrops.filter(crop => 
      crop.includes(searchTerm) || searchTerm.includes(crop)
    );

    return similar.length > 0 ? similar : availableCrops.slice(0, 5);
  }

  /**
   * Get crop prices with caching
   * @param {string} cropName - Name of the crop
   * @returns {Promise<Array>} Array of crop prices
   */
  async getCropPrices(cropName) {
    try {
      // Check cache first
      const cachedData = await this.cacheService.getCachedCropData(cropName);
      if (cachedData) {
        return cachedData.prices || [];
      }

      // Parse CSV data
      const parseResult = await this.csvParser.parseMandiPrices();
      if (!parseResult.success) {
        throw new Error(`Failed to parse price data: ${parseResult.error}`);
      }

      const filteredPrices = this.csvParser.filterCropPrices(parseResult.data, { cropName });
      
      // Cache the crop data
      await this.cacheService.cacheCropData(cropName, {
        name: cropName,
        prices: filteredPrices.map(p => p.toObject()),
        lastUpdated: new Date().toISOString()
      });

      return filteredPrices;
    } catch (error) {
      console.error('Error getting crop prices:', error);
      return [];
    }
  }

  /**
   * Calculate price statistics with caching
   * @param {string} cropName - Name of the crop
   * @returns {Promise<Object>} Price statistics
   */
  async calculatePriceStatistics(cropName) {
    try {
      // Check if we have cached statistics
      const cacheKey = `stats_${cropName}`;
      const cachedStats = await this.cacheService.get('analytics', { type: 'stats', period: cropName });
      if (cachedStats) {
        return cachedStats;
      }

      const prices = await this.getCropPrices(cropName);
      if (prices.length === 0) {
        return this.getEmptyStatistics();
      }

      const statistics = this.calculateAdvancedStatistics(prices);
      
      // Cache the statistics
      await this.cacheService.set('analytics', { type: 'stats', period: cropName }, statistics);
      
      return statistics;
    } catch (error) {
      console.error('Error calculating price statistics:', error);
      return this.getEmptyStatistics();
    }
  }

  /**
   * Invalidate cache for a specific crop
   * @param {string} cropName - Name of the crop
   * @returns {Promise<boolean>} Success status
   */
  async invalidateCropCache(cropName) {
    try {
      await this.cacheService.invalidateCropPrices(cropName);
      
      // Also clear legacy cache
      const keysToDelete = [];
      for (const key of this.priceCache.keys()) {
        if (key.includes(cropName)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.priceCache.delete(key));
      
      console.log(`Cache invalidated for crop: ${cropName}`);
      return true;
    } catch (error) {
      console.error('Error invalidating crop cache:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache performance statistics
   */
  getCacheStats() {
    return {
      redis: this.cacheService.getStats(),
      legacy: {
        size: this.priceCache.size,
        keys: Array.from(this.priceCache.keys())
      }
    };
  }

  /**
   * Warm up cache with popular crops
   * @param {Array<string>} cropNames - Array of crop names to cache
   * @returns {Promise<Object>} Warm-up results
   */
  async warmUpCache(cropNames = ['tomato', 'onion', 'chili', 'potato', 'rice']) {
    const results = {
      success: 0,
      failed: 0,
      crops: {}
    };

    for (const cropName of cropNames) {
      try {
        console.log(`Warming up cache for ${cropName}...`);
        const priceData = await this.getCurrentPrices(cropName);
        if (priceData.success) {
          results.success++;
          results.crops[cropName] = 'cached';
        } else {
          results.failed++;
          results.crops[cropName] = 'failed';
        }
      } catch (error) {
        console.error(`Failed to warm up cache for ${cropName}:`, error);
        results.failed++;
        results.crops[cropName] = 'error';
      }
    }

    console.log(`Cache warm-up completed: ${results.success} success, ${results.failed} failed`);
    return results;
  }

  // Helper methods
  generateCacheKey(type, cropName, options) {
    return `${type}_${cropName}_${JSON.stringify(options)}`;
  }

  getFromCache(key) {
    const cached = this.priceCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.priceCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  getEmptyStatistics() {
    return {
      count: 0,
      sum: 0,
      average: 0,
      min: 0,
      max: 0,
      median: 0,
      variance: 0,
      standardDeviation: 0,
      coefficientOfVariation: 0,
      percentiles: { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 },
      qualityStats: {},
      marketStats: {},
      priceDistribution: []
    };
  }

  calculateCoefficientOfVariation(prices) {
    const priceValues = prices.map(p => p.price);
    const average = priceValues.reduce((sum, price) => sum + price, 0) / priceValues.length;
    const variance = priceValues.reduce((sum, price) => sum + Math.pow(price - average, 2), 0) / priceValues.length;
    const standardDeviation = Math.sqrt(variance);
    return (standardDeviation / average) * 100;
  }

  getQualityDistribution(prices) {
    const total = prices.length;
    const distribution = { premium: 0, standard: 0, low: 0 };
    
    prices.forEach(price => {
      distribution[price.quality] = (distribution[price.quality] || 0) + 1;
    });

    Object.keys(distribution).forEach(quality => {
      distribution[quality] = Math.round((distribution[quality] / total) * 100);
    });

    return distribution;
  }

  getMarketDistribution(prices) {
    const markets = {};
    prices.forEach(price => {
      markets[price.market] = (markets[price.market] || 0) + 1;
    });
    return markets;
  }

  calculateSupplyScore(qualityDistribution, marketCount, averagePrice) {
    let score = 0;
    score += qualityDistribution.standard * 0.4;
    score += Math.min(marketCount * 10, 50);
    score += averagePrice < 50 ? 20 : 0;
    return Math.min(score, 100);
  }

  calculateDemandScore(qualityDistribution, averagePrice) {
    let score = 0;
    score += qualityDistribution.premium * 0.6;
    score += averagePrice > 50 ? 30 : 0;
    score += qualityDistribution.low < 20 ? 20 : 0;
    return Math.min(score, 100);
  }

  generatePriceRecommendations(min, max, average, confidence) {
    const recommendations = [];
    
    if (confidence === 'high') {
      recommendations.push(`Fair price range: ₹${min} - ₹${max} per kg`);
      recommendations.push(`Target price: ₹${average} per kg`);
    } else if (confidence === 'medium') {
      recommendations.push(`Estimated price range: ₹${min} - ₹${max} per kg (moderate confidence)`);
    } else {
      recommendations.push(`Price estimate: ₹${min} - ₹${max} per kg (low confidence - limited data)`);
    }

    return recommendations;
  }
}

module.exports = PriceService;