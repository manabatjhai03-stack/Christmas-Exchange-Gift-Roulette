/**
 * Secret Santa derangement using Sattolo's algorithm (single cycle).
 * giver[i] -> shuffled[i], with no fixed points when shuffled starts as a copy of giver.
 */
function sattoloShuffle(items) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function buildAssignments(participantIds) {
  if (participantIds.length < 2) {
    throw new Error('Need at least two confirmed participants.');
  }

  const givers = participantIds.slice();
  const recipients = sattoloShuffle(givers);

  const pairs = givers.map((giverId, index) => ({
    giverId,
    recipientId: recipients[index]
  }));

  validateAssignments(pairs, participantIds);
  return pairs;
}

function validateAssignments(pairs, participantIds) {
  const expected = new Set(participantIds);
  const givers = new Set();
  const recipients = new Set();

  if (pairs.length !== participantIds.length) {
    throw new Error('Assignment count does not match confirmed participants.');
  }

  for (const pair of pairs) {
    if (pair.giverId === pair.recipientId) {
      throw new Error('Self-assignment is not allowed.');
    }
    if (!expected.has(pair.giverId) || !expected.has(pair.recipientId)) {
      throw new Error('Assignment includes an ineligible participant.');
    }
    if (givers.has(pair.giverId) || recipients.has(pair.recipientId)) {
      throw new Error('Duplicate giver or recipient in assignment set.');
    }
    givers.add(pair.giverId);
    recipients.add(pair.recipientId);
  }

  if (givers.size !== expected.size || recipients.size !== expected.size) {
    throw new Error('Assignments are not a complete matching.');
  }
}

module.exports = { buildAssignments, validateAssignments, sattoloShuffle };
