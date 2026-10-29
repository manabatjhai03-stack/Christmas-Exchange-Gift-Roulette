require('dotenv').config();

const { query, pool } = require('../lib/db');
const { hashSecret } = require('../lib/crypto-utils');

async function main() {
  const email = String(process.env.CREATE_ADMIN_EMAIL || process.argv[2] || '')
    .trim()
    .toLowerCase();
  const password = String(process.env.CREATE_ADMIN_PASSWORD || process.argv[3] || '');

  if (!email || !password) {
    console.error('Usage: CREATE_ADMIN_EMAIL=you@email.com CREATE_ADMIN_PASSWORD="long-password" npm run create-admin');
    console.error('   or: node scripts/create-admin.js you@email.com "long-password"');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }

  const existing = await query('SELECT id FROM admins WHERE email = $1', [email]);
  if (existing.rows.length) {
    console.error('An admin with that email already exists.');
    process.exit(1);
  }

  const passwordHash = await hashSecret(password);
  const inserted = await query(
    'INSERT INTO admins (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [email, passwordHash]
  );
  console.log(`Admin created: ${inserted.rows[0].email}`);
}

main()
  .catch((err) => {
    console.error('Could not create admin:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
