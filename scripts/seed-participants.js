require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { query, pool } = require('../lib/db');
const { generateAccessCode, lookupHash, hashSecret } = require('../lib/crypto-utils');

const INITIAL = [
  { displayName: 'Jhai', attendance: 'confirmed' },
  { displayName: 'Gab', attendance: 'confirmed' },
  { displayName: 'Lot', attendance: 'confirmed' },
  { displayName: "Lot's Friend", attendance: 'confirmed' },
  { displayName: 'Dave', attendance: 'confirmed' },
  { displayName: 'Kulot', attendance: 'confirmed' },
  { displayName: 'Arnel', attendance: 'confirmed' },
  { displayName: 'Jam', attendance: 'confirmed' },
  { displayName: 'roma', attendance: 'confirmed' },
  { displayName: 'johnrey', attendance: 'confirmed' },
  { displayName: "Dave's Friend", attendance: 'confirmed' },
  { displayName: "Dave's Friend", attendance: 'tentative' },
  { displayName: 'Mark', attendance: 'tentative' },
  { displayName: 'Der', attendance: 'tentative' },
  { displayName: 'Zhy', attendance: 'confirmed' },
  { displayName: 'Gie', attendance: 'confirmed' },
  { displayName: 'Kenji', attendance: 'confirmed' },
  { displayName: 'Clark', attendance: 'confirmed' }
];

async function issueCode(participantId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const accessCode = generateAccessCode();
    const digest = lookupHash(accessCode);
    const codeHash = await hashSecret(accessCode);
    try {
      await query(
        `INSERT INTO participant_credentials (participant_id, lookup_hash, access_code_hash)
         VALUES ($1, $2, $3)`,
        [participantId, digest, codeHash]
      );
      return accessCode;
    } catch (err) {
      if (err.code === '23505') continue;
      throw err;
    }
  }
  throw new Error('Could not generate a unique access code.');
}

async function main() {
  const eventRes = await query('SELECT id FROM events ORDER BY created_at ASC LIMIT 1');
  if (!eventRes.rows.length) {
    console.error('No event found. Run database/schema.sql first.');
    process.exit(1);
  }
  const eventId = eventRes.rows[0].id;

  const count = await query('SELECT COUNT(*)::int AS n FROM participants WHERE event_id = $1', [eventId]);
  if (count.rows[0].n > 0) {
    console.error('Participants already exist. Skipping seed so existing codes are not overwritten.');
    process.exit(1);
  }

  const lines = ['Display name | Attendance | Access code', '-------------------------------------------'];

  for (const person of INITIAL) {
    const inserted = await query(
      `INSERT INTO participants (event_id, display_name, attendance)
       VALUES ($1, $2, $3)
       RETURNING id, display_name, attendance`,
      [eventId, person.displayName, person.attendance]
    );
    const row = inserted.rows[0];
    const accessCode = await issueCode(row.id);
    lines.push(`${row.display_name} | ${row.attendance} | ${accessCode}`);
  }

  const outPath = path.join(__dirname, '..', 'access-codes.txt');
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Seeded ${INITIAL.length} participants.`);
  console.log(`Plaintext access codes written to ${outPath} (gitignored).`);
  console.log('Share each code privately. Regenerating a code in the admin dashboard invalidates the old one.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
