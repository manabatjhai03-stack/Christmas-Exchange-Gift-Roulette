const express = require('express');
const { query } = require('../lib/db');
const { requireAdmin, requireCsrf } = require('../middleware/auth');

const router = express.Router();

router.use(requireAdmin, requireCsrf);

router.get('/event', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name, event_date, draw_status, finalized_at FROM events ORDER BY created_at ASC LIMIT 1');
    if (!rows.length) return res.status(404).json({ error: 'No event found.' });
    const event = rows[0];
    res.json({
      id: event.id,
      name: event.name,
      eventDate: event.event_date,
      drawStatus: event.draw_status,
      finalizedAt: event.finalized_at
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/event', async (req, res, next) => {
  try {
    const name = req.body?.name !== undefined ? String(req.body.name).trim() : null;
    const eventDate = req.body?.eventDate !== undefined ? req.body.eventDate : undefined;
    if (name !== null && (name.length < 1 || name.length > 120)) {
      return res.status(400).json({ error: 'Event name must be 1–120 characters.' });
    }

    let parsedDate = undefined;
    if (eventDate !== undefined) {
      if (eventDate === null || eventDate === '') {
        parsedDate = null;
      } else {
        const d = new Date(eventDate);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ error: 'Invalid event date.' });
        }
        parsedDate = d.toISOString();
      }
    }

    const { rows } = await query(
      `UPDATE events
       SET name = COALESCE($1, name),
           event_date = CASE WHEN $2::boolean THEN $3::timestamptz ELSE event_date END
       WHERE id = (SELECT id FROM events ORDER BY created_at ASC LIMIT 1)
       RETURNING id, name, event_date, draw_status, finalized_at`,
      [name, parsedDate !== undefined, parsedDate ?? null]
    );
    if (!rows.length) return res.status(404).json({ error: 'No event found.' });
    const event = rows[0];
    res.json({
      id: event.id,
      name: event.name,
      eventDate: event.event_date,
      drawStatus: event.draw_status,
      finalizedAt: event.finalized_at
    });
  } catch (err) {
    next(err);
  }
});

router.get('/stats', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE attendance = 'confirmed')::int AS confirmed,
         COUNT(*) FILTER (WHERE attendance = 'tentative')::int AS tentative,
         COUNT(*) FILTER (WHERE attendance = 'not_attending')::int AS not_attending
       FROM participants`
    );
    const assignmentCount = await query('SELECT COUNT(*)::int AS n FROM assignments');
    const event = await query('SELECT draw_status FROM events ORDER BY created_at ASC LIMIT 1');
    res.json({
      total: rows[0]?.total || 0,
      confirmed: rows[0]?.confirmed || 0,
      tentative: rows[0]?.tentative || 0,
      notAttending: rows[0]?.not_attending || 0,
      assignmentCount: assignmentCount.rows[0]?.n || 0,
      drawStatus: event.rows[0]?.draw_status || 'draft'
    });
  } catch (err) {
    next(err);
  }
});

router.get('/assignments', async (req, res, next) => {
  try {
    const reveal = req.query.reveal === '1' || req.query.reveal === 'true';
    if (reveal) {
      const { rows } = await query(
        `SELECT a.id,
                g.id AS giver_id,
                g.display_name AS giver_name,
                r.id AS recipient_id,
                r.display_name AS recipient_name
         FROM assignments a
         JOIN participants g ON g.id = a.giver_id
         JOIN participants r ON r.id = a.recipient_id
         ORDER BY g.display_name ASC`
      );
      return res.json({
        reveal: true,
        assignments: rows.map((row) => ({
          giverId: row.giver_id,
          giverName: row.giver_name,
          recipientId: row.recipient_id,
          recipientName: row.recipient_name
        }))
      });
    }

    const { rows } = await query(
      `SELECT p.id, p.display_name, p.attendance,
              EXISTS (SELECT 1 FROM assignments a WHERE a.giver_id = p.id) AS assigned
       FROM participants p
       ORDER BY p.display_name ASC`
    );
    res.json({
      reveal: false,
      assignments: rows.map((row) => ({
        giverId: row.id,
        giverName: row.display_name,
        attendance: row.attendance,
        assigned: row.assigned
      }))
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
