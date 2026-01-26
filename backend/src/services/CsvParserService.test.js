const CsvParserService = require('./CsvParserService');
const { CropPrice } = require('../models/CropModels');
const fs = require('fs');
const path = require('path');

// Mock fs module
jest.mock('fs');

describe('CsvParserService', () => {
  let csvParserService;

  beforeEach(() => {
    csvParserService = new CsvParserService();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with correct paths', () => {
      expect(csvParserService.dataPath).toContain('data');
      expect(csvParserService.mandiPricesFile).toContain('mandi_prices.csv');
    });
  });

  describe('parseCsvString', () => {
    test('should parse valid CSV string', () => {
      const csvString = `crop_name,variety,price_per_kg,market,state,date,quality,source
tomato,hybrid,40,Hyderabad,Telangana,2024-01-15,premium,agmarknet
onion,red,30,Hyderabad,Telangana,2024-01-15,standard,agmarknet`;

      const result = csvParserService.parseCsvString(csvString);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].crop_name).toBe('tomato');
      expect(result.data[1].crop_name).toBe('onion');
      expect(result.errors).toHaveLength(0);
    });

    test('should handle empty CSV string', () => {
      const result = csvParserService.parseCsvString('');

      // PapaParse may return success: false for empty string, so we handle both cases
      expect(result.data).toHaveLength(0);
    });

    test('should handle CSV with only headers', () => {
      const csvString = 'crop_name,variety,price_per_kg,market,state,date,quality,source';

      const result = csvParserService.parseCsvString(csvString);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    test('should trim whitespace from values', () => {
      const csvString = `crop_name,variety,price_per_kg
  tomato  ,  hybrid  ,  40  `;

      const result = csvParserService.parseCsvString(csvString);

      expect(result.success).toBe(true);
      expect(result.data[0].crop_name).toBe('tomato');
      expect(result.data[0].variety).toBe('hybrid');
      expect(result.data[0].price_per_kg).toBe('40');
    });
  });

  describe('validateMandiPricesStructure', () => {
    test('should validate correct CSV structure', () => {
      const csvData = [{
        crop_name: 'tomato',
        variety: 'hybrid',
        price_per_kg: '40',
        market: 'Hyderabad',
        state: 'Telangana',
        date: '2024-01-15',
        quality: 'premium',
        source: 'agmarknet'
      }];

      const result = csvParserService.validateMandiPricesStructure(csvData);

      expect(result.valid).toBe(true);
      expect(result.totalRows).toBe(1);
      expect(result.availableColumns).toContain('crop_name');
      expect(result.availableColumns).toContain('variety');
    });

    test('should fail validation for missing required columns', () => {
      const csvData = [{
        crop_name: 'tomato',
        variety: 'hybrid'
        // missing other required columns
      }];

      const result = csvParserService.validateMandiPricesStructure(csvData);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required columns');
      expect(result.missingColumns).toContain('price_per_kg');
      expect(result.missingColumns).toContain('market');
    });

    test('should fail validation for empty data', () => {
      const result = csvParserService.validateMandiPricesStructure([]);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    test('should fail validation for non-array data', () => {
      const result = csvParserService.validateMandiPricesStructure('not an array');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not an array');
    });
  });

  describe('filterCropPrices', () => {
    let sampleCropPrices;

    beforeEach(() => {
      sampleCropPrices = [
        new CropPrice({
          cropName: 'tomato',
          variety: 'hybrid',
          price: 40,
          market: 'Hyderabad',
          state: 'Telangana',
          date: '2024-01-15',
          quality: 'premium',
          source: 'agmarknet',
          coordinates: { lat: 17.3850, lng: 78.4867 }
        }),
        new CropPrice({
          cropName: 'onion',
          variety: 'red',
          price: 30,
          market: 'Mumbai',
          state: 'Maharashtra',
          date: '2024-01-10',
          quality: 'standard',
          source: 'manual',
          coordinates: { lat: 19.0760, lng: 72.8777 }
        }),
        new CropPrice({
          cropName: 'tomato',
          variety: 'local',
          price: 35,
          market: 'Chennai',
          state: 'Tamil Nadu',
          date: '2024-01-12',
          quality: 'standard',
          source: 'agmarknet',
          coordinates: { lat: 13.0827, lng: 80.2707 }
        })
      ];
    });

    test('should filter by crop name', () => {
      const filtered = csvParserService.filterCropPrices(sampleCropPrices, {
        cropName: 'tomato'
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.every(price => price.cropName === 'tomato')).toBe(true);
    });

    test('should filter by market', () => {
      const filtered = csvParserService.filterCropPrices(sampleCropPrices, {
        market: 'Hyderabad'
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].market).toBe('Hyderabad');
    });

    test('should filter by state', () => {
      const filtered = csvParserService.filterCropPrices(sampleCropPrices, {
        state: 'Telangana'
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].state).toBe('Telangana');
    });

    test('should filter by quality', () => {
      const filtered = csvParserService.filterCropPrices(sampleCropPrices, {
        quality: 'premium'
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].quality).toBe('premium');
    });

    test('should filter by source', () => {
      const filtered = csvParserService.filterCropPrices(sampleCropPrices, {
        source: 'agmarknet'
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.every(price => price.source === 'agmarknet')).toBe(true);
    });

    test('should filter by price range', () => {
      const filtered = csvParserService.filterCropPrices(sampleCropPrices, {
        priceRange: { min: 35, max: 40 }
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.every(price => price.price >= 35 && price.price <= 40)).toBe(true);
    });

    test('should filter by date range', () => {
      const filtered = csvParserService.filterCropPrices(sampleCropPrices, {
        dateRange: {
          from: '2024-01-12',
          to: '2024-01-15'
        }
      });

      expect(filtered).toHaveLength(2);
    });

    test('should apply multiple filters', () => {
      const filtered = csvParserService.filterCropPrices(sampleCropPrices, {
        cropName: 'tomato',
        quality: 'premium'
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].cropName).toBe('tomato');
      expect(filtered[0].quality).toBe('premium');
    });

    test('should return empty array when no matches', () => {
      const filtered = csvParserService.filterCropPrices(sampleCropPrices, {
        cropName: 'nonexistent'
      });

      expect(filtered).toHaveLength(0);
    });

    test('should return all items when no filters applied', () => {
      const filtered = csvParserService.filterCropPrices(sampleCropPrices, {});

      expect(filtered).toHaveLength(3);
    });
  });

  describe('calculatePriceStatistics', () => {
    test('should calculate statistics for valid crop prices', () => {
      const cropPrices = [
        new CropPrice({ cropName: 'tomato', variety: 'hybrid', price: 40, market: 'Test', state: 'Test', date: '2024-01-15', coordinates: { lat: 0, lng: 0 } }),
        new CropPrice({ cropName: 'tomato', variety: 'hybrid', price: 30, market: 'Test', state: 'Test', date: '2024-01-15', coordinates: { lat: 0, lng: 0 } }),
        new CropPrice({ cropName: 'tomato', variety: 'hybrid', price: 50, market: 'Test', state: 'Test', date: '2024-01-15', coordinates: { lat: 0, lng: 0 } })
      ];

      const stats = csvParserService.calculatePriceStatistics(cropPrices);

      expect(stats.count).toBe(3);
      expect(stats.average).toBe(40);
      expect(stats.min).toBe(30);
      expect(stats.max).toBe(50);
      expect(stats.median).toBe(40);
      expect(stats.sum).toBe(120);
    });

    test('should handle empty array', () => {
      const stats = csvParserService.calculatePriceStatistics([]);

      expect(stats.count).toBe(0);
      expect(stats.average).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.median).toBe(0);
    });

    test('should handle single item', () => {
      const cropPrices = [
        new CropPrice({ cropName: 'tomato', variety: 'hybrid', price: 40, market: 'Test', state: 'Test', date: '2024-01-15', coordinates: { lat: 0, lng: 0 } })
      ];

      const stats = csvParserService.calculatePriceStatistics(cropPrices);

      expect(stats.count).toBe(1);
      expect(stats.average).toBe(40);
      expect(stats.min).toBe(40);
      expect(stats.max).toBe(40);
      expect(stats.median).toBe(40);
    });

    test('should calculate median for even number of items', () => {
      const cropPrices = [
        new CropPrice({ cropName: 'tomato', variety: 'hybrid', price: 20, market: 'Test', state: 'Test', date: '2024-01-15', coordinates: { lat: 0, lng: 0 } }),
        new CropPrice({ cropName: 'tomato', variety: 'hybrid', price: 30, market: 'Test', state: 'Test', date: '2024-01-15', coordinates: { lat: 0, lng: 0 } }),
        new CropPrice({ cropName: 'tomato', variety: 'hybrid', price: 40, market: 'Test', state: 'Test', date: '2024-01-15', coordinates: { lat: 0, lng: 0 } }),
        new CropPrice({ cropName: 'tomato', variety: 'hybrid', price: 50, market: 'Test', state: 'Test', date: '2024-01-15', coordinates: { lat: 0, lng: 0 } })
      ];

      const stats = csvParserService.calculatePriceStatistics(cropPrices);

      expect(stats.median).toBe(35); // (30 + 40) / 2
    });
  });

  describe('groupCropPrices', () => {
    let sampleCropPrices;

    beforeEach(() => {
      sampleCropPrices = [
        new CropPrice({
          cropName: 'tomato',
          variety: 'hybrid',
          price: 40,
          market: 'Hyderabad',
          state: 'Telangana',
          date: '2024-01-15',
          coordinates: { lat: 0, lng: 0 }
        }),
        new CropPrice({
          cropName: 'tomato',
          variety: 'local',
          price: 35,
          market: 'Chennai',
          state: 'Tamil Nadu',
          date: '2024-01-15',
          coordinates: { lat: 0, lng: 0 }
        }),
        new CropPrice({
          cropName: 'onion',
          variety: 'red',
          price: 30,
          market: 'Mumbai',
          state: 'Maharashtra',
          date: '2024-01-15',
          coordinates: { lat: 0, lng: 0 }
        })
      ];
    });

    test('should group by crop name by default', () => {
      const grouped = csvParserService.groupCropPrices(sampleCropPrices);

      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped.tomato).toBeDefined();
      expect(grouped.onion).toBeDefined();
      expect(grouped.tomato.prices).toHaveLength(2);
      expect(grouped.onion.prices).toHaveLength(1);
    });

    test('should group by specified field', () => {
      const grouped = csvParserService.groupCropPrices(sampleCropPrices, 'state');

      expect(Object.keys(grouped)).toHaveLength(3);
      expect(grouped.Telangana).toBeDefined();
      expect(grouped['Tamil Nadu']).toBeDefined();
      expect(grouped.Maharashtra).toBeDefined();
    });

    test('should include statistics for each group', () => {
      const grouped = csvParserService.groupCropPrices(sampleCropPrices);

      expect(grouped.tomato.statistics).toBeDefined();
      expect(grouped.tomato.statistics.count).toBe(2);
      expect(grouped.tomato.statistics.average).toBe(37.5);
      expect(grouped.onion.statistics.count).toBe(1);
      expect(grouped.onion.statistics.average).toBe(30);
    });
  });

  describe('exportToCsv', () => {
    test('should export crop prices to CSV format', () => {
      const cropPrices = [
        new CropPrice({
          cropName: 'tomato',
          variety: 'hybrid',
          price: 40,
          market: 'Hyderabad',
          state: 'Telangana',
          date: '2024-01-15',
          quality: 'premium',
          source: 'agmarknet',
          coordinates: { lat: 17.3850, lng: 78.4867 }
        })
      ];

      const csvString = csvParserService.exportToCsv(cropPrices);

      expect(csvString).toContain('crop_name,variety,price_per_kg');
      expect(csvString).toContain('tomato,hybrid,40');
      expect(csvString).toContain('Hyderabad,Telangana');
    });

    test('should return empty string for empty array', () => {
      const csvString = csvParserService.exportToCsv([]);
      expect(csvString).toBe('');
    });

    test('should handle null or undefined input', () => {
      expect(csvParserService.exportToCsv(null)).toBe('');
      expect(csvParserService.exportToCsv(undefined)).toBe('');
    });
  });
});