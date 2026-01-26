const fc = require('fast-check');
const CsvParserService = require('./CsvParserService');
const { CropPrice } = require('../models/CropModels');

describe('CsvParserService Property-Based Tests', () => {
  let csvParserService;

  beforeEach(() => {
    csvParserService = new CsvParserService();
  });

  describe('Property 1: CSV parsing preserves data integrity', () => {
    /**
     * **Validates: Requirements 6.1**
     * Feature: multilingual-mandi, Property 1: CSV parsing preserves data integrity
     * 
     * For any valid crop price data that is exported to CSV and then parsed back,
     * the essential data fields should be preserved with correct types and values.
     */
    test('should preserve data integrity through export-import cycle', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              cropName: fc.constantFrom('tomato', 'onion', 'chili', 'potato', 'carrot'),
              variety: fc.constantFrom('hybrid', 'local', 'red', 'green', 'orange'),
              price: fc.float({ min: 1, max: 500 }),
              market: fc.constantFrom('Hyderabad', 'Mumbai', 'Chennai', 'Delhi', 'Bangalore'),
              state: fc.constantFrom('Telangana', 'Maharashtra', 'Tamil Nadu', 'Delhi', 'Karnataka'),
              date: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
              quality: fc.constantFrom('premium', 'standard', 'low'),
              source: fc.constantFrom('agmarknet', 'manual', 'estimated'),
              coordinates: fc.record({
                lat: fc.float({ min: 6, max: 37 }),
                lng: fc.float({ min: 68, max: 97 })
              })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (cropDataArray) => {
            // Create CropPrice objects from the generated data and filter out invalid prices
            const originalCropPrices = cropDataArray
              .map(data => new CropPrice(data))
              .filter(cp => !isNaN(cp.price) && isFinite(cp.price));
            
            // Skip test if no valid prices
            if (originalCropPrices.length === 0) {
              return;
            }
            
            // Export to CSV
            const csvString = csvParserService.exportToCsv(originalCropPrices);
            
            // Parse the CSV back
            const parseResult = csvParserService.parseCsvString(csvString);
            
            // Verify parsing was successful
            expect(parseResult.success).toBe(true);
            expect(parseResult.data).toHaveLength(originalCropPrices.length);
            
            // Verify each row preserves essential data
            parseResult.data.forEach((parsedRow, index) => {
              const original = originalCropPrices[index];
              
              // Check essential fields are preserved
              expect(parsedRow.crop_name).toBe(original.cropName);
              expect(parsedRow.variety).toBe(original.variety);
              
              // Handle price comparison with tolerance for floating point precision
              const parsedPrice = parseFloat(parsedRow.price_per_kg);
              if (!isNaN(parsedPrice) && !isNaN(original.price)) {
                expect(parsedPrice).toBeCloseTo(original.price, 2);
              }
              
              expect(parsedRow.market).toBe(original.market);
              expect(parsedRow.state).toBe(original.state);
              expect(parsedRow.quality).toBe(original.quality);
              expect(parsedRow.source).toBe(original.source);
              expect(parseFloat(parsedRow.coordinates_lat)).toBeCloseTo(original.coordinates.lat, 4);
              expect(parseFloat(parsedRow.coordinates_lng)).toBeCloseTo(original.coordinates.lng, 4);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2: Filtering operations are consistent', () => {
    /**
     * **Validates: Requirements 6.2**
     * Feature: multilingual-mandi, Property 2: Filtering operations are consistent
     * 
     * For any set of crop prices and any valid filter criteria,
     * the filtering operation should be consistent and return only items that match all criteria.
     */
    test('should consistently filter crop prices based on criteria', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              cropName: fc.constantFrom('tomato', 'onion', 'chili', 'potato'),
              variety: fc.constantFrom('hybrid', 'local', 'red', 'green'),
              price: fc.float({ min: 10, max: 200 }),
              market: fc.constantFrom('Hyderabad', 'Mumbai', 'Chennai'),
              state: fc.constantFrom('Telangana', 'Maharashtra', 'Tamil Nadu'),
              date: fc.date({ min: new Date('2023-01-01'), max: new Date() }),
              quality: fc.constantFrom('premium', 'standard', 'low'),
              source: fc.constantFrom('agmarknet', 'manual'),
              coordinates: fc.record({
                lat: fc.float({ min: 10, max: 30 }),
                lng: fc.float({ min: 70, max: 90 })
              })
            }),
            { minLength: 5, maxLength: 20 }
          ),
          fc.record({
            cropName: fc.option(fc.constantFrom('tomato', 'onion', 'chili'), { nil: undefined }),
            market: fc.option(fc.constantFrom('Hyderabad', 'Mumbai'), { nil: undefined }),
            quality: fc.option(fc.constantFrom('premium', 'standard'), { nil: undefined }),
            priceRange: fc.option(fc.record({
              min: fc.float({ min: 10, max: 100 }),
              max: fc.float({ min: 100, max: 200 })
            }), { nil: undefined })
          }),
          (cropDataArray, filters) => {
            // Create CropPrice objects
            const cropPrices = cropDataArray.map(data => new CropPrice(data));
            
            // Apply filters
            const filtered = csvParserService.filterCropPrices(cropPrices, filters);
            
            // Verify all filtered items match the criteria
            filtered.forEach(price => {
              if (filters.cropName) {
                expect(price.cropName.toLowerCase()).toContain(filters.cropName.toLowerCase());
              }
              if (filters.market) {
                expect(price.market.toLowerCase()).toContain(filters.market.toLowerCase());
              }
              if (filters.quality) {
                expect(price.quality).toBe(filters.quality);
              }
              if (filters.priceRange) {
                if (filters.priceRange.min !== undefined) {
                  expect(price.price).toBeGreaterThanOrEqual(filters.priceRange.min);
                }
                if (filters.priceRange.max !== undefined) {
                  expect(price.price).toBeLessThanOrEqual(filters.priceRange.max);
                }
              }
            });
            
            // Verify filtering is consistent - applying the same filter twice should yield same result
            const filteredAgain = csvParserService.filterCropPrices(cropPrices, filters);
            expect(filtered).toEqual(filteredAgain);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 3: Statistics calculations are mathematically correct', () => {
    /**
     * **Validates: Requirements 6.2**
     * Feature: multilingual-mandi, Property 3: Statistics calculations are mathematically correct
     * 
     * For any non-empty array of crop prices, the calculated statistics should be mathematically correct
     * and consistent with the input data.
     */
    test('should calculate mathematically correct statistics', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              cropName: fc.constant('tomato'),
              variety: fc.constant('hybrid'),
              price: fc.float({ min: 1, max: 1000 }),
              market: fc.constant('Test Market'),
              state: fc.constant('Test State'),
              date: fc.constant(new Date('2024-01-15')),
              coordinates: fc.constant({ lat: 17.3850, lng: 78.4867 })
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (cropDataArray) => {
            // Create CropPrice objects and filter out any with invalid prices
            const cropPrices = cropDataArray
              .map(data => new CropPrice(data))
              .filter(cp => !isNaN(cp.price) && isFinite(cp.price));
            
            // Skip test if no valid prices
            if (cropPrices.length === 0) {
              return;
            }
            
            // Calculate statistics
            const stats = csvParserService.calculatePriceStatistics(cropPrices);
            
            // Extract prices for manual verification
            const prices = cropPrices.map(cp => cp.price).sort((a, b) => a - b);
            
            // Verify count
            expect(stats.count).toBe(prices.length);
            
            // Verify sum and average
            const expectedSum = prices.reduce((acc, price) => acc + price, 0);
            expect(stats.sum).toBeCloseTo(expectedSum, 2);
            expect(stats.average).toBeCloseTo(expectedSum / prices.length, 2);
            
            // Verify min and max
            expect(stats.min).toBe(prices[0]);
            expect(stats.max).toBe(prices[prices.length - 1]);
            
            // Verify median
            let expectedMedian;
            if (prices.length % 2 === 0) {
              expectedMedian = (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
            } else {
              expectedMedian = prices[Math.floor(prices.length / 2)];
            }
            expect(stats.median).toBeCloseTo(expectedMedian, 2);
            
            // Verify invariants (mathematical relationships should always hold with tolerance)
            expect(stats.min).toBeLessThanOrEqual(stats.max + 0.01);
            expect(stats.min).toBeLessThanOrEqual(stats.average + 0.01);
            expect(stats.average).toBeLessThanOrEqual(stats.max + 0.01);
            expect(stats.min).toBeLessThanOrEqual(stats.median + 0.01);
            expect(stats.median).toBeLessThanOrEqual(stats.max + 0.01);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 4: Grouping operations preserve all data', () => {
    /**
     * **Validates: Requirements 6.2**
     * Feature: multilingual-mandi, Property 4: Grouping operations preserve all data
     * 
     * For any array of crop prices and any valid grouping field,
     * the grouping operation should preserve all original data items across groups.
     */
    test('should preserve all data when grouping by any field', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              cropName: fc.constantFrom('tomato', 'onion', 'chili'),
              variety: fc.constantFrom('hybrid', 'local', 'red'),
              price: fc.float({ min: 10, max: 100 }),
              market: fc.constantFrom('Hyderabad', 'Mumbai', 'Chennai'),
              state: fc.constantFrom('Telangana', 'Maharashtra', 'Tamil Nadu'),
              date: fc.constant(new Date('2024-01-15')),
              quality: fc.constantFrom('premium', 'standard'),
              source: fc.constantFrom('agmarknet', 'manual'),
              coordinates: fc.constant({ lat: 17.3850, lng: 78.4867 })
            }),
            { minLength: 1, maxLength: 20 }
          ),
          fc.constantFrom('cropName', 'market', 'state', 'quality', 'source'),
          (cropDataArray, groupByField) => {
            // Create CropPrice objects
            const cropPrices = cropDataArray.map(data => new CropPrice(data));
            
            // Group the data
            const grouped = csvParserService.groupCropPrices(cropPrices, groupByField);
            
            // Collect all items from all groups
            const allGroupedItems = [];
            Object.values(grouped).forEach(group => {
              allGroupedItems.push(...group.prices);
            });
            
            // Verify all original items are preserved
            expect(allGroupedItems).toHaveLength(cropPrices.length);
            
            // Verify each group contains only items with the same grouping field value
            Object.entries(grouped).forEach(([groupKey, group]) => {
              group.prices.forEach(price => {
                expect(price[groupByField]).toBe(groupKey);
              });
              
              // Verify statistics are calculated for each group
              expect(group.statistics).toBeDefined();
              expect(group.statistics.count).toBe(group.prices.length);
              expect(group.statistics.count).toBeGreaterThan(0);
            });
            
            // Verify no data is lost or duplicated
            const originalIds = cropPrices.map(cp => cp.id).sort();
            const groupedIds = allGroupedItems.map(cp => cp.id).sort();
            expect(groupedIds).toEqual(originalIds);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 5: Data validation is consistent and comprehensive', () => {
    /**
     * **Validates: Requirements 6.1**
     * Feature: multilingual-mandi, Property 5: Data validation is consistent and comprehensive
     * 
     * For any CSV data structure validation, the validation should be consistent
     * and correctly identify missing required columns.
     */
    test('should consistently validate CSV data structure', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.dictionary(
              fc.constantFrom(
                'crop_name', 'variety', 'price_per_kg', 'market', 'state', 
                'date', 'quality', 'source', 'coordinates_lat', 'coordinates_lng',
                'extra_field1', 'extra_field2' // some extra fields
              ),
              fc.string({ minLength: 1, maxLength: 20 })
            ),
            { minLength: 1, maxLength: 5 }
          ),
          (csvDataArray) => {
            const result = csvParserService.validateMandiPricesStructure(csvDataArray);
            
            const requiredColumns = [
              'crop_name', 'variety', 'price_per_kg', 'market', 
              'state', 'date', 'quality', 'source'
            ];
            
            if (csvDataArray.length === 0) {
              expect(result.valid).toBe(false);
              expect(result.error).toContain('empty');
            } else {
              const availableColumns = Object.keys(csvDataArray[0]);
              const missingColumns = requiredColumns.filter(col => !availableColumns.includes(col));
              
              if (missingColumns.length === 0) {
                expect(result.valid).toBe(true);
                expect(result.totalRows).toBe(csvDataArray.length);
                expect(result.availableColumns).toEqual(expect.arrayContaining(requiredColumns));
              } else {
                expect(result.valid).toBe(false);
                expect(result.error).toContain('Missing required columns');
                expect(result.missingColumns).toEqual(expect.arrayContaining(missingColumns));
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});