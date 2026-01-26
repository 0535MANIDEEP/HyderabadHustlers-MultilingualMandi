import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Dashboard from '../Dashboard';
import { LanguageProvider } from '../../contexts/LanguageContext';

// Mock the LanguageContext
const mockTheme = createTheme();

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      <LanguageProvider>
        {component}
      </LanguageProvider>
    </ThemeProvider>
  );
};

describe('Dashboard Component', () => {
  test('renders dashboard title', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  test('renders price query section', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Price Query')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., tomato price in Hyderabad')).toBeInTheDocument();
  });

  test('renders current prices section', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Current Market Prices')).toBeInTheDocument();
  });

  test('displays price cards with crop information', async () => {
    renderWithProviders(<Dashboard />);
    
    // Wait for the price data to load
    await waitFor(() => {
      expect(screen.getByText('Tomato')).toBeInTheDocument();
      expect(screen.getByText('Onion')).toBeInTheDocument();
      expect(screen.getByText('Chili')).toBeInTheDocument();
    });
  });

  test('displays auto-refresh functionality', async () => {
    renderWithProviders(<Dashboard />);
    
    // Check for last update indicator
    await waitFor(() => {
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });
  });

  test('displays price trends and changes', async () => {
    renderWithProviders(<Dashboard />);
    
    // Wait for price data and check for trend indicators
    await waitFor(() => {
      // Should show percentage changes
      const percentageElements = screen.getAllByText(/%/);
      expect(percentageElements.length).toBeGreaterThan(0);
    });
  });

  test('displays quality indicators', async () => {
    renderWithProviders(<Dashboard />);
    
    // Wait for price data and check for quality chips
    await waitFor(() => {
      expect(screen.getByText('Premium')).toBeInTheDocument();
      expect(screen.getByText('Standard')).toBeInTheDocument();
    });
  });

  test('displays market information', async () => {
    renderWithProviders(<Dashboard />);
    
    // Wait for price data and check for market info
    await waitFor(() => {
      expect(screen.getAllByText(/Market: Hyderabad/)).toHaveLength(6);
    });
  });
});