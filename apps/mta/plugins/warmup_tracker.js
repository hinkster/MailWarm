'use strict';

/**
 * Warmup tracker plugin.
 * Records DELIVERED events and injects a tracking pixel for OPEN tracking.
 * CLICK tracking is handled by a redirect URL in the email body.
 */

// Copy X-Mailwarm-* email headers into transaction.notes during submission
// so they survive into the outbound delivery phase (hmail.todo.notes).
exports.hook_data_post = function (next, connection) {
  const txn = connection.transaction;
  if (!txn) return next();

  const scheduleId = txn.header.get('X-Mailwarm-Schedule');
  const dayLogId   = txn.header.get('X-Mailwarm-DayLog');
  const autoReply  = txn.header.get('X-Mailwarm-AutoReply');

  if (scheduleId) txn.notes['X-Mailwarm-Schedule']  = scheduleId.trim();
  if (dayLogId)   txn.notes['X-Mailwarm-DayLog']    = dayLogId.trim();
  if (autoReply)  txn.notes['X-Mailwarm-AutoReply'] = autoReply.trim();

  next();
};

exports.hook_delivered = function (next, hmail, params) {
  const connection = hmail?.todo;
  if (!connection) return next();

  const scheduleId = hmail.todo?.notes?.['X-Mailwarm-Schedule'];
  const dayLogId   = hmail.todo?.notes?.['X-Mailwarm-DayLog'];
  if (!scheduleId || !dayLogId) return next();

  fetch(`${process.env.API_URL}/v1/internal/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MTA_INTERNAL_TOKEN}`,
    },
    body: JSON.stringify({
      type: 'DELIVERED',
      scheduleId,
      dayLogId,
      messageId: hmail.todo?.message_id,
    }),
  }).catch((e) => console.error('warmup_tracker delivered event failed:', e.message));

  next();
};

exports.hook_bounce = function (next, hmail, error) {
  const scheduleId = hmail.todo?.notes?.['X-Mailwarm-Schedule'];
  const dayLogId   = hmail.todo?.notes?.['X-Mailwarm-DayLog'];
  if (!scheduleId) return next();

  fetch(`${process.env.API_URL}/v1/internal/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MTA_INTERNAL_TOKEN}`,
    },
    body: JSON.stringify({
      type: 'BOUNCED',
      scheduleId,
      dayLogId,
      messageId: hmail.todo?.message_id,
      error: error?.toString(),
    }),
  }).catch((e) => console.error('warmup_tracker bounce event failed:', e.message));

  next();
};
