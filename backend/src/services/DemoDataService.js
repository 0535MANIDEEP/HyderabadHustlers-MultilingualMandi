/**
 * Demo Data Service for Multilingual Mandi
 * Provides sample data and scenarios for demonstration purposes
 */

const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');

class DemoDataService {
  constructor() {
    this.demoScenarios = null;
    this.samplePriceData = [];
    this.demoUsers = [];
    this.loadDemoData();
  }

  /**
   * Load demo data from files
   */
  async loadDemoData() {
    try {
      // Load demo scenarios
      const scenariosPath = path.join(__dirname, '../../data/demo_scenarios.json');
      const scenariosData = fs.readFileSync(scenariosPath, 'utf8');
      this.demoScenarios = JSON.parse(scenariosData);
      
      // Load CSV price data
      await this.loadPriceData();
      
      console.log('Demo data loaded successfully');
    } catch (error) {
      console.error('Failed to load demo data:', error);
    }
  }

  /**
   * Load price data from CSV
   */
  async loadPriceData() {
    return new Promise((resolve, reject) => {
      const csvPath = path.join(__dirname, '../../data/mandi_prices.csv');
      const results = [];
      
      fs.createReadStream(csvPath)
        .pipe(csvParser())
        .on('data', (data) => {
          // Convert price to number and add calculated fields
          const priceData = {
            ...data,
            price_per_kg: parseFloat(data.price_per_kg),
            coordinates_lat: parseFloat(data.coordinates_lat),
            coordinates_lng: parseFloat(data.coordinates_lng),
            date: new Date(data.date),
            // Add trend simulation
            trend: this.simulateTrend(),
            change_percentage: this.simulateChange(),
            last_updated: new Date()
          };
          results.push(priceData);
        })
        .on('end', () => {
          this.samplePriceData = results;
          console.log(`Loaded ${results.length} price records`);
          resolve(results);
        })
        .on('error', (error) => {
          console.error('Error loading CSV data:', error);
          reject(error);
        });
    });
  }

  /**
   * Simulate price trend for demo purposes
   */
  simulateTrend() {
    const trends = ['up', 'down', 'stable'];
    const weights = [0.3, 0.2, 0.5]; // 30% up, 20% down, 50% stable
    const random = Math.random();
    
    if (random < weights[0]) return 'up';
    if (random < weights[0] + weights[1]) return 'down';
    return 'stable';
  }

  /**
   * Simulate price change percentage
   */
  simulateChange() {
    return (Math.random() - 0.5) * 20; // -10% to +10%
  }

  /**
   * Get all demo scenarios
   */
  getDemoScenarios() {
    return this.demoScenarios?.scenarios || [];
  }

  /**
   * Get specific demo scenario by ID
   */
  getDemoScenario(scenarioId) {
    return this.demoScenarios?.scenarios.find(s => s.id === scenarioId);
  }

  /**
   * Get demo users
   */
  getDemoUsers() {
    return this.demoScenarios?.demo_users || [];
  }

  /**
   * Get sample queries by language
   */
  getSampleQueries(language = 'english') {
    return this.demoScenarios?.sample_queries[language] || [];
  }

  /**
   * Get negotiation templates
   */
  getNegotiationTemplates() {
    return this.demoScenarios?.negotiation_templates || [];
  }

  /**
   * Get price data for specific crop
   */
  getPriceDataForCrop(cropName, market = null) {
    let filtered = this.samplePriceData.filter(
      item => item.crop_name.toLowerCase() === cropName.toLowerCase()
    );
    
    if (market) {
      filtered = filtered.filter(
        item => item.market.toLowerCase() === market.toLowerCase()
      );
    }
    
    return filtered;
  }

  /**
   * Get all available crops
   */
  getAvailableCrops() {
    const crops = [...new Set(this.samplePriceData.map(item => item.crop_name))];
    return crops.sort();
  }

  /**
   * Get all available markets
   */
  getAvailableMarkets() {
    const markets = [...new Set(this.samplePriceData.map(item => item.market))];
    return markets.sort();
  }

  /**
   * Get price comparison across markets
   */
  getPriceComparison(cropName) {
    const cropData = this.getPriceDataForCrop(cropName);
    
    const comparison = cropData.map(item => ({
      market: item.market,
      state: item.state,
      variety: item.variety,
      price: item.price_per_kg,
      quality: item.quality,
      trend: item.trend,
      change: item.change_percentage
    }));
    
    // Sort by price
    comparison.sort((a, b) => a.price - b.price);
    
    return {
      crop: cropName,
      markets: comparison,
      lowest_price: comparison[0]?.price || 0,
      highest_price: comparison[comparison.length - 1]?.price || 0,
      average_price: comparison.reduce((sum, item) => sum + item.price, 0) / comparison.length || 0
    };
  }

  /**
   * Get market trends summary
   */
  getMarketTrends(market = null) {
    let data = this.samplePriceData;
    
    if (market) {
      data = data.filter(item => item.market.toLowerCase() === market.toLowerCase());
    }
    
    const trends = {
      up: data.filter(item => item.trend === 'up').length,
      down: data.filter(item => item.trend === 'down').length,
      stable: data.filter(item => item.trend === 'stable').length
    };
    
    const total = data.length;
    
    return {
      market: market || 'All Markets',
      total_crops: total,
      trends: {
        up: { count: trends.up, percentage: (trends.up / total * 100).toFixed(1) },
        down: { count: trends.down, percentage: (trends.down / total * 100).toFixed(1) },
        stable: { count: trends.stable, percentage: (trends.stable / total * 100).toFixed(1) }
      },
      top_gainers: data
        .filter(item => item.trend === 'up')
        .sort((a, b) => b.change_percentage - a.change_percentage)
        .slice(0, 5)
        .map(item => ({
          crop: item.crop_name,
          variety: item.variety,
          change: item.change_percentage.toFixed(1)
        })),
      top_losers: data
        .filter(item => item.trend === 'down')
        .sort((a, b) => a.change_percentage - b.change_percentage)
        .slice(0, 5)
        .map(item => ({
          crop: item.crop_name,
          variety: item.variety,
          change: item.change_percentage.toFixed(1)
        }))
    };
  }

  /**
   * Generate fair price range for a crop
   */
  getFairPriceRange(cropName, quality = null) {
    let cropData = this.getPriceDataForCrop(cropName);
    
    if (quality) {
      cropData = cropData.filter(item => item.quality.toLowerCase() === quality.toLowerCase());
    }
    
    if (cropData.length === 0) {
      return null;
    }
    
    const prices = cropData.map(item => item.price_per_kg);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    
    // Fair range is typically ±10% from average
    const fairMin = Math.max(minPrice, avgPrice * 0.9);
    const fairMax = Math.min(maxPrice, avgPrice * 1.1);
    
    return {
      crop: cropName,
      quality: quality || 'all',
      fair_range: {
        min: Math.round(fairMin),
        max: Math.round(fairMax)
      },
      market_range: {
        min: Math.round(minPrice),
        max: Math.round(maxPrice)
      },
      average: Math.round(avgPrice),
      recommendation: avgPrice < 50 ? 'Good time to buy' : 'Consider waiting for price drop'
    };
  }

  /**
   * Get bulk pricing suggestions
   */
  getBulkPricingSuggestion(cropName, quantity) {
    const basePrice = this.getPriceDataForCrop(cropName);
    if (basePrice.length === 0) {
      return null;
    }
    
    const avgPrice = basePrice.reduce((sum, item) => sum + item.price_per_kg, 0) / basePrice.length;
    
    // Bulk discount tiers
    let discount = 0;
    if (quantity >= 1000) discount = 0.15; // 15% for 1000+ kg
    else if (quantity >= 500) discount = 0.10; // 10% for 500+ kg
    else if (quantity >= 100) discount = 0.05; // 5% for 100+ kg
    
    const bulkPrice = avgPrice * (1 - discount);
    const totalCost = bulkPrice * quantity;
    const savings = (avgPrice - bulkPrice) * quantity;
    
    return {
      crop: cropName,
      quantity: quantity,
      regular_price: Math.round(avgPrice),
      bulk_price: Math.round(bulkPrice),
      discount_percentage: (discount * 100).toFixed(1),
      total_cost: Math.round(totalCost),
      savings: Math.round(savings),
      recommendation: discount > 0 ? `Save ₹${Math.round(savings)} with bulk purchase` : 'No bulk discount available'
    };
  }

  /**
   * Create demo negotiation session
   */
  createDemoNegotiationSession(scenarioId) {
    const scenario = this.getDemoScenario(scenarioId);
    if (!scenario) {
      return null;
    }
    
    const sessionId = `demo_${scenarioId}_${Date.now()}`;
    
    return {
      sessionId,
      scenario: scenario,
      participants: scenario.participants || [],
      status: 'active',
      createdAt: new Date(),
      messages: [],
      currentStep: 0,
      language: scenario.language
    };
  }

  /**
   * Get demo statistics
   */
  getDemoStatistics() {
    return {
      total_scenarios: this.demoScenarios?.scenarios.length || 0,
      total_crops: this.getAvailableCrops().length,
      total_markets: this.getAvailableMarkets().length,
      total_price_records: this.samplePriceData.length,
      languages_supported: ['English', 'Hindi', 'Telugu', 'Tamil'],
      demo_users: this.demoScenarios?.demo_users.length || 0,
      last_updated: new Date()
    };
  }

  /**
   * Search crops by name (supports partial matching)
   */
  searchCrops(query) {
    const searchTerm = query.toLowerCase();
    return this.samplePriceData
      .filter(item => 
        item.crop_name.toLowerCase().includes(searchTerm) ||
        item.variety.toLowerCase().includes(searchTerm)
      )
      .map(item => ({
        crop: item.crop_name,
        variety: item.variety,
        market: item.market,
        price: item.price_per_kg,
        quality: item.quality
      }))
      .slice(0, 10); // Limit to 10 results
  }

  /**
   * Get seasonal recommendations (mock data for demo)
   */
  getSeasonalRecommendations() {
    const currentMonth = new Date().getMonth() + 1;
    
    const seasonalData = {
      1: { season: 'Winter', recommended: ['cabbage', 'cauliflower', 'carrot'], avoid: ['mango', 'watermelon'] },
      2: { season: 'Winter', recommended: ['cabbage', 'cauliflower', 'carrot'], avoid: ['mango', 'watermelon'] },
      3: { season: 'Spring', recommended: ['tomato', 'onion', 'potato'], avoid: ['mango'] },
      4: { season: 'Summer', recommended: ['mango', 'watermelon', 'cucumber'], avoid: ['cabbage', 'cauliflower'] },
      5: { season: 'Summer', recommended: ['mango', 'watermelon', 'cucumber'], avoid: ['cabbage', 'cauliflower'] },
      6: { season: 'Monsoon', recommended: ['rice', 'okra', 'brinjal'], avoid: ['mango'] },
      7: { season: 'Monsoon', recommended: ['rice', 'okra', 'brinjal'], avoid: ['watermelon'] },
      8: { season: 'Monsoon', recommended: ['rice', 'okra', 'brinjal'], avoid: ['watermelon'] },
      9: { season: 'Post-Monsoon', recommended: ['onion', 'chili', 'turmeric'], avoid: ['mango'] },
      10: { season: 'Post-Monsoon', recommended: ['onion', 'chili', 'turmeric'], avoid: ['mango'] },
      11: { season: 'Winter', recommended: ['cabbage', 'cauliflower', 'carrot'], avoid: ['mango', 'watermelon'] },
      12: { season: 'Winter', recommended: ['cabbage', 'cauliflower', 'carrot'], avoid: ['mango', 'watermelon'] }
    };
    
    return seasonalData[currentMonth] || seasonalData[1];
  }
}

module.exports = new DemoDataService();