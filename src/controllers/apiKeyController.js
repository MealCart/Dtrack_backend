// src/controllers/apiKeyController.js
const { pool } = require('../config/database');
const { generateApiKey } = require('../utils/apiKey');

// ============================================================
// GET /api/admin/api-keys
// List all API keys (masked — never returns full key or hash)
// ============================================================
exports.listKeys = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,
              client_id,
              client_name,
              key_prefix,
              scopes,
              is_active,
              last_used_at,
              expires_at,
              created_at,
              updated_at
         FROM api_keys
        ORDER BY created_at DESC`
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error('❌ listKeys error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch API keys',
      details: error.message,
    });
  }
};

// ============================================================
// POST /api/admin/api-keys
// Create a new API key.
// Returns the full key ONCE — never retrievable afterwards.
// ============================================================
exports.createKey = async (req, res) => {
  try {
    const {
      client_id,
      client_name,
      scopes,
      expires_at,
    } = req.body;

    // -------- Validation --------
    if (!client_name || !String(client_name).trim()) {
      return res.status(400).json({ error: 'client_name is required' });
    }
    if (!client_id || !String(client_id).trim()) {
      return res.status(400).json({ error: 'client_id is required' });
    }

    const cleanScopes = Array.isArray(scopes) && scopes.length > 0
      ? scopes.filter(s => typeof s === 'string')
      : ['jobs:read', 'jobs:write'];

    const cleanClientId   = String(client_id).trim();
    const cleanClientName = String(client_name).trim();
    const cleanExpiresAt  = expires_at ? new Date(expires_at) : null;

    if (cleanExpiresAt && isNaN(cleanExpiresAt.getTime())) {
      return res.status(400).json({ error: 'Invalid expires_at date' });
    }

    // -------- Generate key --------
    const { key, keyPrefix, hash } = generateApiKey();

    // -------- Persist --------
    const { rows } = await pool.query(
      `INSERT INTO api_keys
         (client_id, client_name, api_key_hash, key_prefix, scopes, expires_at, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id,
                 client_id,
                 client_name,
                 key_prefix,
                 scopes,
                 is_active,
                 last_used_at,
                 expires_at,
                 created_at,
                 updated_at`,
      [
        cleanClientId,
        cleanClientName,
        hash,
        keyPrefix,
        cleanScopes,
        cleanExpiresAt,
        req.user?.id || null,
      ]
    );

    console.log(`✅ API key created for "${cleanClientName}" (${cleanClientId})`);

    // ⚠️ Return full key ONLY here — the only time it ever leaves the server
    return res.status(201).json({
      success: true,
      api_key: key,
      record: rows[0],
      warning: 'Store this key securely. You will not see it again.',
    });
  } catch (error) {
    console.error('❌ createKey error:', error.message);
    return res.status(500).json({
      error: 'Failed to create API key',
      details: error.message,
    });
  }
};

// ============================================================
// PATCH /api/admin/api-keys/:id/revoke
// Soft-revoke: is_active = FALSE
// ============================================================
exports.revokeKey = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) return res.status(400).json({ error: 'id is required' });

    const { rowCount } = await pool.query(
      `UPDATE api_keys
          SET is_active = FALSE,
              updated_at = NOW()
        WHERE id = $1
          AND is_active = TRUE`,
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({
        error: 'API key not found or already revoked',
      });
    }

    console.log(`🚫 API key ${id} revoked`);

    return res.json({
      success: true,
      message: 'API key revoked',
    });
  } catch (error) {
    console.error('❌ revokeKey error:', error.message);
    return res.status(500).json({
      error: 'Failed to revoke API key',
      details: error.message,
    });
  }
};

// ============================================================
// DELETE /api/admin/api-keys/:id
// Permanent delete
// ============================================================
exports.deleteKey = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) return res.status(400).json({ error: 'id is required' });

    const { rowCount } = await pool.query(
      `DELETE FROM api_keys WHERE id = $1`,
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

    console.log(`🗑️ API key ${id} deleted`);

    return res.json({
      success: true,
      message: 'API key deleted',
    });
  } catch (error) {
    console.error('❌ deleteKey error:', error.message);
    return res.status(500).json({
      error: 'Failed to delete API key',
      details: error.message,
    });
  }
};