/**
 * AWS Lambda handler for Multilingual Mandi Backend
 * Serverless entry point for the Express.js application
 */

const serverlessExpress = require('@vendia/serverless-express');
const { app } = require('../server/app');

// Create serverless express handler
const handler = serverlessExpress({ app });

module.exports = { handler };