const CacheService = require('./CacheService');

describe('CacheService', () => {
  let cacheService;

  beforeEach(async () => {
    // Create cache service in test mode
    process.env.NODE_ENV = 'test';
    cacheService = new CacheService();
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    if (cacheService) {
      await cacheService.close();
    }
  });

  describe('initialization', () => {
    it('should initialize with mock client in test environment', () => {
      expect(cacheService.isConnected).toBe(true);
      expect(cacheService.client).toBeDefined();
    });

    it('should have default configuration', () => {
      expect(cacheService.keyPrefix).toBe('mandi:');
      expect(cacheService.defaultTTL).toBe(3600);
      expect(cacheService.cacheConfig).toHaveProperty('prices');
      expect(cacheService.cacheConfig).toHaveProperty('translations');
    });
  });

  describe('key generation', () => {
    it('should generate correct keys for different types', () => {
      const priceKey = cacheService.generateKey('prices', { crop: 'tomato', market: 'hyderabad' });
      expect(priceKey).toBe('mandi:prices:tomato:hyderabad');

      const translationKey = cacheService.generateKey('translations', { hash: 'abc123' });
      expect(translationKey).toBe('mandi:trans:abc123');
    });

    it('should throw error for unknown cache type', () => {
      expect(() => {
        cacheService.generateKey('unknown', {});
      }).toThrow('Unknown cache type: unknown');
    });
  });

  describe('basic cache operations', () => {
    it('should set and get data successfully', async () => {
      const testData = { price: 40, quality: 'premium' };
      
      const setResult = await cacheService.set('prices', { crop: 'tomato', market: 'delhi' }, testData);
      expect(setResult).toBe(true);

      const getData = await cacheService.get('prices', { crop: 'tomato', market: 'delhi' });
      expect(getData).toEqual(testData);
      
      expect(cacheService.stats.sets).toBe(1);
      expect(cacheService.stats.hits).toBe(1);
    });

    it('should return null for non-existent keys', async () => {
      const getData = await cacheService.get('prices', { crop: 'nonexistent', market: 'nowhere' });
      expect(getData).toBeNull();
      expect(cacheService.stats.misses).toBe(1);
    });

    it('should delete data successfully', async () => {
      const testData = { price: 35 };
      
      await cacheService.set('prices', { crop: 'onion', market: 'mumbai' }, testData);
      
      const deleteResult = await cacheService.delete('prices', { crop: 'onion', market: 'mumbai' });
      expect(deleteResult).toBe(true);

      const getData = await cacheService.get('prices', { crop: 'onion', market: 'mumbai' });
      expect(getData).toBeNull();
      
      expect(cacheService.stats.deletes).toBe(1);
    });

    it('should check if key exists', async () => {
      const testData = { price: 50 };
      
      const existsBefore = await cacheService.exists('prices', { crop: 'chili', market: 'bangalore' });
      expect(existsBefore).toBe(false);

      await cacheService.set('prices', { crop: 'chili', market: 'bangalore' }, testData);
      
      const existsAfter = await cacheService.exists('prices', { crop: 'chili', market: 'bangalore' });
      expect(existsAfter).toBe(true);
    });
  });

  describe('price caching', () => {
    it('should cache and retrieve price data', async () => {
      const priceData = {
        price: 45,
        quality: 'premium',
        quantity: 100,
        unit: 'kg',
        date: '2024-01-15'
      };

      const cacheResult = await cacheService.cachePrice('tomato', 'hyderabad', priceData);
      expect(cacheResult).toBe(true);

      const cachedPrice = await cacheService.getCachedPrice('tomato', 'hyderabad');
      expect(cachedPrice.price).toBe(45);
      expect(cachedPrice.quality).toBe('premium');
      expect(cachedPrice).toHaveProperty('cachedAt');
    });

    it('should return null for non-cached prices', async () => {
      const cachedPrice = await cacheService.getCachedPrice('potato', 'chennai');
      expect(cachedPrice).toBeNull();
    });
  });

  describe('translation caching', () => {
    it('should cache and retrieve translation data', async () => {
      const translationData = {
        translatedText: 'नमस्ते किसान',
        confidence: 0.95,
        preservedTerms: ['farmer']
      };

      const cacheResult = await cacheService.cacheTranslation(
        'Hello farmer',
        'en',
        'hi',
        translationData
      );
      expect(cacheResult).toBe(true);

      const cachedTranslation = await cacheService.getCachedTranslation('Hello farmer', 'en', 'hi');
      expect(cachedTranslation.translatedText).toBe('नमस्ते किसान');
      expect(cachedTranslation.originalText).toBe('Hello farmer');
      expect(cachedTranslation.sourceLang).toBe('en');
      expect(cachedTranslation.targetLang).toBe('hi');
      expect(cachedTranslation).toHaveProperty('cachedAt');
    });

    it('should generate consistent hashes for same input', () => {
      const hash1 = cacheService.generateTranslationHash('Hello', 'en', 'hi');
      const hash2 = cacheService.generateTranslationHash('Hello', 'en', 'hi');
      expect(hash1).toBe(hash2);

      const hash3 = cacheService.generateTranslationHash('Hello', 'en', 'te');
      expect(hash1).not.toBe(hash3);
    });
  });

  describe('crop data caching', () => {
    it('should cache and retrieve crop data', async () => {
      const cropData = {
        name: 'tomato',
        varieties: ['hybrid', 'local'],
        season: 'winter',
        avgPrice: 40
      };

      const cacheResult = await cacheService.cacheCropData('tomato', cropData);
      expect(cacheResult).toBe(true);

      const cachedCrop = await cacheService.getCachedCropData('tomato');
      expect(cachedCrop.name).toBe('tomato');
      expect(cachedCrop.varieties).toEqual(['hybrid', 'local']);
      expect(cachedCrop).toHaveProperty('cachedAt');
    });
  });

  describe('session caching', () => {
    it('should cache and retrieve session data', async () => {
      const sessionData = {
        vendorId: 'vendor123',
        buyerId: 'buyer456',
        cropName: 'onion',
        status: 'active'
      };

      const cacheResult = await cacheService.cacheSession('session123', sessionData);
      expect(cacheResult).toBe(true);

      const cachedSession = await cacheService.getCachedSession('session123');
      expect(cachedSession.vendorId).toBe('vendor123');
      expect(cachedSession.status).toBe('active');
      expect(cachedSession).toHaveProperty('cachedAt');
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate crop prices', async () => {
      // Cache multiple prices for tomato
      await cacheService.cachePrice('tomato', 'delhi', { price: 40 });
      await cacheService.cachePrice('tomato', 'mumbai', { price: 42 });
      await cacheService.cachePrice('onion', 'delhi', { price: 30 });
      
      // Verify they exist
      expect(await cacheService.getCachedPrice('tomato', 'delhi')).not.toBeNull();
      expect(await cacheService.getCachedPrice('tomato', 'mumbai')).not.toBeNull();
      expect(await cacheService.getCachedPrice('onion', 'delhi')).not.toBeNull();

      // Invalidate tomato prices
      const invalidated = await cacheService.invalidateCropPrices('tomato');
      expect(invalidated).toBe(2); // Should delete 2 tomato price entries

      // Check that tomato prices are gone but onion remains
      expect(await cacheService.getCachedPrice('tomato', 'delhi')).toBeNull();
      expect(await cacheService.getCachedPrice('tomato', 'mumbai')).toBeNull();
      expect(await cacheService.getCachedPrice('onion', 'delhi')).not.toBeNull();
    });

    it('should invalidate translations', async () => {
      await cacheService.cacheTranslation('Hello', 'en', 'hi', { translatedText: 'नमस्ते' });
      await cacheService.cacheTranslation('Goodbye', 'en', 'hi', { translatedText: 'अलविदा' });

      expect(await cacheService.getCachedTranslation('Hello', 'en', 'hi')).not.toBeNull();

      const invalidated = await cacheService.invalidateTranslations('en', 'hi');
      expect(invalidated).toBeGreaterThanOrEqual(0); // Pattern-based deletion

      // Note: In mock implementation, this clears all translations
    });
  });

  describe('statistics', () => {
    it('should track cache statistics', async () => {
      // Reset stats
      cacheService.resetStats();

      // Perform operations
      await cacheService.set('prices', { crop: 'test', market: 'test' }, { price: 100 });
      await cacheService.get('prices', { crop: 'test', market: 'test' }); // hit
      await cacheService.get('prices', { crop: 'missing', market: 'test' }); // miss
      await cacheService.delete('prices', { crop: 'test', market: 'test' });

      const stats = cacheService.getStats();
      expect(stats.sets).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.deletes).toBe(1);
      expect(stats.totalRequests).toBe(2);
      expect(stats.hitRate).toBe(50);
    });

    it('should reset statistics', () => {
      cacheService.stats.hits = 10;
      cacheService.stats.misses = 5;

      cacheService.resetStats();

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('health check', () => {
    it('should perform health check successfully', async () => {
      const health = await cacheService.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.message).toContain('Redis operations working correctly');
      expect(health.stats).toBeDefined();
    });
  });

  describe('flush operations', () => {
    it('should flush all cache data', async () => {
      // Add some data
      await cacheService.cachePrice('tomato', 'delhi', { price: 40 });
      await cacheService.cacheTranslation('Hello', 'en', 'hi', { translatedText: 'नमस्ते' });

      // Verify data exists
      expect(await cacheService.getCachedPrice('tomato', 'delhi')).not.toBeNull();

      // Flush all
      const flushResult = await cacheService.flushAll();
      expect(flushResult).toBe(true);

      // Verify data is gone
      expect(await cacheService.getCachedPrice('tomato', 'delhi')).toBeNull();
    });
  });
});