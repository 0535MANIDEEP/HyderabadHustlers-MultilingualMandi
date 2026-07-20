import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  IconButton, 
  Tooltip, 
  Box, 
  Typography, 
  Alert, 
  Snackbar,
  CircularProgress,
  Chip,
  useTheme,
  useMediaQuery
} from '@mui/material';
import { 
  Mic, 
  MicOff, 
  VolumeUp, 
  Stop,
  Error as ErrorIcon,
  CheckCircle,
  Settings
} from '@mui/icons-material';
import { useLanguage } from '../contexts/LanguageContext';

interface VoiceInputProps {
  onTranscript: (transcript: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

interface RecognitionError {
  error: string;
  message: string;
}

const VoiceInput: React.FC<VoiceInputProps> = ({ 
  onTranscript, 
  onError,
  disabled = false,
  size = 'medium'
}) => {
  const { language, t } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [recognition, setRecognition] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const recognitionRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Language mapping with better coverage
  const languageMap: { [key: string]: string } = {
    'en': 'en-US',
    'hi': 'hi-IN',
    'te': 'te-IN', 
    'ta': 'ta-IN'
  };

  // Error message mapping
  const getErrorMessage = useCallback((errorCode: string): string => {
    const errorMessages: { [key: string]: string } = {
      'no-speech': t('noSpeechDetected') || 'No speech detected. Please try again.',
      'audio-capture': t('microphoneError') || 'Microphone access error. Please check permissions.',
      'not-allowed': t('microphonePermissionDenied') || 'Microphone permission denied.',
      'network': t('networkError') || 'Network error. Please check your connection.',
      'service-not-allowed': t('serviceNotAllowed') || 'Speech recognition service not allowed.',
      'bad-grammar': t('grammarError') || 'Grammar recognition error.',
      'language-not-supported': t('languageNotSupported') || 'Language not supported.',
      'aborted': t('recognitionAborted') || 'Speech recognition was aborted.'
    };
    
    return errorMessages[errorCode] || `Speech recognition error: ${errorCode}`;
  }, [t]);

  // Check microphone permissions
  const checkMicrophonePermission = useCallback(async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately
        setHasPermission(true);
        return true;
      } else {
        setHasPermission(false);
        return false;
      }
    } catch (error: any) {
      console.error('Microphone permission check failed:', error);
      setHasPermission(false);
      
      if (error.name === 'NotAllowedError') {
        setError(t('microphonePermissionDenied') || 'Microphone permission denied.');
      } else if (error.name === 'NotFoundError') {
        setError(t('microphoneNotFound') || 'No microphone found.');
      } else {
        setError(t('microphoneError') || 'Microphone access error.');
      }
      
      return false;
    }
  }, [t]);

  // Initialize speech recognition
  const initializeSpeechRecognition = useCallback(async () => {
    setIsInitializing(true);
    
    try {
      // Check if Web Speech API is supported
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        setIsSupported(false);
        setError(t('voiceNotSupported') || 'Voice input not supported in this browser');
        setIsInitializing(false);
        return;
      }

      // Check microphone permissions
      const hasPermission = await checkMicrophonePermission();
      if (!hasPermission) {
        setIsInitializing(false);
        return;
      }

      setIsSupported(true);
      
      const recognitionInstance = new SpeechRecognition();
      
      // Configure recognition settings
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.maxAlternatives = 3;
      recognitionInstance.lang = languageMap[language] || 'en-US';
      
      // Event handlers
      recognitionInstance.onstart = () => {
        console.log('Speech recognition started');
        setIsListening(true);
        setError(null);
        setInterimTranscript('');
        setConfidence(null);
      };
      
      recognitionInstance.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        let maxConfidence = 0;
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          const confidence = result[0].confidence;
          
          if (result.isFinal) {
            finalTranscript += transcript;
            maxConfidence = Math.max(maxConfidence, confidence || 0);
          } else {
            interimTranscript += transcript;
          }
        }
        
        setInterimTranscript(interimTranscript);
        
        if (finalTranscript) {
          setConfidence(maxConfidence);
          onTranscript(finalTranscript.trim());
          
          // Auto-stop after getting final result
          setTimeout(() => {
            if (recognitionRef.current && isListening) {
              recognitionRef.current.stop();
            }
          }, 500);
        }
      };
      
      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error, event.message);
        const errorMessage = getErrorMessage(event.error);
        setError(errorMessage);
        setIsListening(false);
        setInterimTranscript('');
        
        if (onError) {
          onError(errorMessage);
        }
        
        // Clear timeout on error
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
      
      recognitionInstance.onend = () => {
        console.log('Speech recognition ended');
        setIsListening(false);
        setInterimTranscript('');
        
        // Clear timeout when recognition ends
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
      
      recognitionInstance.onnomatch = () => {
        console.log('No speech match found');
        setError(t('noSpeechMatch') || 'No speech match found. Please try again.');
      };
      
      recognitionInstance.onspeechstart = () => {
        console.log('Speech detected');
        setError(null);
      };
      
      recognitionInstance.onspeechend = () => {
        console.log('Speech ended');
      };
      
      setRecognition(recognitionInstance);
      recognitionRef.current = recognitionInstance;
      
    } catch (error: any) {
      console.error('Failed to initialize speech recognition:', error);
      setError(t('initializationError') || 'Failed to initialize voice input');
      setIsSupported(false);
    } finally {
      setIsInitializing(false);
    }
  }, [language, onTranscript, onError, getErrorMessage, checkMicrophonePermission, t, languageMap, isListening]);

  // Initialize on component mount and language change
  useEffect(() => {
    initializeSpeechRecognition();
    
    return () => {
      // Cleanup on unmount
      if (recognitionRef.current && typeof recognitionRef.current.stop === 'function') {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.warn('Error stopping speech recognition during cleanup:', error);
        }
        recognitionRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [initializeSpeechRecognition]);

  // Start listening
  const startListening = useCallback(async () => {
    if (!recognition || isListening || disabled) return;
    
    try {
      // Double-check permissions before starting
      const hasPermission = await checkMicrophonePermission();
      if (!hasPermission) {
        return;
      }
      
      setError(null);
      recognition.start();
      
      // Set a timeout to auto-stop after 30 seconds
      timeoutRef.current = setTimeout(() => {
        if (recognition && isListening && typeof recognition.stop === 'function') {
          try {
            recognition.stop();
          } catch (error) {
            console.warn('Error stopping speech recognition on timeout:', error);
          }
          setError(t('listeningTimeout') || 'Listening timeout. Please try again.');
        }
      }, 30000);
      
    } catch (error: any) {
      console.error('Failed to start speech recognition:', error);
      setError(t('startError') || 'Failed to start voice input');
    }
  }, [recognition, isListening, disabled, checkMicrophonePermission, t]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (recognition && isListening && typeof recognition.stop === 'function') {
      try {
        recognition.stop();
      } catch (error) {
        console.warn('Error stopping speech recognition:', error);
        setIsListening(false);
      }
    }
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [recognition, isListening]);

  // Handle click
  const handleClick = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Request permissions
  const requestPermissions = useCallback(async () => {
    await checkMicrophonePermission();
    if (hasPermission) {
      await initializeSpeechRecognition();
    }
  }, [checkMicrophonePermission, hasPermission, initializeSpeechRecognition]);

  // Get button size
  const getButtonSize = () => {
    switch (size) {
      case 'small': return isMobile ? 'medium' : 'small';
      case 'large': return 'large';
      default: return 'medium';
    }
  };

  // Get icon size
  const getIconSize = () => {
    switch (size) {
      case 'small': return { fontSize: 20 };
      case 'large': return { fontSize: 32 };
      default: return { fontSize: 24 };
    }
  };

  // Render loading state
  if (isInitializing) {
    return (
      <Tooltip title={t('initializingVoice') || 'Initializing voice input...'}>
        <Box sx={{ position: 'relative', display: 'inline-flex' }}>
          <IconButton disabled size={getButtonSize()}>
            <CircularProgress size={20} />
          </IconButton>
        </Box>
      </Tooltip>
    );
  }

  // Render unsupported state
  if (!isSupported) {
    return (
      <Tooltip title={error || t('voiceNotSupported')}>
        <span>
          <IconButton disabled size={getButtonSize()}>
            <MicOff sx={getIconSize()} />
          </IconButton>
        </span>
      </Tooltip>
    );
  }

  // Render permission denied state
  if (hasPermission === false) {
    return (
      <Tooltip title={error || t('microphonePermissionDenied')}>
        <Box sx={{ position: 'relative', display: 'inline-flex' }}>
          <IconButton 
            onClick={requestPermissions}
            color="error"
            size={getButtonSize()}
          >
            <ErrorIcon sx={getIconSize()} />
          </IconButton>
        </Box>
      </Tooltip>
    );
  }

  // Main render
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <Tooltip title={
        isListening 
          ? t('stopListening') 
          : error 
            ? error 
            : t('startListening')
      }>
        <Box sx={{ position: 'relative' }}>
          <IconButton
            onClick={handleClick}
            disabled={disabled || hasPermission !== true}
            color={isListening ? 'secondary' : error ? 'error' : 'default'}
            size={getButtonSize()}
            sx={{
              animation: isListening ? 'pulse 1.5s infinite' : 'none',
              '@keyframes pulse': {
                '0%': {
                  transform: 'scale(1)',
                  opacity: 1,
                },
                '50%': {
                  transform: 'scale(1.1)',
                  opacity: 0.7,
                },
                '100%': {
                  transform: 'scale(1)',
                  opacity: 1,
                },
              },
              '&:hover': {
                backgroundColor: isListening 
                  ? 'rgba(156, 39, 176, 0.1)' 
                  : 'rgba(0, 0, 0, 0.04)',
              }
            }}
          >
            {isListening ? (
              <Stop sx={getIconSize()} />
            ) : error ? (
              <ErrorIcon sx={getIconSize()} />
            ) : (
              <Mic sx={getIconSize()} />
            )}
          </IconButton>
          
          {/* Recording indicator */}
          {isListening && (
            <Box
              sx={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: 'error.main',
                animation: 'blink 1s infinite',
                '@keyframes blink': {
                  '0%, 50%': { opacity: 1 },
                  '51%, 100%': { opacity: 0.3 },
                },
              }}
            />
          )}
        </Box>
      </Tooltip>
      
      {/* Interim transcript display */}
      {interimTranscript && isListening && (
        <Box sx={{ 
          mt: 1, 
          maxWidth: 200, 
          textAlign: 'center',
          position: 'absolute',
          top: '100%',
          zIndex: 1000,
          backgroundColor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          p: 1,
          boxShadow: 2
        }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            {interimTranscript}
          </Typography>
        </Box>
      )}
      
      {/* Confidence indicator */}
      {confidence !== null && confidence > 0 && (
        <Chip
          size="small"
          label={`${Math.round(confidence * 100)}%`}
          color={confidence > 0.8 ? 'success' : confidence > 0.6 ? 'warning' : 'error'}
          sx={{ 
            position: 'absolute',
            top: '100%',
            mt: 0.5,
            fontSize: '0.7rem',
            height: 20
          }}
        />
      )}
      
      {/* Error snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setError(null)} 
          severity="error" 
          variant="filled"
          sx={{ width: '100%' }}
        >
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default VoiceInput;