import React, { useState, useEffect, useCallback } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  useTheme,
  useMediaQuery,
  Skeleton,
} from '@mui/material';
import { 
  TrendingUp, 
  Agriculture, 
  Refresh, 
  TrendingDown,
  Remove,
  AccessTime,
  LocationOn,
} from '@mui/icons-material';
import { useLanguage } from '../contexts/LanguageContext';
import VoiceInput from './VoiceInput';
import ErrorNotification from './ErrorNotification';
import apiService, { PriceData } from '../services/apiService';
import { useErrorHandler } from '../utils/errorHandling';

interface PriceDataLocal extends PriceData {
  lastUpdated: Date;
}

const Dashboard: React.FC = () => {
  const { t, language } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { handleError, handleNetworkError } = useErrorHandler();
  
  const [priceData, setPriceData] = useState<PriceDataLocal[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<any>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [fairPriceRange, setFairPriceRange] = useState<{ min: number; max: number } | null>(null);

  // Auto-refresh interval (30 seconds)
  const REFRESH_INTERVAL = 30000;

  // Load price data from backend
  const loadPriceData = useCallback(async () => {
    try {
      const response = await apiService.getPrices({ language });
      
      if (response.success && response.data) {
        const processedData = response.data.map(item => ({
          ...item,
          lastUpdated: new Date(item.lastUpdated)
        }));
        setPriceData(processedData);
        setLastRefresh(new Date());
        setError(null);
      } else {
        // Fallback to mock data if API fails
        loadMockData();
        if (response.error) {
          const networkError = handleNetworkError(new Error(response.error), 'price_data_load');
          setError(networkError);
        }
      }
    } catch (err: any) {
      handleError(err, 'price_data_load');
      loadMockData(); // Fallback to mock data
      const networkError = handleNetworkError(err, 'price_data_load');
      setError(networkError);
    }
  }, [language, handleError, handleNetworkError]);

  // Fallback mock data for demo purposes
  const loadMockData = useCallback(() => {
    const mockData: PriceDataLocal[] = [
      { 
        crop: 'Tomato', 
        price: 40, 
        unit: 'kg', 
        market: 'Hyderabad', 
        trend: 'up', 
        lastUpdated: new Date(),
        change: 5.2,
        quality: 'Premium'
      },
      { 
        crop: 'Onion', 
        price: 30, 
        unit: 'kg', 
        market: 'Hyderabad', 
        trend: 'down', 
        lastUpdated: new Date(),
        change: -3.1,
        quality: 'Standard'
      },
      { 
        crop: 'Chili', 
        price: 100, 
        unit: 'kg', 
        market: 'Hyderabad', 
        trend: 'stable', 
        lastUpdated: new Date(),
        change: 0.5,
        quality: 'Premium'
      },
      { 
        crop: 'Potato', 
        price: 25, 
        unit: 'kg', 
        market: 'Hyderabad', 
        trend: 'up', 
        lastUpdated: new Date(),
        change: 2.8,
        quality: 'Standard'
      },
      { 
        crop: 'Carrot', 
        price: 35, 
        unit: 'kg', 
        market: 'Hyderabad', 
        trend: 'down', 
        lastUpdated: new Date(),
        change: -1.5,
        quality: 'Premium'
      },
      { 
        crop: 'Cabbage', 
        price: 20, 
        unit: 'kg', 
        market: 'Hyderabad', 
        trend: 'stable', 
        lastUpdated: new Date(),
        change: 0.2,
        quality: 'Standard'
      },
    ];
    
    setPriceData(mockData);
    setLastRefresh(new Date());
  }, []);

  // Initial data load
  useEffect(() => {
    loadPriceData();
  }, [loadPriceData]);

  // Auto-refresh functionality
  useEffect(() => {
    const interval = setInterval(() => {
      loadPriceData();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [loadPriceData]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadPriceData();
    setRefreshing(false);
  };

  const handlePriceQuery = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setFairPriceRange(null);
    
    try {
      const response = await apiService.queryPrice({
        text: query,
        language
      });
      
      if (response.success && response.data) {
        // Update price data with query results
        if (response.data.prices && response.data.prices.length > 0) {
          const processedData = response.data.prices.map(item => ({
            ...item,
            lastUpdated: new Date(item.lastUpdated)
          }));
          setPriceData(processedData);
        }
        
        // Set suggestions and fair price range
        if (response.data.suggestions) {
          setSuggestions(response.data.suggestions);
        }
        
        if (response.data.fairPriceRange) {
          setFairPriceRange(response.data.fairPriceRange);
        }
        
        setLastRefresh(new Date());
      } else {
        const networkError = handleNetworkError(
          new Error(response.error || 'Query failed'), 
          'price_query'
        );
        setError(networkError);
      }
    } catch (err: any) {
      const networkError = handleNetworkError(err, 'price_query');
      setError(networkError);
      handleError(err, 'price_query');
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceInput = (transcript: string) => {
    setQuery(transcript);
  };

  const handleVoiceError = (error: string) => {
    const voiceError = handleNetworkError(new Error(error), 'voice_input');
    setError(voiceError);
  };

  const dismissError = () => {
    setError(null);
  };

  const retryLastOperation = () => {
    if (query.trim()) {
      handlePriceQuery();
    } else {
      handleManualRefresh();
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp sx={{ color: 'success.main' }} />;
      case 'down':
        return <TrendingDown sx={{ color: 'error.main' }} />;
      default:
        return <Remove sx={{ color: 'text.secondary' }} />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up':
        return 'success.main';
      case 'down':
        return 'error.main';
      default:
        return 'text.secondary';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Box sx={{ 
      width: '100%',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      gap: { xs: 2, md: 3 },
    }}>
      {/* Header Section - Mobile First */}
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
          {t('dashboard')}
        </Typography>
        
        {/* Auto-refresh indicator */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          justifyContent: { xs: 'center', sm: 'flex-end' }
        }}>
          <Chip
            icon={<AccessTime />}
            label={`${t('lastUpdate')}: ${formatTime(lastRefresh)}`}
            size="small"
            variant="outlined"
          />
          <IconButton 
            onClick={handleManualRefresh}
            disabled={refreshing}
            size="small"
            sx={{ color: 'primary.main' }}
          >
            {refreshing ? <CircularProgress size={20} /> : <Refresh />}
          </IconButton>
        </Box>
      </Box>
      
      {/* Price Query Section - Enhanced Mobile Layout */}
      <Card sx={{ 
        boxShadow: { xs: 1, md: 2 },
        borderRadius: { xs: 2, md: 3 }
      }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Typography 
            variant="h6" 
            gutterBottom
            sx={{ 
              fontSize: { xs: '1.1rem', md: '1.25rem' },
              fontWeight: 500
            }}
          >
            {t('priceQuery')}
          </Typography>
          
          <Box sx={{ 
            display: 'flex', 
            flexDirection: { xs: 'column', sm: 'row' },
            gap: { xs: 2, sm: 1 }, 
            alignItems: { xs: 'stretch', sm: 'center' }
          }}>
            <TextField
              fullWidth
              label={t('enterCropQuery')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('queryPlaceholder')}
              size={isMobile ? "medium" : "medium"}
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
              flexDirection: { xs: 'row', sm: 'row' },
              justifyContent: { xs: 'center', sm: 'flex-end' }
            }}>
              <VoiceInput 
                onTranscript={handleVoiceInput}
                onError={handleVoiceError}
                disabled={loading}
                size="medium"
              />
              <Button
                variant="contained"
                onClick={handlePriceQuery}
                disabled={loading || !query.trim()}
                startIcon={loading ? <CircularProgress size={20} /> : <TrendingUp />}
                sx={{ 
                  minWidth: { xs: 'auto', sm: 120 },
                  borderRadius: { xs: 2, md: 1 },
                  px: { xs: 2, sm: 3 }
                }}
              >
                {loading ? t('searching') : t('search')}
              </Button>
            </Box>
          </Box>
          
          {/* Query Results */}
          {suggestions.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {t('suggestions')}:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {suggestions.map((suggestion, index) => (
                  <Chip
                    key={index}
                    label={suggestion}
                    size="small"
                    variant="outlined"
                    onClick={() => setQuery(suggestion)}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Box>
            </Box>
          )}
          
          {fairPriceRange && (
            <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>
              {t('fairPriceRange')}: ₹{fairPriceRange.min} - ₹{fairPriceRange.max} per kg
            </Alert>
          )}
          
          {error && (
            <ErrorNotification
              error={error}
              onRetry={retryLastOperation}
              onDismiss={dismissError}
              language={language}
            />
          )}
        </CardContent>
      </Card>

      {/* Current Prices Section - Responsive Grid */}
      <Box>
        <Typography 
          variant={isMobile ? "h6" : "h5"} 
          gutterBottom
          sx={{ 
            fontWeight: 600,
            mb: { xs: 2, md: 3 },
            color: 'text.primary'
          }}
        >
          {t('currentPrices')}
        </Typography>
        
        {/* Loading skeleton for better UX */}
        {priceData.length === 0 ? (
          <Grid container spacing={{ xs: 2, md: 3 }}>
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={item}>
                <Card>
                  <CardContent>
                    <Skeleton variant="text" width="60%" height={32} />
                    <Skeleton variant="text" width="40%" height={48} />
                    <Skeleton variant="text" width="80%" height={24} />
                    <Skeleton variant="text" width="50%" height={20} />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Grid container spacing={{ xs: 2, md: 3 }}>
            {priceData.map((item, index) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
                <Card sx={{ 
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: { xs: 'none', md: 'translateY(-4px)' },
                    boxShadow: { xs: 1, md: 4 }
                  },
                  borderRadius: { xs: 2, md: 3 }
                }}>
                  <CardContent sx={{ 
                    flex: 1, 
                    display: 'flex', 
                    flexDirection: 'column',
                    p: { xs: 2, md: 2.5 }
                  }}>
                    {/* Crop Header */}
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      mb: 2 
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Agriculture sx={{ mr: 1, color: 'primary.main' }} />
                        <Typography variant="h6" sx={{ fontSize: { xs: '1rem', md: '1.1rem' } }}>
                          {item.crop}
                        </Typography>
                      </Box>
                      <Chip 
                        label={item.quality} 
                        size="small" 
                        color={item.quality === 'Premium' ? 'primary' : 'default'}
                        variant="outlined"
                      />
                    </Box>
                    
                    {/* Price Display */}
                    <Box sx={{ mb: 2, flex: 1 }}>
                      <Typography 
                        variant="h4" 
                        color="primary" 
                        sx={{ 
                          fontSize: { xs: '1.8rem', md: '2.125rem' },
                          fontWeight: 700,
                          lineHeight: 1.2
                        }}
                      >
                        ₹{item.price.toFixed(0)}
                        <Typography 
                          component="span" 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ fontSize: { xs: '0.8rem', md: '0.875rem' } }}
                        >
                          /{item.unit}
                        </Typography>
                      </Typography>
                      
                      {/* Price Change */}
                      <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                        {getTrendIcon(item.trend)}
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            ml: 0.5,
                            color: getTrendColor(item.trend),
                            fontWeight: 500
                          }}
                        >
                          {item.change > 0 ? '+' : ''}{item.change.toFixed(1)}%
                        </Typography>
                      </Box>
                    </Box>
                    
                    {/* Market Info */}
                    <Box sx={{ mt: 'auto' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <LocationOn sx={{ fontSize: 16, mr: 0.5, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {t('market')}: {item.market}
                        </Typography>
                      </Box>
                      
                      <Typography variant="caption" color="text.secondary">
                        {t('updated')}: {formatTime(item.lastUpdated)}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  );
};

export default Dashboard;