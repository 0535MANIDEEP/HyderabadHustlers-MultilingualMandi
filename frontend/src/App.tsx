import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Container, Box } from '@mui/material';
import Dashboard from './components/Dashboard';
import ChatInterface from './components/ChatInterface';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import { LanguageProvider } from './contexts/LanguageContext';
import { SocketProvider } from './contexts/SocketContext';

function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <SocketProvider>
          <Router>
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              minHeight: '100vh',
              bgcolor: 'background.default'
            }}>
              <Header />
              <Container 
                maxWidth="xl" 
                sx={{ 
                  flex: 1, 
                  py: { xs: 2, md: 3 },
                  px: { xs: 2, sm: 3, md: 4 },
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <ErrorBoundary>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/chat" element={<ChatInterface />} />
                    <Route path="/chat/:sessionId" element={<ChatInterface />} />
                  </Routes>
                </ErrorBoundary>
              </Container>
            </Box>
          </Router>
        </SocketProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;