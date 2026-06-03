const fs = require('fs');
const http = require('http');
const path = require('path');
const { MongoClient } = require('mongodb');

loadEnv();

const PORT = Number(process.env.PORT || (process.env.RENDER ? 10000 : 5400));
const HOST = process.env.HOST || '0.0.0.0';
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'timekeeper';
const COLLECTION_NAME = process.env.MONGODB_COLLECTION || 'dashboard_data';
const ALLOWED_ORIGINS = parseOrigins(process.env.ALLOWED_ORIGINS);
const PUBLIC_DIR = __dirname;
const STATIC_PREFIXES = ['/css/', '/js/'];
const DATA_KEYS = ['sessions', 'events', 'projects', 'meetings'];
const DATA_KEY_SET = new Set(DATA_KEYS);

let collection;

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const eq = trimmed.indexOf('=');
    if (eq === -1) return;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  });
}

function parseOrigins(value) {
  return new Set(String(value || '').split(',').map((origin) => {
    const trimmed = origin.trim();
    if (!trimmed || trimmed === '*') return trimmed;

    try {
      return new URL(trimmed).origin;
    } catch (err) {
      return trimmed.replace(/\/+$/, '');
    }
  }).filter(Boolean));
}

function hasMongoPlaceholder(uri) {
  return /<[^>]+>|YOUR_|your-|cluster-host|db_user|db_password|app_name/i.test(uri);
}

function isTlsHandshakeError(err) {
  return /tlsv1 alert internal error|SSL routines|ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR/i.test(String(err && err.message));
}

function sameOrigin(req, origin) {
  if (!origin || !req.headers.host) return false;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || 'http';
  return origin === `${protocol}://${req.headers.host}`;
}

function isAllowedOrigin(req, origin) {
  return sameOrigin(req, origin) || ALLOWED_ORIGINS.has('*') || ALLOWED_ORIGINS.has(origin);
}

function responseHeaders(req, headers = {}) {
  const origin = req.headers.origin;
  const nextHeaders = { ...headers };

  if (origin && isAllowedOrigin(req, origin)) {
    nextHeaders['Access-Control-Allow-Origin'] = origin;
    nextHeaders['Access-Control-Allow-Methods'] = 'GET, PUT, OPTIONS';
    nextHeaders['Access-Control-Allow-Headers'] = 'Content-Type';
    nextHeaders.Vary = 'Origin';
  }

  return nextHeaders;
}

async function connectDatabase() {
  if (!MONGODB_URI) {
    throw new Error('Missing MONGODB_URI. Copy .env.example to .env and add your MongoDB connection string.');
  }

  if (hasMongoPlaceholder(MONGODB_URI)) {
    throw new Error('MONGODB_URI still has placeholders. In Render, replace it with the full MongoDB Atlas connection string from Atlas Database > Connect > Drivers.');
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  collection = client.db(DB_NAME).collection(COLLECTION_NAME);
  await collection.createIndex({ key: 1 }, { unique: true });
}

function json(req, res, statusCode, payload) {
  res.writeHead(statusCode, responseHeaders(req, {
    'Content-Type': 'application/json'
  }));
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

async function allData() {
  const docs = await collection.find({ key: { $in: DATA_KEYS } }).toArray();
  const data = DATA_KEYS.reduce((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});

  docs.forEach((doc) => {
    if (DATA_KEY_SET.has(doc.key) && Array.isArray(doc.items)) data[doc.key] = doc.items;
  });

  return data;
}

async function saveData(key, items) {
  await collection.updateOne(
    { key },
    { $set: { key, items, updatedAt: new Date() } },
    { upsert: true }
  );
}

async function handleApi(req, res, pathname) {
  if (req.headers.origin && !isAllowedOrigin(req, req.headers.origin)) {
    json(req, res, 403, { error: 'Origin not allowed' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, responseHeaders(req));
    res.end();
    return;
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    json(req, res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/data' && req.method === 'GET') {
    json(req, res, 200, await allData());
    return;
  }

  const match = pathname.match(/^\/api\/data\/([a-z]+)$/);
  if (match && req.method === 'PUT') {
    const key = match[1];
    if (!DATA_KEY_SET.has(key)) {
      json(req, res, 404, { error: 'Unknown data key' });
      return;
    }

    const items = await readBody(req);
    if (!Array.isArray(items)) {
      json(req, res, 400, { error: 'Expected an array' });
      return;
    }

    await saveData(key, items);
    json(req, res, 200, { ok: true });
    return;
  }

  json(req, res, 404, { error: 'Not found' });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.css': 'text/css',
    '.html': 'text/html',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml'
  }[ext] || 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  const requestPath = pathname === '/' ? '/index.html' : pathname;

  if (requestPath !== '/index.html' && !STATIC_PREFIXES.some((prefix) => requestPath.startsWith(prefix))) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));
  const relativePath = path.relative(PUBLIC_DIR, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(content);
  });
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname);
      return;
    }

    serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (err) {
    console.error(err);
    json(req, res, 500, { error: 'Server error' });
  }
}

connectDatabase().then(() => {
  http.createServer(handleRequest).listen(PORT, HOST, () => {
    console.log(`Timekeeper running at ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
    console.log(`MongoDB database: ${DB_NAME}.${COLLECTION_NAME}`);
  });
}).catch((err) => {
  console.error(err.message);
  if (isTlsHandshakeError(err)) {
    console.error('MongoDB TLS handshake failed. Verify MongoDB Atlas Network Access allows this Render service outbound IP range, then redeploy.');
  }
  process.exit(1);
});
