/**
 * Security Service for Multilingual Mandi
 * Provides authentication, authorization, and security measures
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

class SecurityService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || this.generateSecureSecret();
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
    this.bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    this.sessionStore = new Map(); // In production, use Redis
    this.blacklistedTokens = new Set(); // In production, use Redis
  }

  /**
   * Generate a secure secret if not provided
   */
  generateSecureSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password) {
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }
    return await bcrypt.hash(password, this.bcryptRounds);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   */
  generateToken(payload, expiresIn = null) {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: expiresIn || this.jwtExpiresIn,
      issuer: 'multilingual-mandi',
      audience: 'multilingual-mandi-users'
    });
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      if (this.blacklistedTokens.has(token)) {
        throw new Error('Token has been revoked');
      }
      
      return jwt.verify(token, this.jwtSecret, {
        issuer: 'multilingual-mandi',
        audience: 'multilingual-mandi-users'
      });
    } catch (error) {
      throw new Error(`Invalid token: ${error.message}`);
    }
  }

  /**
   * Blacklist a token (logout)
   */
  blacklistToken(token) {
    this.blacklistedTokens.add(token);
    
    // Clean up expired tokens periodically
    if (this.blacklistedTokens.size > 1000) {
      this.cleanupBlacklistedTokens();
    }
  }

  /**
   * Clean up expired blacklisted tokens
   */
  cleanupBlacklistedTokens() {
    const tokensToRemove = [];
    
    for (const token of this.blacklistedTokens) {
      try {
        jwt.verify(token, this.jwtSecret);
      } catch (error) {
        // Token is expired or invalid, safe to remove
        tokensToRemove.push(token);
      }
    }
    
    tokensToRemove.forEach(token => this.blacklistedTokens.delete(token));
  }

  /**
   * Create user session
   */
  createSession(userId, userData = {}) {
    const sessionId = crypto.randomUUID();
    const session = {
      id: sessionId,
      userId,
      createdAt: new Date(),
      lastActivity: new Date(),
      data: userData,
      isActive: true
    };
    
    this.sessionStore.set(sessionId, session);
    return sessionId;
  }

  /**
   * Get user session
   */
  getSession(sessionId) {
    const session = this.sessionStore.get(sessionId);
    if (!session || !session.isActive) {
      return null;
    }
    
    // Update last activity
    session.lastActivity = new Date();
    return session;
  }

  /**
   * Update session data
   */
  updateSession(sessionId, data) {
    const session = this.sessionStore.get(sessionId);
    if (session) {
      session.data = { ...session.data, ...data };
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }

  /**
   * Destroy session
   */
  destroySession(sessionId) {
    const session = this.sessionStore.get(sessionId);
    if (session) {
      session.isActive = false;
      this.sessionStore.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [sessionId, session] of this.sessionStore.entries()) {
      if (now - session.lastActivity > maxAge) {
        this.sessionStore.delete(sessionId);
      }
    }
  }

  /**
   * Generate API key for service-to-service communication
   */
  generateAPIKey(service, permissions = []) {
    const keyData = {
      service,
      permissions,
      createdAt: new Date(),
      keyId: crypto.randomUUID()
    };
    
    const apiKey = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(JSON.stringify(keyData))
      .digest('hex');
    
    return {
      apiKey: `mandi_${apiKey}`,
      keyId: keyData.keyId,
      service,
      permissions
    };
  }

  /**
   * Verify API key
   */
  verifyAPIKey(apiKey) {
    if (!apiKey || !apiKey.startsWith('mandi_')) {
      throw new Error('Invalid API key format');
    }
    
    // In production, you would validate against a database
    // For now, we'll implement basic validation
    const key = apiKey.replace('mandi_', '');
    
    if (key.length !== 64) {
      throw new Error('Invalid API key');
    }
    
    return {
      valid: true,
      service: 'external',
      permissions: ['read']
    };
  }

  /**
   * Sanitize user input to prevent XSS
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }
    
    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  /**
   * Validate input against common injection patterns
   */
  validateInput(input, type = 'general') {
    if (!input) return true;
    
    const patterns = {
      general: /^[a-zA-Z0-9\s\-_.@]+$/,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      phone: /^[\+]?[1-9][\d]{0,15}$/,
      alphanumeric: /^[a-zA-Z0-9]+$/,
      text: /^[a-zA-Z0-9\s\-_.!?,:;'"()]+$/
    };
    
    const pattern = patterns[type] || patterns.general;
    return pattern.test(input);
  }

  /**
   * Create rate limiter for different endpoints
   */
  createRateLimiter(options = {}) {
    const defaultOptions = {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(options.windowMs / 1000) || 900
      },
      standardHeaders: true,
      legacyHeaders: false
    };
    
    return rateLimit({ ...defaultOptions, ...options });
  }

  /**
   * Middleware for JWT authentication
   */
  authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'MISSING_TOKEN'
      });
    }
    
    try {
      const decoded = this.verifyToken(token);
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(403).json({ 
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }
  }

  /**
   * Middleware for API key authentication
   */
  authenticateAPIKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({ 
        error: 'API key required',
        code: 'MISSING_API_KEY'
      });
    }
    
    try {
      const keyInfo = this.verifyAPIKey(apiKey);
      req.apiKey = keyInfo;
      next();
    } catch (error) {
      return res.status(403).json({ 
        error: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
    }
  }

  /**
   * Middleware for input validation and sanitization
   */
  validateAndSanitize(validationRules = {}) {
    return (req, res, next) => {
      // Sanitize all string inputs
      const sanitizeObject = (obj) => {
        if (typeof obj === 'string') {
          return this.sanitizeInput(obj);
        } else if (Array.isArray(obj)) {
          return obj.map(sanitizeObject);
        } else if (obj && typeof obj === 'object') {
          const sanitized = {};
          for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeObject(value);
          }
          return sanitized;
        }
        return obj;
      };
      
      req.body = sanitizeObject(req.body);
      req.query = sanitizeObject(req.query);
      req.params = sanitizeObject(req.params);
      
      // Validate specific fields
      for (const [field, rules] of Object.entries(validationRules)) {
        const value = req.body[field] || req.query[field] || req.params[field];
        
        if (rules.required && !value) {
          return res.status(400).json({
            error: `${field} is required`,
            code: 'VALIDATION_ERROR'
          });
        }
        
        if (value && rules.type && !this.validateInput(value, rules.type)) {
          return res.status(400).json({
            error: `${field} has invalid format`,
            code: 'VALIDATION_ERROR'
          });
        }
        
        if (value && rules.minLength && value.length < rules.minLength) {
          return res.status(400).json({
            error: `${field} must be at least ${rules.minLength} characters`,
            code: 'VALIDATION_ERROR'
          });
        }
        
        if (value && rules.maxLength && value.length > rules.maxLength) {
          return res.status(400).json({
            error: `${field} must be no more than ${rules.maxLength} characters`,
            code: 'VALIDATION_ERROR'
          });
        }
      }
      
      next();
    };
  }

  /**
   * Middleware for CORS security
   */
  corsMiddleware() {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
    
    return (req, res, next) => {
      const origin = req.headers.origin;
      
      if (allowedOrigins.includes(origin) || !origin) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
      }
      
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
      
      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }
      
      next();
    };
  }

  /**
   * Security headers middleware
   */
  securityHeaders() {
    return (req, res, next) => {
      // Prevent clickjacking
      res.setHeader('X-Frame-Options', 'DENY');
      
      // Prevent MIME type sniffing
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      // Enable XSS protection
      res.setHeader('X-XSS-Protection', '1; mode=block');
      
      // Strict transport security (HTTPS only)
      if (req.secure) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
      
      // Content Security Policy
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' wss: ws:; " +
        "font-src 'self';"
      );
      
      next();
    };
  }

  /**
   * Get security statistics
   */
  getSecurityStats() {
    return {
      activeSessions: this.sessionStore.size,
      blacklistedTokens: this.blacklistedTokens.size,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new SecurityService();