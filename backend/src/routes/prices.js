const express = require('express');
const PriceService = require('../services/PriceService');
const { PriceQuery } = require('../models/CropModels');
const router = express.Router();

const priceService = new PriceService();

// GET /api/v1/prices
router.get('/', async (req, res) => {
  try {
    const { crop, market, state, quality, source } = req.query;
    
    if (!crop) {
      return res.status(400).json({ 
        error: 'Crop name is required',
        message: 'Please provide a crop name in the query parameters'
      });
    }

    const options = {};
    if (market) options.market = market;
    if (state) options.state = state;
    if (quality) options.quality = quality;
    if (source) options.source = source;

    const result = await priceService.getCurrentPrices(crop, options);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Price discovery error:', error);
    res.status(500).json({ 
      error: 'Price discovery service error',
      message: error.message 
    });
  }
});

// POST /api/v1/prices/query
router.post('/query', async (req, res) => {
  try {
    const priceQuery = new PriceQuery(req.body);
    const validation = priceQuery.validate();
    
    if (validation.error) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: validation.error.details
      });
    }

    const options = {
      market: priceQuery.market,
      state: priceQuery.state,
      quality: priceQuery.quality,
      source: priceQuery.source,
      dateRange: priceQuery.dateRange,
      priceRange: req.body.priceRange,
      maxDistance: priceQuery.maxDistance,
      userLocation: priceQuery.userLocation
    };

    // Remove undefined values
    Object.keys(options).forEach(key => {
      if (options[key] === undefined || options[key] === null) {
        delete options[key];
      }
    });

    const result = await priceService.getCurrentPrices(priceQuery.cropName, options);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Price query error:', error);
    res.status(500).json({ 
      error: 'Price query service error',
      message: error.message 
    });
  }
});

// GET /api/v1/prices/analytics/:crop
router.get('/analytics/:crop', async (req, res) => {
  try {
    const { crop } = req.params;
    const { market, state, quality } = req.query;
    
    const options = {};
    if (market) options.market = market;
    if (state) options.state = state;
    if (quality) options.quality = quality;

    const result = await priceService.getCurrentPrices(crop, options);
    
    if (result.success) {
      // Return only analytics data
      res.json({
        success: true,
        cropName: result.cropName,
        statistics: result.statistics,
        trendAnalysis: result.trendAnalysis,
        fairPriceRange: result.fairPriceRange,
        marketAnalysis: result.marketAnalysis,
        recommendations: result.recommendations,
        lastUpdated: result.lastUpdated
      });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Price analytics error:', error);
    res.status(500).json({ 
      error: 'Price analytics service error',
      message: error.message 
    });
  }
});

// GET /api/v1/prices/fair-range/:crop
router.get('/fair-range/:crop', async (req, res) => {
  try {
    const { crop } = req.params;
    const { market, state, quality } = req.query;
    
    const options = {};
    if (market) options.market = market;
    if (state) options.state = state;
    if (quality) options.quality = quality;

    const result = await priceService.getCurrentPrices(crop, options);
    
    if (result.success) {
      // Return only fair price range data
      res.json({
        success: true,
        cropName: result.cropName,
        fairPriceRange: result.fairPriceRange,
        recommendations: result.recommendations.filter(rec => 
          rec.includes('Fair price') || rec.includes('Target price') || rec.includes('Price estimate')
        ),
        lastUpdated: result.lastUpdated
      });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Fair price range error:', error);
    res.status(500).json({ 
      error: 'Fair price range service error',
      message: error.message 
    });
  }
});

module.exports = router;