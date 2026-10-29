const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../lib/db');
const { lookupHash, verifySecret, hashSecret, normalizeCode } = require('../lib/crypto-utils');
const { ensureCsrfToken, requireCsrf } = require('../middleware/auth');

const router = express.Router();

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.get('/csrf', (req, res) => {
  res.json({ csrfToken: ensureCsrfToken(req) });
});

router.get('/public/event', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT name, event_date, draw_status
       FROM events
       ORDER BY created_at ASC
       LIMIT 1`
    );
    if (!rows.length) {
      return res.json({ name: 'Christmas Exchange Gift', eventDate: null, drawStatus: 'draft' });
    }
    const event = rows[0];
    res.json({
      name: event.name,
      eventDate: event.event_date,
      drawStatus: event.draw_status
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/setup', requireCsrf, async (req, res, next) => {
  try {
    const setupToken = process.env.ADMIN_SETUP_TOKEN || '';
    if (!setupToken) {
      return res.status(403).json({ error: 'Admin setup is disabled. Use npm run create-admin instead.' });
    }
    const provided = String(req.body?.setupToken || '');
    if (provided.length !== setupToken.length || !require('crypto').timingSafeEqual(Buffer.from(provided), Buffer.from(setupToken))) {
      return res.status(403).json({ error: 'Invalid setup token.' });
    }

    const existing = await query('SELECT id FROM admins LIMIT 1');
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An admin account already exists.' });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!isValidEmail(email) || password.length < 12) {
      return res.status(400).json({ error: 'Use a valid email and a password of at least 12 characters.' });
    }

    const passwordHash = await hashSecret(password);
    const inserted = await query(
      'INSERT INTO admins (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );
    req.session.adminId = inserted.rows[0].id;
    req.session.participantId = undefined;
    res.status(201).json({ id: inserted.rows[0].id, email: inserted.rows[0].email });
  } catch (err) {
    next(err);
  }
});


router.post('/admin/login', requireCsrf, async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const { rows } = await query(
      'SELECT id, email, password_hash FROM admins WHERE email = $1',
      [email]
    );

    const admin = rows[0];
    const ok = await verifySecret(
      password,
      admin ? admin.password_hash : DUMMY_HASH
    );

    if (!admin || !ok) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.adminId = admin.id;
      const csrfToken = ensureCsrfToken(req);

      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);

        res.json({
          id: admin.id,
          email: admin.email,
          csrfToken
        });
      });
    });
  } catch (err) {
    next(err);
  }
});


router.post('/admin/logout', requireCsrf, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('christmas.sid');
    res.json({ ok: true });
  });
});

router.get('/admin/me', async (req, res, next) => {
  try {
    if (!req.session.adminId) {
      return res.status(401).json({ error: 'Admin sign-in required.' });
    }
    const { rows } = await query('SELECT id, email FROM admins WHERE id = $1', [req.session.adminId]);
    if (!rows.length) {
      req.session.adminId = undefined;
      return res.status(401).json({ error: 'Admin sign-in required.' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/participant/login', requireCsrf, async (req, res, next) => {
  try {
    const code = normalizeCode(req.body?.accessCode);
    if (code.length < 8) {
      return res.status(401).json({ error: 'Invalid access code.' });
    }

    const digest = lookupHash(code);
    const { rows } = await query(
      `SELECT p.id, p.display_name, p.attendance, p.event_id, c.access_code_hash
       FROM participant_credentials c
       JOIN participants p ON p.id = c.participant_id
       WHERE c.lookup_hash = $1`,
      [digest]
    );
    const row = rows[0];
    const ok = await verifySecret(code, row ? row.access_code_hash : DUMMY_HASH);
    if (!row || !ok) {
      return res.status(401).json({ error: 'Invalid access code.' });
    }

    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.participantId = row.id;
      ensureCsrfToken(req);
      res.json({
        id: row.id,
        displayName: row.display_name,
        attendance: row.attendance
      });
    });
  } catch (err) {
    next(err);
  }
});

router.post('/participant/logout', requireCsrf, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('christmas.sid');
    res.json({ ok: true });
  });
});

router.get('/participant/me', async (req, res, next) => {
  try {
    if (!req.session.participantId) {
      return res.status(401).json({ error: 'Access code sign-in required.' });
    }
    const { rows } = await query(
      `SELECT p.id, p.display_name, p.attendance, e.draw_status, e.name AS event_name, e.event_date
       FROM participants p
       JOIN events e ON e.id = p.event_id
       WHERE p.id = $1`,
      [req.session.participantId]
    );
    if (!rows.length) {
      req.session.participantId = undefined;
      return res.status(401).json({ error: 'Access code sign-in required.' });
    }
    const p = rows[0];
    const eligible = p.attendance === 'confirmed' && p.draw_status === 'finalized';
    res.json({
      id: p.id,
      displayName: p.display_name,
      attendance: p.attendance,
      drawStatus: p.draw_status,
      eventName: p.event_name,
      eventDate: p.event_date,
      canSpin: eligible
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
