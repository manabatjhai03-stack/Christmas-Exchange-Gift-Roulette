const express = require('express');
const { query } = require('../lib/db');
const { generateAccessCode, lookupHash, hashSecret } = require('../lib/crypto-utils');
const { requireAdmin, requireCsrf } = require('../middleware/auth');

const router = express.Router();

const ATTENDANCE = new Set(['confirmed', 'tentative', 'not_attending']);

async function getPrimaryEvent() {
  const { rows } = await query('SELECT * FROM events ORDER BY created_at ASC LIMIT 1');
  return rows[0] || null;
}

function cleanName(value) {
  return String(value || '').trim();
}

async function issueCredentials(participantId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const accessCode = generateAccessCode();
    const digest = lookupHash(accessCode);
    const codeHash = await hashSecret(accessCode);
    try {
      await query(
        `INSERT INTO participant_credentials (participant_id, lookup_hash, access_code_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (participant_id)
         DO UPDATE SET lookup_hash = EXCLUDED.lookup_hash, access_code_hash = EXCLUDED.access_code_hash`,
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

router.use(requireAdmin, requireCsrf);

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.display_name, p.attendance, p.created_at, p.updated_at,
              EXISTS (
                SELECT 1 FROM assignments a
                WHERE a.giver_id = p.id
              ) AS assigned
       FROM participants p
       ORDER BY p.created_at ASC`
    );
    res.json(
      rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        attendance: row.attendance,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        assigned: row.assigned
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const event = await getPrimaryEvent();
    if (!event) return res.status(400).json({ error: 'No event is configured.' });
    if (event.draw_status === 'finalized') {
      return res.status(409).json({
        error: 'The draw is finalized. Unlock and reset assignments before changing the participant list.'
      });
    }

    const displayName = cleanName(req.body?.displayName);
    const attendance = String(req.body?.attendance || 'confirmed');
    if (displayName.length < 1 || displayName.length > 80) {
      return res.status(400).json({ error: 'Display name must be 1–80 characters.' });
    }
    if (!ATTENDANCE.has(attendance)) {
      return res.status(400).json({ error: 'Attendance must be confirmed, tentative, or not_attending.' });
    }

    const inserted = await query(
      `INSERT INTO participants (event_id, display_name, attendance)
       VALUES ($1, $2, $3)
       RETURNING id, display_name, attendance, created_at, updated_at`,
      [event.id, displayName, attendance]
    );
    const participant = inserted.rows[0];
    const accessCode = await issueCredentials(participant.id);
    res.status(201).json({
      id: participant.id,
      displayName: participant.display_name,
      attendance: participant.attendance,
      accessCode
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const event = await getPrimaryEvent();
    if (event?.draw_status === 'finalized') {
      return res.status(409).json({
        error: 'The draw is finalized, so the list is locked. Reset the draw first if someone cancelled — that clears every assignment.'
      });
    }

    const displayName = req.body?.displayName !== undefined ? cleanName(req.body.displayName) : null;
    const attendance = req.body?.attendance !== undefined ? String(req.body.attendance) : null;

    if (displayName !== null && (displayName.length < 1 || displayName.length > 80)) {
      return res.status(400).json({ error: 'Display name must be 1–80 characters.' });
    }
    if (attendance !== null && !ATTENDANCE.has(attendance)) {
      return res.status(400).json({ error: 'Attendance must be confirmed, tentative, or not_attending.' });
    }

    const { rows } = await query(
      `UPDATE participants
       SET display_name = COALESCE($2, display_name),
           attendance = COALESCE($3, attendance),
           updated_at = now()
       WHERE id = $1
       RETURNING id, display_name, attendance, created_at, updated_at`,
      [req.params.id, displayName, attendance]
    );
    if (!rows.length) return res.status(404).json({ error: 'Participant not found.' });
    res.json({
      id: rows[0].id,
      displayName: rows[0].display_name,
      attendance: rows[0].attendance,
      createdAt: rows[0].created_at,
      updatedAt: rows[0].updated_at
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const event = await getPrimaryEvent();
    if (event?.draw_status === 'finalized') {
      return res.status(409).json({
        error: 'The draw is finalized. Reset the draw before deleting participants.'
      });
    }

    const assigned = await query('SELECT id FROM assignments WHERE giver_id = $1 OR recipient_id = $1 LIMIT 1', [
      req.params.id
    ]);
    if (assigned.rows.length) {
      return res.status(409).json({ error: 'This person still has an assignment. Reset the draw first.' });
    }

    const deleted = await query('DELETE FROM participants WHERE id = $1 RETURNING id', [req.params.id]);
    if (!deleted.rows.length) return res.status(404).json({ error: 'Participant not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/regenerate-code', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id FROM participants WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Participant not found.' });
    const accessCode = await issueCredentials(req.params.id);
    res.json({ id: req.params.id, accessCode });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
