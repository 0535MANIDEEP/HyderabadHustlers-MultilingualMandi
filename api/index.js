/**
 * HyderabadHustlers — Vercel Serverless Backend
 * MongoDB auth + demo prices/translation/negotiate/RAG.
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mandi_jwt_secret_2026';
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://manideepdaram_bloodbank_admin:HELLO!mani10@bloodbankmanagementsyst.93mzbw3.mongodb.net/hyderabadhustlers?retryWrites=true&w=majority&appName=BloodBankManagementSystem';

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    isConnected = true;
  } catch (e) {
    console.error('MongoDB connection error:', e.message);
  }
}

// ── Mongoose Models ──
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },
  name: { type: String, default: '' },
  role: { type: String, enum: ['farmer', 'buyer', 'admin'], default: 'farmer' },
  language: { type: String, default: 'en' },
  phone: { type: String, default: '' },
}, { timestamps: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

const User = mongoose.models.MandiUser || mongoose.model('MandiUser', UserSchema);

const NegotiationSessionSchema = new mongoose.Schema({
  vendorId: String,
  buyerId: String,
  vendorName: String,
  buyerName: String,
  cropDetails: { name: String, quantity: Number, unit: String, quality: String },
  vendorLanguage: { type: String, default: 'te' },
  buyerLanguage: { type: String, default: 'hi' },
  status: { type: String, default: 'active' },
  currentOffer: { price: Number, by: String },
  messages: [{ senderId: String, senderName: String, text: String, timestamp: Date }],
}, { timestamps: true });

const Negotiation = mongoose.models.MandiNegotiation || mongoose.model('MandiNegotiation', NegotiationSessionSchema);

// ── Helpers ──
const CROPS = ['Tomato', 'Onion', 'Potato', 'Rice', 'Wheat', 'Chilli', 'Turmeric', 'Cotton', 'Maize', 'Groundnut'];
const MARKETS = ['Rythu Bazaar Hyderabad', 'Krishna Market Vijayawada', 'Market Yard Warangal', 'APMC Nizamabad', 'Mandi Secunderabad'];
const PRICES = CROPS.map((crop, i) => ({
  id: `price_${i + 1}`, cropName: crop, market: MARKETS[i % MARKETS.length],
  state: i % 2 === 0 ? 'Telangana' : 'Andhra Pradesh',
  minPrice: 1000 + Math.floor(Math.random() * 2000),
  maxPrice: 3000 + Math.floor(Math.random() * 5000),
  avgPrice: 2000 + Math.floor(Math.random() * 3000),
  unit: 'quintal', quality: ['A', 'B', 'C'][i % 3], source: 'APMC',
  date: new Date().toISOString().split('T')[0], trend: ['up', 'down', 'stable'][i % 3],
}));

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-ID, Accept-Language');
}

function json(res, status, data) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// ── Handler ──
module.exports = async (req, res) => {
  await connectDB();

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(200);
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/^\/api\/v1/, '') || '/';
  const method = req.method;

  // ── Health ──
  if (path === '/health' || path === '/') {
    return json(res, 200, { success: true, status: 'ok', service: 'multilingual-mandi', db: isConnected ? 'connected' : 'disconnected', timestamp: new Date().toISOString() });
  }

  // ── Auth: Register ──
  if (path === '/auth/register' && method === 'POST') {
    const body = await parseBody(req);
    if (!body.username || !body.email || !body.password) {
      return json(res, 400, { success: false, error: 'Username, email, and password required' });
    }
    const exists = await User.findOne({ $or: [{ email: body.email }, { username: body.username }] });
    if (exists) return json(res, 409, { success: false, error: 'User already exists' });

    const user = await User.create({
      username: body.username, email: body.email, password: body.password,
      name: body.name || body.username, role: body.role || 'farmer',
      language: body.language || 'en', phone: body.phone || '',
    });
    const token = signToken(user);
    const { password, ...safe } = user.toObject();
    return json(res, 201, { success: true, data: { user: safe, token, sessionId: `sess_${Date.now()}` } });
  }

  // ── Auth: Login ──
  if (path === '/auth/login' && method === 'POST') {
    const body = await parseBody(req);
    if (!body.username || !body.password) {
      return json(res, 400, { success: false, error: 'Username and password required' });
    }
    const user = await User.findOne({ $or: [{ email: body.username }, { username: body.username }] }).select('+password');
    if (!user) return json(res, 401, { success: false, error: 'Invalid credentials' });

    const match = await user.comparePassword(body.password);
    if (!match) return json(res, 401, { success: false, error: 'Invalid credentials' });

    const token = signToken(user);
    const { password, ...safe } = user.toObject();
    return json(res, 200, { success: true, data: { user: safe, token, sessionId: `sess_${Date.now()}` } });
  }

  // ── Auth: Profile ──
  if (path === '/auth/profile') {
    const decoded = verifyToken(req);
    if (!decoded) return json(res, 401, { success: false, error: 'Not authenticated' });

    if (method === 'GET') {
      const user = await User.findById(decoded.id);
      if (!user) return json(res, 404, { success: false, error: 'User not found' });
      return json(res, 200, { success: true, data: user });
    }
    if (method === 'PUT') {
      const body = await parseBody(req);
      const user = await User.findByIdAndUpdate(decoded.id, body, { new: true });
      return json(res, 200, { success: true, data: user });
    }
  }

  // ── Auth: Logout ──
  if (path === '/auth/logout' && method === 'POST') {
    return json(res, 200, { success: true, message: 'Logged out' });
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
    return json(res, 200, { success: true, data: { prices: result, suggestions: ['Try Tomato, Onion, or Rice', 'Filter by market'], fairPriceRange: { min: 1500, max: 4500 } } });
  }

  if (path.startsWith('/prices/analytics/') && method === 'GET') {
    const crop = path.split('/prices/analytics/')[1];
    const s = PRICES.find((p) => p.cropName.toLowerCase() === crop.toLowerCase()) || PRICES[0];
    return json(res, 200, { success: true, cropName: s.cropName, statistics: { min: s.minPrice, max: s.maxPrice, avg: s.avgPrice, median: s.avgPrice - 200 }, trendAnalysis: { direction: s.trend, percentage: s.trend === 'up' ? 5.2 : s.trend === 'down' ? -3.1 : 0.1 }, fairPriceRange: { min: s.minPrice + 200, max: s.maxPrice - 200 }, recommendations: [`Fair price for ${s.cropName} is ₹${s.avgPrice}/quintal`], lastUpdated: new Date().toISOString() });
  }

  if (path.startsWith('/prices/fair-range/') && method === 'GET') {
    const crop = path.split('/prices/fair-range/')[1];
    const s = PRICES.find((p) => p.cropName.toLowerCase() === crop.toLowerCase()) || PRICES[0];
    return json(res, 200, { success: true, cropName: s.cropName, fairPriceRange: { min: s.minPrice + 200, max: s.maxPrice - 200 }, recommendations: [`Target: ₹${s.avgPrice}/quintal`], lastUpdated: new Date().toISOString() });
  }

  // ── Translate ──
  if (path === '/translate' && method === 'POST') {
    const body = await parseBody(req);
    const dict = { te: { Hello: 'నమస్కారం', Price: 'ధర' }, hi: { Hello: 'नमस्ते', Price: 'कीमत' }, ta: { Hello: 'வணக்கம்', Price: 'விலை' } };
    const lang = body.targetLanguage || body.target || 'te';
    const text = body.text || body.source || '';
    return json(res, 200, { success: true, data: { original: text, translated: (dict[lang] || dict.te)[text] || `${text} (${lang})`, sourceLanguage: 'en', targetLanguage: lang } });
  }

  if (path === '/translate/detect' && method === 'POST') {
    return json(res, 200, { success: true, data: { language: 'en', confidence: 0.95 } });
  }

  if (path === '/translate/detect-language' && method === 'POST') {
    return json(res, 200, { success: true, data: { language: 'en', confidence: 0.95 } });
  }

  // ── Negotiate ──
  if (path === '/negotiate/session' && method === 'POST') {
    const decoded = verifyToken(req);
    const body = await parseBody(req);
    const session = await Negotiation.create({
      vendorId: body.vendorId || decoded?.id || 'demo',
      buyerId: body.buyerId || 'demo_buyer',
      vendorName: body.vendorName || 'Farmer',
      buyerName: body.buyerName || 'Buyer',
      cropDetails: body.cropDetails || { name: 'Tomato', quantity: 100, unit: 'kg', quality: 'A' },
      vendorLanguage: body.vendorLanguage || 'te',
      buyerLanguage: body.buyerLanguage || 'hi',
      currentOffer: { price: 3500, by: 'vendor' },
      messages: [
        { senderId: 'vendor', senderName: 'Farmer', text: 'Tomato quality A, ₹3500/quintal', timestamp: new Date() },
        { senderId: 'buyer', senderName: 'Buyer', text: 'Can we do ₹3000?', timestamp: new Date() },
      ],
    });
    return json(res, 201, { success: true, data: session });
  }

  if (path.startsWith('/negotiate/session/') && method === 'GET') {
    const sid = path.split('/negotiate/session/')[1];
    const session = await Negotiation.findById(sid);
    if (!session) return json(res, 404, { success: false, error: 'Session not found' });
    return json(res, 200, { success: true, data: session });
  }

  if (path === '/negotiate/stats' && method === 'GET') {
    const total = await Negotiation.countDocuments();
    const active = await Negotiation.countDocuments({ status: 'active' });
    return json(res, 200, { success: true, data: { activeSessions: active, totalSessions: total, averageSessionDuration: 420, successRate: 78.5 } });
  }

  // ── RAG ──
  if (path === '/rag/query' && method === 'POST') {
    const body = await parseBody(req);
    const q = (body.text || '').toLowerCase();
    let answer = 'Check current market prices before making a decision.';
    let sources = ['APMC Price Database', 'Historical Trend Analysis'];
    if (q.includes('price') || q.includes('rate')) {
      answer = 'Current tomato prices range from ₹2,500 to ₹4,500/quintal. Trend is upward this week.';
      sources.push('Real-time Market Feed');
    } else if (q.includes('negotiat')) {
      answer = 'Start at 80% of market average and consider quality, quantity, and transport costs.';
      sources.push('Negotiation Best Practices Guide');
    }
    return json(res, 200, { success: true, data: { response: answer, sources, confidence: 0.85 } });
  }

  if (path === '/rag/analyze-intent' && method === 'POST') {
    return json(res, 200, { success: true, data: { intent: 'price_inquiry', confidence: 0.9, entities: [{ type: 'crop', value: 'tomato' }] } });
  }

  // ── Monitoring ──
  if (path === '/monitoring' && method === 'GET') {
    const total = await Negotiation.countDocuments();
    return json(res, 200, { success: true, data: { transactions: { total: total * 10 + 156, today: 12, successRate: 94.2 }, audit: { totalEvents: 423, last24h: 34 }, performance: { avgResponseTime: 145, p95ResponseTime: 312 }, system: { uptime: '7d 14h', memoryUsage: '62%', cpuUsage: '23%' } } });
  }

  // ── Fallback ──
  return json(res, 404, { success: false, error: 'Not found', path });
};
