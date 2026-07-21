module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  res.status(200).json({
    status: 'ok',
    service: 'multilingual-mandi-backend',
    message: 'Frontend is live. Full backend requires Docker/Redis.',
    timestamp: new Date().toISOString(),
  });
};
