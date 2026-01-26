/**
 * Example usage of BedrockClient
 * This file demonstrates how to use the BedrockClient for translation tasks
 */

const BedrockClient = require('./BedrockClient');
const { TranslationRequest, TranslationResponse } = require('../models/TranslationModels');

/**
 * Example: Basic translation using BedrockClient
 */
async function basicTranslationExample() {
  console.log('=== Basic Translation Example ===');
  
  try {
    // Initialize the Bedrock client
    const bedrockClient = new BedrockClient({
      region: 'us-east-1',
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      maxRetries: 3,
      requestsPerSecond: 2
    });

    // Test connection first
    console.log('Testing connection...');
    const connectionTest = await bedrockClient.testConnection();
    console.log('Connection test result:', connectionTest);

    if (!connectionTest.success) {
      console.error('Connection test failed, aborting example');
      return;
    }

    // Create a translation request
    const translationRequest = new TranslationRequest({
      sourceText: 'Hello, how are you today?',
      sourceLang: 'en',
      targetLang: 'hi',
      context: 'general'
    });

    // Validate the request
    const validation = translationRequest.validate();
    if (!validation.isValid) {
      console.error('Invalid translation request:', validation.errors);
      return;
    }

    console.log('Translation request:', translationRequest.toJSON());

    // Create a prompt for Claude to translate
    const prompt = createTranslationPrompt(translationRequest);
    console.log('Generated prompt:', prompt);

    // Invoke the model
    const startTime = Date.now();
    const result = await bedrockClient.invokeModel(prompt, {
      maxTokens: 1000,
      temperature: 0.3
    });
    const processingTime = Date.now() - startTime;

    console.log('Raw Bedrock response:', result);

    // Parse the translation from Claude's response
    const translatedText = parseTranslationResponse(result.content);
    
    // Create a translation response
    const translationResponse = TranslationResponse.success(
      translationRequest,
      translatedText,
      {
        confidence: 0.95, // In a real implementation, this would be calculated
        processingTime,
        model: result.model,
        preservedTerms: [] // Would be populated by terminology preservation logic
      }
    );

    console.log('Translation response:', translationResponse.toJSON());
    console.log('Summary:', translationResponse.getSummary());

  } catch (error) {
    console.error('Translation example failed:', error);
    
    // Create error response
    const errorResponse = TranslationResponse.error(
      new TranslationRequest({
        sourceText: 'Hello, how are you today?',
        sourceLang: 'en',
        targetLang: 'hi'
      }),
      error
    );
    
    console.log('Error response:', errorResponse.toJSON());
  }
}

/**
 * Example: Batch translation processing
 */
async function batchTranslationExample() {
  console.log('\n=== Batch Translation Example ===');
  
  try {
    const bedrockClient = new BedrockClient();
    
    const requests = [
      { sourceText: 'Good morning', sourceLang: 'en', targetLang: 'hi' },
      { sourceText: 'Thank you', sourceLang: 'en', targetLang: 'te' },
      { sourceText: 'How much does this cost?', sourceLang: 'en', targetLang: 'ta', context: 'price_query' }
    ];

    console.log('Processing batch of', requests.length, 'translations...');

    const results = [];
    for (const requestData of requests) {
      const request = new TranslationRequest(requestData);
      const validation = request.validate();
      
      if (!validation.isValid) {
        console.error('Invalid request:', validation.errors);
        continue;
      }

      try {
        const prompt = createTranslationPrompt(request);
        const result = await bedrockClient.invokeModel(prompt, { maxTokens: 500 });
        const translatedText = parseTranslationResponse(result.content);
        
        const response = TranslationResponse.success(request, translatedText, {
          processingTime: result.duration,
          model: result.model
        });
        
        results.push(response);
        console.log(`✓ Translated "${request.sourceText}" to ${request.targetLang}: "${translatedText}"`);
        
      } catch (error) {
        const errorResponse = TranslationResponse.error(request, error);
        results.push(errorResponse);
        console.error(`✗ Failed to translate "${request.sourceText}":`, error.message);
      }
    }

    console.log('\nBatch processing complete. Results:');
    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.getSummary()}`);
    });

  } catch (error) {
    console.error('Batch translation example failed:', error);
  }
}

/**
 * Example: Error handling and retry scenarios
 */
async function errorHandlingExample() {
  console.log('\n=== Error Handling Example ===');
  
  try {
    // Create client with aggressive rate limiting to trigger throttling
    const bedrockClient = new BedrockClient({
      requestsPerSecond: 10, // This might trigger rate limiting
      maxRetries: 2
    });

    const request = new TranslationRequest({
      sourceText: 'This is a test for error handling',
      sourceLang: 'en',
      targetLang: 'hi'
    });

    // Make multiple rapid requests to potentially trigger rate limiting
    const promises = Array(5).fill(null).map((_, index) => 
      bedrockClient.invokeModel(
        createTranslationPrompt(request),
        { maxTokens: 100 }
      ).catch(error => ({
        error: true,
        message: error.message,
        category: error.category,
        retryable: error.retryable,
        index
      }))
    );

    const results = await Promise.all(promises);
    
    console.log('Results from rapid requests:');
    results.forEach((result, index) => {
      if (result.error) {
        console.log(`Request ${index + 1}: ERROR - ${result.message} (${result.category}, retryable: ${result.retryable})`);
      } else {
        console.log(`Request ${index + 1}: SUCCESS - ${result.content.substring(0, 50)}...`);
      }
    });

  } catch (error) {
    console.error('Error handling example failed:', error);
  }
}

/**
 * Create a translation prompt for Claude
 * @param {TranslationRequest} request - The translation request
 * @returns {string} - The formatted prompt
 */
function createTranslationPrompt(request) {
  const languageNames = {
    'en': 'English',
    'hi': 'Hindi',
    'te': 'Telugu',
    'ta': 'Tamil'
  };

  const contextInstructions = {
    'general': 'Translate naturally and conversationally.',
    'price_query': 'This is related to pricing or market inquiries. Preserve any numerical values and units.',
    'negotiation': 'This is part of a business negotiation. Maintain a professional and respectful tone.',
    'agricultural': 'This relates to agriculture or farming. Preserve technical agricultural terms when possible.'
  };

  const sourceLangName = languageNames[request.sourceLang];
  const targetLangName = languageNames[request.targetLang];
  const contextInstruction = contextInstructions[request.context] || contextInstructions['general'];

  return `You are a professional translator specializing in Indian languages and agricultural commerce.

Task: Translate the following text from ${sourceLangName} to ${targetLangName}.

Context: ${request.context}
Instructions: ${contextInstruction}

${request.preserveTerminology ? 'Important: Preserve agricultural and commercial terminology where appropriate. If a term has a specific meaning in the agricultural context, maintain its accuracy.' : ''}

Text to translate: "${request.sourceText}"

Please provide only the translation without any additional explanation or commentary.`;
}

/**
 * Parse translation response from Claude
 * @param {string} response - Claude's response
 * @returns {string} - Extracted translation
 */
function parseTranslationResponse(response) {
  // In a real implementation, this would be more sophisticated
  // and might handle various response formats from Claude
  return response.trim();
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('BedrockClient Examples');
  console.log('=====================');
  
  // Check if AWS credentials are configured
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.log('⚠️  AWS credentials not found in environment variables.');
    console.log('   Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to run these examples.');
    console.log('   These examples will demonstrate the API structure but won\'t make actual AWS calls.');
    console.log('');
  }

  await basicTranslationExample();
  await batchTranslationExample();
  await errorHandlingExample();
  
  console.log('\n=== Examples Complete ===');
}

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

module.exports = {
  basicTranslationExample,
  batchTranslationExample,
  errorHandlingExample,
  createTranslationPrompt,
  parseTranslationResponse
};