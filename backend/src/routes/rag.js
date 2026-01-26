const express = require('express');
const RAGPipelineService = require('../services/RAGPipelineService');

const router = express.Router();

// Initialize RAG pipeline service
const ragService = new RAGPipelineService();
let isInitialized = false;

// Initialize the RAG pipeline on startup
const initializeRAG = async () => {
  if (!isInitialized) {
    try {
      const result = await ragService.initialize();
      if (result.success) {
        isInitialized = true;
        console.log('RAG pipeline initialized successfully:', result.statistics);
      } else {
        console.error('Failed to initialize RAG pipeline:', result.error);
      }
    } catch (error) {
      console.error('Error during RAG initialization:', error);
    }
  }
};

// Initialize on module load
initializeRAG();

/**
 * POST /api/rag/query
 * Process a query using the RAG pipeline
 */
router.post('/query', async (req, res) => {
  try {
    const { query, queryType = 'price_query', language = 'en', options = {} } = req.body;

    // Validate input
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a non-empty string'
      });
    }

    // Ensure RAG pipeline is initialized
    if (!isInitialized) {
      await initializeRAG();
      if (!isInitialized) {
        return res.status(503).json({
          success: false,
          error: 'RAG pipeline is not available. Please try again later.'
        });
      }
    }

    // Process the query
    const result = await ragService.processQuery(query.trim(), {
      queryType,
      language,
      ...options
    });

    // Return the result
    res.json(result);

  } catch (error) {
    console.error('Error processing RAG query:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while processing query'
    });
  }
});

/**
 * GET /api/rag/status
 * Get RAG pipeline status and statistics
 */
router.get('/status', async (req, res) => {
  try {
    // Ensure RAG pipeline is initialized
    if (!isInitialized) {
      await initializeRAG();
    }

    const statistics = ragService.getStatistics();
    
    res.json({
      success: true,
      isInitialized,
      statistics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting RAG status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while getting status'
    });
  }
});

/**
 * POST /api/rag/initialize
 * Manually initialize or reinitialize the RAG pipeline
 */
router.post('/initialize', async (req, res) => {
  try {
    const { csvPath } = req.body;

    // Clear existing pipeline if initialized
    if (isInitialized) {
      ragService.clear();
      isInitialized = false;
    }

    // Initialize with optional custom CSV path
    const result = await ragService.initialize(csvPath);
    
    if (result.success) {
      isInitialized = true;
    }

    res.json(result);

  } catch (error) {
    console.error('Error initializing RAG pipeline:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during initialization'
    });
  }
});

/**
 * POST /api/rag/search
 * Perform semantic search without full RAG processing
 */
router.post('/search', async (req, res) => {
  try {
    const { query, limit = 10, threshold = 0.3, filters = {} } = req.body;

    // Validate input
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a non-empty string'
      });
    }

    // Ensure RAG pipeline is initialized
    if (!isInitialized) {
      await initializeRAG();
      if (!isInitialized) {
        return res.status(503).json({
          success: false,
          error: 'RAG pipeline is not available. Please try again later.'
        });
      }
    }

    // Perform semantic search
    const result = await ragService.vectorService.semanticSearch(query.trim(), {
      limit,
      threshold,
      filters
    });

    res.json(result);

  } catch (error) {
    console.error('Error performing semantic search:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while performing search'
    });
  }
});

/**
 * GET /api/rag/crops
 * Get available crops and their information
 */
router.get('/crops', async (req, res) => {
  try {
    // Ensure RAG pipeline is initialized
    if (!isInitialized) {
      await initializeRAG();
      if (!isInitialized) {
        return res.status(503).json({
          success: false,
          error: 'RAG pipeline is not available. Please try again later.'
        });
      }
    }

    const statistics = ragService.getStatistics();
    
    res.json({
      success: true,
      crops: statistics.vectorService.cropTypes || [],
      markets: statistics.vectorService.markets || [],
      qualities: statistics.vectorService.qualities || [],
      totalRecords: statistics.vectorService.totalIndexedItems || 0
    });

  } catch (error) {
    console.error('Error getting crop information:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while getting crop information'
    });
  }
});

/**
 * POST /api/rag/similar
 * Find similar crops based on a given crop name
 */
router.post('/similar', async (req, res) => {
  try {
    const { cropName, limit = 5 } = req.body;

    // Validate input
    if (!cropName || typeof cropName !== 'string' || cropName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Crop name is required and must be a non-empty string'
      });
    }

    // Ensure RAG pipeline is initialized
    if (!isInitialized) {
      await initializeRAG();
      if (!isInitialized) {
        return res.status(503).json({
          success: false,
          error: 'RAG pipeline is not available. Please try again later.'
        });
      }
    }

    // Find similar crops
    const result = await ragService.vectorService.findSimilarCrops(cropName.trim(), {
      limit
    });

    res.json(result);

  } catch (error) {
    console.error('Error finding similar crops:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while finding similar crops'
    });
  }
});

/**
 * POST /api/rag/analyze-intent
 * Analyze query intent and type for voice processing
 */
router.post('/analyze-intent', async (req, res) => {
  try {
    const { query, language = 'en', context = 'voice_input' } = req.body;

    // Validate input
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a non-empty string'
      });
    }

    // Simple intent analysis (can be enhanced with ML models later)
    const lowerQuery = query.toLowerCase();
    
    // Price query indicators
    const priceKeywords = ['price', 'cost', 'rate', 'how much', 'भाव', 'दाम', 'कीमत', 'ధర', 'விலை'];
    const cropKeywords = ['tomato', 'onion', 'potato', 'rice', 'wheat', 'टमाटर', 'प्याज', 'आलू', 'టమాటో', 'ఉల్లిపాయ', 'தக்காளி', 'வெங்காயம்'];
    
    const hasPriceKeyword = priceKeywords.some(keyword => lowerQuery.includes(keyword));
    const hasCropKeyword = cropKeywords.some(keyword => lowerQuery.includes(keyword));
    
    if (hasPriceKeyword || hasCropKeyword) {
      return res.json({
        success: true,
        isQuery: true,
        queryType: 'price_query',
        confidence: (hasPriceKeyword && hasCropKeyword) ? 0.9 : 0.7,
        metadata: {
          detectedKeywords: {
            price: priceKeywords.filter(k => lowerQuery.includes(k)),
            crops: cropKeywords.filter(k => lowerQuery.includes(k))
          }
        }
      });
    }

    // Negotiation indicators
    const negotiationKeywords = ['buy', 'sell', 'offer', 'deal', 'negotiate', 'खरीद', 'बेच', 'सौदा', 'కొను', 'అమ్ము', 'வாங்கு', 'விற்று'];
    const hasNegotiationKeyword = negotiationKeywords.some(keyword => lowerQuery.includes(keyword));
    
    if (hasNegotiationKeyword) {
      return res.json({
        success: true,
        isQuery: true,
        queryType: 'negotiation',
        confidence: 0.8,
        metadata: {
          detectedKeywords: {
            negotiation: negotiationKeywords.filter(k => lowerQuery.includes(k))
          }
        }
      });
    }

    // Question indicators
    const questionWords = ['what', 'how', 'when', 'where', 'why', 'which', 'क्या', 'कैसे', 'कब', 'ఎలా', 'ఎప్పుడు', 'எப்படி', 'எப்போது'];
    const hasQuestionWord = questionWords.some(word => lowerQuery.includes(word));
    const hasQuestionMark = query.includes('?');
    
    if (hasQuestionWord || hasQuestionMark) {
      return res.json({
        success: true,
        isQuery: true,
        queryType: 'general',
        confidence: 0.6,
        metadata: {
          detectedKeywords: {
            questions: questionWords.filter(w => lowerQuery.includes(w))
          }
        }
      });
    }

    // Default case
    res.json({
      success: true,
      isQuery: false,
      queryType: 'general',
      confidence: 0.5,
      metadata: {
        detectedKeywords: {}
      }
    });

  } catch (error) {
    console.error('Error analyzing query intent:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while analyzing intent'
    });
  }
});

/**
 * Error handling middleware
 */
router.use((error, req, res, next) => {
  console.error('RAG route error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error in RAG service'
  });
});

module.exports = router;