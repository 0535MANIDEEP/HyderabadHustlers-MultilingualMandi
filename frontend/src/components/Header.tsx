import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
  Menu,
  MenuItem,
  useTheme,
  useMediaQuery,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
} from '@mui/material';
import { 
  Menu as MenuIcon, 
  Language as LanguageIcon,
  Dashboard as DashboardIcon,
  Chat as ChatIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [languageMenuAnchor, setLanguageMenuAnchor] = useState<null | HTMLElement>(null);

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    setLanguageMenuAnchor(null);
  };

  const handleLanguageMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setLanguageMenuAnchor(event.currentTarget);
  };

  const handleLanguageMenuClose = () => {
    setLanguageMenuAnchor(null);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const isCurrentPath = (path: string) => {
    return location.pathname === path;
  };

  const languageOptions = [
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'hi', label: 'हिंदी', flag: '🇮🇳' },
    { code: 'te', label: 'తెలుగు', flag: '🇮🇳' },
    { code: 'ta', label: 'தமிழ்', flag: '🇮🇳' },
  ];

  const getCurrentLanguageLabel = () => {
    const current = languageOptions.find(lang => lang.code === language);
    return current ? `${current.flag} ${current.label}` : 'Language';
  };

  // Mobile Navigation Drawer
  const mobileDrawer = (
    <Drawer
      anchor="left"
      open={mobileMenuOpen}
      onClose={toggleMobileMenu}
      sx={{
        '& .MuiDrawer-paper': {
          width: 280,
          bgcolor: 'background.paper',
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 600 }}>
          {t('appTitle')}
        </Typography>
      </Box>
      <Divider />
      <List>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => handleNavigation('/')}
            selected={isCurrentPath('/')}
            sx={{
              '&.Mui-selected': {
                bgcolor: 'primary.light',
                color: 'primary.contrastText',
                '&:hover': {
                  bgcolor: 'primary.main',
                },
              },
            }}
          >
            <DashboardIcon sx={{ mr: 2 }} />
            <ListItemText primary={t('dashboard')} />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => handleNavigation('/chat')}
            selected={isCurrentPath('/chat')}
            sx={{
              '&.Mui-selected': {
                bgcolor: 'primary.light',
                color: 'primary.contrastText',
                '&:hover': {
                  bgcolor: 'primary.main',
                },
              },
            }}
          >
            <ChatIcon sx={{ mr: 2 }} />
            <ListItemText primary={t('chat')} />
          </ListItemButton>
        </ListItem>
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {t('language')}
        </Typography>
        {languageOptions.map((lang) => (
          <Button
            key={lang.code}
            fullWidth
            variant={language === lang.code ? 'contained' : 'text'}
            onClick={() => handleLanguageChange(lang.code)}
            sx={{ 
              justifyContent: 'flex-start', 
              mb: 1,
              textTransform: 'none'
            }}
          >
            {lang.flag} {lang.label}
          </Button>
        ))}
      </Box>
    </Drawer>
  );

  return (
    <>
      <AppBar 
        position="static" 
        elevation={isMobile ? 1 : 2}
        sx={{
          bgcolor: 'primary.main',
          '& .MuiToolbar-root': {
            minHeight: { xs: 56, sm: 64 },
          },
        }}
      >
        <Toolbar>
          {/* Mobile Menu Button */}
          {isMobile && (
            <IconButton
              edge="start"
              color="inherit"
              aria-label="menu"
              onClick={toggleMobileMenu}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          {/* App Title */}
          <Typography 
            variant="h6" 
            component="div" 
            sx={{ 
              flexGrow: 1,
              fontWeight: 600,
              fontSize: { xs: '1.1rem', sm: '1.25rem' },
              cursor: 'pointer'
            }}
            onClick={() => navigate('/')}
          >
            {t('appTitle')}
          </Typography>
          
          {/* Desktop Navigation */}
          {!isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button 
                color="inherit" 
                onClick={() => navigate('/')}
                startIcon={<DashboardIcon />}
                sx={{ 
                  textTransform: 'none',
                  fontWeight: isCurrentPath('/') ? 600 : 400,
                  bgcolor: isCurrentPath('/') ? 'rgba(255,255,255,0.1)' : 'transparent',
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.1)',
                  },
                }}
              >
                {t('dashboard')}
              </Button>
              <Button 
                color="inherit" 
                onClick={() => navigate('/chat')}
                startIcon={<ChatIcon />}
                sx={{ 
                  textTransform: 'none',
                  fontWeight: isCurrentPath('/chat') ? 600 : 400,
                  bgcolor: isCurrentPath('/chat') ? 'rgba(255,255,255,0.1)' : 'transparent',
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.1)',
                  },
                }}
              >
                {t('chat')}
              </Button>
              
              {/* Desktop Language Selector */}
              <Button
                color="inherit"
                onClick={handleLanguageMenuOpen}
                startIcon={<LanguageIcon />}
                sx={{ 
                  textTransform: 'none',
                  ml: 1,
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.1)',
                  },
                }}
              >
                {getCurrentLanguageLabel()}
              </Button>
              
              <Menu
                anchorEl={languageMenuAnchor}
                open={Boolean(languageMenuAnchor)}
                onClose={handleLanguageMenuClose}
                PaperProps={{
                  sx: {
                    mt: 1,
                    minWidth: 180,
                  },
                }}
              >
                {languageOptions.map((lang) => (
                  <MenuItem
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
                    selected={language === lang.code}
                    sx={{
                      '&.Mui-selected': {
                        bgcolor: 'primary.light',
                        color: 'primary.contrastText',
                      },
                    }}
                  >
                    {lang.flag} {lang.label}
                  </MenuItem>
                ))}
              </Menu>
            </Box>
          )}

          {/* Mobile Language Button */}
          {isMobile && (
            <IconButton
              color="inherit"
              onClick={handleLanguageMenuOpen}
              sx={{ ml: 1 }}
            >
              <LanguageIcon />
            </IconButton>
          )}
          
          {/* Mobile Language Menu */}
          {isMobile && (
            <Menu
              anchorEl={languageMenuAnchor}
              open={Boolean(languageMenuAnchor)}
              onClose={handleLanguageMenuClose}
              PaperProps={{
                sx: {
                  mt: 1,
                  minWidth: 160,
                },
              }}
            >
              {languageOptions.map((lang) => (
                <MenuItem
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  selected={language === lang.code}
                  sx={{
                    '&.Mui-selected': {
                      bgcolor: 'primary.light',
                      color: 'primary.contrastText',
                    },
                  }}
                >
                  {lang.flag} {lang.label}
                </MenuItem>
              ))}
            </Menu>
          )}
        </Toolbar>
      </AppBar>
      
      {/* Mobile Navigation Drawer */}
      {mobileDrawer}
    </>
  );
};

export default Header;