const BedrockClient = require('./BedrockClient');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// Mock AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/credential-providers', () => ({
  fromEnv: jest.fn(() => ({ accessKeyId: 'test', secretAccessKey: 'test' }))
}));

describe('BedrockClient', () => {
  let bedrockClient;
  let mockSend;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock the send method
    mockSend = jest.fn();
    BedrockRuntimeClient.mockImplementation(() => ({
      send: mockSend
    }));

    // Create client instance
    bedrockClient = new BedrockClient({
      region: 'us-east-1',
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      maxRetries: 2,
      requestsPerSecond: 5
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const client = new BedrockClient();
      const status = client.getStatus();
      
      expect(status.region).toBe('us-east-1');
      expect(status.modelId).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
      expect(status.maxTokens).toBe(4096);
      expect(status.temperature).toBe(0.7);
      expect(status.maxRetries).toBe(3);
      expect(status.requestsPerSecond).toBe(2);
    });

    it('should initialize with custom options', () => {
      const options = {
        region: 'us-west-2',
        modelId: 'custom-model',
        maxTokens: 2048,
        temperature: 0.5,
        maxRetries: 5,
        requestsPerSecond: 10
      };
      
      const client = new BedrockClient(options);
      const status = client.getStatus();
      
      expect(status.region).toBe(options.region);
      expect(status.modelId).toBe(options.modelId);
      expect(status.maxTokens).toBe(options.maxTokens);
      expect(status.temperature).toBe(options.temperature);
      expect(status.maxRetries).toBe(options.maxRetries);
      expect(status.requestsPerSecond).toBe(options.requestsPerSecond);
    });

    it('should initialize BedrockRuntimeClient correctly', () => {
      expect(BedrockRuntimeClient).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: expect.any(Object),
        maxAttempts: 2
      });
    });
  });

  describe('invokeModel', () => {
    it('should successfully invoke model and return response', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: 'Hello, this is Claude!' }],
          usage: { input_tokens: 10, output_tokens: 5 }
        }))
      };
      
      mockSend.mockResolvedValue(mockResponse);

      const result = await bedrockClient.invokeModel('Hello Claude');

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello, this is Claude!');
      expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
      expect(result.model).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
      expect(typeof result.duration).toBe('number');
    });

    it('should handle model invocation with custom options', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: 'Custom response' }],
          usage: { input_tokens: 15, output_tokens: 8 }
        }))
      };
      
      mockSend.mockResolvedValue(mockResponse);

      const options = {
        maxTokens: 2048,
        temperature: 0.3,
        systemMessage: 'You are a helpful assistant.'
      };

      const result = await bedrockClient.invokeModel('Test prompt', options);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.content).toBe('Custom response');
      expect(result.usage).toEqual({ input_tokens: 15, output_tokens: 8 });
    });

    it('should queue multiple requests and process them with rate limiting', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: 'Response' }],
          usage: { input_tokens: 10, output_tokens: 5 }
        }))
      };
      
      mockSend.mockResolvedValue(mockResponse);

      const startTime = Date.now();
      
      // Make multiple requests
      const promises = [
        bedrockClient.invokeModel('Request 1'),
        bedrockClient.invokeModel('Request 2'),
        bedrockClient.invokeModel('Request 3')
      ];

      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // With 5 requests per second, 3 requests should take at least 400ms
      expect(duration).toBeGreaterThan(300);
      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });

  describe('retry logic', () => {
    it('should retry on throttling exception', async () => {
      const throttlingError = new Error('Request throttled');
      throttlingError.name = 'ThrottlingException';
      
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: 'Success after retry' }],
          usage: { input_tokens: 10, output_tokens: 5 }
        }))
      };

      mockSend
        .mockRejectedValueOnce(throttlingError)
        .mockResolvedValue(mockResponse);

      const result = await bedrockClient.invokeModel('Test prompt');

      expect(result.success).toBe(true);
      expect(result.content).toBe('Success after retry');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should not retry on validation exception', async () => {
      const validationError = new Error('Invalid request');
      validationError.name = 'ValidationException';
      
      mockSend.mockRejectedValue(validationError);

      await expect(bedrockClient.invokeModel('Test prompt')).rejects.toThrow();
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and throw enhanced error', async () => {
      const serviceError = new Error('Service unavailable');
      serviceError.name = 'ServiceUnavailableException';
      
      mockSend.mockRejectedValue(serviceError);

      await expect(bedrockClient.invokeModel('Test prompt')).rejects.toThrow(
        'Bedrock request failed after 2 attempts'
      );
      
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should enhance errors with additional context', async () => {
      const accessError = new Error('Access denied');
      accessError.name = 'AccessDeniedException';
      
      mockSend.mockRejectedValue(accessError);

      try {
        await bedrockClient.invokeModel('Test prompt');
      } catch (error) {
        expect(error.category).toBe('ACCESS_DENIED');
        expect(error.retryable).toBe(false);
        expect(error.attempts).toBe(1);
        expect(error.modelId).toBe('anthropic.claude-3-sonnet-20240229-v1:0');
        expect(error.region).toBe('us-east-1');
      }
    });
  });

  describe('error categorization', () => {
    it('should correctly identify retryable errors', () => {
      const retryableErrors = [
        { name: 'ThrottlingException' },
        { name: 'ServiceUnavailableException' },
        { name: 'InternalServerException' },
        { name: 'TooManyRequestsException' },
        { code: 'ECONNRESET' },
        { code: 'ETIMEDOUT' }
      ];

      retryableErrors.forEach(error => {
        expect(bedrockClient.isRetryableError(error)).toBe(true);
      });
    });

    it('should correctly identify non-retryable errors', () => {
      const nonRetryableErrors = [
        { name: 'ValidationException' },
        { name: 'AccessDeniedException' },
        { name: 'UnknownError' }
      ];

      nonRetryableErrors.forEach(error => {
        expect(bedrockClient.isRetryableError(error)).toBe(false);
      });
    });
  });

  describe('testConnection', () => {
    it('should return success for successful connection test', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: 'Connection successful' }],
          usage: { input_tokens: 10, output_tokens: 5 }
        }))
      };
      
      mockSend.mockResolvedValue(mockResponse);

      const result = await bedrockClient.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Bedrock connection test successful');
      expect(result.response).toBe('Connection successful');
      expect(typeof result.duration).toBe('number');
    });

    it('should return failure for failed connection test', async () => {
      const connectionError = new Error('Connection failed');
      connectionError.name = 'AccessDeniedException';
      
      mockSend.mockRejectedValue(connectionError);

      const result = await bedrockClient.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Bedrock connection test failed');
      expect(result.error).toBe('Bedrock request failed after 1 attempts: Connection failed');
      expect(result.category).toBe('ACCESS_DENIED');
    });
  });

  describe('getStatus', () => {
    it('should return current client status', () => {
      const status = bedrockClient.getStatus();

      expect(status).toEqual({
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        region: 'us-east-1',
        maxTokens: 4096,
        temperature: 0.7,
        maxRetries: 2,
        requestsPerSecond: 5,
        queueLength: 0,
        isProcessingQueue: false
      });
    });
  });

  describe('rate limiting', () => {
    it('should respect rate limiting configuration', async () => {
      // Create client with strict rate limiting
      const strictClient = new BedrockClient({
        requestsPerSecond: 1,
        maxRetries: 1
      });

      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: 'Response' }],
          usage: { input_tokens: 10, output_tokens: 5 }
        }))
      };
      
      mockSend.mockResolvedValue(mockResponse);

      const startTime = Date.now();
      
      // Make two requests
      await Promise.all([
        strictClient.invokeModel('Request 1'),
        strictClient.invokeModel('Request 2')
      ]);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // With 1 request per second, 2 requests should take at least 1000ms
      expect(duration).toBeGreaterThan(900);
    });
  });

  describe('sleep utility', () => {
    it('should sleep for specified duration', async () => {
      const startTime = Date.now();
      await bedrockClient.sleep(100);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeGreaterThanOrEqual(90);
    });
  });
});