const { CropPrice, MarketInfo, PriceQuery } = require('./CropModels');

describe('CropModels', () => {
  describe('CropPrice', () => {
    const validCropData = {
      cropName: 'tomato',
      variety: 'hybrid',
      price: 40,
      unit: 'kg',
      market: 'Hyderabad',
      state: 'Telangana',
      date: '2024-01-15',
      source: 'agmarknet',
      quality: 'premium',
      coordinates: { lat: 17.3850, lng: 78.4867 }
    };

    describe('constructor', () => {
      test('should create CropPrice with valid data', () => {
        const cropPrice = new CropPrice(validCropData);
        
        expect(cropPrice.cropName).toBe('tomato');
        expect(cropPrice.variety).toBe('hybrid');
        expect(cropPrice.price).toBe(40);
        expect(cropPrice.unit).toBe('kg');
        expect(cropPrice.market).toBe('Hyderabad');
        expect(cropPrice.state).toBe('Telangana');
        expect(cropPrice.date).toBeInstanceOf(Date);
        expect(cropPrice.source).toBe('agmarknet');
        expect(cropPrice.quality).toBe('premium');
        expect(cropPrice.coordinates.lat).toBe(17.3850);
        expect(cropPrice.coordinates.lng).toBe(78.4867);
      });

      test('should handle CSV format data with underscore keys', () => {
        const csvData = {
          crop_name: 'onion',
          variety: 'red',
          price_per_kg: '30',
          market: 'Hyderabad',
          state: 'Telangana',
          date: '2024-01-15',
          source: 'manual',
          quality: 'standard',
          coordinates_lat: '17.3850',
          coordinates_lng: '78.4867'
        };

        const cropPrice = new CropPrice(csvData);
        
        expect(cropPrice.cropName).toBe('onion');
        expect(cropPrice.price).toBe(30);
        expect(cropPrice.coordinates.lat).toBe(17.3850);
        expect(cropPrice.coordinates.lng).toBe(78.4867);
      });

      test('should set default values for missing optional fields', () => {
        const minimalData = {
          cropName: 'potato',
          variety: 'local',
          price: 25,
          market: 'Hyderabad',
          state: 'Telangana',
          date: '2024-01-15'
        };

        const cropPrice = new CropPrice(minimalData);
        
        expect(cropPrice.unit).toBe('kg');
        expect(cropPrice.source).toBe('manual');
        expect(cropPrice.quality).toBe('standard');
        expect(cropPrice.coordinates.lat).toBe(0);
        expect(cropPrice.coordinates.lng).toBe(0);
      });

      test('should generate ID automatically', () => {
        const cropPrice = new CropPrice(validCropData);
        expect(cropPrice.id).toBeDefined();
        expect(typeof cropPrice.id).toBe('string');
      });
    });

    describe('validate', () => {
      test('should validate correct crop price data', () => {
        const cropPrice = new CropPrice(validCropData);
        const validation = cropPrice.validate();
        
        expect(validation.error).toBeUndefined();
        expect(validation.value).toBeDefined();
      });

      test('should fail validation for missing required fields', () => {
        const invalidData = {
          cropName: 'tomato',
          // missing variety, price, market, state, date
        };
        
        const cropPrice = new CropPrice(invalidData);
        const validation = cropPrice.validate();
        
        expect(validation.error).toBeDefined();
        expect(validation.error.details.length).toBeGreaterThan(0);
      });

      test('should fail validation for invalid price', () => {
        const invalidData = {
          ...validCropData,
          price: -10 // negative price
        };
        
        const cropPrice = new CropPrice(invalidData);
        const validation = cropPrice.validate();
        
        expect(validation.error).toBeDefined();
      });

      test('should fail validation for invalid coordinates', () => {
        const invalidData = {
          ...validCropData,
          coordinates: { lat: 100, lng: 200 } // invalid coordinates
        };
        
        const cropPrice = new CropPrice(invalidData);
        const validation = cropPrice.validate();
        
        expect(validation.error).toBeDefined();
      });

      test('should fail validation for invalid unit', () => {
        const invalidData = {
          ...validCropData,
          unit: 'pounds' // invalid unit
        };
        
        const cropPrice = new CropPrice(invalidData);
        const validation = cropPrice.validate();
        
        expect(validation.error).toBeDefined();
      });
    });

    describe('utility methods', () => {
      test('getFormattedPrice should return formatted price string', () => {
        const cropPrice = new CropPrice(validCropData);
        const formatted = cropPrice.getFormattedPrice();
        
        expect(formatted).toBe('₹40/kg');
      });

      test('isRecent should return true for recent dates', () => {
        const recentData = {
          ...validCropData,
          date: new Date().toISOString()
        };
        
        const cropPrice = new CropPrice(recentData);
        expect(cropPrice.isRecent()).toBe(true);
      });

      test('isRecent should return false for old dates', () => {
        const oldData = {
          ...validCropData,
          date: '2023-01-01'
        };
        
        const cropPrice = new CropPrice(oldData);
        expect(cropPrice.isRecent()).toBe(false);
      });

      test('toObject should return plain object representation', () => {
        const cropPrice = new CropPrice(validCropData);
        const obj = cropPrice.toObject();
        
        expect(obj).toHaveProperty('id');
        expect(obj).toHaveProperty('cropName', 'tomato');
        expect(obj).toHaveProperty('price', 40);
        expect(obj).toHaveProperty('coordinates');
      });
    });
  });

  describe('MarketInfo', () => {
    const validMarketData = {
      name: 'Hyderabad Mandi',
      state: 'Telangana',
      district: 'Hyderabad',
      coordinates: { lat: 17.3850, lng: 78.4867 },
      operatingHours: '6:00 AM - 8:00 PM',
      contactInfo: { phone: '040-12345678' },
      facilities: ['parking', 'storage', 'weighing'],
      isActive: true
    };

    describe('constructor', () => {
      test('should create MarketInfo with valid data', () => {
        const market = new MarketInfo(validMarketData);
        
        expect(market.name).toBe('Hyderabad Mandi');
        expect(market.state).toBe('Telangana');
        expect(market.district).toBe('Hyderabad');
        expect(market.coordinates.lat).toBe(17.3850);
        expect(market.coordinates.lng).toBe(78.4867);
        expect(market.isActive).toBe(true);
      });

      test('should set default values', () => {
        const minimalData = {
          name: 'Test Mandi',
          state: 'Telangana',
          district: 'Test District',
          coordinates: { lat: 17.3850, lng: 78.4867 }
        };
        
        const market = new MarketInfo(minimalData);
        
        expect(market.operatingHours).toBe('6:00 AM - 8:00 PM');
        expect(market.contactInfo).toEqual({});
        expect(market.facilities).toEqual([]);
        expect(market.isActive).toBe(true);
      });

      test('should generate ID automatically', () => {
        const market = new MarketInfo(validMarketData);
        expect(market.id).toBeDefined();
        expect(typeof market.id).toBe('string');
        expect(market.id).toContain('market_');
      });
    });

    describe('validate', () => {
      test('should validate correct market data', () => {
        const market = new MarketInfo(validMarketData);
        const validation = market.validate();
        
        expect(validation.error).toBeUndefined();
      });

      test('should fail validation for missing required fields', () => {
        const invalidData = {
          name: 'Test Mandi'
          // missing state, district, coordinates
        };
        
        const market = new MarketInfo(invalidData);
        const validation = market.validate();
        
        expect(validation.error).toBeDefined();
      });
    });

    describe('getDistanceFrom', () => {
      test('should calculate distance correctly', () => {
        const market = new MarketInfo(validMarketData);
        
        // Distance from same location should be 0
        const distance = market.getDistanceFrom(17.3850, 78.4867);
        expect(distance).toBeCloseTo(0, 1);
      });

      test('should calculate distance to different location', () => {
        const market = new MarketInfo(validMarketData);
        
        // Distance to Mumbai (approximate)
        const distance = market.getDistanceFrom(19.0760, 72.8777);
        expect(distance).toBeGreaterThan(500); // Should be more than 500km
      });
    });
  });

  describe('PriceQuery', () => {
    const validQueryData = {
      cropName: 'tomato',
      market: 'Hyderabad',
      state: 'Telangana',
      dateRange: {
        from: '2024-01-01',
        to: '2024-01-31'
      },
      quality: 'premium',
      source: 'agmarknet',
      maxDistance: 50,
      userLocation: { lat: 17.3850, lng: 78.4867 }
    };

    describe('constructor', () => {
      test('should create PriceQuery with valid data', () => {
        const query = new PriceQuery(validQueryData);
        
        expect(query.cropName).toBe('tomato');
        expect(query.market).toBe('Hyderabad');
        expect(query.state).toBe('Telangana');
        expect(query.quality).toBe('premium');
        expect(query.source).toBe('agmarknet');
        expect(query.maxDistance).toBe(50);
        expect(query.userLocation.lat).toBe(17.3850);
        expect(query.userLocation.lng).toBe(78.4867);
        expect(query.dateRange.from).toBeInstanceOf(Date);
        expect(query.dateRange.to).toBeInstanceOf(Date);
      });

      test('should handle minimal query data', () => {
        const minimalData = {
          cropName: 'onion'
        };
        
        const query = new PriceQuery(minimalData);
        
        expect(query.cropName).toBe('onion');
        expect(query.market).toBeUndefined();
        expect(query.state).toBeUndefined();
        expect(query.userLocation).toBeNull();
      });
    });

    describe('validate', () => {
      test('should validate correct query data', () => {
        const query = new PriceQuery(validQueryData);
        const validation = query.validate();
        
        expect(validation.error).toBeUndefined();
      });

      test('should fail validation for missing crop name', () => {
        const invalidData = {
          market: 'Hyderabad'
          // missing cropName
        };
        
        const query = new PriceQuery(invalidData);
        const validation = query.validate();
        
        expect(validation.error).toBeDefined();
      });

      test('should fail validation for invalid coordinates', () => {
        const invalidData = {
          ...validQueryData,
          userLocation: { lat: 100, lng: 200 }
        };
        
        const query = new PriceQuery(invalidData);
        const validation = query.validate();
        
        expect(validation.error).toBeDefined();
      });
    });
  });
});