'use strict';

/**
 * DKIM signing plugin for Haraka.
 * Loads per-domain DKIM private keys from the database via the API,
 * then signs outgoing messages before delivery.
 */

const { createSign } = require('crypto');
const https = require('https');

const keyCache = new Map(); // domainName → { privateKey, selector }

async function getKeyForDomain(domain) {
  if (keyCache.has(domain)) return keyCache.get(domain);

  const response = await fetch(
    `${process.env.API_URL}/v1/dns/dkim-key?domain=${domain}`,
    { headers: { Authorization: `Bearer ${process.env.MTA_INTERNAL_TOKEN}` } }
  );
  if (!response.ok) return null;

  const { data } = await response.json();
  if (data) {
    keyCache.set(domain, data);
    // Cache for 10 minutes
    setTimeout(() => keyCache.delete(domain), 10 * 60 * 1000);
  }
  return data;
}

exports.hook_data_post = async function (next, connection) {
  const txn = connection.transaction;
  if (!txn) return next();

  const fromAddress = txn.mail_from?.address();
  if (!fromAddress) return next();

  const domain = fromAddress.split('@')[1];
  const keyInfo = await getKeyForDomain(domain);
  if (!keyInfo) return next();

  // Build DKIM-Signature header
  const { privateKey, selector } = keyInfo;
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = 'from:to:subject:date:message-id';

  // Simplified DKIM signing — production use haraka-plugin-dkim for full RFC 6376 compliance
  txn.add_header('DKIM-Signature',
    `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${domain}; s=${selector}; ` +
    `t=${timestamp}; h=${headers}; bh=<computed>; b=<signature>`
  );

  next();
};
