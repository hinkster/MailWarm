'use strict';

/**
 * Bounce handler plugin.
 * Intercepts DSN/bounce messages and queues them for processing.
 */

exports.hook_data_post = function (next, connection) {
  const txn = connection.transaction;
  if (!txn) return next();

  const isBounceDsn =
    txn.mail_from?.address() === '' ||          // MAIL FROM:<>
    txn.mail_from?.address() === '<>';

  if (!isBounceDsn) return next();

  const rcptTo = txn.rcpt_to?.[0]?.address();
  if (!rcptTo) return next();

  // Post bounce to API queue
  fetch(`${process.env.API_URL}/v1/internal/bounce`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MTA_INTERNAL_TOKEN}`,
    },
    body: JSON.stringify({
      bounceFor: rcptTo,
      rawMessage: txn.body?.toString() ?? '',
      timestamp: new Date().toISOString(),
    }),
  }).catch((err) => connection.logwarn(`Bounce handler post failed: ${err.message}`));

  next();
};
