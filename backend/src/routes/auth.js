/**
 * Authentication routes for Multilingual Mandi
 */

const express = require('express');
const router = express.Router();
const securityService = require('../services/SecurityService');
const loggingService = require('../services/LoggingService');
const errorHandler = require('../services/ErrorHandlingService');

// Mock user database (in production, use a real database)
const users = new Map();

/**
 * Register a new user
 */
router.post('/register', 
  securityService.validateAndSanitize({
    username: { required: true, type: 'alphanumeric', minLength: 3, maxLength: 20 },
    email: { required: true, type: 'email' },
    password: { required: true, minLength: 6, maxLength: 100 },
    language: { required: false, type: 'alphanumeric' },
    role: { required: false, type: 'alphanumeric' }
  }),
  async (req, res) => {
    const transactionId = loggingService.logTransaction('user_registration', req.body);
    
    try {
      const { username, email, password, language = 'en', role = 'user' } = req.body;
      
      // Check if user already exists
      const existingUser = Array.from(users.values()).find(
        user => user.username === username || user.email === email
      );
      
      if (existingUser) {
        loggingService.updateTransactionStatus(transactionId, 'failed', null, 
          new Error('User already exists'));
        return res.status(400).json(
          errorHandler.createErrorResponse('USER_ALREADY_EXISTS', language)
        );
      }
      
      // Hash password
      const hashedPassword = await securityService.hashPassword(password);
      
      // Create user
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const user = {
        id: userId,
        username,
        email,
        password: hashedPassword,
        language,
        role,
        createdAt: new Date(),
        isActive: true
      };
      
      users.set(userId, user);
      
      // Generate token
      const token = securityService.generateToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        language: user.language
      });
      
      // Create session
      const sessionId = securityService.createSession(userId, {
        username: user.username,
        language: user.language,
        role: user.role
      });
      
      loggingService.logAudit('user_registered', 'user', userId, {
        username,
        email,
        language,
        role,
        success: true
      });
      
      loggingService.updateTransactionStatus(transactionId, 'completed', { userId });
      
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          language: user.language,
          role: user.role
        },
        token,
        sessionId
      });
      
    } catch (error) {
      loggingService.updateTransactionStatus(transactionId, 'failed', null, error);
      const errorResponse = errorHandler.handleError(error, 'user_registration', req.body.language);
      res.status(500).json(errorResponse);
    }
  }
);

/**
 * Login user
 */
router.post('/login',
  securityService.validateAndSanitize({
    username: { required: true, type: 'text', maxLength: 100 },
    password: { required: true, minLength: 1, maxLength: 100 }
  }),
  async (req, res) => {
    const transactionId = loggingService.logTransaction('user_login', { username: req.body.username });
    
    try {
      const { username, password } = req.body;
      const language = req.headers['accept-language'] || req.body.language || 'en';
      
      // Find user by username or email
      const user = Array.from(users.values()).find(
        u => u.username === username || u.email === username
      );
      
      if (!user || !user.isActive) {
        loggingService.logAudit('login_failed', 'user', null, {
          username,
          reason: 'user_not_found',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          success: false
        });
        
        loggingService.updateTransactionStatus(transactionId, 'failed', null, 
          new Error('Invalid credentials'));
        
        return res.status(401).json(
          errorHandler.createErrorResponse('INVALID_CREDENTIALS', language)
        );
      }
      
      // Verify password
      const isValidPassword = await securityService.verifyPassword(password, user.password);
      
      if (!isValidPassword) {
        loggingService.logAudit('login_failed', 'user', user.id, {
          username,
          reason: 'invalid_password',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          success: false
        });
        
        loggingService.updateTransactionStatus(transactionId, 'failed', null, 
          new Error('Invalid credentials'));
        
        return res.status(401).json(
          errorHandler.createErrorResponse('INVALID_CREDENTIALS', language)
        );
      }
      
      // Generate token
      const token = securityService.generateToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        language: user.language
      });
      
      // Create session
      const sessionId = securityService.createSession(user.id, {
        username: user.username,
        language: user.language,
        role: user.role,
        loginTime: new Date()
      });
      
      loggingService.logAudit('user_login', 'user', user.id, {
        username: user.username,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        success: true
      });
      
      loggingService.updateTransactionStatus(transactionId, 'completed', { userId: user.id });
      
      res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          language: user.language,
          role: user.role
        },
        token,
        sessionId
      });
      
    } catch (error) {
      loggingService.updateTransactionStatus(transactionId, 'failed', null, error);
      const errorResponse = errorHandler.handleError(error, 'user_login', req.body.language);
      res.status(500).json(errorResponse);
    }
  }
);

/**
 * Logout user
 */
router.post('/logout', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const sessionId = req.headers['x-session-id'];
    
    if (token) {
      securityService.blacklistToken(token);
    }
    
    if (sessionId) {
      securityService.destroySession(sessionId);
    }
    
    loggingService.logAudit('user_logout', 'user', req.user?.userId, {
      success: true
    });
    
    res.json({
      success: true,
      message: 'Logout successful'
    });
    
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'user_logout');
    res.status(500).json(errorResponse);
  }
});

/**
 * Get current user profile
 */
router.get('/profile', securityService.authenticateToken.bind(securityService), (req, res) => {
  try {
    const user = users.get(req.user.userId);
    
    if (!user || !user.isActive) {
      return res.status(404).json(
        errorHandler.createErrorResponse('USER_NOT_FOUND', req.user.language)
      );
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        language: user.language,
        role: user.role,
        createdAt: user.createdAt
      }
    });
    
  } catch (error) {
    const errorResponse = errorHandler.handleError(error, 'get_profile', req.user?.language);
    res.status(500).json(errorResponse);
  }
});

/**
 * Update user profile
 */
router.put('/profile', 
  securityService.authenticateToken.bind(securityService),
  securityService.validateAndSanitize({
    email: { required: false, type: 'email' },
    language: { required: false, type: 'alphanumeric' }
  }),
  async (req, res) => {
    const transactionId = loggingService.logTransaction('update_profile', req.body, req.user.userId);
    
    try {
      const user = users.get(req.user.userId);
      
      if (!user || !user.isActive) {
        loggingService.updateTransactionStatus(transactionId, 'failed', null, 
          new Error('User not found'));
        return res.status(404).json(
          errorHandler.createErrorResponse('USER_NOT_FOUND', req.user.language)
        );
      }
      
      // Update allowed fields
      const { email, language } = req.body;
      
      if (email) user.email = email;
      if (language) user.language = language;
      
      user.updatedAt = new Date();
      
      loggingService.logAudit('profile_updated', 'user', user.id, {
        changes: { email: !!email, language: !!language },
        success: true
      });
      
      loggingService.updateTransactionStatus(transactionId, 'completed', { userId: user.id });
      
      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          language: user.language,
          role: user.role
        }
      });
      
    } catch (error) {
      loggingService.updateTransactionStatus(transactionId, 'failed', null, error);
      const errorResponse = errorHandler.handleError(error, 'update_profile', req.user?.language);
      res.status(500).json(errorResponse);
    }
  }
);

/**
 * Generate API key for external services
 */
router.post('/api-key', 
  securityService.authenticateToken.bind(securityService),
  (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json(
          errorHandler.createErrorResponse('INSUFFICIENT_PERMISSIONS', req.user.language)
        );
      }
      
      const { service, permissions = ['read'] } = req.body;
      
      const apiKeyData = securityService.generateAPIKey(service, permissions);
      
      loggingService.logAudit('api_key_generated', 'system', req.user.userId, {
        service,
        permissions,
        keyId: apiKeyData.keyId,
        success: true
      });
      
      res.json({
        success: true,
        message: 'API key generated successfully',
        ...apiKeyData
      });
      
    } catch (error) {
      const errorResponse = errorHandler.handleError(error, 'generate_api_key', req.user?.language);
      res.status(500).json(errorResponse);
    }
  }
);

// Add error messages to ErrorHandlingService
errorHandler.errorMessages = {
  ...errorHandler.errorMessages,
  'USER_ALREADY_EXISTS': {
    en: 'User with this username or email already exists.',
    hi: 'इस उपयोगकर्ता नाम या ईमेल के साथ उपयोगकर्ता पहले से मौजूद है।',
    te: 'ఈ వినియోగదారు పేరు లేదా ఇమెయిల్‌తో వినియోగదారు ఇప్పటికే ఉన్నారు.',
    ta: 'இந்த பயனர்பெயர் அல்லது மின்னஞ்சலுடன் பயனர் ஏற்கனவே உள்ளார்.'
  },
  'INVALID_CREDENTIALS': {
    en: 'Invalid username or password.',
    hi: 'अमान्य उपयोगकर्ता नाम या पासवर्ड।',
    te: 'చెల్లని వినియోగదారు పేరు లేదా పాస్‌వర్డ్.',
    ta: 'தவறான பயனர்பெயர் அல்லது கடவுச்சொல்.'
  },
  'USER_NOT_FOUND': {
    en: 'User not found.',
    hi: 'उपयोगकर्ता नहीं मिला।',
    te: 'వినియోగదారు కనుగొనబడలేదు.',
    ta: 'பயனர் கிடைக்கவில்லை.'
  },
  'INSUFFICIENT_PERMISSIONS': {
    en: 'Insufficient permissions to perform this action.',
    hi: 'इस कार्य को करने के लिए अपर्याप्त अनुमतियां।',
    te: 'ఈ చర్యను నిర్వహించడానికి తగిన అనుమతులు లేవు.',
    ta: 'இந்த செயலைச் செய்ய போதுமான அனுமதிகள் இல்லை.'
  }
};

module.exports = router;