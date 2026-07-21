/**
 * HyderabadHustlers — Vercel Serverless Backend (Demo Mode)
 * Self-contained demo API with no external dependencies (no Redis, no DB).
 * Covers: auth, prices, translation, negotiation, RAG, monitoring.
 */
const crypto = require('crypto');

const DEMO_USERS = [
  { id: '1', username: 'demo_farmer', email: 'farmer@demo.com', password: 'demo123', role: 'farmer', language: 'te', name: 'Ravi Kumar' },
  { id: '2', username: 'demo_buyer', email: 'buyer@demo.com', password: 'demo123', role: 'buyer', language: 'hi', name: 'Suresh Reddy' },
  { id: '3', username: 'demo_admin', email: 'admin@demo.com', password: 'demo123', role: 'admin', language: 'en', name: 'Admin User' },
];

const CROPS = ['Tomato', 'Onion', 'Potato', 'Rice', 'Wheat', 'Chilli', 'Turmeric', 'Cotton', 'Maize', 'Groundnut'];
const MARKETS = ['Rythu Bazaar Hyderabad', 'Krishna Market Vijayawada', 'Market Yard Warangal', 'APMC Nizamabad', 'Mandi Secunderabad'];

const PRICES = CROPS.map((crop, i) => ({
  id: `price_${i + 1}`,
  cropName: crop,
  market: MARKETS[i % MARKETS.length],
  state: i % 2 === 0 ? 'Telangana' : 'Andhra Pradesh',
  minPrice: 1000 + Math.floor(Math.random() * 2000),
  maxPrice: 3000 + Math.floor(Math.random() * 5000),
  avgPrice: 2000 + Math.floor(Math.random() * 3000),
  unit: 'quintal',
  quality: ['A', 'B', 'C'][i % 3],
  source: 'APMC',
  date: new Date().toISOString().split('T')[0],
  trend: ['up', 'down', 'stable'][i % 3],
}));

const TOKEN_STORE = new Map();
const SESSION_STORE = new Map();

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-ID, Accept-Language',
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function getUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  return TOKEN_STORE.get(token) || null;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-ID, Accept-Language',
    });
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/^\/api\/v1/, '') || '/';
  const method = req.method;

  // ── Health ──
  if (path === '/health' || path === '/') {
    return json(res, 200, { success: true, status: 'ok', service: 'multilingual-mandi', mode: 'demo', timestamp: new Date().toISOString() });
  }

  // ── Auth ──
  if (path === '/auth/register' && method === 'POST') {
    const body = await parseBody(req);
    const user = { id: crypto.randomUUID(), username: body.username, email: body.email, role: 'farmer', language: body.language || 'en', name: body.username };
    const token = crypto.randomUUID();
    TOKEN_STORE.set(token, user);
    return json(res, 201, { success: true, data: { user, token, sessionId: crypto.randomUUID() } });
  }

  if (path === '/auth/login' && method === 'POST') {
    const body = await parseBody(req);
    const user = DEMO_USERS.find((u) => (u.username === body.username || u.email === body.username) && u.password === body.password);
    if (!user) return json(res, 401, { success: false, error: 'Invalid credentials' });
    const token = crypto.randomUUID();
    const { password, ...safe } = user;
    TOKEN_STORE.set(token, safe);
    return json(res, 200, { success: true, data: { user: safe, token, sessionId: crypto.randomUUID() } });
  }

  if (path === '/auth/logout' && method === 'POST') {
    const user = getUser(req);
    if (user) { for (const [k, v] of TOKEN_STORE) { if (v.id === user.id) TOKEN_STORE.delete(k); } }
    return json(res, 200, { success: true, message: 'Logged out' });
  }

  if (path === '/auth/profile') {
    const user = getUser(req);
    if (!user) return json(res, 401, { success: false, error: 'Not authenticated' });
    if (method === 'GET') return json(res, 200, { success: true, data: user });
    if (method === 'PUT') {
      const body = await parseBody(req);
      Object.assign(user, body);
      return json(res, 200, { success: true, data: user });
    }
  }

  // ── Prices ──
  if (path === '/prices' && method === 'GET') {
    const crop = url.searchParams.get('crop');
    const market = url.searchParams.get('market');
    let result = [...PRICES];
    if (crop) result = result.filter((p) => p.cropName.toLowerCase().includes(crop.toLowerCase()));
    if (market) result = result.filter((p) => p.market.toLowerCase().includes(market.toLowerCase()));
    return json(res, 200, { success: true, data: result, count: result.length });
  }

  if (path === '/prices/query' && method === 'POST') {
    const body = await parseBody(req);
    const crop = body.text || body.crop || '';
    let result = PRICES.filter((p) => p.cropName.toLowerCase().includes(crop.toLowerCase()));
    if (!result.length) result = PRICES.slice(0, 3);
    return json(res, 200, {
      success: true,
      data: { prices: result, suggestions: ['Try searching for Tomato, Onion, or Rice', 'Filter by market for local prices'], fairPriceRange: { min: 1500, max: 4500 } },
    });
  }

  if (path.startsWith('/prices/analytics/') && method === 'GET') {
    const crop = path.split('/prices/analytics/')[1];
    const found = PRICES.filter((p) => p.cropName.toLowerCase() === crop.toLowerCase());
    const stats = found.length ? found[0] : PRICES[0];
    return json(res, 200, {
      success: true, cropName: stats.cropName,
      statistics: { min: stats.minPrice, max: stats.maxPrice, avg: stats.avgPrice, median: stats.avgPrice - 200 },
      trendAnalysis: { direction: stats.trend, percentage: stats.trend === 'up' ? 5.2 : stats.trend === 'down' ? -3.1 : 0.1 },
      fairPriceRange: { min: stats.minPrice + 200, max: stats.maxPrice - 200 },
      recommendations: [`Fair price for ${stats.cropName} is ₹${stats.avgPrice}/quintal`, `Trend: ${stats.trend}`],
      lastUpdated: new Date().toISOString(),
    });
  }

  if (path.startsWith('/prices/fair-range/') && method === 'GET') {
    const crop = path.split('/prices/fair-range/')[1];
    const found = PRICES.find((p) => p.cropName.toLowerCase() === crop.toLowerCase()) || PRICES[0];
    return json(res, 200, { success: true, cropName: found.cropName, fairPriceRange: { min: found.minPrice + 200, max: found.maxPrice - 200 }, recommendations: [`Target price: ₹${found.avgPrice}/quintal`], lastUpdated: new Date().toISOString() });
  }

  // ── Translate ──
  if (path === '/translate' && method === 'POST') {
    const body = await parseBody(req);
    const translations = {
      te: { 'Hello': 'నమస్కారం', 'Good morning': 'శుభోదయం', 'Thank you': 'ధన్యవాదాలు', 'Price': 'ధర' },
      hi: { 'Hello': 'नमस्ते', 'Good morning': 'सुप्रभात', 'Thank you': 'धन्यवाद', 'Price': 'कीमत' },
      ta: { 'Hello': 'வணக்கம்', 'Good morning': 'காலை வணக்கம்', 'Thank you': 'நன்றி', 'Price': 'விலை' },
    };
    const lang = body.targetLanguage || body.target || 'te';
    const dict = translations[lang] || translations.te;
    const text = body.text || body.source || '';
    return json(res, 200, { success: true, data: { original: text, translated: dict[text] || `${text} (${lang})`, sourceLanguage: 'en', targetLanguage: lang } });
  }

  if (path === '/translate/detect' && method === 'POST') {
    return json(res, 200, { success: true, data: { language: 'en', confidence: 0.95 } });
  }

  if (path === '/translate/detect-language' && method === 'POST') {
    return json(res, 200, { success: true, data: { language: 'en', confidence: 0.95 } });
  }

  // ── Negotiate ──
  if (path === '/negotiate/session' && method === 'POST') {
    const body = await parseBody(req);
    const session = {
      sessionId: crypto.randomUUID(),
      vendorId: body.vendorId || 'demo_farmer',
      buyerId: body.buyerId || 'demo_buyer',
      cropDetails: body.cropDetails || { name: 'Tomato', quantity: 100, unit: 'kg', quality: 'A' },
      status: 'active',
      currentOffer: { price: 3500, by: 'vendor' },
      messages: [
        { by: 'vendor', text: 'Tomato quality A, ₹3500/quintal', ts: new Date().toISOString() },
        { by: 'buyer', text: 'Can we do ₹3000?', ts: new Date().toISOString() },
      ],
      createdAt: new Date().toISOString(),
    };
    SESSION_STORE.set(session.sessionId, session);
    return json(res, 201, { success: true, data: session });
  }

  if (path.startsWith('/negotiate/session/') && method === 'GET') {
    const sid = path.split('/negotiate/session/')[1];
    const session = SESSION_STORE.get(sid);
    if (!session) return json(res, 404, { success: false, error: 'Session not found' });
    return json(res, 200, { success: true, data: session });
  }

  if (path === '/negotiate/stats' && method === 'GET') {
    return json(res, 200, { success: true, data: { activeSessions: SESSION_STORE.size, totalSessions: SESSION_STORE.size + 12, averageSessionDuration: 420, successRate: 78.5 } });
  }

  // ── RAG ──
  if (path === '/rag/query' && method === 'POST') {
    const body = await parseBody(req);
    const q = (body.text || '').toLowerCase();
    let answer = 'Based on our analysis, the recommended action is to check current market prices before making a decision.';
    let sources = ['APMC Price Database', 'Historical Trend Analysis'];
    if (q.includes('price') || q.includes('rate')) {
      answer = 'Current tomato prices range from ₹2,500 to ₹4,500 per quintal depending on quality and market. Trend is upward this week.';
      sources.push('Real-time Market Feed');
    } else if (q.includes('negotiat')) {
      answer = 'For fair negotiation, start at 80% of market average and consider quality, quantity, and transport costs. Both parties should feel they got a good deal.';
      sources.push('Negotiation Best Practices Guide');
    }
    return json(res, 200, { success: true, data: { response: answer, sources, confidence: 0.85 } });
  }

  if (path === '/rag/analyze-intent' && method === 'POST') {
    return json(res, 200, { success: true, data: { intent: 'price_inquiry', confidence: 0.9, entities: [{ type: 'crop', value: 'tomato' }] } });
  }

  // ── Monitoring ──
  if (path === '/monitoring' && method === 'GET') {
    return json(res, 200, {
      success: true,
      data: {
        transactions: { total: 156, today: 12, successRate: 94.2 },
        audit: { totalEvents: 423, last24h: 34 },
        performance: { avgResponseTime: 145, p95ResponseTime: 312 },
        system: { uptime: '7d 14h', memoryUsage: '62%', cpuUsage: '23%' },
      },
    });
  }

  // ── Fallback ──
  return json(res, 404, { success: false, error: 'Not found', path });
};
