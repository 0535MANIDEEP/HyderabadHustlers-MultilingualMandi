const Joi = require('joi');
const { CropPrice, MarketInfo, PriceQuery } = require('../models/CropModels');

/**
 * Data Validation Service
 * Provides comprehensive validation for crop price data, market information, and queries
 */
class DataValidationService {
  constructor() {
    this.supportedCrops = [
      'tomato', 'onion', 'chili', 'potato', 'carrot', 'cabbage', 
      'cauliflower', 'brinjal', 'okra', 'cucumber', 'spinach', 
      'coriander', 'mint', 'ginger', 'garlic', 'beetroot'
    ];
    
    this.supportedStates = [
      'Telangana', 'Andhra Pradesh', 'Karnataka', 'Tamil Nadu', 
      'Kerala', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Punjab', 
      'Haryana', 'Uttar Pradesh', 'Bihar', 'West Bengal', 'Odisha'
    ];

    this.supportedQualities = ['premium', 'standard', 'low'];
    this.supportedSources = ['agmarknet', 'manual', 'estimated'];
    this.supportedUnits = ['kg', 'quintal', 'ton'];
  }

  /**
   * Validates crop price data with comprehensive checks
   * @param {Object} data - Raw crop price data
   * @returns {Object} Validation result with detailed feedback
   */
  validateCropPrice(data) {
    const schema = Joi.object({
      cropName: Joi.string()
        .required()
        .min(2)
        .max(50)
        .custom((value, helpers) => {
          const normalizedValue = value.toLowerCase().trim();
          if (!this.supportedCrops.includes(normalizedValue)) {
            return helpers.error('any.invalid', { 
              message: `Crop "${value}" is not in supported crops list. Supported crops: ${this.supportedCrops.join(', ')}` 
            });
          }
          return normalizedValue;
        })
        .messages({
          'string.empty': 'Crop name is required',
          'string.min': 'Crop name must be at least 2 characters long',
          'string.max': 'Crop name cannot exceed 50 characters'
        }),

      variety: Joi.string()
        .required()
        .min(2)
        .max(50)
        .messages({
          'string.empty': 'Variety is required',
          'string.min': 'Variety must be at least 2 characters long'
        }),

      price: Joi.number()
        .positive()
        .required()
        .min(0.01)
        .max(10000)
        .messages({
          'number.base': 'Price must be a valid number',
          'number.positive': 'Price must be positive',
          'number.min': 'Price must be at least ₹0.01',
          'number.max': 'Price cannot exceed ₹10,000 per kg'
        }),

      unit: Joi.string()
        .valid(...this.supportedUnits)
        .default('kg')
        .messages({
          'any.only': `Unit must be one of: ${this.supportedUnits.join(', ')}`
        }),

      market: Joi.string()
        .required()
        .min(2)
        .max(100)
        .messages({
          'string.empty': 'Market name is required',
          'string.min': 'Market name must be at least 2 characters long'
        }),

      state: Joi.string()
        .required()
        .custom((value, helpers) => {
          if (!this.supportedStates.includes(value)) {
            return helpers.error('any.invalid', { 
              message: `State "${value}" is not supported. Supported states: ${this.supportedStates.join(', ')}` 
            });
          }
          return value;
        })
        .messages({
          'string.empty': 'State is required'
        }),

      date: Joi.date()
        .required()
        .max('now')
        .min('2020-01-01')
        .messages({
          'date.base': 'Date must be a valid date',
          'date.max': 'Date cannot be in the future',
          'date.min': 'Date cannot be before 2020'
        }),

      source: Joi.string()
        .valid(...this.supportedSources)
        .default('manual')
        .messages({
          'any.only': `Source must be one of: ${this.supportedSources.join(', ')}`
        }),

      quality: Joi.string()
        .valid(...this.supportedQualities)
        .default('standard')
        .messages({
          'any.only': `Quality must be one of: ${this.supportedQualities.join(', ')}`
        }),

      coordinates: Joi.object({
        lat: Joi.number()
          .min(-90)
          .max(90)
          .required()
          .messages({
            'number.min': 'Latitude must be between -90 and 90',
            'number.max': 'Latitude must be between -90 and 90'
          }),
        lng: Joi.number()
          .min(-180)
          .max(180)
          .required()
          .messages({
            'number.min': 'Longitude must be between -180 and 180',
            'number.max': 'Longitude must be between -180 and 180'
          })
      }).required()
    });

    const validation = schema.validate(data, { 
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    });

    return {
      isValid: !validation.error,
      data: validation.value,
      errors: validation.error ? validation.error.details : [],
      warnings: this.generateWarnings(validation.value || data)
    };
  }

  /**
   * Validates market information data
   * @param {Object} data - Raw market information data
   * @returns {Object} Validation result
   */
  validateMarketInfo(data) {
    const schema = Joi.object({
      name: Joi.string()
        .required()
        .min(2)
        .max(100)
        .messages({
          'string.empty': 'Market name is required'
        }),

      state: Joi.string()
        .required()
        .custom((value, helpers) => {
          if (!this.supportedStates.includes(value)) {
            return helpers.error('any.invalid', { 
              message: `State "${value}" is not supported` 
            });
          }
          return value;
        }),

      district: Joi.string()
        .required()
        .min(2)
        .max(50),

      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).required(),

      operatingHours: Joi.string().optional(),
      contactInfo: Joi.object().optional(),
      facilities: Joi.array().items(Joi.string()).optional(),
      isActive: Joi.boolean().default(true)
    });

    const validation = schema.validate(data, { 
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    });

    return {
      isValid: !validation.error,
      data: validation.value,
      errors: validation.error ? validation.error.details : []
    };
  }

  /**
   * Validates price query parameters
   * @param {Object} query - Query parameters
   * @returns {Object} Validation result
   */
  validatePriceQuery(query) {
    const schema = Joi.object({
      cropName: Joi.string()
        .required()
        .min(2)
        .max(50)
        .custom((value, helpers) => {
          const normalizedValue = value.toLowerCase().trim();
          if (!this.supportedCrops.includes(normalizedValue)) {
            return helpers.error('any.invalid', { 
              message: `Crop "${value}" is not supported` 
            });
          }
          return normalizedValue;
        }),

      market: Joi.string().optional().min(2).max(100),
      state: Joi.string().optional(),
      
      dateRange: Joi.object({
        from: Joi.date().optional(),
        to: Joi.date().optional().min(Joi.ref('from'))
      }).optional(),

      quality: Joi.string().valid(...this.supportedQualities).optional(),
      source: Joi.string().valid(...this.supportedSources).optional(),
      maxDistance: Joi.number().positive().max(1000).optional(),

      userLocation: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).optional()
    });

    const validation = schema.validate(query, { 
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    });

    return {
      isValid: !validation.error,
      data: validation.value,
      errors: validation.error ? validation.error.details : []
    };
  }

  /**
   * Validates bulk crop price data
   * @param {Array} dataArray - Array of crop price data objects
   * @returns {Object} Bulk validation result
   */
  validateBulkCropPrices(dataArray) {
    if (!Array.isArray(dataArray)) {
      return {
        isValid: false,
        error: 'Data must be an array',
        validItems: [],
        invalidItems: []
      };
    }

    const validItems = [];
    const invalidItems = [];

    dataArray.forEach((item, index) => {
      const validation = this.validateCropPrice(item);
      
      if (validation.isValid) {
        validItems.push({
          index,
          data: validation.data,
          warnings: validation.warnings
        });
      } else {
        invalidItems.push({
          index,
          data: item,
          errors: validation.errors
        });
      }
    });

    return {
      isValid: invalidItems.length === 0,
      totalItems: dataArray.length,
      validItems,
      invalidItems,
      validCount: validItems.length,
      invalidCount: invalidItems.length,
      successRate: (validItems.length / dataArray.length) * 100
    };
  }

  /**
   * Generates warnings for potentially problematic data
   * @param {Object} data - Validated data
   * @returns {Array} Array of warning messages
   */
  generateWarnings(data) {
    const warnings = [];

    if (!data) return warnings;

    // Price warnings
    if (data.price) {
      if (data.price < 5) {
        warnings.push('Price seems unusually low (< ₹5/kg)');
      }
      if (data.price > 500) {
        warnings.push('Price seems unusually high (> ₹500/kg)');
      }
    }

    // Date warnings
    if (data.date) {
      const daysDiff = (new Date() - new Date(data.date)) / (1000 * 60 * 60 * 24);
      if (daysDiff > 30) {
        warnings.push('Price data is more than 30 days old');
      }
    }

    // Coordinate warnings
    if (data.coordinates) {
      // Check if coordinates are in India (approximate bounds)
      const { lat, lng } = data.coordinates;
      if (lat < 6 || lat > 37 || lng < 68 || lng > 97) {
        warnings.push('Coordinates appear to be outside India');
      }
    }

    return warnings;
  }

  /**
   * Sanitizes and normalizes crop price data
   * @param {Object} data - Raw data
   * @returns {Object} Sanitized data
   */
  sanitizeCropPriceData(data) {
    const sanitized = { ...data };

    // Normalize crop name
    if (sanitized.cropName) {
      sanitized.cropName = sanitized.cropName.toLowerCase().trim();
    }

    // Normalize market name
    if (sanitized.market) {
      sanitized.market = sanitized.market.trim();
    }

    // Normalize state name
    if (sanitized.state) {
      sanitized.state = sanitized.state.trim();
    }

    // Normalize variety
    if (sanitized.variety) {
      sanitized.variety = sanitized.variety.toLowerCase().trim();
    }

    // Ensure price is a number
    if (sanitized.price && typeof sanitized.price === 'string') {
      sanitized.price = parseFloat(sanitized.price);
    }

    // Ensure coordinates are numbers
    if (sanitized.coordinates) {
      if (typeof sanitized.coordinates.lat === 'string') {
        sanitized.coordinates.lat = parseFloat(sanitized.coordinates.lat);
      }
      if (typeof sanitized.coordinates.lng === 'string') {
        sanitized.coordinates.lng = parseFloat(sanitized.coordinates.lng);
      }
    }

    return sanitized;
  }

  /**
   * Checks for duplicate entries in crop price data
   * @param {Array} dataArray - Array of crop price data
   * @returns {Object} Duplicate analysis result
   */
  checkForDuplicates(dataArray) {
    const seen = new Map();
    const duplicates = [];

    dataArray.forEach((item, index) => {
      const key = `${item.cropName}_${item.market}_${item.date}_${item.variety}`;
      
      if (seen.has(key)) {
        duplicates.push({
          index,
          duplicateOf: seen.get(key),
          data: item
        });
      } else {
        seen.set(key, index);
      }
    });

    return {
      hasDuplicates: duplicates.length > 0,
      duplicates,
      duplicateCount: duplicates.length,
      uniqueCount: dataArray.length - duplicates.length
    };
  }

  /**
   * Gets supported values for various fields
   * @returns {Object} Object containing all supported values
   */
  getSupportedValues() {
    return {
      crops: this.supportedCrops,
      states: this.supportedStates,
      qualities: this.supportedQualities,
      sources: this.supportedSources,
      units: this.supportedUnits
    };
  }
}

module.exports = DataValidationService;