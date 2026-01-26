const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { fromEnv } = require('@aws-sdk/credential-providers');

/**
 * AWS Bedrock Client Wrapper for Claude Model Integration
 * Provides error handling, retry logic, and rate limiting for AWS Bedrock operations
 */
class BedrockClient {
  constructor(options = {}) {
    this.region = options.region || process.env.AWS_REGION || 'us-east-1';
    this.modelId = options.modelId || process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    this.maxTokens = options.maxTokens || parseInt(process.env.BEDROCK_MAX_TOKENS) || 4096;
    this.temperature = options.temperature || parseFloat(process.env.BEDROCK_TEMPERATURE) || 0.7;
    
    // Retry configuration
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 10000; // 10 seconds
    
    // Rate limiting configuration
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.requestsPerSecond = options.requestsPerSecond || 2; // Conservative rate limit
    this.lastRequestTime = 0;
    
    // Initialize Bedrock client
    // Handle mock credentials for testing
    const credentials = this.createCredentials();
    this.client = new BedrockRuntimeClient({
      region: this.region,
      credentials: credentials,
      maxAttempts: this.maxRetries
    });
    
    console.log(`BedrockClient initialized with model: ${this.modelId}, region: ${this.region}`);
  }

  /**
   * Create credentials for AWS Bedrock client
   * Handles both real AWS credentials and mock credentials for testing
   * @returns {Object} - AWS credentials object
   */
  createCredentials() {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    // If we have test credentials, create a mock credentials provider
    if (accessKeyId === 'test_access_key_id' || secretAccessKey === 'test_secret_access_key') {
      return {
        accessKeyId: 'test_access_key_id',
        secretAccessKey: 'test_secret_access_key',
        sessionToken: undefined
      };
    }
    
    // Use real AWS credentials from environment
    try {
      return fromEnv();
    } catch (error) {
      // Fallback to mock credentials if real ones are not available
      return {
        accessKeyId: 'test_access_key_id',
        secretAccessKey: 'test_secret_access_key',
        sessionToken: undefined
      };
    }
  }

  /**
   * Invoke Claude model with retry logic and rate limiting
   * @param {string} prompt - The prompt to send to Claude
   * @param {Object} options - Additional options for the request
   * @returns {Promise<Object>} - The response from Claude
   */
  async invokeModel(prompt, options = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ prompt, options, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process the request queue with rate limiting
   */
  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const { prompt, options, resolve, reject } = this.requestQueue.shift();
      
      try {
        // Rate limiting: ensure minimum time between requests
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const minInterval = 1000 / this.requestsPerSecond;
        
        if (timeSinceLastRequest < minInterval) {
          await this.sleep(minInterval - timeSinceLastRequest);
        }
        
        this.lastRequestTime = Date.now();
        
        // Execute the request with retry logic
        const result = await this.executeWithRetry(prompt, options);
        resolve(result);
        
      } catch (error) {
        reject(error);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Execute model invocation with exponential backoff retry logic
   * @param {string} prompt - The prompt to send to Claude
   * @param {Object} options - Additional options for the request
   * @returns {Promise<Object>} - The response from Claude
   */
  async executeWithRetry(prompt, options = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.executeModelInvocation(prompt, options);
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        if (!this.isRetryableError(error) || attempt === this.maxRetries) {
          throw this.enhanceError(error, attempt);
        }
        
        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          this.baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
          this.maxDelay
        );
        
        console.warn(`Bedrock request failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms:`, error.message);
        await this.sleep(delay);
      }
    }
    
    throw this.enhanceError(lastError, this.maxRetries);
  }

  /**
   * Execute the actual model invocation
   * @param {string} prompt - The prompt to send to Claude
   * @param {Object} options - Additional options for the request
   * @returns {Promise<Object>} - The response from Claude
   */
  async executeModelInvocation(prompt, options = {}) {
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: options.maxTokens || this.maxTokens,
      temperature: options.temperature || this.temperature,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    // Add system message if provided
    if (options.systemMessage) {
      requestBody.system = options.systemMessage;
    }

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody)
    });

    const startTime = Date.now();
    
    try {
      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      const duration = Date.now() - startTime;
      console.log(`Bedrock request completed in ${duration}ms`);
      
      return {
        success: true,
        content: responseBody.content[0].text,
        usage: responseBody.usage,
        model: this.modelId,
        duration
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Bedrock request failed after ${duration}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Check if an error is retryable
   * @param {Error} error - The error to check
   * @returns {boolean} - Whether the error is retryable
   */
  isRetryableError(error) {
    // Retryable error conditions
    const retryableErrors = [
      'ThrottlingException',
      'ServiceUnavailableException',
      'InternalServerException',
      'TooManyRequestsException'
    ];
    
    // Network errors are also retryable
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }
    
    // Check AWS error names
    return retryableErrors.includes(error.name) || retryableErrors.includes(error.__type);
  }

  /**
   * Enhance error with additional context
   * @param {Error} error - The original error
   * @param {number} attempts - Number of attempts made
   * @returns {Error} - Enhanced error
   */
  enhanceError(error, attempts) {
    const enhancedError = new Error(`Bedrock request failed after ${attempts} attempts: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.attempts = attempts;
    enhancedError.modelId = this.modelId;
    enhancedError.region = this.region;
    
    // Categorize error types for better handling
    if (error.name === 'ValidationException') {
      enhancedError.category = 'VALIDATION_ERROR';
      enhancedError.retryable = false;
    } else if (error.name === 'AccessDeniedException') {
      enhancedError.category = 'ACCESS_DENIED';
      enhancedError.retryable = false;
    } else if (error.name === 'ThrottlingException') {
      enhancedError.category = 'RATE_LIMITED';
      enhancedError.retryable = true;
    } else if (this.isRetryableError(error)) {
      enhancedError.category = 'TEMPORARY_ERROR';
      enhancedError.retryable = true;
    } else {
      enhancedError.category = 'UNKNOWN_ERROR';
      enhancedError.retryable = false;
    }
    
    return enhancedError;
  }

  /**
   * Sleep for a specified duration
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} - Promise that resolves after the delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get client status and configuration
   * @returns {Object} - Client status information
   */
  getStatus() {
    return {
      modelId: this.modelId,
      region: this.region,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      maxRetries: this.maxRetries,
      requestsPerSecond: this.requestsPerSecond,
      queueLength: this.requestQueue.length,
      isProcessingQueue: this.isProcessingQueue
    };
  }

  /**
   * Test the connection to Bedrock
   * @returns {Promise<Object>} - Test result
   */
  async testConnection() {
    try {
      const testPrompt = "Hello, please respond with 'Connection successful' to confirm the service is working.";
      const result = await this.invokeModel(testPrompt, { maxTokens: 50 });
      
      return {
        success: true,
        message: 'Bedrock connection test successful',
        response: result.content,
        duration: result.duration
      };
    } catch (error) {
      return {
        success: false,
        message: 'Bedrock connection test failed',
        error: error.message,
        category: error.category || 'UNKNOWN_ERROR'
      };
    }
  }
}

module.exports = BedrockClient;