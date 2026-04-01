'use strict';

/**
 * Outbound selector plugin.
 *
 * When SES_SMTP_USER and SES_SMTP_PASS are set, all outbound mail is relayed
 * through AWS SES on port 587 (STARTTLS). This avoids the Azure outbound
 * port-25 block while keeping full DKIM/SPF alignment on the sending domain.
 *
 * Falls back to direct MX resolution when credentials are absent so local
 * dev (docker-compose, no SES account needed) continues to work.
 */
exports.hook_get_mx = function (next, hmail, domain) {
  const user = process.env.SES_SMTP_USER;
  const pass = process.env.SES_SMTP_PASS;

  if (!user || !pass) {
    // No SES credentials — use direct MX (local dev only)
    return next();
  }

  const host = process.env.SES_SMTP_HOST || 'email-smtp.us-east-1.amazonaws.com';
  const port = parseInt(process.env.SES_SMTP_PORT || '587', 10);

  next(OK, [{
    priority: 0,
    exchange: host,
    port,
    auth_type: 'login',
    auth_user: user,
    auth_pass: pass,
  }]);
};
