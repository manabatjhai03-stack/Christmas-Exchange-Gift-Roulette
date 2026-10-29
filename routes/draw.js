const express = require('express');
const { query, withTransaction } = require('../lib/db');
const { buildAssignments } = require('../lib/draw');
const { requireAdmin, requireParticipant, requireCsrf } = require('../middleware/auth');

const router = express.Router();

router.post('/admin/finalize', requireAdmin, requireCsrf, async (_req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const eventRes = await client.query(
        `SELECT id, draw_status FROM events ORDER BY created_at ASC LIMIT 1 FOR UPDATE`
      );
      const event = eventRes.rows[0];
      if (!event) {
        const err = new Error('No event found.');
        err.status = 404;
        throw err;
      }
      if (event.draw_status === 'finalized') {
        const err = new Error('The draw is already finalized. Reset it before running again.');
        err.status = 409;
        throw err;
      }

      const existing = await client.query('SELECT id FROM assignments WHERE event_id = $1 LIMIT 1', [event.id]);
      if (existing.rows.length) {
        const err = new Error('Assignments already exist. Reset the draw before generating new ones.');
        err.status = 409;
        throw err;
      }

      const confirmed = await client.query(
        `SELECT id FROM participants
         WHERE event_id = $1 AND attendance = 'confirmed'
         ORDER BY id
         FOR UPDATE`,
        [event.id]
      );
      const ids = confirmed.rows.map((row) => row.id);
      if (ids.length < 2) {
        const err = new Error('Need at least two confirmed participants to start the roulette.');
        err.status = 400;
        throw err;
      }

      const pairs = buildAssignments(ids);
      for (const pair of pairs) {
        await client.query(
          `INSERT INTO assignments (event_id, giver_id, recipient_id)
           VALUES ($1, $2, $3)`,
          [event.id, pair.giverId, pair.recipientId]
        );
      }

      await client.query(
        `UPDATE events SET draw_status = 'finalized', finalized_at = now() WHERE id = $1`,
        [event.id]
      );

      return { count: pairs.length };
    });

    res.json({
      ok: true,
      assignmentCount: result.count,
      message: 'Draw finalized. Confirmed participants can now spin on their phones.'
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/reset', requireAdmin, requireCsrf, async (req, res, next) => {
  try {
    const confirmation = String(req.body?.confirmation || '').trim();
    if (confirmation !== 'RESET DRAW') {
      return res.status(400).json({
        error: 'Type RESET DRAW to confirm. This deletes every assignment and unlocks the participant list.'
      });
    }

    const result = await withTransaction(async (client) => {
      const eventRes = await client.query(
        `SELECT id FROM events ORDER BY created_at ASC LIMIT 1 FOR UPDATE`
      );
      const event = eventRes.rows[0];
      if (!event) {
        const err = new Error('No event found.');
        err.status = 404;
        throw err;
      }
      const deleted = await client.query('DELETE FROM assignments WHERE event_id = $1', [event.id]);
      await client.query(
        `UPDATE events SET draw_status = 'draft', finalized_at = NULL WHERE id = $1`,
        [event.id]
      );
      return { removed: deleted.rowCount };
    });

    res.json({
      ok: true,
      removedAssignments: result.removed,
      message: 'Assignments cleared. Update attendance, then finalize again. Previous pairings are gone.'
    });
  } catch (err) {
    next(err);
  }
});

router.get('/participant/assignment', requireParticipant, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.display_name, p.attendance, e.draw_status
       FROM participants p
       JOIN events e ON e.id = p.event_id
       WHERE p.id = $1`,
      [req.session.participantId]
    );
    const me = rows[0];
    if (!me) return res.status(401).json({ error: 'Access code sign-in required.' });

    if (me.attendance !== 'confirmed') {
      return res.status(403).json({
        error: 'You are not on the confirmed list, so you are not in this draw.',
        attendance: me.attendance,
        drawStatus: me.draw_status
      });
    }

    if (me.draw_status !== 'finalized') {
      return res.status(409).json({
        error: "The Christmas roulette isn't ready yet. Please wait for the organizer.",
        drawStatus: me.draw_status
      });
    }

    const assigned = await query(
      `SELECT r.display_name AS recipient_name
       FROM assignments a
       JOIN participants r ON r.id = a.recipient_id
       WHERE a.giver_id = $1`,
      [req.session.participantId]
    );
    if (!assigned.rows.length) {
      return res.status(404).json({ error: 'No assignment found for your account. Ask the organizer.' });
    }

    res.json({
      recipientName: assigned.rows[0].recipient_name
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
