const Joi = require('joi');

/**
 * Crop Price Model
 * Represents price information for agricultural crops in mandi markets
 */
class CropPrice {
  constructor(data) {
    this.id = data.id || this.generateId();
    this.cropName = data.cropName || data.crop_name;
    this.variety = data.variety;
    this.price = parseFloat(data.price || data.price_per_kg);
    this.unit = data.unit || 'kg';
    this.market = data.market;
    this.state = data.state;
    this.date = new Date(data.date);
    this.source = data.source || 'manual';
    this.quality = data.quality || 'standard';
    this.coordinates = {
      lat: parseFloat(data.coordinates_lat || data.coordinates?.lat || 0),
      lng: parseFloat(data.coordinates_lng || data.coordinates?.lng || 0)
    };
  }

  generateId() {
    return `${this.cropName}_${this.market}_${Date.now()}`;
  }

  /**
   * Validates the crop price data
   * @returns {Object} Validation result with error details if any
   */
  validate() {
    const schema = Joi.object({
      cropName: Joi.string().required().min(2).max(50),
      variety: Joi.string().required().min(2).max(50),
      price: Joi.number().positive().required(),
      unit: Joi.string().valid('kg', 'quintal', 'ton').default('kg'),
      market: Joi.string().required().min(2).max(100),
      state: Joi.string().required().min(2).max(50),
      date: Joi.date().required(),
      source: Joi.string().valid('agmarknet', 'manual', 'estimated').default('manual'),
      quality: Joi.string().valid('premium', 'standard', 'low').default('standard'),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).required()
    });

    return schema.validate({
      cropName: this.cropName,
      variety: this.variety,
      price: this.price,
      unit: this.unit,
      market: this.market,
      state: this.state,
      date: this.date,
      source: this.source,
      quality: this.quality,
      coordinates: this.coordinates
    });
  }

  /**
   * Converts the crop price to a plain object
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      id: this.id,
      cropName: this.cropName,
      variety: this.variety,
      price: this.price,
      unit: this.unit,
      market: this.market,
      state: this.state,
      date: this.date,
      source: this.source,
      quality: this.quality,
      coordinates: this.coordinates
    };
  }

  /**
   * Formats price for display with currency symbol
   * @returns {string} Formatted price string
   */
  getFormattedPrice() {
    return `₹${this.price}/${this.unit}`;
  }

  /**
   * Checks if the price data is recent (within last 7 days)
   * @returns {boolean} True if recent, false otherwise
   */
  isRecent() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return this.date >= sevenDaysAgo;
  }
}

/**
 * Market Information Model
 * Represents information about agricultural markets
 */
class MarketInfo {
  constructor(data) {
    this.id = data.id || this.generateId();
    this.name = data.name;
    this.state = data.state;
    this.district = data.district;
    this.coordinates = {
      lat: parseFloat(data.coordinates?.lat || data.coordinates_lat || 0),
      lng: parseFloat(data.coordinates?.lng || data.coordinates_lng || 0)
    };
    this.operatingHours = data.operatingHours || '6:00 AM - 8:00 PM';
    this.contactInfo = data.contactInfo || {};
    this.facilities = data.facilities || [];
    this.isActive = data.isActive !== undefined ? data.isActive : true;
  }

  generateId() {
    const safeName = this.name ? this.name.toLowerCase().replace(/\s+/g, '_') : 'unknown';
    const safeState = this.state ? this.state.toLowerCase() : 'unknown';
    return `market_${safeName}_${safeState}`;
  }

  /**
   * Validates the market information
   * @returns {Object} Validation result with error details if any
   */
  validate() {
    const schema = Joi.object({
      name: Joi.string().required().min(2).max(100),
      state: Joi.string().required().min(2).max(50),
      district: Joi.string().required().min(2).max(50),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).required(),
      operatingHours: Joi.string().optional(),
      contactInfo: Joi.object().optional(),
      facilities: Joi.array().items(Joi.string()).optional(),
      isActive: Joi.boolean().default(true)
    });

    return schema.validate({
      name: this.name,
      state: this.state,
      district: this.district,
      coordinates: this.coordinates,
      operatingHours: this.operatingHours,
      contactInfo: this.contactInfo,
      facilities: this.facilities,
      isActive: this.isActive
    });
  }

  /**
   * Converts the market info to a plain object
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      id: this.id,
      name: this.name,
      state: this.state,
      district: this.district,
      coordinates: this.coordinates,
      operatingHours: this.operatingHours,
      contactInfo: this.contactInfo,
      facilities: this.facilities,
      isActive: this.isActive
    };
  }

  /**
   * Calculates distance from given coordinates (in kilometers)
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {number} Distance in kilometers
   */
  getDistanceFrom(lat, lng) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat - this.coordinates.lat);
    const dLng = this.toRadians(lng - this.coordinates.lng);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRadians(this.coordinates.lat)) * Math.cos(this.toRadians(lat)) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI/180);
  }
}

/**
 * Price Query Model
 * Represents a query for crop price information
 */
class PriceQuery {
  constructor(data) {
    this.cropName = data.cropName;
    this.market = data.market;
    this.state = data.state;
    this.dateRange = {
      from: data.dateRange?.from ? new Date(data.dateRange.from) : null,
      to: data.dateRange?.to ? new Date(data.dateRange.to) : null
    };
    this.quality = data.quality;
    this.source = data.source;
    this.maxDistance = data.maxDistance; // in kilometers
    this.userLocation = data.userLocation ? {
      lat: parseFloat(data.userLocation.lat),
      lng: parseFloat(data.userLocation.lng)
    } : null;
  }

  /**
   * Validates the price query
   * @returns {Object} Validation result with error details if any
   */
  validate() {
    const schema = Joi.object({
      cropName: Joi.string().required().min(2).max(50),
      market: Joi.string().optional().min(2).max(100),
      state: Joi.string().optional().min(2).max(50),
      dateRange: Joi.object({
        from: Joi.date().optional(),
        to: Joi.date().optional()
      }).optional(),
      quality: Joi.string().valid('premium', 'standard', 'low').optional(),
      source: Joi.string().valid('agmarknet', 'manual', 'estimated').optional(),
      maxDistance: Joi.number().positive().optional(),
      userLocation: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).optional()
    });

    return schema.validate({
      cropName: this.cropName,
      market: this.market,
      state: this.state,
      dateRange: this.dateRange,
      quality: this.quality,
      source: this.source,
      maxDistance: this.maxDistance,
      userLocation: this.userLocation
    });
  }
}

module.exports = {
  CropPrice,
  MarketInfo,
  PriceQuery
};