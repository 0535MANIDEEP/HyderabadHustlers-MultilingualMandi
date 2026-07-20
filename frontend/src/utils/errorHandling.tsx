/**
 * Frontend Error Handling Utilities for Multilingual Mandi
 * Provides error boundaries, error reporting, and user-friendly error messages
 */

import React, { ErrorInfo, ReactNode } from 'react';

// Error types
export interface AppError {
  code: string;
  message: string;
  context?: string;
  timestamp: string;
  retryable?: boolean;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

// Multilingual error messages
const ERROR_MESSAGES = {
  // Network errors
  NETWORK_ERROR: {
    en: 'Network connection error. Please check your internet connection.',
    hi: 'नेटवर्क कनेक्शन त्रुटि। कृपया अपना इंटरनेट कनेक्शन जांचें।',
    te: 'నెట్‌వర్క్ కనెక్షన్ లోపం. దయచేసి మీ ఇంటర్నెట్ కనెక్షన్‌ను తనిఖీ చేయండి.',
    ta: 'நெட்வொர்க் இணைப்பு பிழை. தயவுசेय்து உங்கள் இணைய இணைப்பைச் சரிபார்க்கவும்.'
  },
  
  // Voice input errors
  MICROPHONE_ACCESS_DENIED: {
    en: 'Microphone access denied. Please enable microphone permissions.',
    hi: 'माइक्रोफ़ोन एक्सेस अस्वीकृत। कृपया माइक्रोफ़ोन अनुमतियां सक्षम करें।',
    te: 'మైక్రోఫోన్ యాక్సెస్ తిరస్కరించబడింది. దయచేసి మైక్రోఫోన్ అనుమతులను ప్రారంభించండి.',
    ta: 'மைக்ரோஃபோன் அணுகல் மறுக்கப்பட்டது. தயவுசेय்து மைக்ரோஃபோன் அனுமதிகளை இயக்கவும்.'
  },
  
  SPEECH_RECOGNITION_NOT_SUPPORTED: {
    en: 'Speech recognition is not supported in this browser. Please use text input.',
    hi: 'इस ब्राउज़र में वाक् पहचान समर्थित नहीं है। कृपया टेक्स्ट इनपुट का उपयोग करें।',
    te: 'ఈ బ్రౌజర్‌లో వాక్ గుర్తింపు మద్దతు లేదు. దయచేసి టెక్స్ట్ ఇన్‌పుట్ ఉపయోగించండి.',
    ta: 'இந்த உலாவியில் பேச்சு அங்கீகாரம் ஆதரிக்கப்படவில்லை. தயவுசेय்து உரை உள்ளீட்டைப் பயன்படுத்தவும்.'
  },
  
  SPEECH_RECOGNITION_FAILED: {
    en: 'Speech recognition failed. Please try again or use text input.',
    hi: 'वाक् पहचान असफल। कृपया पुनः प्रयास करें या टेक्स्ट इनपुट का उपयोग करें।',
    te: 'వాక్ గుర్తింపు విఫలమైంది. దయచేసి మళ్లీ ప్రయత్నించండి లేదా టెక్స్ట్ ఇన్‌పుట్ ఉపయోగించండి.',
    ta: 'பேச்சு அங்கீகாரம் தோல்வியடைந்தது. தயவுசेय்து மீண்டும் முயற்சிக்கவும் அல்லது உரை உள்ளீட்டைப் பயன்படுத்தவும்.'
  },
  
  // Translation errors
  TRANSLATION_FAILED: {
    en: 'Translation service is temporarily unavailable. Please try again.',
    hi: 'अनुवाद सेवा अस्थायी रूप से अनुपलब्ध है। कृपया पुनः प्रयास करें।',
    te: 'అనువాద సేవ తాత్కాలికంగా అందుబాటులో లేదు. దయచేసి మళ్లీ ప్రయత్నించండి.',
    ta: 'மொழிபெயர்ப்பு சேவை தற்காலிகமாக கிடைக்கவில்லை. தயவுசेय்து மீண்டும் முயற்சிக்கவும்.'
  },
  
  // Price discovery errors
  PRICE_DATA_UNAVAILABLE: {
    en: 'Price data is currently unavailable. Please try again later.',
    hi: 'मूल्य डेटा वर्तमान में अनुपलब्ध है। कृपया बाद में पुनः प्रयास करें।',
    te: 'ధర డేటా ప్రస్తుతం అందుబాటులో లేదు. దయచేసి తర్వాత మళ్లీ ప్రయత్నించండి.',
    ta: 'விலை தரவு தற்போது கிடைக்கவில்லை. தயவுசेय்து பின்னர் மீண்டும் முயற்சிக்கவும்.'
  },
  
  // WebSocket errors
  WEBSOCKET_CONNECTION_FAILED: {
    en: 'Real-time connection failed. Some features may not work properly.',
    hi: 'रीयल-टाइम कनेक्शन असफल। कुछ सुविधाएं ठीक से काम नहीं कर सकती हैं।',
    te: 'రియల్ టైమ్ కనెక్షన్ విఫలమైంది. కొన్ని ఫీచర్లు సరిగ్గా పని చేయకపోవచ్చు.',
    ta: 'நிகழ்நேர இணைப்பு தோல்வியடைந்தது. சில அம்சங்கள் சரியாக வேலை செய்யாமல் போகலாம்.'
  },
  
  // Generic errors
  UNKNOWN_ERROR: {
    en: 'An unexpected error occurred. Please try again.',
    hi: 'एक अप्रत्याशित त्रुटि हुई। कृपया पुनः प्रयास करें।',
    te: 'అనుకోని లోపం సంభవించింది. దయచేసి మళ్లీ ప్రయత్నించండి.',
    ta: 'எதிர்பாராத பிழை ஏற்பட்டது. தயவுசेय்து மீண்டும் முயற்சிக்கவும்.'
  }
};

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorLog: AppError[] = [];

  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Get localized error message
   */
  public getLocalizedMessage(errorCode: string, language: string = 'en'): string {
    const messages = ERROR_MESSAGES[errorCode as keyof typeof ERROR_MESSAGES];
    if (!messages) {
      return ERROR_MESSAGES.UNKNOWN_ERROR[language as keyof typeof ERROR_MESSAGES.UNKNOWN_ERROR] || 
             ERROR_MESSAGES.UNKNOWN_ERROR.en;
    }
    
    return messages[language as keyof typeof messages] || messages.en;
  }

  /**
   * Create standardized error object
   */
  public createError(
    code: string, 
    context?: string, 
    retryable: boolean = true
  ): AppError {
    return {
      code,
      message: this.getLocalizedMessage(code),
      context,
      timestamp: new Date().toISOString(),
      retryable
    };
  }

  /**
   * Log error for debugging and analytics
   */
  public logError(error: AppError | Error, context?: string): void {
    const appError: AppError = error instanceof Error ? {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      context: context || 'Unknown',
      timestamp: new Date().toISOString(),
      retryable: true
    } : error;

    this.errorLog.push(appError);
    
    // Keep only last 100 errors to prevent memory issues
    if (this.errorLog.length > 100) {
      this.errorLog = this.errorLog.slice(-100);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error logged:', appError);
    }

    // In production, you might want to send to analytics service
    this.reportToAnalytics(appError);
  }

  /**
   * Report error to analytics service (placeholder)
   */
  private reportToAnalytics(error: AppError): void {
    // In a real application, you would send this to your analytics service
    // like Google Analytics, Mixpanel, or a custom error tracking service
    if (process.env.NODE_ENV === 'production') {
      // Example: analytics.track('error', error);
    }
  }

  /**
   * Get recent errors for debugging
   */
  public getRecentErrors(limit: number = 10): AppError[] {
    return this.errorLog.slice(-limit);
  }

  /**
   * Clear error log
   */
  public clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Handle network errors specifically
   */
  public handleNetworkError(error: any, context?: string): AppError {
    let errorCode = 'NETWORK_ERROR';
    
    if (error.code === 'NETWORK_ERR' || error.message?.includes('Network Error')) {
      errorCode = 'NETWORK_ERROR';
    } else if (error.status === 429) {
      errorCode = 'RATE_LIMIT_EXCEEDED';
    } else if (error.status >= 500) {
      errorCode = 'SERVER_ERROR';
    }

    const appError = this.createError(errorCode, context);
    this.logError(appError);
    return appError;
  }

  /**
   * Handle voice input errors
   */
  public handleVoiceError(error: any, context?: string): AppError {
    let errorCode = 'SPEECH_RECOGNITION_FAILED';
    
    if (error.error === 'not-allowed') {
      errorCode = 'MICROPHONE_ACCESS_DENIED';
    } else if (error.error === 'not-supported') {
      errorCode = 'SPEECH_RECOGNITION_NOT_SUPPORTED';
    }

    const appError = this.createError(errorCode, context);
    this.logError(appError);
    return appError;
  }
}

/**
 * React Error Boundary component
 */
export class AppErrorBoundary extends React.Component<
  { children: ReactNode; fallback?: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorHandler = ErrorHandler.getInstance();
    errorHandler.logError(error, 'React Error Boundary');
    
    this.setState({
      hasError: true,
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>We're sorry, but something unexpected happened. Please refresh the page and try again.</p>
          <button onClick={() => window.location.reload()}>
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook for handling errors in functional components
 */
export const useErrorHandler = () => {
  const errorHandler = ErrorHandler.getInstance();

  const handleError = (error: Error | AppError, context?: string) => {
    errorHandler.logError(error, context);
  };

  const handleNetworkError = (error: any, context?: string) => {
    return errorHandler.handleNetworkError(error, context);
  };

  const handleVoiceError = (error: any, context?: string) => {
    return errorHandler.handleVoiceError(error, context);
  };

  const getLocalizedMessage = (errorCode: string, language?: string) => {
    return errorHandler.getLocalizedMessage(errorCode, language);
  };

  return {
    handleError,
    handleNetworkError,
    handleVoiceError,
    getLocalizedMessage,
    getRecentErrors: () => errorHandler.getRecentErrors(),
    clearErrorLog: () => errorHandler.clearErrorLog()
  };
};

/**
 * Utility function to create retry mechanism
 */
export const withRetry = async <T,>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const waitTime = delay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw lastError!;
};

export default ErrorHandler;