import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VoiceInput from '../VoiceInput';
import { LanguageProvider } from '../../contexts/LanguageContext';

// Mock navigator.mediaDevices
const mockGetUserMedia = jest.fn();
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: mockGetUserMedia,
  },
  writable: true,
});

const renderVoiceInput = (props = {}) => {
  const defaultProps = {
    onTranscript: jest.fn(),
    onError: jest.fn(),
    ...props,
  };

  return render(
    <LanguageProvider>
      <VoiceInput {...defaultProps} />
    </LanguageProvider>
  );
};

describe('VoiceInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful microphone access
    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: jest.fn() }],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows loading state during initialization', () => {
    renderVoiceInput();
    
    // Should show loading initially
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  test('shows error state when speech recognition is not supported', async () => {
    // Mock unsupported browser
    Object.defineProperty(window, 'SpeechRecognition', {
      value: undefined,
      writable: true,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      writable: true,
    });
    
    renderVoiceInput();
    
    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  test('respects disabled prop', async () => {
    renderVoiceInput({ disabled: true });
    
    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  test('handles microphone permission denied', async () => {
    const onError = jest.fn();
    mockGetUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    
    renderVoiceInput({ onError });
    
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    });
    
    // Should show error state
    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('color', 'error');
    });
  });

  test('handles different button sizes', async () => {
    const { rerender } = renderVoiceInput({ size: 'small' });
    
    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
    
    rerender(
      <LanguageProvider>
        <VoiceInput onTranscript={jest.fn()} size="large" />
      </LanguageProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  test('renders with proper accessibility attributes', async () => {
    renderVoiceInput();
    
    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button.closest('[aria-label]')).toBeInTheDocument();
    });
  });

  test('handles microphone not found error', async () => {
    mockGetUserMedia.mockRejectedValue(new DOMException('Device not found', 'NotFoundError'));
    
    renderVoiceInput();
    
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    });
  });

  test('handles network error during permission check', async () => {
    mockGetUserMedia.mockRejectedValue(new DOMException('Network error', 'NetworkError'));
    
    renderVoiceInput();
    
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    });
  });

  test('cleans up properly on unmount', async () => {
    const { unmount } = renderVoiceInput();
    
    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
    
    // Should not throw error on unmount
    expect(() => unmount()).not.toThrow();
  });

  test('handles permission request retry', async () => {
    // First call fails
    mockGetUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    // Second call succeeds
    mockGetUserMedia.mockResolvedValueOnce({
      getTracks: () => [{ stop: jest.fn() }],
    });
    
    renderVoiceInput();
    
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    });
    
    // Should show error button initially
    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('color', 'error');
    });
    
    // Click to retry
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    // Should call getUserMedia again
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    });
  });
});