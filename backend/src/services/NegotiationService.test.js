const NegotiationService = require('./NegotiationService');

describe('NegotiationService', () => {
  let negotiationService;

  beforeEach(() => {
    negotiationService = new NegotiationService();
  });

  afterEach(() => {
    // Clear any intervals
    if (negotiationService.cleanupInterval) {
      clearInterval(negotiationService.cleanupInterval);
    }
    // Clear all sessions to avoid interference between tests
    negotiationService.sessions.clear();
    negotiationService.userSessions.clear();
  });

  describe('createSession', () => {
    it('should create a new negotiation session with valid data', () => {
      const sessionData = {
        vendorId: 'vendor123',
        cropDetails: {
          name: 'tomato',
          quantity: 100,
          unit: 'kg',
          quality: 'premium'
        },
        vendorLanguage: 'hi'
      };

      const session = negotiationService.createSession(sessionData);

      expect(session).toHaveProperty('sessionId');
      expect(session.vendorId).toBe('vendor123');
      expect(session.cropDetails.name).toBe('tomato');
      expect(session.status).toBe('waiting');
      expect(session.participants).toContain('vendor123');
      expect(session.vendorLanguage).toBe('hi');
    });

    it('should throw error for invalid session data', () => {
      const invalidData = {
        vendorId: 'vendor123'
        // Missing required cropDetails
      };

      expect(() => {
        negotiationService.createSession(invalidData);
      }).toThrow('Invalid session data');
    });

    it('should set default values for optional fields', () => {
      const sessionData = {
        vendorId: 'vendor123',
        cropDetails: {
          name: 'onion',
          quantity: 50,
          unit: 'kg'
        }
      };

      const session = negotiationService.createSession(sessionData);

      expect(session.cropDetails.quality).toBe('standard');
      expect(session.vendorLanguage).toBe('en');
      expect(session.buyerLanguage).toBe('en');
    });
  });

  describe('joinSession', () => {
    let sessionId;

    beforeEach(() => {
      const sessionData = {
        vendorId: 'vendor123',
        cropDetails: {
          name: 'chili',
          quantity: 25,
          unit: 'kg'
        }
      };
      const session = negotiationService.createSession(sessionData);
      sessionId = session.sessionId;
    });

    it('should allow buyer to join waiting session', () => {
      const updatedSession = negotiationService.joinSession(sessionId, 'buyer456', 'te');

      expect(updatedSession.buyerId).toBe('buyer456');
      expect(updatedSession.buyerLanguage).toBe('te');
      expect(updatedSession.status).toBe('active');
      expect(updatedSession.participants).toContain('buyer456');
    });

    it('should throw error when joining non-existent session', () => {
      expect(() => {
        negotiationService.joinSession('invalid-session', 'buyer456');
      }).toThrow('Session not found');
    });

    it('should throw error when session already has different buyer', () => {
      negotiationService.joinSession(sessionId, 'buyer456');
      
      expect(() => {
        negotiationService.joinSession(sessionId, 'buyer789');
      }).toThrow('Cannot join session with status: active');
    });
  });

  describe('addMessage', () => {
    let sessionId;

    beforeEach(() => {
      const sessionData = {
        vendorId: 'vendor123',
        cropDetails: {
          name: 'potato',
          quantity: 200,
          unit: 'kg'
        }
      };
      const session = negotiationService.createSession(sessionData);
      sessionId = session.sessionId;
      negotiationService.joinSession(sessionId, 'buyer456');
    });

    it('should add message to active session', () => {
      const messageData = {
        senderId: 'vendor123',
        originalText: 'Hello, I have fresh potatoes',
        language: 'en',
        messageType: 'message'
      };

      const message = negotiationService.addMessage(sessionId, messageData);

      expect(message).toHaveProperty('messageId');
      expect(message.senderId).toBe('vendor123');
      expect(message.originalText).toBe('Hello, I have fresh potatoes');
      expect(message).toHaveProperty('timestamp');

      const session = negotiationService.getSession(sessionId);
      expect(session.messages).toHaveLength(1);
      expect(session.metadata.totalMessages).toBe(1);
    });

    it('should handle offer messages and update current offer', () => {
      const offerMessage = {
        senderId: 'vendor123',
        originalText: 'I offer 200kg at ₹30/kg',
        language: 'en',
        messageType: 'offer',
        offerDetails: {
          price: 30,
          quantity: 200,
          terms: 'Fresh quality, delivery included'
        }
      };

      negotiationService.addMessage(sessionId, offerMessage);

      const session = negotiationService.getSession(sessionId);
      expect(session.currentOffer.price).toBe(30);
      expect(session.currentOffer.quantity).toBe(200);
      expect(session.metadata.offerCount).toBe(1);
    });

    it('should update session status when offer is accepted', () => {
      const acceptMessage = {
        senderId: 'buyer456',
        originalText: 'I accept your offer',
        language: 'en',
        messageType: 'accept'
      };

      negotiationService.addMessage(sessionId, acceptMessage);

      const session = negotiationService.getSession(sessionId);
      expect(session.status).toBe('agreed');
    });

    it('should throw error for non-participant sender', () => {
      const messageData = {
        senderId: 'outsider789',
        originalText: 'Hello',
        language: 'en'
      };

      expect(() => {
        negotiationService.addMessage(sessionId, messageData);
      }).toThrow('Sender is not a participant in this session');
    });
  });

  describe('getSession', () => {
    it('should return session by ID', () => {
      const sessionData = {
        vendorId: 'vendor123',
        cropDetails: {
          name: 'onion',
          quantity: 100,
          unit: 'kg'
        }
      };
      const createdSession = negotiationService.createSession(sessionData);

      const retrievedSession = negotiationService.getSession(createdSession.sessionId);

      expect(retrievedSession.sessionId).toBe(createdSession.sessionId);
      expect(retrievedSession.vendorId).toBe('vendor123');
    });

    it('should throw error for non-existent session', () => {
      expect(() => {
        negotiationService.getSession('invalid-session');
      }).toThrow('Session not found');
    });
  });

  describe('getUserSessions', () => {
    it('should return sessions for a user', () => {
      const sessionData1 = {
        vendorId: 'vendor123',
        cropDetails: { name: 'tomato', quantity: 50, unit: 'kg' }
      };
      const sessionData2 = {
        vendorId: 'vendor123',
        cropDetails: { name: 'onion', quantity: 100, unit: 'kg' }
      };

      negotiationService.createSession(sessionData1);
      negotiationService.createSession(sessionData2);

      const userSessions = negotiationService.getUserSessions('vendor123');

      expect(userSessions).toHaveLength(2);
      expect(userSessions[0].vendorId).toBe('vendor123');
      expect(userSessions[1].vendorId).toBe('vendor123');
    });

    it('should return empty array for user with no sessions', () => {
      const userSessions = negotiationService.getUserSessions('nonexistent');
      expect(userSessions).toHaveLength(0);
    });
  });

  describe('updateSessionStatus', () => {
    let sessionId;

    beforeEach(() => {
      const sessionData = {
        vendorId: 'vendor123',
        cropDetails: {
          name: 'chili',
          quantity: 10,
          unit: 'kg'
        }
      };
      const session = negotiationService.createSession(sessionData);
      sessionId = session.sessionId;
    });

    it('should update session status by participant', () => {
      const updatedSession = negotiationService.updateSessionStatus(sessionId, 'cancelled', 'vendor123');

      expect(updatedSession.status).toBe('cancelled');
    });

    it('should throw error for non-participant', () => {
      expect(() => {
        negotiationService.updateSessionStatus(sessionId, 'cancelled', 'outsider');
      }).toThrow('User is not a participant in this session');
    });

    it('should throw error for invalid status', () => {
      expect(() => {
        negotiationService.updateSessionStatus(sessionId, 'invalid', 'vendor123');
      }).toThrow('Invalid status: invalid');
    });
  });

  describe('addAISuggestion', () => {
    let sessionId;

    beforeEach(() => {
      const sessionData = {
        vendorId: 'vendor123',
        cropDetails: {
          name: 'tomato',
          quantity: 75,
          unit: 'kg'
        }
      };
      const session = negotiationService.createSession(sessionData);
      sessionId = session.sessionId;
    });

    it('should add AI suggestion to session', () => {
      const suggestion = 'Consider meeting at ₹35/kg as a fair compromise';
      
      const updatedSession = negotiationService.addAISuggestion(sessionId, suggestion);

      expect(updatedSession.aiSuggestions).toHaveLength(1);
      expect(updatedSession.aiSuggestions[0].text).toBe(suggestion);
      expect(updatedSession.aiSuggestions[0].type).toBe('ai_mediation');
    });

    it('should limit AI suggestions to 5 most recent', () => {
      // Add 7 suggestions
      for (let i = 1; i <= 7; i++) {
        negotiationService.addAISuggestion(sessionId, `Suggestion ${i}`);
      }

      const session = negotiationService.getSession(sessionId);
      expect(session.aiSuggestions).toHaveLength(5);
      expect(session.aiSuggestions[0].text).toBe('Suggestion 3');
      expect(session.aiSuggestions[4].text).toBe('Suggestion 7');
    });
  });

  describe('removeParticipant', () => {
    let sessionId;

    beforeEach(() => {
      const sessionData = {
        vendorId: 'vendor123',
        cropDetails: {
          name: 'onion',
          quantity: 150,
          unit: 'kg'
        }
      };
      const session = negotiationService.createSession(sessionData);
      sessionId = session.sessionId;
      negotiationService.joinSession(sessionId, 'buyer456');
    });

    it('should remove participant from session', () => {
      const updatedSession = negotiationService.removeParticipant(sessionId, 'buyer456');

      expect(updatedSession.participants).not.toContain('buyer456');
      expect(updatedSession.buyerId).toBeNull();
      expect(updatedSession.status).toBe('waiting');
    });

    it('should delete session when no participants remain', () => {
      negotiationService.removeParticipant(sessionId, 'buyer456');
      const result = negotiationService.removeParticipant(sessionId, 'vendor123');

      expect(result).toBeNull();
      expect(() => {
        negotiationService.getSession(sessionId);
      }).toThrow('Session not found');
    });
  });

  describe('getSessionStats', () => {
    it('should return correct session statistics', () => {
      // Create sessions with different statuses
      const session1Data = {
        vendorId: 'vendor1',
        cropDetails: { name: 'tomato', quantity: 50, unit: 'kg' }
      };
      const session2Data = {
        vendorId: 'vendor2',
        cropDetails: { name: 'onion', quantity: 100, unit: 'kg' }
      };

      const session1 = negotiationService.createSession(session1Data);
      const session2 = negotiationService.createSession(session2Data);
      
      negotiationService.joinSession(session1.sessionId, 'buyer1');
      negotiationService.updateSessionStatus(session2.sessionId, 'cancelled', 'vendor2');

      const stats = negotiationService.getSessionStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(1);
      expect(stats.cancelledSessions).toBe(1);
      expect(stats.totalParticipants).toBe(3); // vendor1, vendor2, buyer1
    });
  });
});