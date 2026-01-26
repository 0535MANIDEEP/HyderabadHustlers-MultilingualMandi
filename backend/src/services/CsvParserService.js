const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const Papa = require('papaparse');
const { CropPrice, MarketInfo } = require('../models/CropModels');

/**
 * CSV Parser Service
 * Handles parsing and validation of CSV data for mandi prices and market information
 */
class CsvParserService {
  constructor() {
    this.dataPath = path.join(__dirname, '../../data');
    this.mandiPricesFile = path.join(this.dataPath, 'mandi_prices.csv');
  }

  /**
   * Parses the mandi prices CSV file and returns validated crop price objects
   * @returns {Promise<Array<CropPrice>>} Array of validated crop price objects
   */
  async parseMandiPrices() {
    try {
      const csvData = await this.readCsvFile(this.mandiPricesFile);
      const cropPrices = [];
      const errors = [];

      for (let i = 0; i < csvData.length; i++) {
        try {
          const cropPrice = new CropPrice(csvData[i]);
          const validation = cropPrice.validate();
          
          if (validation.error) {
            errors.push({
              row: i + 1,
              data: csvData[i],
              error: validation.error.details
            });
            continue;
          }

          cropPrices.push(cropPrice);
        } catch (error) {
          errors.push({
            row: i + 1,
            data: csvData[i],
            error: error.message
          });
        }
      }

      return {
        success: true,
        data: cropPrices,
        errors: errors,
        totalRows: csvData.length,
        validRows: cropPrices.length,
        errorRows: errors.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: [],
        errors: []
      };
    }
  }

  /**
   * Reads and parses a CSV file using csv-parser
   * @param {string} filePath - Path to the CSV file
   * @returns {Promise<Array<Object>>} Array of parsed CSV rows
   */
  readCsvFile(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      
      if (!fs.existsSync(filePath)) {
        reject(new Error(`CSV file not found: ${filePath}`));
        return;
      }

      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          // Clean up the data by trimming whitespace
          const cleanData = {};
          Object.keys(data).forEach(key => {
            cleanData[key.trim()] = typeof data[key] === 'string' ? data[key].trim() : data[key];
          });
          results.push(cleanData);
        })
        .on('end', () => {
          resolve(results);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  /**
   * Parses CSV data from a string using PapaParse
   * @param {string} csvString - CSV data as string
   * @param {Object} options - Parsing options
   * @returns {Object} Parsed CSV data with validation results
   */
  parseCsvString(csvString, options = {}) {
    const defaultOptions = {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      transform: (value) => typeof value === 'string' ? value.trim() : value
    };

    const parseOptions = { ...defaultOptions, ...options };
    
    try {
      const result = Papa.parse(csvString, parseOptions);
      
      if (result.errors.length > 0) {
        return {
          success: false,
          errors: result.errors,
          data: []
        };
      }

      return {
        success: true,
        data: result.data,
        errors: [],
        meta: result.meta
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: [],
        errors: []
      };
    }
  }

  /**
   * Validates CSV data structure for mandi prices
   * @param {Array<Object>} csvData - Array of CSV row objects
   * @returns {Object} Validation result
   */
  validateMandiPricesStructure(csvData) {
    const requiredColumns = [
      'crop_name',
      'variety',
      'price_per_kg',
      'market',
      'state',
      'date',
      'quality',
      'source'
    ];

    const optionalColumns = [
      'coordinates_lat',
      'coordinates_lng'
    ];

    if (!Array.isArray(csvData) || csvData.length === 0) {
      return {
        valid: false,
        error: 'CSV data is empty or not an array'
      };
    }

    const firstRow = csvData[0];
    const availableColumns = Object.keys(firstRow);
    const missingColumns = requiredColumns.filter(col => !availableColumns.includes(col));

    if (missingColumns.length > 0) {
      return {
        valid: false,
        error: `Missing required columns: ${missingColumns.join(', ')}`,
        missingColumns,
        availableColumns
      };
    }

    return {
      valid: true,
      requiredColumns,
      optionalColumns,
      availableColumns,
      totalRows: csvData.length
    };
  }

  /**
   * Filters crop prices based on query parameters
   * @param {Array<CropPrice>} cropPrices - Array of crop price objects
   * @param {Object} filters - Filter parameters
   * @returns {Array<CropPrice>} Filtered crop prices
   */
  filterCropPrices(cropPrices, filters = {}) {
    let filtered = [...cropPrices];

    // Filter by crop name
    if (filters.cropName) {
      const cropNameLower = filters.cropName.toLowerCase();
      filtered = filtered.filter(price => 
        price.cropName.toLowerCase().includes(cropNameLower)
      );
    }

    // Filter by market
    if (filters.market) {
      const marketLower = filters.market.toLowerCase();
      filtered = filtered.filter(price => 
        price.market.toLowerCase().includes(marketLower)
      );
    }

    // Filter by state
    if (filters.state) {
      const stateLower = filters.state.toLowerCase();
      filtered = filtered.filter(price => 
        price.state.toLowerCase().includes(stateLower)
      );
    }

    // Filter by quality
    if (filters.quality) {
      filtered = filtered.filter(price => price.quality === filters.quality);
    }

    // Filter by source
    if (filters.source) {
      filtered = filtered.filter(price => price.source === filters.source);
    }

    // Filter by date range
    if (filters.dateRange) {
      if (filters.dateRange.from) {
        const fromDate = new Date(filters.dateRange.from);
        filtered = filtered.filter(price => price.date >= fromDate);
      }
      if (filters.dateRange.to) {
        const toDate = new Date(filters.dateRange.to);
        filtered = filtered.filter(price => price.date <= toDate);
      }
    }

    // Filter by price range
    if (filters.priceRange) {
      if (filters.priceRange.min !== undefined) {
        filtered = filtered.filter(price => price.price >= filters.priceRange.min);
      }
      if (filters.priceRange.max !== undefined) {
        filtered = filtered.filter(price => price.price <= filters.priceRange.max);
      }
    }

    return filtered;
  }

  /**
   * Calculates statistics for crop prices
   * @param {Array<CropPrice>} cropPrices - Array of crop price objects
   * @returns {Object} Statistics object
   */
  calculatePriceStatistics(cropPrices) {
    if (!cropPrices || cropPrices.length === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        median: 0
      };
    }

    const prices = cropPrices.map(cp => cp.price).sort((a, b) => a - b);
    const count = prices.length;
    const sum = prices.reduce((acc, price) => acc + price, 0);
    const average = sum / count;
    const min = prices[0];
    const max = prices[count - 1];
    
    let median;
    if (count % 2 === 0) {
      median = (prices[count / 2 - 1] + prices[count / 2]) / 2;
    } else {
      median = prices[Math.floor(count / 2)];
    }

    return {
      count,
      average: Math.round(average * 100) / 100,
      min,
      max,
      median,
      sum
    };
  }

  /**
   * Groups crop prices by specified field
   * @param {Array<CropPrice>} cropPrices - Array of crop price objects
   * @param {string} groupBy - Field to group by (cropName, market, state, quality, source)
   * @returns {Object} Grouped crop prices
   */
  groupCropPrices(cropPrices, groupBy = 'cropName') {
    const grouped = {};

    cropPrices.forEach(price => {
      const key = price[groupBy];
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(price);
    });

    // Add statistics for each group
    Object.keys(grouped).forEach(key => {
      const groupPrices = grouped[key];
      grouped[key] = {
        prices: groupPrices,
        statistics: this.calculatePriceStatistics(groupPrices)
      };
    });

    return grouped;
  }

  /**
   * Exports crop prices to CSV format
   * @param {Array<CropPrice>} cropPrices - Array of crop price objects
   * @returns {string} CSV string
   */
  exportToCsv(cropPrices) {
    if (!cropPrices || cropPrices.length === 0) {
      return '';
    }

    const headers = [
      'crop_name',
      'variety',
      'price_per_kg',
      'market',
      'state',
      'date',
      'quality',
      'source',
      'coordinates_lat',
      'coordinates_lng'
    ];

    const csvData = cropPrices.map(price => ({
      crop_name: price.cropName,
      variety: price.variety,
      price_per_kg: price.price,
      market: price.market,
      state: price.state,
      date: price.date.toISOString().split('T')[0],
      quality: price.quality,
      source: price.source,
      coordinates_lat: price.coordinates.lat,
      coordinates_lng: price.coordinates.lng
    }));

    return Papa.unparse(csvData, {
      header: true,
      columns: headers
    });
  }
}

module.exports = CsvParserService;