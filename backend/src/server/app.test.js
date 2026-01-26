const request = require('supertest');
const { app } = require('./app');

describe('Express App', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('service', 'multilingual-mandi-backend');
    });
  });

  describe('GET /api/v1/translate/languages', () => {
    it('should return supported languages', async () => {
      const response = await request(app)
        .get('/api/v1/translate/languages')
        .expect(200);

      expect(response.body).toHaveProperty('supported');
      expect(response.body.supported).toContain('hi');
      expect(response.body.supported).toContain('te');
      expect(response.body.supported).toContain('ta');
      expect(response.body.supported).toContain('en');
    });
  });

  describe('404 handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown-route')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Route not found');
    });
  });
});