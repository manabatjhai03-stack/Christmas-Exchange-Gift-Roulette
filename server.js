require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');

const { pool } = require('./lib/db');
const { attachCsrf } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const participantRoutes = require('./routes/participants');
const adminRoutes = require('./routes/admin');
const drawRoutes = require('./routes/draw');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (process.env.TRUST_PROXY === '1' || isProd) {
  app.set('trust proxy', 1);
}

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
  console.error('SESSION_SECRET must be set to a long random string.');
  process.exit(1);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    name: 'christmas.sid',
    secret: process.env.SESSION_SECRET,
    store: new pgSession({
      pool,
      tableName: 'session',
      createTableIfMissing: false
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);

app.use('/api', attachCsrf);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 8 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes.' }
});

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait and try again.' }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/admin/login', loginLimiter);
app.use('/api/participant/login', loginLimiter);
app.use('/api/admin/setup', loginLimiter);
app.use('/api/admin/finalize', sensitiveLimiter);
app.use('/api/admin/reset', sensitiveLimiter);

app.use('/api', authRoutes);
app.use('/api/admin/participants', participantRoutes);
app.use('/api', drawRoutes);
app.use('/api/admin', adminRoutes);

app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    index: 'index.html'
  })
);

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.use((err, _req, res, _next) => {
  const status = err.status || 500;

  console.error("Server error:", err);

  res.status(status).json({
    error:
      status >= 500
        ? "Something went wrong. Please try again."
        : err.message
  });
});

app.listen(PORT, () => {
  console.log(`Christmas roulette listening on port ${PORT}`);
});

