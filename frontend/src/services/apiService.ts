/**
 * API Service for Multilingual Mandi Frontend
 * Handles all backend API communications with error handling and retry logic
 */

import { ErrorHandler, withRetry } from '../utils/errorHandling';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  message?: string;
}

interface PriceData {
  crop: string;
  price: number;
  unit: string;
  market: string;
  trend: 'up' | 'down' | 'stable';
  lastUpdated: string;
  change: number;
  quality: string;
}

interface TranslationRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
  context?: string;
}

interface TranslationResponse {
  translatedText: string;
  confidence: number;
  preservedTerms?: string[];
  sourceLang: string;
  targetLang: string;
}

interface NegotiationSession {
  sessionId: string;
  vendorId: string;
  buyerId: string;
  cropDetails: {
    name: string;
    quantity: number;
    unit: string;
    quality: string;
  };
  status: 'active' | 'agreed' | 'cancelled';
  messages: any[];
  currentOffer?: {
    price: number;
    quantity: number;
    terms: string;
  };
}

interface User {
  id: string;
  username: string;
  email: string;
  language: string;
  role: string;
}

interface AuthResponse {
  success: boolean;
  user: User;
  token: string;
  sessionId: string;
  message: string;
}

class ApiService {
  private baseURL: string;
  private token: string | null = null;
  private sessionId: string | null = null;
  private errorHandler: ErrorHandler;

  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1';
    this.errorHandler = ErrorHandler.getInstance();
    
    // Load token and session from localStorage
    this.token = localStorage.getItem('auth_token');
    this.sessionId = localStorage.getItem('session_id');
  }

  /**
   * Set authentication token
   */
  setToken(token: string, sessionId?: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
    
    if (sessionId) {
      this.sessionId = sessionId;
      localStorage.setItem('session_id', sessionId);
    }
  }

  /**
   * Clear authentication
   */
  clearAuth() {
    this.token = null;
    this.sessionId = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('session_id');
  }

  /**
   * Get default headers for API requests
   */
  private getHeaders(language?: string): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (this.sessionId) {
      headers['X-Session-ID'] = this.sessionId;
    }

    if (language) {
      headers['Accept-Language'] = language;
    }

    return headers;
  }

  /**
   * Make HTTP request with error handling
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    language?: string
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseURL}${endpoint}`;
      const headers = this.getHeaders(language);

      const response = await withRetry(async () => {
        const res = await fetch(url, {
          ...options,
          headers: {
            ...headers,
            ...options.headers,
          },
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const error = new Error(errorData.error || `HTTP ${res.status}`);
          (error as any).status = res.status;
          (error as any).code = errorData.errorCode;
          throw error;
        }

        return res;
      });

      const data = await response.json();
      return {
        success: true,
        data,
        message: data.message
      };

    } catch (error: any) {
      const appError = this.errorHandler.handleNetworkError(error, endpoint);
      return {
        success: false,
        error: appError.message,
        errorCode: appError.code
      };
    }
  }

  /**
   * Authentication APIs
   */
  async register(userData: {
    username: string;
    email: string;
    password: string;
    language?: string;
  }): Promise<ApiResponse<AuthResponse>> {
    return this.makeRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    }, userData.language);
  }

  async login(credentials: {
    username: string;
    password: string;
    language?: string;
  }): Promise<ApiResponse<AuthResponse>> {
    const response = await this.makeRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }, credentials.language);

    if (response.success && response.data) {
      this.setToken(response.data.token, response.data.sessionId);
    }

    return response;
  }

  async logout(): Promise<ApiResponse> {
    const response = await this.makeRequest('/auth/logout', {
      method: 'POST',
    });

    if (response.success) {
      this.clearAuth();
    }

    return response;
  }

  async getProfile(): Promise<ApiResponse<User>> {
    return this.makeRequest<User>('/auth/profile');
  }

  async updateProfile(updates: {
    email?: string;
    language?: string;
  }): Promise<ApiResponse<User>> {
    return this.makeRequest<User>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Price Discovery APIs
   */
  async getPrices(query?: {
    crop?: string;
    market?: string;
    language?: string;
  }): Promise<ApiResponse<PriceData[]>> {
    const params = new URLSearchParams();
    if (query?.crop) params.append('crop', query.crop);
    if (query?.market) params.append('market', query.market);

    const endpoint = `/prices${params.toString() ? `?${params.toString()}` : ''}`;
    return this.makeRequest<PriceData[]>(endpoint, {}, query?.language);
  }

  async queryPrice(query: {
    text: string;
    language?: string;
  }): Promise<ApiResponse<{
    prices: PriceData[];
    suggestions: string[];
    fairPriceRange?: { min: number; max: number };
  }>> {
    return this.makeRequest('/prices/query', {
      method: 'POST',
      body: JSON.stringify(query),
    }, query.language);
  }

  /**
   * Translation APIs
   */
  async translateText(request: TranslationRequest): Promise<ApiResponse<TranslationResponse>> {
    return this.makeRequest<TranslationResponse>('/translate', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async detectLanguage(text: string): Promise<ApiResponse<{ language: string; confidence: number }>> {
    return this.makeRequest('/translate/detect', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  /**
   * Negotiation APIs
   */
  async createNegotiationSession(sessionData: {
    vendorId: string;
    buyerId: string;
    cropDetails: {
      name: string;
      quantity: number;
      unit: string;
      quality: string;
    };
    vendorLanguage: string;
    buyerLanguage: string;
  }): Promise<ApiResponse<NegotiationSession>> {
    return this.makeRequest<NegotiationSession>('/negotiate/session', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  }

  async getNegotiationSession(sessionId: string): Promise<ApiResponse<NegotiationSession>> {
    return this.makeRequest<NegotiationSession>(`/negotiate/session/${sessionId}`);
  }

  async getNegotiationStats(): Promise<ApiResponse<{
    activeSessions: number;
    totalSessions: number;
    averageSessionDuration: number;
    successRate: number;
  }>> {
    return this.makeRequest('/negotiate/stats');
  }

  /**
   * RAG Pipeline APIs
   */
  async queryRAG(query: {
    text: string;
    context?: string;
    language?: string;
  }): Promise<ApiResponse<{
    response: string;
    sources: string[];
    confidence: number;
  }>> {
    return this.makeRequest('/rag/query', {
      method: 'POST',
      body: JSON.stringify(query),
    }, query.language);
  }

  /**
   * Monitoring APIs
   */
  async getHealthStatus(): Promise<ApiResponse<{
    status: string;
    timestamp: string;
    uptime: number;
    memory: any;
  }>> {
    return this.makeRequest('/health', {}, undefined);
  }

  async getMonitoringData(): Promise<ApiResponse<{
    transactions: any;
    audit: any;
    performance: any;
    system: any;
  }>> {
    return this.makeRequest('/monitoring');
  }

  /**
   * Utility methods
   */
  isAuthenticated(): boolean {
    return !!this.token;
  }

  getToken(): string | null {
    return this.token;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * WebSocket connection helper
   */
  getWebSocketURL(): string {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = process.env.REACT_APP_WS_URL || 'localhost:5000';
    return `${wsProtocol}//${wsHost}`;
  }
}

// Create singleton instance
const apiService = new ApiService();

export default apiService;
export type { 
  ApiResponse, 
  PriceData, 
  TranslationRequest, 
  TranslationResponse, 
  NegotiationSession, 
  User, 
  AuthResponse 
};