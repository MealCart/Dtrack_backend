// src/utils/apiKey.js
const crypto = require('crypto');

/**
 * Generate a fresh API key.
 * Format: sk_live_<43 chars>
 */
function generateApiKey() {
  const raw = crypto.randomBytes(32).toString('base64url'); // ~43 chars
  const key = `sk_live_${raw}`;
  const keyPrefix = key.slice(0, 14);                        // 'sk_live_ab12cd'
  const hash = hashApiKey(key);
  return { key, keyPrefix, hash };
}

/**
 * SHA-256 hash of the full key. What we actually store in the DB.
 */
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

module.exports = { generateApiKey, hashApiKey };