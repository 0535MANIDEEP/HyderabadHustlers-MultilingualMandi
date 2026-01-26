import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ChatInterface from '../ChatInterface';
import { LanguageProvider } from '../../contexts/LanguageContext';

// Mock socket.io-client
const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

// Mock SocketContext
jest.mock('../../contexts/SocketContext', () => ({
  useSocket: () => ({
    socket: mockSocket,
    connected: true,
  }),
  SocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock VoiceInput component
jest.mock('../VoiceInput', () => {
  return function MockVoiceInput({ onTranscript }: { onTranscript: (text: string) => void }) {
    return (
      <button 
        data-testid="voice-input"
        onClick={() => onTranscript('Test voice input')}
      >
        Voice Input
      </button>
    );
  };
});

// Mock scrollIntoView
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: jest.fn(),
});

// Mock fetch for API calls
global.fetch = jest.fn();

const renderChatInterface = () => {
  return render(
    <BrowserRouter>
      <LanguageProvider>
        <ChatInterface />
      </LanguageProvider>
    </BrowserRouter>
  );
};

describe('ChatInterface', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Reset fetch mock
    (global.fetch as jest.Mock).mockClear();
  });

  test('renders chat interface with welcome message', () => {
    renderChatInterface();
    
    expect(screen.getByText(/Multilingual Mandi Chat/i)).toBeInTheDocument();
    expect(screen.getByText('Welcome to Multilingual Mandi Chat')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ask about prices/)).toBeInTheDocument();
  });

  test('allows typing and sending messages', async () => {
    renderChatInterface();
    
    const input = screen.getByPlaceholderText(/Ask about prices/);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Type a message
    fireEvent.change(input, { target: { value: 'What is the price of tomatoes?' } });
    expect(input).toHaveValue('What is the price of tomatoes?');
    
    // Send button should be enabled
    expect(sendButton).not.toBeDisabled();
    
    // Click send
    fireEvent.click(sendButton);
    
    // Input should be cleared
    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  test('handles voice input', () => {
    renderChatInterface();
    
    const voiceButton = screen.getByTestId('voice-input');
    const input = screen.getByPlaceholderText(/Ask about prices/);
    
    // Click voice input
    fireEvent.click(voiceButton);
    
    // Input should be filled with voice transcript
    expect(input).toHaveValue('Test voice input');
  });

  test('shows quick action chips', () => {
    renderChatInterface();
    
    expect(screen.getByText('Tomato prices')).toBeInTheDocument();
    expect(screen.getByText('Market trends')).toBeInTheDocument();
    expect(screen.getByText('Compare prices')).toBeInTheDocument();
  });

  test('clicking quick action fills input', () => {
    renderChatInterface();
    
    const input = screen.getByPlaceholderText(/Ask about prices/);
    const tomatoChip = screen.getByText('Tomato prices');
    
    fireEvent.click(tomatoChip);
    
    expect(input).toHaveValue('What is the current price of tomatoes?');
  });

  test('shows connection status', () => {
    renderChatInterface();
    
    // Should show connection status chip
    expect(screen.getByText('connected')).toBeInTheDocument();
  });

  test('handles Enter key to send message', async () => {
    renderChatInterface();
    
    const input = screen.getByPlaceholderText(/Ask about prices/);
    
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    
    // Input should be cleared after sending
    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  test('prevents sending empty messages', () => {
    renderChatInterface();
    
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    // Send button should be disabled when input is empty
    expect(sendButton).toBeDisabled();
  });
});