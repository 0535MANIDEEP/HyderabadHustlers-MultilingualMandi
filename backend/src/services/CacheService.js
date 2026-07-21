const redis = require('redis');
const { v4: uuidv4 } = require('uuid');

/**
 * Redis Caching Service for Performance Optimization
 * Provides caching strategies for price data, translations, and frequently requested data
 * Validates Requirement 9.5 - Performance and caching effectiveness
 */
class CacheService {
  constructor(options = {}) {
    this.redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.keyPrefix = options.keyPrefix || 'mandi:';
    this.defaultTTL = options.defaultTTL || 3600; // 1 hour in seconds
    
    // Cache configuration for different data types
    this.cacheConfig = {
      prices: {
        ttl: 1800, // 30 minutes for price data
        keyPattern: 'prices:{crop}:{market}',
        maxSize: 1000
      },
      translations: {
        ttl: 86400, // 24 hours for translations
        keyPattern: 'trans:{hash}',
        maxSize: 5000
      },
      cropData: {
        ttl: 3600, // 1 hour for crop data
        keyPattern: 'crop:{name}',
        maxSize: 500
      },
      sessions: {
        ttl: 1800, // 30 minutes for session data
        keyPattern: 'session:{id}',
        maxSize: 200
      },
      analytics: {
        ttl: 7200, // 2 hours for analytics
        keyPattern: 'analytics:{type}:{period}',
        maxSize: 100
      }
    };
    
    // Connection state
    this.client = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    
    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      connectionErrors: 0
    };
    
    // Initialize connection
    if (!process.env.VERCEL) {
      this.initialize();
    } else {
      this.client = this.createMockClient();
      this.isConnected = true;
    }
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    try {
      // Handle test environment
      if (process.env.NODE_ENV === 'test') {
        console.log('CacheService: Running in test mode, using mock Redis');
        this.client = this.createMockClient();
        this.isConnected = true;
        return;
      }
      
      // Create Redis client
      this.client = redis.createClient({
        url: this.redisUrl,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.error('Redis connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Redis retry time exhausted');
          }
          if (options.attempt > this.maxConnectionAttempts) {
            return new Error('Redis max connection attempts reached');
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });
      
      // Set up event handlers
      this.client.on('connect', () => {
        console.log('Redis client connected');
        this.isConnected = true;
        this.connectionAttempts = 0;
      });
      
      this.client.on('ready', () => {
        console.log('Redis client ready');
      });
      
      this.client.on('error', (err) => {
        console.error('Redis client error:', err);
        this.stats.connectionErrors++;
        this.isConnected = false;
      });
      
      this.client.on('end', () => {
        console.log('Redis client disconnected');
        this.isConnected = false;
      });
      
      // Connect to Redis
      await this.client.connect();
      
    } catch (error) {
      console.error('Failed to initialize Redis cache:', error);
      this.connectionAttempts++;
      this.stats.connectionErrors++;
      
      // Fall back to mock client for development
      if (this.connectionAttempts >= this.maxConnectionAttempts) {
        console.warn('Redis unavailable, falling back to in-memory cache');
        this.client = this.createMockClient();
        this.isConnected = true;
      }
    }
  }

  /**
   * Create mock Redis client for testing/fallback
   */
  createMockClient() {
    const mockStore = new Map();
    const mockExpiry = new Map();
    
    return {
      get: async (key) => {
        // Check expiry
        if (mockExpiry.has(key) && mockExpiry.get(key) < Date.now()) {
          mockStore.delete(key);
          mockExpiry.delete(key);
          return null;
        }
        return mockStore.get(key) || null;
      },
      set: async (key, value, options = {}) => {
        mockStore.set(key, value);
        if (options.EX) {
          mockExpiry.set(key, Date.now() + (options.EX * 1000));
        }
        return 'OK';
      },
      del: async (keys) => {
        // Handle both single key and array of keys
        const keyArray = Array.isArray(keys) ? keys : [keys];
        let deletedCount = 0;
        
        for (const key of keyArray) {
          if (mockStore.has(key)) {
            mockStore.delete(key);
            mockExpiry.delete(key);
            deletedCount++;
          }
        }
        
        return deletedCount;
      },
      exists: async (key) => {
        if (mockExpiry.has(key) && mockExpiry.get(key) < Date.now()) {
          mockStore.delete(key);
          mockExpiry.delete(key);
          return 0;
        }
        return mockStore.has(key) ? 1 : 0;
      },
      keys: async (pattern) => {
        // Convert Redis pattern to JavaScript regex
        const regexPattern = pattern
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.')
          .replace(/\[/g, '\\[')
          .replace(/\]/g, '\\]');
        const regex = new RegExp(`^${regexPattern}$`);
        
        const matchingKeys = [];
        for (const key of mockStore.keys()) {
          // Check expiry first
          if (mockExpiry.has(key) && mockExpiry.get(key) < Date.now()) {
            mockStore.delete(key);
            mockExpiry.delete(key);
            continue;
          }
          if (regex.test(key)) {
            matchingKeys.push(key);
          }
        }
        return matchingKeys;
      },
      flushall: async () => {
        mockStore.clear();
        mockExpiry.clear();
        return 'OK';
      },
      quit: async () => 'OK'
    };
  }

  /**
   * Generate cache key with prefix
   */
  generateKey(type, params = {}) {
    const config = this.cacheConfig[type];
    if (!config) {
      throw new Error(`Unknown cache type: ${type}`);
    }
    
    let key = config.keyPattern;
    Object.keys(params).forEach(param => {
      key = key.replace(`{${param}}`, params[param]);
    });
    
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Get data from cache
   */
  async get(type, params = {}) {
    if (!this.isConnected || !this.client) {
      return null;
    }
    
    try {
      const key = this.generateKey(type, params);
      const value = await this.client.get(key);
      
      if (value) {
        this.stats.hits++;
        return JSON.parse(value);
      } else {
        this.stats.misses++;
        return null;
      }
    } catch (error) {
      console.error('Cache get error:', error);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Set data in cache
   */
  async set(type, params = {}, data, customTTL = null) {
    if (!this.isConnected || !this.client) {
      return false;
    }
    
    try {
      const key = this.generateKey(type, params);
      const config = this.cacheConfig[type];
      const ttl = customTTL || config.ttl || this.defaultTTL;
      
      const serializedData = JSON.stringify(data);
      await this.client.set(key, serializedData, { EX: ttl });
      
      this.stats.sets++;
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Delete data from cache
   */
  async delete(type, params = {}) {
    if (!this.isConnected || !this.client) {
      return false;
    }
    
    try {
      const key = this.generateKey(type, params);
      const result = await this.client.del(key);
      
      if (result > 0) {
        this.stats.deletes++;
      }
      
      return result > 0;
    } catch (error) {
      console.error('Cache delete error:', error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(type, params = {}) {
    if (!this.isConnected || !this.client) {
      return false;
    }
    
    try {
      const key = this.generateKey(type, params);
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Cache price data with automatic key generation
   */
  async cachePrice(cropName, market, priceData) {
    return await this.set('prices', { crop: cropName, market: market }, {
      ...priceData,
      cachedAt: new Date().toISOString()
    });
  }

  /**
   * Get cached price data
   */
  async getCachedPrice(cropName, market) {
    return await this.get('prices', { crop: cropName, market: market });
  }

  /**
   * Cache translation with hash-based key
   */
  async cacheTranslation(originalText, sourceLang, targetLang, translationData) {
    const hash = this.generateTranslationHash(originalText, sourceLang, targetLang);
    return await this.set('translations', { hash }, {
      originalText,
      sourceLang,
      targetLang,
      ...translationData,
      cachedAt: new Date().toISOString()
    });
  }

  /**
   * Get cached translation
   */
  async getCachedTranslation(originalText, sourceLang, targetLang) {
    const hash = this.generateTranslationHash(originalText, sourceLang, targetLang);
    return await this.get('translations', { hash });
  }

  /**
   * Generate hash for translation caching
   */
  generateTranslationHash(originalText, sourceLang, targetLang) {
    const crypto = require('crypto');
    const input = `${originalText}:${sourceLang}:${targetLang}`;
    return crypto.createHash('md5').update(input).digest('hex');
  }

  /**
   * Cache crop data
   */
  async cacheCropData(cropName, cropData) {
    return await this.set('cropData', { name: cropName }, {
      ...cropData,
      cachedAt: new Date().toISOString()
    });
  }

  /**
   * Get cached crop data
   */
  async getCachedCropData(cropName) {
    return await this.get('cropData', { name: cropName });
  }

  /**
   * Cache session data
   */
  async cacheSession(sessionId, sessionData) {
    return await this.set('sessions', { id: sessionId }, {
      ...sessionData,
      cachedAt: new Date().toISOString()
    });
  }

  /**
   * Get cached session data
   */
  async getCachedSession(sessionId) {
    return await this.get('sessions', { id: sessionId });
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern) {
    if (!this.isConnected || !this.client) {
      return 0;
    }
    
    try {
      const keys = await this.client.keys(`${this.keyPrefix}${pattern}`);
      if (keys.length === 0) {
        return 0;
      }
      
      const result = await this.client.del(keys);
      this.stats.deletes += result;
      return result;
    } catch (error) {
      console.error('Cache invalidation error:', error);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Invalidate all price data for a crop
   */
  async invalidateCropPrices(cropName) {
    return await this.invalidatePattern(`prices:${cropName}:*`);
  }

  /**
   * Invalidate all translations for a language pair
   */
  async invalidateTranslations(sourceLang, targetLang) {
    // Since we use hash-based keys, we need to clear all translations
    // In a production system, you might want to maintain a separate index
    return await this.invalidatePattern('trans:*');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    
    return {
      ...this.stats,
      totalRequests,
      hitRate: parseFloat(hitRate.toFixed(2)),
      isConnected: this.isConnected,
      connectionAttempts: this.connectionAttempts
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      connectionErrors: 0
    };
  }

  /**
   * Flush all cache data
   */
  async flushAll() {
    if (!this.isConnected || !this.client) {
      return false;
    }
    
    try {
      await this.client.flushall();
      this.resetStats();
      return true;
    } catch (error) {
      console.error('Cache flush error:', error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.client) {
      try {
        await this.client.quit();
        this.isConnected = false;
      } catch (error) {
        console.error('Error closing Redis connection:', error);
      }
    }
  }

  /**
   * Health check for cache service
   */
  async healthCheck() {
    if (!this.isConnected || !this.client) {
      return {
        status: 'unhealthy',
        message: 'Redis not connected',
        stats: this.getStats()
      };
    }
    
    try {
      // Test basic operations
      const testKey = `${this.keyPrefix}health:${Date.now()}`;
      await this.client.set(testKey, 'test', { EX: 10 });
      const value = await this.client.get(testKey);
      await this.client.del(testKey);
      
      if (value === 'test') {
        return {
          status: 'healthy',
          message: 'Redis operations working correctly',
          stats: this.getStats()
        };
      } else {
        return {
          status: 'degraded',
          message: 'Redis operations not working correctly',
          stats: this.getStats()
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Redis health check failed: ${error.message}`,
        stats: this.getStats()
      };
    }
  }
}

module.exports = CacheService;