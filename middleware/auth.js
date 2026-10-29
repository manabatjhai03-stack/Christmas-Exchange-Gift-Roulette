const { randomToken, timingSafeEqualString } = require('../lib/crypto-utils');

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomToken(24);
  }
  return req.session.csrfToken;
}

function attachCsrf(req, res, next) {
  ensureCsrfToken(req);
  next();
}

function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  const header = req.get('X-CSRF-Token') || '';
  const expected = req.session.csrfToken || '';
  if (!expected || !timingSafeEqualString(header, expected)) {
    return res.status(403).json({ error: 'Invalid or missing security token. Refresh the page and try again.' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({ error: 'Admin sign-in required.' });
  }
  return next();
}

function requireParticipant(req, res, next) {
  if (!req.session.participantId) {
    return res.status(401).json({ error: 'Access code sign-in required.' });
  }
  return next();
}

module.exports = {
  ensureCsrfToken,
  attachCsrf,
  requireCsrf,
  requireAdmin,
  requireParticipant
};
