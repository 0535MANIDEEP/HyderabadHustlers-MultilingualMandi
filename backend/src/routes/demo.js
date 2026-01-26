/**
 * Demo routes for Multilingual Mandi
 * Provides demo data, scenarios, and sample interactions
 */

const express = require('express');
const router = express.Router();
const demoDataService = require('../services/DemoDataService');
const loggingService = require('../services/LoggingService');
const errorHandler = require('../services/ErrorHandlingService');

/**
 * Get all demo scenarios
 */
router.get('/scenarios', (req, res) => {
  try {
    const scenarios = demoDataService.getDemoScenarios();
    
    loggingService.logAudit('demo_scenarios_accessed', 'demo', null, {
      count: scenarios.length,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip
    });
    
    res.json({
      success: true,
      data: scenarios,
      count: scenarios.length
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'demo_scenarios', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

/**
 * Get specific demo scenario
 */
router.get('/scenarios/:scenarioId', (req, res) => {
  try {
    const { scenarioId } = req.params;
    const scenario = demoDataService.getDemoScenario(scenarioId);
    
    if (!scenario) {
      return res.status(404).json(
        errorHandler.createErrorResponse('SCENARIO_NOT_FOUND', req.headers['accept-language'])
      );
    }
    
    loggingService.logAudit('demo_scenario_accessed', 'demo', null, {
      scenarioId,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip
    });
    
    res.json({
      success: true,
      data: scenario
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'demo_scenario', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

/**
 * Get demo users
 */
router.get('/users', (req, res) => {
  try {
    const users = demoDataService.getDemoUsers();
    
    // Remove passwords from response
    const safeUsers = users.map(user => {
      const { password, ...safeUser } = user;
      return safeUser;
    });
    
    res.json({
      success: true,
      data: safeUsers,
      count: safeUsers.length
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'demo_users', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

/**
 * Get sample queries by language
 */
router.get('/queries/:language?', (req, res) => {
  try {
    const { language = 'english' } = req.params;
    const queries = demoDataService.getSampleQueries(language);
    
    res.json({
      success: true,
      language,
      data: queries,
      count: queries.length
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'demo_queries', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

/**
 * Get price data for demo
 */
router.get('/prices', (req, res) => {
  try {
    const { crop, market, limit = 10 } = req.query;
    let priceData;
    
    if (crop) {
      priceData = demoDataService.getPriceDataForCrop(crop, market);
    } else {
      priceData = demoDataService.samplePriceData.slice(0, parseInt(limit));
    }
    
    res.json({
      success: true,
      data: priceData,
      count: priceData.length,
      filters: { crop, market }
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'demo_prices', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

/**
 * Get price comparison
 */
router.get('/prices/compare/:crop', (req, res) => {
  try {
    const { crop } = req.params;
    const comparison = demoDataService.getPriceComparison(crop);
    
    if (comparison.markets.length === 0) {
      return res.status(404).json(
        errorHandler.createErrorResponse('CROP_NOT_FOUND', req.headers['accept-language'])
      );
    }
    
    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'price_comparison', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

/**
 * Get market trends
 */
router.get('/trends/:market?', (req, res) => {
  try {
    const { market } = req.params;
    const trends = demoDataService.getMarketTrends(market);
    
    res.json({
      success: true,
      data: trends
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'market_trends', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

/**
 * Get fair price range
 */
router.get('/fair-price/:crop', (req, res) => {
  try {
    const { crop } = req.params;
    const { quality } = req.query;
    const fairPrice = demoDataService.getFairPriceRange(crop, quality);
    
    if (!fairPrice) {
      return res.status(404).json(
        errorHandler.createErrorResponse('CROP_NOT_FOUND', req.headers['accept-language'])
      );
    }
    
    res.json({
      success: true,
      data: fairPrice
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'fair_price', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

/**
 * Get bulk pricing suggestion
 */
router.post('/bulk-pricing', (req, res) => {
  try {
    const { crop, quantity } = req.body;
    
    if (!crop || !quantity) {
      return res.status(400).json(
        errorHandler.createErrorResponse('MISSING_PARAMETERS', req.headers['accept-language'])
      );
    }
    
    const bulkPricing = demoDataService.getBulkPricingSuggestion(crop, quantity);
    
    if (!bulkPricing) {
      return res.status(404).json(
        errorHandler.createErrorResponse('CROP_NOT_FOUND', req.headers['accept-language'])
      );
    }
    
    res.json({
      success: true,
      data: bulkPricing
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'bulk_pricing', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

/**
 * Create demo negotiation session
 */
router.post('/negotiation/:scenarioId', (req, res) => {
  try {
    const { scenarioId } = req.params;
    const session = demoDataService.createDemoNegotiationSession(scenarioId);
    
    if (!session) {
      return res.status(404).json(
        errorHandler.createErrorResponse('SCENARIO_NOT_FOUND', req.headers['accept-language'])
      );
    }
    
    loggingService.logAudit('demo_negotiation_created', 'demo', null, {
      scenarioId,
      sessionId: session.sessionId,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip
    });
    
    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'demo_negotiation', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

/**
 * Search crops
 */
router.get('/search/crops', (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query) {
      return res.status(400).json(
        errorHandler.createErrorResponse('MISSING_QUERY', req.headers['accept-language'])
      );
    }
    
    const results = demoDataService.searchCrops(query);
    
    res.json({
      success: true,
      query,
      data: results,
      count: results.length
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'crop_search', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

/**
 * Get available crops and markets
 */
router.get('/metadata', (req, res) => {
  try {
    const crops = demoDataService.getAvailableCrops();
    const markets = demoDataService.getAvailableMarkets();
    const stats = demoDataService.getDemoStatistics();
    const seasonal = demoDataService.getSeasonalRecommendations();
    
    res.json({
      success: true,
      data: {
        crops,
        markets,
        statistics: stats,
        seasonal_recommendations: seasonal
      }
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'demo_metadata', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

/**
 * Get negotiation templates
 */
router.get('/templates/negotiation', (req, res) => {
  try {
    const templates = demoDataService.getNegotiationTemplates();
    
    res.json({
      success: true,
      data: templates,
      count: templates.length
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'negotiation_templates', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

/**
 * Demo statistics endpoint
 */
router.get('/stats', (req, res) => {
  try {
    const stats = demoDataService.getDemoStatistics();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'demo_stats', req.headers['accept-language']);
    res.status(500).json(errorResponse);
  }
});

// Add missing error messages
errorHandler.errorMessages = {
  ...errorHandler.errorMessages,
  'SCENARIO_NOT_FOUND': {
    en: 'Demo scenario not found.',
    hi: 'डेमो परिदृश्य नहीं मिला।',
    te: 'డెమో దృశ్యం కనుగొనబడలేదు.',
    ta: 'டெமோ காட்சி கிடைக்கவில்லை.'
  },
  'CROP_NOT_FOUND': {
    en: 'Crop not found in our database.',
    hi: 'हमारे डेटाबेस में फसल नहीं मिली।',
    te: 'మా డేటాబేస్‌లో పంట కనుగొనబడలేదు.',
    ta: 'எங்கள் தரவுத்தளத்தில் பயிர் கிடைக்கவில்லை.'
  },
  'MISSING_PARAMETERS': {
    en: 'Required parameters are missing.',
    hi: 'आवश्यक पैरामीटर गुम हैं।',
    te: 'అవసరమైన పారామీటర్లు లేవు.',
    ta: 'தேவையான அளவுருக்கள் இல்லை.'
  },
  'MISSING_QUERY': {
    en: 'Search query is required.',
    hi: 'खोज क्वेरी आवश्यक है।',
    te: 'శోధన ప్రశ్న అవసరం.',
    ta: 'தேடல் வினவல் தேவை.'
  }
};

module.exports = router;