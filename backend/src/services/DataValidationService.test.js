const DataValidationService = require('./DataValidationService');

describe('DataValidationService', () => {
  let validationService;

  beforeEach(() => {
    validationService = new DataValidationService();
  });

  describe('constructor', () => {
    test('should initialize with supported values', () => {
      expect(validationService.supportedCrops).toContain('tomato');
      expect(validationService.supportedCrops).toContain('onion');
      expect(validationService.supportedStates).toContain('Telangana');
      expect(validationService.supportedQualities).toContain('premium');
      expect(validationService.supportedSources).toContain('agmarknet');
      expect(validationService.supportedUnits).toContain('kg');
    });
  });

  describe('validateCropPrice', () => {
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

    test('should validate correct crop price data', () => {
      const result = validationService.validateCropPrice(validCropData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.data).toBeDefined();
      expect(result.data.cropName).toBe('tomato');
    });

    test('should fail validation for unsupported crop', () => {
      const invalidData = {
        ...validCropData,
        cropName: 'dragon_fruit'
      };

      const result = validationService.validateCropPrice(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('invalid value');
    });

    test('should fail validation for missing required fields', () => {
      const invalidData = {
        cropName: 'tomato'
        // missing other required fields
      };

      const result = validationService.validateCropPrice(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should fail validation for negative price', () => {
      const invalidData = {
        ...validCropData,
        price: -10
      };

      const result = validationService.validateCropPrice(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.path.includes('price'))).toBe(true);
    });

    test('should fail validation for invalid coordinates', () => {
      const invalidData = {
        ...validCropData,
        coordinates: { lat: 100, lng: 200 }
      };

      const result = validationService.validateCropPrice(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.path.includes('coordinates'))).toBe(true);
    });

    test('should fail validation for unsupported state', () => {
      const invalidData = {
        ...validCropData,
        state: 'Atlantis'
      };

      const result = validationService.validateCropPrice(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('invalid value');
    });

    test('should fail validation for invalid unit', () => {
      const invalidData = {
        ...validCropData,
        unit: 'pounds'
      };

      const result = validationService.validateCropPrice(invalidData);

      expect(result.isValid).toBe(false);
    });

    test('should fail validation for invalid quality', () => {
      const invalidData = {
        ...validCropData,
        quality: 'super_premium'
      };

      const result = validationService.validateCropPrice(invalidData);

      expect(result.isValid).toBe(false);
    });

    test('should fail validation for invalid source', () => {
      const invalidData = {
        ...validCropData,
        source: 'wikipedia'
      };

      const result = validationService.validateCropPrice(invalidData);

      expect(result.isValid).toBe(false);
    });

    test('should fail validation for future date', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const invalidData = {
        ...validCropData,
        date: futureDate.toISOString()
      };

      const result = validationService.validateCropPrice(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.path.includes('date'))).toBe(true);
    });

    test('should fail validation for very old date', () => {
      const invalidData = {
        ...validCropData,
        date: '2019-01-01'
      };

      const result = validationService.validateCropPrice(invalidData);

      expect(result.isValid).toBe(false);
    });

    test('should fail validation for extremely high price', () => {
      const invalidData = {
        ...validCropData,
        price: 15000
      };

      const result = validationService.validateCropPrice(invalidData);

      expect(result.isValid).toBe(false);
    });

    test('should generate warnings for unusual prices', () => {
      const lowPriceData = {
        ...validCropData,
        price: 2
      };

      const result = validationService.validateCropPrice(lowPriceData);
      expect(result.warnings).toContain('Price seems unusually low (< ₹5/kg)');

      const highPriceData = {
        ...validCropData,
        price: 600
      };

      const result2 = validationService.validateCropPrice(highPriceData);
      expect(result2.warnings).toContain('Price seems unusually high (> ₹500/kg)');
    });

    test('should normalize crop name to lowercase', () => {
      const dataWithUpperCase = {
        ...validCropData,
        cropName: 'TOMATO'
      };

      const result = validationService.validateCropPrice(dataWithUpperCase);
      expect(result.data.cropName).toBe('tomato');
    });
  });

  describe('validateMarketInfo', () => {
    const validMarketData = {
      name: 'Hyderabad Mandi',
      state: 'Telangana',
      district: 'Hyderabad',
      coordinates: { lat: 17.3850, lng: 78.4867 },
      operatingHours: '6:00 AM - 8:00 PM',
      contactInfo: { phone: '040-12345678' },
      facilities: ['parking', 'storage'],
      isActive: true
    };

    test('should validate correct market data', () => {
      const result = validationService.validateMarketInfo(validMarketData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.data).toBeDefined();
    });

    test('should fail validation for missing required fields', () => {
      const invalidData = {
        name: 'Test Mandi'
        // missing state, district, coordinates
      };

      const result = validationService.validateMarketInfo(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should fail validation for unsupported state', () => {
      const invalidData = {
        ...validMarketData,
        state: 'Atlantis'
      };

      const result = validationService.validateMarketInfo(invalidData);

      expect(result.isValid).toBe(false);
    });

    test('should fail validation for invalid coordinates', () => {
      const invalidData = {
        ...validMarketData,
        coordinates: { lat: 100, lng: 200 }
      };

      const result = validationService.validateMarketInfo(invalidData);

      expect(result.isValid).toBe(false);
    });
  });

  describe('validatePriceQuery', () => {
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

    test('should validate correct query data', () => {
      const result = validationService.validatePriceQuery(validQueryData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.data).toBeDefined();
    });

    test('should fail validation for missing crop name', () => {
      const invalidData = {
        market: 'Hyderabad'
        // missing cropName
      };

      const result = validationService.validatePriceQuery(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.path.includes('cropName'))).toBe(true);
    });

    test('should fail validation for unsupported crop', () => {
      const invalidData = {
        ...validQueryData,
        cropName: 'dragon_fruit'
      };

      const result = validationService.validatePriceQuery(invalidData);

      expect(result.isValid).toBe(false);
    });

    test('should fail validation for invalid date range', () => {
      const invalidData = {
        ...validQueryData,
        dateRange: {
          from: '2024-01-31',
          to: '2024-01-01' // to date before from date
        }
      };

      const result = validationService.validatePriceQuery(invalidData);

      expect(result.isValid).toBe(false);
    });

    test('should validate minimal query with only crop name', () => {
      const minimalQuery = {
        cropName: 'tomato'
      };

      const result = validationService.validatePriceQuery(minimalQuery);

      expect(result.isValid).toBe(true);
      expect(result.data.cropName).toBe('tomato');
    });
  });

  describe('validateBulkCropPrices', () => {
    const validCropData = {
      cropName: 'tomato',
      variety: 'hybrid',
      price: 40,
      market: 'Hyderabad',
      state: 'Telangana',
      date: '2024-01-15',
      coordinates: { lat: 17.3850, lng: 78.4867 }
    };

    test('should validate array of valid crop prices', () => {
      const dataArray = [
        validCropData,
        { ...validCropData, cropName: 'onion', price: 30 }
      ];

      const result = validationService.validateBulkCropPrices(dataArray);

      expect(result.isValid).toBe(true);
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(0);
      expect(result.successRate).toBe(100);
    });

    test('should handle mixed valid and invalid data', () => {
      const dataArray = [
        validCropData,
        { ...validCropData, price: -10 }, // invalid price
        { ...validCropData, cropName: 'onion' }
      ];

      const result = validationService.validateBulkCropPrices(dataArray);

      expect(result.isValid).toBe(false);
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(1);
      expect(result.successRate).toBeCloseTo(66.67, 1);
    });

    test('should fail validation for non-array input', () => {
      const result = validationService.validateBulkCropPrices('not an array');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must be an array');
    });

    test('should handle empty array', () => {
      const result = validationService.validateBulkCropPrices([]);

      expect(result.isValid).toBe(true);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(0);
      expect(result.successRate).toBeNaN();
    });
  });

  describe('generateWarnings', () => {
    test('should generate warning for low price', () => {
      const data = { price: 2 };
      const warnings = validationService.generateWarnings(data);

      expect(warnings).toContain('Price seems unusually low (< ₹5/kg)');
    });

    test('should generate warning for high price', () => {
      const data = { price: 600 };
      const warnings = validationService.generateWarnings(data);

      expect(warnings).toContain('Price seems unusually high (> ₹500/kg)');
    });

    test('should generate warning for old date', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);
      
      const data = { date: oldDate };
      const warnings = validationService.generateWarnings(data);

      expect(warnings).toContain('Price data is more than 30 days old');
    });

    test('should generate warning for coordinates outside India', () => {
      const data = { coordinates: { lat: 40.7128, lng: -74.0060 } }; // New York
      const warnings = validationService.generateWarnings(data);

      expect(warnings).toContain('Coordinates appear to be outside India');
    });

    test('should return empty array for null data', () => {
      const warnings = validationService.generateWarnings(null);
      expect(warnings).toEqual([]);
    });
  });

  describe('sanitizeCropPriceData', () => {
    test('should normalize crop name to lowercase', () => {
      const data = { cropName: 'TOMATO' };
      const sanitized = validationService.sanitizeCropPriceData(data);

      expect(sanitized.cropName).toBe('tomato');
    });

    test('should trim whitespace from strings', () => {
      const data = {
        cropName: '  tomato  ',
        market: '  Hyderabad  ',
        state: '  Telangana  ',
        variety: '  HYBRID  '
      };

      const sanitized = validationService.sanitizeCropPriceData(data);

      expect(sanitized.cropName).toBe('tomato');
      expect(sanitized.market).toBe('Hyderabad');
      expect(sanitized.state).toBe('Telangana');
      expect(sanitized.variety).toBe('hybrid');
    });

    test('should convert string price to number', () => {
      const data = { price: '40.50' };
      const sanitized = validationService.sanitizeCropPriceData(data);

      expect(sanitized.price).toBe(40.50);
      expect(typeof sanitized.price).toBe('number');
    });

    test('should convert string coordinates to numbers', () => {
      const data = {
        coordinates: {
          lat: '17.3850',
          lng: '78.4867'
        }
      };

      const sanitized = validationService.sanitizeCropPriceData(data);

      expect(sanitized.coordinates.lat).toBe(17.3850);
      expect(sanitized.coordinates.lng).toBe(78.4867);
      expect(typeof sanitized.coordinates.lat).toBe('number');
      expect(typeof sanitized.coordinates.lng).toBe('number');
    });
  });

  describe('checkForDuplicates', () => {
    test('should detect duplicate entries', () => {
      const dataArray = [
        { cropName: 'tomato', market: 'Hyderabad', date: '2024-01-15', variety: 'hybrid' },
        { cropName: 'onion', market: 'Mumbai', date: '2024-01-15', variety: 'red' },
        { cropName: 'tomato', market: 'Hyderabad', date: '2024-01-15', variety: 'hybrid' } // duplicate
      ];

      const result = validationService.checkForDuplicates(dataArray);

      expect(result.hasDuplicates).toBe(true);
      expect(result.duplicateCount).toBe(1);
      expect(result.uniqueCount).toBe(2);
      expect(result.duplicates[0].index).toBe(2);
      expect(result.duplicates[0].duplicateOf).toBe(0);
    });

    test('should return no duplicates for unique entries', () => {
      const dataArray = [
        { cropName: 'tomato', market: 'Hyderabad', date: '2024-01-15', variety: 'hybrid' },
        { cropName: 'onion', market: 'Mumbai', date: '2024-01-15', variety: 'red' }
      ];

      const result = validationService.checkForDuplicates(dataArray);

      expect(result.hasDuplicates).toBe(false);
      expect(result.duplicateCount).toBe(0);
      expect(result.uniqueCount).toBe(2);
    });
  });

  describe('getSupportedValues', () => {
    test('should return all supported values', () => {
      const supported = validationService.getSupportedValues();

      expect(supported).toHaveProperty('crops');
      expect(supported).toHaveProperty('states');
      expect(supported).toHaveProperty('qualities');
      expect(supported).toHaveProperty('sources');
      expect(supported).toHaveProperty('units');

      expect(Array.isArray(supported.crops)).toBe(true);
      expect(supported.crops).toContain('tomato');
      expect(supported.states).toContain('Telangana');
    });
  });
});