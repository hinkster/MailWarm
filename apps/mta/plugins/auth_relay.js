'use strict';

/**
 * SMTP auth plugin for the MailWarm relay user.
 * Validates against MTA_SMTP_USER / MTA_SMTP_PASS env vars so
 * credentials don't have to be hardcoded in a config file.
 */

exports.hook_capabilities = function (next, connection) {
  if (connection.tls_enabled) {
    connection.capabilities.push('AUTH LOGIN PLAIN');
  }
  next();
};

exports.hook_unrecognised_command = function (next, connection, params) {
  if (params[0] !== 'AUTH') return next();

  const method = (params[1] || '').toUpperCase();
  const relayUser = process.env.MTA_SMTP_USER;
  const relayPass = process.env.MTA_SMTP_PASS;

  if (!relayUser || !relayPass) {
    connection.respond(454, 'Authentication credentials not configured');
    return next(OK);
  }

  if (method === 'PLAIN') {
    // AUTH PLAIN <base64(\0user\0pass)>
    try {
      const decoded = Buffer.from(params[2] || '', 'base64').toString('utf8');
      const parts = decoded.split('\0');
      const user = parts[1];
      const pass = parts[2];
      if (user === relayUser && pass === relayPass) {
        connection.relaying = true;
        connection.respond(235, 'Authentication successful');
      } else {
        connection.respond(535, 'Invalid credentials');
      }
    } catch {
      connection.respond(501, 'Malformed AUTH PLAIN');
    }
    return next(OK);
  }

  if (method === 'LOGIN') {
    // Multi-step LOGIN — not implemented here; use PLAIN instead
    connection.respond(504, 'Use AUTH PLAIN');
    return next(OK);
  }

  next();
};
