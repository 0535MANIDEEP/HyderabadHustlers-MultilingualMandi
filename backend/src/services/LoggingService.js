/**
 * Comprehensive Logging Service for Multilingual Mandi
 * Provides structured logging, transaction tracking, and audit trails
 */

const winston = require('winston');
const path = require('path');

class LoggingService {
  constructor() {
    this.logger = this.createLogger();
    this.transactionLog = [];
    this.auditLog = [];
    this.performanceMetrics = new Map();
  }

  /**
   * Create Winston logger with multiple transports
   */
  createLogger() {
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return JSON.stringify({
          timestamp,
          level,
          message,
          ...meta
        });
      })
    );

    return winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      transports: [
        // Console transport for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        
        // File transport for general logs
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'app.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        
        // File transport for error logs
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        
        // File transport for audit logs
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'audit.log'),
          level: 'info',
          maxsize: 5242880, // 5MB
          maxFiles: 10
        })
      ]
    });
  }

  /**
   * Log general application events
   */
  info(message, metadata = {}) {
    this.logger.info(message, {
      service: 'multilingual-mandi',
      ...metadata
    });
  }

  /**
   * Log warning events
   */
  warn(message, metadata = {}) {
    this.logger.warn(message, {
      service: 'multilingual-mandi',
      ...metadata
    });
  }

  /**
   * Log error events
   */
  error(message, error = null, metadata = {}) {
    this.logger.error(message, {
      service: 'multilingual-mandi',
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : null,
      ...metadata
    });
  }

  /**
   * Log debug information
   */
  debug(message, metadata = {}) {
    this.logger.debug(message, {
      service: 'multilingual-mandi',
      ...metadata
    });
  }

  /**
   * Log transaction events with detailed tracking
   */
  logTransaction(transactionType, data, userId = null, sessionId = null) {
    const transaction = {
      id: this.generateTransactionId(),
      type: transactionType,
      timestamp: new Date().toISOString(),
      userId,
      sessionId,
      data: this.sanitizeData(data),
      status: 'initiated'
    };

    this.transactionLog.push(transaction);
    
    // Keep only last 1000 transactions in memory
    if (this.transactionLog.length > 1000) {
      this.transactionLog = this.transactionLog.slice(-1000);
    }

    this.logger.info('Transaction logged', {
      category: 'transaction',
      transactionId: transaction.id,
      type: transactionType,
      userId,
      sessionId,
      dataSize: JSON.stringify(data).length
    });

    return transaction.id;
  }

  /**
   * Update transaction status
   */
  updateTransactionStatus(transactionId, status, result = null, error = null) {
    const transaction = this.transactionLog.find(t => t.id === transactionId);
    if (transaction) {
      transaction.status = status;
      transaction.completedAt = new Date().toISOString();
      transaction.duration = new Date(transaction.completedAt) - new Date(transaction.timestamp);
      
      if (result) {
        transaction.result = this.sanitizeData(result);
      }
      
      if (error) {
        transaction.error = {
          message: error.message,
          stack: error.stack,
          name: error.name
        };
      }

      this.logger.info('Transaction updated', {
        category: 'transaction',
        transactionId,
        status,
        duration: transaction.duration,
        hasError: !!error
      });
    }
  }

  /**
   * Log audit events for security and compliance
   */
  logAudit(action, resource, userId, metadata = {}) {
    const auditEntry = {
      id: this.generateAuditId(),
      timestamp: new Date().toISOString(),
      action,
      resource,
      userId,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      sessionId: metadata.sessionId,
      success: metadata.success !== false,
      details: this.sanitizeData(metadata.details || {})
    };

    this.auditLog.push(auditEntry);
    
    // Keep only last 500 audit entries in memory
    if (this.auditLog.length > 500) {
      this.auditLog = this.auditLog.slice(-500);
    }

    this.logger.info('Audit event logged', {
      category: 'audit',
      auditId: auditEntry.id,
      action,
      resource,
      userId,
      success: auditEntry.success
    });

    return auditEntry.id;
  }

  /**
   * Log performance metrics
   */
  logPerformance(operation, duration, metadata = {}) {
    const performanceEntry = {
      operation,
      duration,
      timestamp: new Date().toISOString(),
      metadata: this.sanitizeData(metadata)
    };

    // Store performance metrics
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, []);
    }
    
    const metrics = this.performanceMetrics.get(operation);
    metrics.push(performanceEntry);
    
    // Keep only last 100 entries per operation
    if (metrics.length > 100) {
      this.performanceMetrics.set(operation, metrics.slice(-100));
    }

    this.logger.info('Performance metric logged', {
      category: 'performance',
      operation,
      duration,
      ...metadata
    });
  }

  /**
   * Log API requests and responses
   */
  logAPIRequest(req, res, duration) {
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
      contentLength: res.get('content-length'),
      userId: req.user?.id,
      sessionId: req.sessionId,
      language: req.headers['accept-language'] || req.query.lang,
      timestamp: new Date().toISOString()
    };

    // Log different levels based on status code
    if (res.statusCode >= 500) {
      this.error('API request failed', null, logData);
    } else if (res.statusCode >= 400) {
      this.warn('API request error', logData);
    } else {
      this.info('API request completed', logData);
    }

    // Log to audit trail for sensitive operations
    if (this.isSensitiveOperation(req)) {
      this.logAudit(
        `${req.method} ${req.path}`,
        'api',
        req.user?.id,
        {
          statusCode: res.statusCode,
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip,
          success: res.statusCode < 400
        }
      );
    }
  }

  /**
   * Log WebSocket events
   */
  logWebSocketEvent(event, socketId, data = {}) {
    this.info('WebSocket event', {
      category: 'websocket',
      event,
      socketId,
      userId: data.userId,
      sessionId: data.sessionId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log AI service interactions
   */
  logAIInteraction(service, operation, input, output, duration, error = null) {
    const logData = {
      category: 'ai-service',
      service,
      operation,
      inputSize: JSON.stringify(input).length,
      outputSize: output ? JSON.stringify(output).length : 0,
      duration,
      success: !error,
      timestamp: new Date().toISOString()
    };

    if (error) {
      logData.error = {
        message: error.message,
        name: error.name
      };
      this.error(`AI service error: ${service}.${operation}`, error, logData);
    } else {
      this.info(`AI service success: ${service}.${operation}`, logData);
    }

    // Track performance metrics for AI services
    this.logPerformance(`ai.${service}.${operation}`, duration, {
      inputSize: logData.inputSize,
      outputSize: logData.outputSize,
      success: !error
    });
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(limit = 50, type = null, userId = null) {
    let transactions = [...this.transactionLog];
    
    if (type) {
      transactions = transactions.filter(t => t.type === type);
    }
    
    if (userId) {
      transactions = transactions.filter(t => t.userId === userId);
    }
    
    return transactions
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Get audit history
   */
  getAuditHistory(limit = 50, action = null, userId = null) {
    let audits = [...this.auditLog];
    
    if (action) {
      audits = audits.filter(a => a.action === action);
    }
    
    if (userId) {
      audits = audits.filter(a => a.userId === userId);
    }
    
    return audits
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(operation = null) {
    if (operation) {
      const metrics = this.performanceMetrics.get(operation) || [];
      return this.calculateStats(metrics);
    }
    
    const allStats = {};
    for (const [op, metrics] of this.performanceMetrics.entries()) {
      allStats[op] = this.calculateStats(metrics);
    }
    
    return allStats;
  }

  /**
   * Calculate statistics for performance metrics
   */
  calculateStats(metrics) {
    if (metrics.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0 };
    }
    
    const durations = metrics.map(m => m.duration);
    const sum = durations.reduce((a, b) => a + b, 0);
    
    return {
      count: metrics.length,
      avg: sum / metrics.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      recent: metrics.slice(-10).map(m => ({
        duration: m.duration,
        timestamp: m.timestamp
      }))
    };
  }

  /**
   * Generate unique transaction ID
   */
  generateTransactionId() {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique audit ID
   */
  generateAuditId() {
    return `aud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sanitize sensitive data before logging
   */
  sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    const sanitized = { ...data };
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  /**
   * Check if operation is sensitive and requires audit logging
   */
  isSensitiveOperation(req) {
    const sensitivePaths = ['/api/v1/negotiate', '/api/v1/translate'];
    const sensitiveOperations = ['POST', 'PUT', 'DELETE'];
    
    return sensitivePaths.some(path => req.path.startsWith(path)) ||
           sensitiveOperations.includes(req.method);
  }

  /**
   * Express middleware for automatic request logging
   */
  requestLogger() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Log request start
      this.debug('Request started', {
        method: req.method,
        url: req.originalUrl,
        userAgent: req.headers['user-agent'],
        contentLength: req.headers['content-length']
      });
      
      // Override res.end to capture response
      const originalEnd = res.end;
      res.end = (...args) => {
        const duration = Date.now() - startTime;
        this.logAPIRequest(req, res, duration);
        originalEnd.apply(res, args);
      };
      
      next();
    };
  }

  /**
   * Create monitoring dashboard data
   */
  getMonitoringData() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Recent transactions
    const recentTransactions = this.transactionLog.filter(
      t => new Date(t.timestamp) > oneHourAgo
    );
    
    // Recent audit events
    const recentAudits = this.auditLog.filter(
      a => new Date(a.timestamp) > oneHourAgo
    );
    
    // Performance summary
    const performanceStats = this.getPerformanceStats();
    
    return {
      timestamp: now.toISOString(),
      transactions: {
        total: this.transactionLog.length,
        recent: recentTransactions.length,
        byType: this.groupBy(recentTransactions, 'type'),
        byStatus: this.groupBy(recentTransactions, 'status')
      },
      audit: {
        total: this.auditLog.length,
        recent: recentAudits.length,
        byAction: this.groupBy(recentAudits, 'action'),
        successRate: recentAudits.length > 0 ? 
          recentAudits.filter(a => a.success).length / recentAudits.length : 1
      },
      performance: performanceStats,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      }
    };
  }

  /**
   * Group array by property
   */
  groupBy(array, property) {
    return array.reduce((groups, item) => {
      const key = item[property];
      groups[key] = (groups[key] || 0) + 1;
      return groups;
    }, {});
  }
}

module.exports = new LoggingService();