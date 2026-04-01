'use strict';

/**
 * Per-domain rate limiter plugin.
 * Enforces the tier-based daily send limit by querying Redis counters.
 * Haraka calls this before queueing each message.
 */

const redis = require('ioredis');
const client = new redis(process.env.REDIS_URL);

exports.hook_mail = async function (next, connection, params) {
  const from = params[0]?.address();
  if (!from) return next();

  const domain = from.split('@')[1];
  const key = `rate:domain:${domain}:${new Date().toISOString().slice(0, 10)}`; // YYYY-MM-DD

  const current = await client.incr(key);
  if (current === 1) {
    // First email today — set TTL to 25 hours to handle timezone edge cases
    await client.expire(key, 90000);
  }

  // Fetch limit from API (cached in Redis with 5-min TTL)
  const limitKey = `limit:domain:${domain}`;
  let limit = await client.get(limitKey);

  if (!limit) {
    try {
      const res = await fetch(
        `${process.env.API_URL}/v1/internal/domain-limit?domain=${domain}`,
        { headers: { Authorization: `Bearer ${process.env.MTA_INTERNAL_TOKEN}` } }
      );
      const data = await res.json();
      limit = String(data.dailyLimit ?? 500);
      await client.setex(limitKey, 300, limit);
    } catch {
      limit = '500'; // safe default
    }
  }

  if (current > parseInt(limit, 10)) {
    connection.logwarn(`Rate limit exceeded for domain ${domain}: ${current}/${limit}`);
    return next(DENYSOFT, `Daily send limit reached for ${domain}`);
  }

  next();
};
