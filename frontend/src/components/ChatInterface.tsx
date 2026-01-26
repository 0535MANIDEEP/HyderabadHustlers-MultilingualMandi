import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  List,
  ListItem,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  Avatar,
  useTheme,
  useMediaQuery,
  IconButton,
} from '@mui/material';
import { 
  Send, 
  Person, 
  SmartToy, 
  Translate,
  TrendingUp,
  Info,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useSocket } from '../contexts/SocketContext';
import VoiceInput from './VoiceInput';
import ErrorNotification from './ErrorNotification';
import apiService from '../services/apiService';
import { useErrorHandler } from '../utils/errorHandling';
import VoiceProcessingService, { ProcessedVoiceInput } from '../utils/voiceProcessingService';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  originalText: string;
  translatedText?: string;
  language: string;
  timestamp: Date;
  messageType: 'offer' | 'counter' | 'accept' | 'reject' | 'general' | 'price_query' | 'system';
  translating?: boolean;
  translationStatus?: 'pending' | 'success' | 'error';
  priceData?: any;
  confidence?: number;
}

interface NegotiationSession {
  id: string;
  participants: string[];
  status: 'active' | 'completed' | 'cancelled';
  createdAt: Date;
  lastActivity: Date;
}

const ChatInterface: React.FC = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { socket, connected } = useSocket();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { handleError, handleNetworkError } = useErrorHandler();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [showTranslations, setShowTranslations] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [voiceProcessingService] = useState(() => new VoiceProcessingService());
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentUserId = 'user-' + Math.random().toString(36).substring(2, 11); // Generate unique user ID

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle socket connection status
  useEffect(() => {
    if (connected) {
      setConnectionStatus('connected');
      setError(null);
    } else {
      setConnectionStatus('disconnected');
      setError('Connection lost. Trying to reconnect...');
    }
  }, [connected]);

  // Socket event handlers
  useEffect(() => {
    if (socket && sessionId) {
      // Join negotiation session
      socket.emit('join-negotiation', { sessionId, userId: currentUserId, language });
      
      // Listen for new messages
      socket.on('new-message', (message: Message) => {
        setMessages(prev => [...prev, {
          ...message,
          timestamp: new Date(message.timestamp)
        }]);
      });

      // Listen for message updates (translations)
      socket.on('message-updated', (updatedMessage: Message) => {
        setMessages(prev => 
          prev.map(msg => 
            msg.id === updatedMessage.id 
              ? { ...updatedMessage, timestamp: new Date(updatedMessage.timestamp) }
              : msg
          )
        );
      });

      // Listen for typing indicators
      socket.on('user-typing', (data: { userId: string, userName: string }) => {
        if (data.userId !== currentUserId) {
          setTypingUsers(prev => [...prev.filter(u => u !== data.userName), data.userName]);
          
          // Clear typing indicator after 3 seconds
          setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u !== data.userName));
          }, 3000);
        }
      });

      // Listen for session updates
      socket.on('session-updated', (sessionData: NegotiationSession) => {
        // Session data received but not stored in state for now
        console.log('Session updated:', sessionData);
      });

      // Listen for errors
      socket.on('negotiation-error', (errorData: { message: string }) => {
        setError(errorData.message);
      });

      // Cleanup on unmount
      return () => {
        socket.off('new-message');
        socket.off('message-updated');
        socket.off('user-typing');
        socket.off('session-updated');
        socket.off('negotiation-error');
        socket.emit('leave-negotiation', { sessionId, userId: currentUserId });
      };
    }
  }, [socket, sessionId, currentUserId, language]);

  // Handle typing indicator
  const handleTyping = () => {
    if (socket && sessionId) {
      socket.emit('typing', { sessionId, userId: currentUserId, userName: 'You' });
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set new timeout to stop typing indicator
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('stop-typing', { sessionId, userId: currentUserId });
      }, 1000);
    }
  };

  // Detect if message is a price query
  const isPriceQuery = (text: string): boolean => {
    const priceKeywords = ['price', 'cost', 'rate', 'भाव', 'दाम', 'कीमत', 'ధర', 'விலை'];
    const cropKeywords = ['tomato', 'onion', 'potato', 'टमाटर', 'प्याज', 'आलू', 'టమాటో', 'ఉల్లిపాయ', 'బంగాళాదుంప', 'தக்காளி', 'வெங்காயம்', 'உருளைக்கிழங்கு'];
    
    const lowerText = text.toLowerCase();
    const hasPriceKeyword = priceKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
    const hasCropKeyword = cropKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
    
    return hasPriceKeyword || hasCropKeyword;
  };

  // Process price query using RAG pipeline
  const processPriceQuery = async (query: string, messageId: string) => {
    try {
      const response = await apiService.queryRAG({
        text: query,
        context: 'price_query',
        language
      });

      if (response.success && response.data) {
        // Update message with price data
        setMessages(prev => 
          prev.map(msg => 
            msg.id === messageId 
              ? { 
                  ...msg, 
                  priceData: response.data,
                  confidence: response.data.confidence || 0.8
                }
              : msg
          )
        );

        // Send AI response with price information
        const aiMessage: Message = {
          id: 'ai-' + Date.now(),
          senderId: 'ai-assistant',
          senderName: 'AI Assistant',
          originalText: response.data.response,
          language: language,
          timestamp: new Date(),
          messageType: 'system',
          priceData: response.data,
          confidence: response.data.confidence || 0.8
        };

        setMessages(prev => [...prev, aiMessage]);
        
        // Emit AI response to other participants
        if (socket) {
          socket.emit('send-message', {
            sessionId,
            message: aiMessage
          });
        }
      } else {
        const networkError = handleNetworkError(
          new Error(response.error || 'Price query failed'), 
          'price_query'
        );
        setError(networkError);
      }
    } catch (err: any) {
      const networkError = handleNetworkError(err, 'price_query');
      setError(networkError);
      handleError(err, 'price_query');
    }
  };

  // Translate message
  const translateMessage = async (message: Message) => {
    try {
      // Update message status to translating
      setMessages(prev => 
        prev.map(msg => 
          msg.id === message.id 
            ? { ...msg, translating: true, translationStatus: 'pending' }
            : msg
        )
      );

      const response = await apiService.translateText({
        text: message.originalText,
        sourceLang: message.language,
        targetLang: language === message.language ? 'en' : language,
        context: 'negotiation'
      });
      
      if (response.success && response.data) {
        // Update message with translation
        const updatedMessage = {
          ...message,
          translatedText: response.data.translatedText,
          translating: false,
          translationStatus: 'success' as const
        };

        setMessages(prev => 
          prev.map(msg => 
            msg.id === message.id ? updatedMessage : msg
          )
        );

        // Emit translation update to other participants
        if (socket) {
          socket.emit('message-translation', {
            sessionId,
            messageId: message.id,
            translation: response.data.translatedText
          });
        }
      } else {
        // Update message with error status
        setMessages(prev => 
          prev.map(msg => 
            msg.id === message.id 
              ? { ...msg, translating: false, translationStatus: 'error' }
              : msg
          )
        );
        
        const networkError = handleNetworkError(
          new Error(response.error || 'Translation failed'), 
          'translation'
        );
        setError(networkError);
      }
    } catch (err: any) {
      const networkError = handleNetworkError(err, 'translation');
      setError(networkError);
      handleError(err, 'translation');
      
      setMessages(prev => 
        prev.map(msg => 
          msg.id === message.id 
            ? { ...msg, translating: false, translationStatus: 'error' }
            : msg
        )
      );
    }
  };

  const handleSendMessage = async (messageText?: string, voiceData?: ProcessedVoiceInput) => {
    const textToSend = messageText || newMessage.trim();
    if (!textToSend || !socket || loading) return;

    const messageId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
    
    // Use voice processing data if available, otherwise analyze locally
    const messageType = voiceData?.queryType === 'price_query' || isPriceQuery(textToSend) ? 'price_query' : 'general';

    const message: Message = {
      id: messageId,
      senderId: currentUserId,
      senderName: 'You',
      originalText: textToSend,
      language: voiceData?.language || language,
      timestamp: new Date(),
      messageType: messageType as any,
      translating: false,
      translationStatus: 'success',
      confidence: voiceData?.confidence
    };

    // Add message to local state immediately
    setMessages(prev => [...prev, message]);
    setNewMessage('');
    setLoading(true);

    try {
      // Emit message to server
      socket.emit('send-message', {
        sessionId,
        message: message
      });

      // If it's a price query, process it with RAG pipeline
      if (messageType === 'price_query') {
        await processPriceQuery(message.originalText, messageId);
      }

      // Auto-translate if needed (for other participants)
      // Skip if voice processing already handled translation
      if (language !== 'en' && !voiceData?.metadata.translationUsed) {
        await translateMessage(message);
      }

    } catch (error) {
      console.error('Failed to send message:', error);
      const networkError = handleNetworkError(error as Error, 'send_message');
      setError(networkError);
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceInput = async (transcript: string) => {
    if (!transcript.trim()) return;
    
    setVoiceProcessing(true);
    
    try {
      // Process voice input through backend services
      const processed: ProcessedVoiceInput = await voiceProcessingService.processVoiceInput(transcript, {
        language,
        autoProcess: true,
        confidenceThreshold: 0.5
      });

      // Set the processed text (or original if processing failed)
      const textToUse = processed.processedText || processed.originalText;
      setNewMessage(textToUse);

      // Show processing metadata if there were issues
      if (processed.metadata.errors && processed.metadata.errors.length > 0) {
        console.warn('Voice processing warnings:', processed.metadata.errors);
        const voiceError = handleNetworkError(
          new Error(processed.metadata.errors[0]), 
          'voice_processing'
        );
        setError(voiceError);
      }

      // Auto-send if conditions are met
      if (processed.shouldAutoSend && processed.confidence > 0.6) {
        // Small delay to allow user to see the transcript
        setTimeout(async () => {
          await handleSendMessage(textToUse, processed);
        }, 1500);
      } else if (processed.isQuery && processed.confidence > 0.4) {
        // For lower confidence queries, show a hint
        const hintError = {
          code: 'VOICE_PROCESSING_HINT',
          message: `Voice detected: "${textToUse}". Click send to submit or edit the message.`,
          retryable: false
        };
        setError(hintError);
        setTimeout(() => setError(null), 4000);
      }

    } catch (error) {
      console.error('Voice processing failed:', error);
      setNewMessage(transcript); // Fallback to original transcript
      const voiceError = handleNetworkError(error as Error, 'voice_processing');
      setError(voiceError);
    } finally {
      setVoiceProcessing(false);
    }
  };

  const handleVoiceError = (error: string) => {
    const voiceError = handleNetworkError(new Error(error), 'voice_input');
    setError(voiceError);
    console.error('Voice input error:', error);
  };

  const dismissError = () => {
    setError(null);
  };

  const retryLastOperation = () => {
    if (newMessage.trim()) {
      handleSendMessage();
    } else {
      // Retry connection or refresh
      window.location.reload();
    }
  };

  const createNewSession = () => {
    const newSessionId = 'session-' + Date.now();
    navigate(`/chat/${newSessionId}`);
  };

  const getMessageIcon = (message: Message) => {
    if (message.senderId === 'ai-assistant') {
      return <SmartToy sx={{ color: 'primary.main' }} />;
    }
    return <Person sx={{ color: message.senderId === currentUserId ? 'primary.main' : 'text.secondary' }} />;
  };

  const getMessageColor = (message: Message) => {
    if (message.senderId === 'ai-assistant') {
      return {
        bgcolor: 'success.light',
        color: 'success.contrastText'
      };
    }
    return {
      bgcolor: message.senderId === currentUserId ? 'primary.light' : 'grey.100',
      color: message.senderId === currentUserId ? 'primary.contrastText' : 'text.primary'
    };
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderPriceData = (priceData: any) => {
    if (!priceData || !priceData.retrievedDocuments) return null;

    return (
      <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1 }}>
        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <TrendingUp sx={{ fontSize: 14, mr: 0.5 }} />
          Price Information ({priceData.retrievedDocuments} sources)
        </Typography>
        {priceData.confidence && (
          <Chip 
            size="small" 
            label={`${Math.round(priceData.confidence * 100)}% confidence`}
            color={priceData.confidence > 0.7 ? 'success' : 'warning'}
            sx={{ fontSize: '0.7rem', height: 20 }}
          />
        )}
      </Box>
    );
  };

  const renderTranslationStatus = (message: Message) => {
    if (message.translating) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
          <CircularProgress size={12} sx={{ mr: 1 }} />
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            {t('translating')}
          </Typography>
        </Box>
      );
    }

    if (message.translationStatus === 'error') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
          <ErrorIcon sx={{ fontSize: 12, mr: 1, color: 'error.main' }} />
          <Typography variant="caption" sx={{ color: 'error.main' }}>
            Translation failed
          </Typography>
        </Box>
      );
    }

    return null;
  };

  return (
    <Box sx={{ 
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: { xs: 2, md: 3 }
    }}>
      {/* Header Section */}
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: 2,
      }}>
        <Typography 
          variant={isMobile ? "h5" : "h4"} 
          sx={{ 
            fontWeight: 600,
            color: 'primary.main',
            textAlign: { xs: 'center', sm: 'left' }
          }}
        >
          {t('negotiationChat')}
        </Typography>
        
        {/* Session Info and Controls */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          justifyContent: { xs: 'center', sm: 'flex-end' },
          flexWrap: 'wrap'
        }}>
          {sessionId ? (
            <Chip 
              label={`${t('session')}: ${sessionId.slice(-8)}`} 
              color="primary" 
              size="small"
              icon={<Info />}
            />
          ) : (
            <Button
              variant="contained"
              size="small"
              onClick={createNewSession}
              sx={{ textTransform: 'none' }}
            >
              Start New Chat
            </Button>
          )}
          
          {/* Connection Status */}
          <Chip
            label={connectionStatus}
            color={connectionStatus === 'connected' ? 'success' : 'error'}
            size="small"
            variant="outlined"
          />
          
          {/* Translation Toggle */}
          <IconButton
            size="small"
            onClick={() => setShowTranslations(!showTranslations)}
            color={showTranslations ? 'primary' : 'default'}
            title="Toggle translations"
          >
            <Translate />
          </IconButton>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <ErrorNotification
          error={error}
          onRetry={retryLastOperation}
          onDismiss={dismissError}
          language={language}
        />
      )}

      {/* Messages Area */}
      <Card sx={{ 
        flex: 1,
        display: 'flex', 
        flexDirection: 'column',
        minHeight: { xs: '60vh', md: '70vh' },
        maxHeight: { xs: '60vh', md: '70vh' },
        borderRadius: { xs: 2, md: 3 }
      }}>
        <CardContent sx={{ 
          flex: 1, 
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          p: { xs: 1, md: 2 }
        }}>
          <Box sx={{ 
            flex: 1, 
            overflow: 'auto',
            '&::-webkit-scrollbar': {
              width: '6px',
            },
            '&::-webkit-scrollbar-track': {
              background: '#f1f1f1',
              borderRadius: '3px',
            },
            '&::-webkit-scrollbar-thumb': {
              background: '#c1c1c1',
              borderRadius: '3px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: '#a8a8a8',
            },
          }}>
            {messages.length === 0 ? (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center',
                height: '100%',
                textAlign: 'center',
                color: 'text.secondary'
              }}>
                <SmartToy sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
                <Typography variant="h6" gutterBottom>
                  Welcome to Multilingual Mandi Chat
                </Typography>
                <Typography variant="body2">
                  Ask about crop prices, start negotiations, or get market information.
                  <br />
                  Try: "What is the price of tomatoes?" or "टमाटर का भाव क्या है?"
                </Typography>
              </Box>
            ) : (
              <List sx={{ p: 0 }}>
                {messages.map((message) => (
                  <ListItem 
                    key={message.id} 
                    sx={{ 
                      flexDirection: 'column', 
                      alignItems: 'stretch',
                      px: { xs: 1, md: 2 },
                      py: 1
                    }}
                  >
                    <Box sx={{
                      display: 'flex',
                      justifyContent: message.senderId === currentUserId ? 'flex-end' : 'flex-start',
                      mb: 1
                    }}>
                      <Paper
                        elevation={1}
                        sx={{
                          p: { xs: 1.5, md: 2 },
                          maxWidth: { xs: '85%', md: '70%' },
                          minWidth: '120px',
                          borderRadius: 2,
                          ...getMessageColor(message),
                          position: 'relative'
                        }}
                      >
                        {/* Message Header */}
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          mb: 1,
                          gap: 1
                        }}>
                          <Avatar sx={{ width: 24, height: 24 }}>
                            {getMessageIcon(message)}
                          </Avatar>
                          <Typography variant="caption" sx={{ fontWeight: 500 }}>
                            {message.senderName}
                          </Typography>
                          {message.messageType === 'price_query' && (
                            <Chip 
                              label="Price Query" 
                              size="small" 
                              color="info"
                              sx={{ height: 16, fontSize: '0.6rem' }}
                            />
                          )}
                        </Box>
                        
                        {/* Original Message */}
                        <Typography variant="body1" sx={{ mb: 1 }}>
                          {message.originalText}
                        </Typography>
                        
                        {/* Translation */}
                        {showTranslations && message.translatedText && !message.translating && (
                          <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                              <Translate sx={{ fontSize: 12, mr: 0.5, opacity: 0.7 }} />
                              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                                Translation
                              </Typography>
                            </Box>
                            <Typography variant="body2" sx={{ fontStyle: 'italic', opacity: 0.9 }}>
                              {message.translatedText}
                            </Typography>
                          </Box>
                        )}
                        
                        {/* Price Data */}
                        {message.priceData && renderPriceData(message.priceData)}
                        
                        {/* Translation Status */}
                        {renderTranslationStatus(message)}
                        
                        {/* Message Footer */}
                        <Box sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          mt: 1,
                          pt: 0.5
                        }}>
                          <Typography variant="caption" sx={{ opacity: 0.7 }}>
                            {formatTime(message.timestamp)}
                          </Typography>
                          <Typography variant="caption" sx={{ opacity: 0.7 }}>
                            {message.language.toUpperCase()}
                          </Typography>
                        </Box>
                      </Paper>
                    </Box>
                  </ListItem>
                ))}
                
                {/* Typing Indicator */}
                {typingUsers.length > 0 && (
                  <ListItem sx={{ px: 2, py: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                      <CircularProgress size={16} sx={{ mr: 1 }} />
                      <Typography variant="caption">
                        {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                      </Typography>
                    </Box>
                  </ListItem>
                )}
              </List>
            )}
            <div ref={messagesEndRef} />
          </Box>
        </CardContent>
      </Card>

      {/* Message Input */}
      <Card sx={{ borderRadius: { xs: 2, md: 3 } }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Box sx={{ 
            display: 'flex', 
            gap: 1, 
            alignItems: 'flex-end',
            flexDirection: { xs: 'column', sm: 'row' }
          }}>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              label={t('typeMessage')}
              placeholder="Ask about prices, start negotiation, or chat..."
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                handleTyping();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSendMessage();
                } else {
                  handleTyping();
                }
              }}
              disabled={loading || !connected}
              sx={{ 
                flex: 1,
                '& .MuiOutlinedInput-root': {
                  borderRadius: { xs: 2, md: 1 }
                }
              }}
            />
            
            <Box sx={{ 
              display: 'flex', 
              gap: 1,
              alignSelf: { xs: 'stretch', sm: 'flex-end' },
              justifyContent: { xs: 'center', sm: 'flex-end' }
            }}>
              <VoiceInput 
                onTranscript={handleVoiceInput}
                onError={handleVoiceError}
                disabled={loading || !connected || voiceProcessing}
                size="medium"
              />
              {voiceProcessing && (
                <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                  <Typography variant="caption" color="text.secondary">
                    Processing...
                  </Typography>
                </Box>
              )}
              <Button
                variant="contained"
                onClick={() => handleSendMessage()}
                disabled={loading || !newMessage.trim() || !connected || voiceProcessing}
                startIcon={loading ? <CircularProgress size={20} /> : <Send />}
                sx={{ 
                  minWidth: { xs: 'auto', sm: 120 },
                  borderRadius: { xs: 2, md: 1 },
                  px: { xs: 2, sm: 3 }
                }}
              >
                {loading ? (isMobile ? '' : t('sending')) : t('send')}
              </Button>
            </Box>
          </Box>
          
          {/* Quick Actions */}
          <Box sx={{ 
            display: 'flex', 
            gap: 1, 
            mt: 2,
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}>
            <Chip
              label="Tomato prices"
              size="small"
              variant="outlined"
              onClick={() => setNewMessage('What is the current price of tomatoes?')}
              sx={{ cursor: 'pointer' }}
            />
            <Chip
              label="Market trends"
              size="small"
              variant="outlined"
              onClick={() => setNewMessage('Show me market trends for vegetables')}
              sx={{ cursor: 'pointer' }}
            />
            <Chip
              label="Compare prices"
              size="small"
              variant="outlined"
              onClick={() => setNewMessage('Compare onion and potato prices')}
              sx={{ cursor: 'pointer' }}
            />
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ChatInterface;