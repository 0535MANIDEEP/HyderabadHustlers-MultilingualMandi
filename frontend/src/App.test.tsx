import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock the contexts to avoid WebSocket connection issues in tests
jest.mock('./contexts/SocketContext', () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSocket: () => ({ socket: null, connected: false }),
}));

describe('App Component', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('Multilingual Mandi')).toBeInTheDocument();
  });

  it('renders navigation elements', () => {
    render(<App />);
    // Use getAllByText to handle multiple instances
    const dashboardElements = screen.getAllByText('Dashboard');
    expect(dashboardElements.length).toBeGreaterThan(0);
    expect(screen.getByText('Chat')).toBeInTheDocument();
  });

  it('renders language selector', () => {
    render(<App />);
    // Use getAllByText to handle multiple instances
    const languageElements = screen.getAllByText('Language');
    expect(languageElements.length).toBeGreaterThan(0);
  });
});