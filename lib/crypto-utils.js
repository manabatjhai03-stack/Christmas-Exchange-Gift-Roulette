const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 10;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function requirePepper() {
  const pepper = process.env.ACCESS_CODE_PEPPER;
  if (!pepper || pepper.length < 16) {
    throw new Error('ACCESS_CODE_PEPPER must be set to a long random string (16+ chars).');
  }
  return pepper;
}

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function generateAccessCode() {
  const bytes = crypto.randomBytes(8);
  let raw = '';
  for (let i = 0; i < 8; i += 1) {
    raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function lookupHash(code) {
  const pepper = requirePepper();
  return crypto.createHmac('sha256', pepper).update(normalizeCode(code)).digest('hex');
}

async function hashSecret(value) {
  return bcrypt.hash(String(value), BCRYPT_ROUNDS);
}

async function verifySecret(value, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(value), hash);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  generateAccessCode,
  lookupHash,
  hashSecret,
  verifySecret,
  normalizeCode,
  randomToken,
  timingSafeEqualString
};
