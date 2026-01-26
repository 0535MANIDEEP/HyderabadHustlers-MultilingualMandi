import React, { useState, useEffect } from 'react';
import { useErrorHandler } from '../utils/errorHandling';

interface ErrorNotificationProps {
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
  onRetry?: () => void;
  onDismiss?: () => void;
  autoHide?: boolean;
  autoHideDelay?: number;
  language?: string;
}

const ErrorNotification: React.FC<ErrorNotificationProps> = ({
  error,
  onRetry,
  onDismiss,
  autoHide = true,
  autoHideDelay = 5000,
  language = 'en'
}) => {
  const [isVisible, setIsVisible] = useState(!!error);
  const { getLocalizedMessage } = useErrorHandler();

  useEffect(() => {
    setIsVisible(!!error);
    
    if (error && autoHide) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        if (onDismiss) {
          onDismiss();
        }
      }, autoHideDelay);
      
      return () => clearTimeout(timer);
    }
  }, [error, autoHide, autoHideDelay, onDismiss]);

  const handleDismiss = () => {
    setIsVisible(false);
    if (onDismiss) {
      onDismiss();
    }
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    }
    handleDismiss();
  };

  if (!isVisible || !error) {
    return null;
  }

  const localizedMessage = getLocalizedMessage(error.code, language);

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        maxWidth: '400px',
        backgroundColor: '#f8d7da',
        color: '#721c24',
        border: '1px solid #f5c6cb',
        borderRadius: '8px',
        padding: '1rem',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 1000,
        animation: 'slideIn 0.3s ease-out'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ fontSize: '1.25rem', flexShrink: 0 }}>⚠️</div>
        
        <div style={{ flex: 1 }}>
          <div style={{ 
            fontWeight: 'bold', 
            marginBottom: '0.5rem',
            fontSize: '0.9rem'
          }}>
            Error
          </div>
          
          <div style={{ 
            fontSize: '0.875rem', 
            lineHeight: '1.4',
            marginBottom: error.retryable ? '1rem' : '0'
          }}>
            {localizedMessage || error.message}
          </div>
          
          {error.retryable && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleRetry}
                style={{
                  padding: '0.375rem 0.75rem',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
        
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.25rem',
            cursor: 'pointer',
            color: '#721c24',
            padding: '0',
            lineHeight: '1'
          }}
          aria-label="Dismiss error"
        >
          ×
        </button>
      </div>
      
      <style>
        {`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
    </div>
  );
};

export default ErrorNotification;