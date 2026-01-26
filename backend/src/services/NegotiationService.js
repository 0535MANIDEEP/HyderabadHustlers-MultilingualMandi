const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');

/**
 * NegotiationService handles session management and state for real-time negotiations
 * Validates Requirements 3.1, 5.3 - Session management and state integrity
 */
class NegotiationService {
  constructor() {
    this.sessions = new Map(); // In-memory session storage for MVP
    this.userSessions = new Map(); // Map users to their active sessions
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes session timeout
    
    // Start cleanup interval for expired sessions
    this.startCleanupInterval();
  }

  /**
   * Create a new negotiation session
   * @param {Object} sessionData - Session creation data
   * @returns {Object} Created session
   */
  createSession(sessionData) {
    const schema = Joi.object({
      vendorId: Joi.string().required(),
      buyerId: Joi.string().optional(),
      cropDetails: Joi.object({
        name: Joi.string().required(),
        quantity: Joi.number().positive().required(),
        unit: Joi.string().valid('kg', 'quintal', 'ton').required(),
        quality: Joi.string().valid('premium', 'standard', 'low').optional().default('standard')
      }).required(),
      initialOffer: Joi.object({
        price: Joi.number().positive().required(),
        quantity: Joi.number().positive().required(),
        terms: Joi.string().optional()
      }).optional(),
      vendorLanguage: Joi.string().valid('hi', 'te', 'ta', 'en').default('en'),
      buyerLanguage: Joi.string().valid('hi', 'te', 'ta', 'en').optional()
    });

    const { error, value } = schema.validate(sessionData);
    if (error) {
      throw new Error(`Invalid session data: ${error.details[0].message}`);
    }

    const sessionId = uuidv4();
    const session = {
      sessionId,
      vendorId: value.vendorId,
      buyerId: value.buyerId || null,
      cropDetails: value.cropDetails,
      participants: [value.vendorId],
      messages: [],
      currentOffer: value.initialOffer || null,
      status: 'waiting', // waiting, active, agreed, cancelled, expired
      vendorLanguage: value.vendorLanguage,
      buyerLanguage: value.buyerLanguage || 'en',
      createdAt: new Date(),
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + this.sessionTimeout),
      aiSuggestions: [],
      metadata: {
        totalMessages: 0,
        offerCount: 0,
        counterOfferCount: 0
      }
    };

    this.sessions.set(sessionId, session);
    this.userSessions.set(value.vendorId, sessionId);

    console.log(`Created negotiation session ${sessionId} for vendor ${value.vendorId}`);
    return session;
  }

  /**
   * Join an existing session as a buyer
   * @param {string} sessionId - Session ID to join
   * @param {string} buyerId - Buyer user ID
   * @param {string} language - Buyer's preferred language
   * @returns {Object} Updated session
   */
  joinSession(sessionId, buyerId, language = 'en') {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'waiting') {
      throw new Error(`Cannot join session with status: ${session.status}`);
    }

    if (session.buyerId && session.buyerId !== buyerId) {
      throw new Error('Session already has a buyer');
    }

    // Update session with buyer info
    session.buyerId = buyerId;
    session.buyerLanguage = language;
    session.status = 'active';
    session.lastActivity = new Date();
    
    if (!session.participants.includes(buyerId)) {
      session.participants.push(buyerId);
    }

    this.userSessions.set(buyerId, sessionId);

    console.log(`Buyer ${buyerId} joined session ${sessionId}`);
    return session;
  }

  /**
   * Add a message to a session
   * @param {string} sessionId - Session ID
   * @param {Object} messageData - Message data
   * @returns {Object} Message with ID and timestamp
   */
  addMessage(sessionId, messageData) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'active') {
      throw new Error(`Cannot send message to session with status: ${session.status}`);
    }

    const messageSchema = Joi.object({
      senderId: Joi.string().required(),
      originalText: Joi.string().required(),
      translatedText: Joi.string().optional(),
      language: Joi.string().valid('hi', 'te', 'ta', 'en').required(),
      messageType: Joi.string().valid('message', 'offer', 'counter', 'accept', 'reject').default('message'),
      offerDetails: Joi.object({
        price: Joi.number().positive(),
        quantity: Joi.number().positive(),
        terms: Joi.string()
      }).optional()
    });

    const { error, value } = messageSchema.validate(messageData);
    if (error) {
      throw new Error(`Invalid message data: ${error.details[0].message}`);
    }

    // Verify sender is a participant
    if (!session.participants.includes(value.senderId)) {
      throw new Error('Sender is not a participant in this session');
    }

    const message = {
      messageId: uuidv4(),
      ...value,
      timestamp: new Date(),
      sessionId
    };

    session.messages.push(message);
    session.lastActivity = new Date();
    session.metadata.totalMessages++;

    // Update offer tracking
    if (value.messageType === 'offer') {
      session.metadata.offerCount++;
      if (value.offerDetails) {
        session.currentOffer = {
          ...value.offerDetails,
          senderId: value.senderId,
          timestamp: message.timestamp
        };
      }
    } else if (value.messageType === 'counter') {
      session.metadata.counterOfferCount++;
      if (value.offerDetails) {
        session.currentOffer = {
          ...value.offerDetails,
          senderId: value.senderId,
          timestamp: message.timestamp
        };
      }
    } else if (value.messageType === 'accept') {
      session.status = 'agreed';
    } else if (value.messageType === 'reject') {
      // Keep session active for further negotiation
    }

    return message;
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @returns {Object} Session data
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Check if session has expired
    if (session.expiresAt < new Date() && session.status === 'active') {
      session.status = 'expired';
    }

    return session;
  }

  /**
   * Get sessions for a user
   * @param {string} userId - User ID
   * @returns {Array} Array of user's sessions
   */
  getUserSessions(userId) {
    const userSessions = [];
    
    for (const session of this.sessions.values()) {
      if (session.participants.includes(userId)) {
        userSessions.push({
          ...session,
          messages: session.messages.slice(-10) // Only include last 10 messages
        });
      }
    }

    return userSessions.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  /**
   * Update session status
   * @param {string} sessionId - Session ID
   * @param {string} status - New status
   * @param {string} userId - User making the change
   * @returns {Object} Updated session
   */
  updateSessionStatus(sessionId, status, userId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (!session.participants.includes(userId)) {
      throw new Error('User is not a participant in this session');
    }

    const validStatuses = ['active', 'agreed', 'cancelled', 'expired'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    session.status = status;
    session.lastActivity = new Date();

    console.log(`Session ${sessionId} status updated to ${status} by ${userId}`);
    return session;
  }

  /**
   * Add AI suggestion to session
   * @param {string} sessionId - Session ID
   * @param {string} suggestion - AI suggestion text
   * @returns {Object} Updated session
   */
  addAISuggestion(sessionId, suggestion) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const suggestionData = {
      id: uuidv4(),
      text: suggestion,
      timestamp: new Date(),
      type: 'ai_mediation'
    };

    session.aiSuggestions.push(suggestionData);
    session.lastActivity = new Date();

    // Keep only last 5 suggestions
    if (session.aiSuggestions.length > 5) {
      session.aiSuggestions = session.aiSuggestions.slice(-5);
    }

    return session;
  }

  /**
   * Remove participant from session
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID to remove
   * @returns {Object} Updated session or null if session deleted
   */
  removeParticipant(sessionId, userId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.participants = session.participants.filter(p => p !== userId);
    session.lastActivity = new Date();

    // Remove user from user sessions map
    this.userSessions.delete(userId);

    // If no participants left, delete the session
    if (session.participants.length === 0) {
      this.sessions.delete(sessionId);
      console.log(`Session ${sessionId} deleted - no participants remaining`);
      return null;
    }

    // If the leaving user was the buyer or vendor, update session status
    if (userId === session.buyerId) {
      session.buyerId = null;
      session.status = 'waiting';
    }

    console.log(`User ${userId} removed from session ${sessionId}`);
    return session;
  }

  /**
   * Get session statistics
   * @returns {Object} Session statistics
   */
  getSessionStats() {
    const stats = {
      totalSessions: this.sessions.size,
      activeSessions: 0,
      waitingSessions: 0,
      agreedSessions: 0,
      cancelledSessions: 0,
      expiredSessions: 0,
      totalMessages: 0,
      totalParticipants: this.userSessions.size
    };

    for (const session of this.sessions.values()) {
      stats[`${session.status}Sessions`]++;
      stats.totalMessages += session.metadata.totalMessages;
    }

    return stats;
  }

  /**
   * Start cleanup interval for expired sessions
   * @private
   */
  startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  /**
   * Clean up expired sessions
   * @private
   */
  cleanupExpiredSessions() {
    const now = new Date();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now && session.status !== 'agreed') {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      const session = this.sessions.get(sessionId);
      if (session) {
        // Remove users from user sessions map
        session.participants.forEach(userId => {
          this.userSessions.delete(userId);
        });
        
        // Update status and delete after grace period
        session.status = 'expired';
        this.sessions.delete(sessionId);
        console.log(`Cleaned up expired session: ${sessionId}`);
      }
    });

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }
}

module.exports = NegotiationService;