// src/controllers/otpController.js
const { pool } = require('../config/database');
const { sendOTPEmail } = require('../services/emailService');

// ===== GENERATE OTP =====
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ===== SEND OTP =====
exports.sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    console.log(`📧 Send OTP request for: ${email}`);

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists
    const userCheck = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    console.log(`🔑 Generated OTP for ${email}: ${otp}`);

    // ===== FIX: Check if OTP exists, then update or insert =====
    // Check if there's an existing OTP for this email
    const existingOTP = await pool.query(
      'SELECT id FROM otp_verifications WHERE email = $1 AND verified = false',
      [email.toLowerCase()]
    );

    if (existingOTP.rows.length > 0) {
      // Update existing OTP
      await pool.query(
        `UPDATE otp_verifications 
         SET otp = $1, expires_at = $2, created_at = CURRENT_TIMESTAMP, verified = false
         WHERE email = $3 AND verified = false`,
        [otp, expiresAt, email.toLowerCase()]
      );
      console.log(`🔄 Updated existing OTP for ${email}`);
    } else {
      // Insert new OTP
      await pool.query(
        `INSERT INTO otp_verifications (email, otp, expires_at, created_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [email.toLowerCase(), otp, expiresAt]
      );
      console.log(`✅ Inserted new OTP for ${email}`);
    }

    // ===== SEND EMAIL WITH OTP =====
    try {
      await sendOTPEmail(email, otp);
      console.log(`✅ OTP email sent to ${email}`);
    } catch (emailError) {
      console.error('❌ Failed to send OTP email:', emailError.message);
      // Still return success but with warning
      return res.status(500).json({
        error: 'Failed to send OTP email',
        details: emailError.message,
      });
    }

    const isDevelopment = process.env.NODE_ENV === 'development';

    res.json({
      success: true,
      message: 'OTP sent successfully',
      debug_otp: isDevelopment ? otp : undefined,
    });

  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({
      error: 'Failed to send OTP',
      details: error.message,
    });
  }
};

// ===== VERIFY OTP =====
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log(`🔐 Verify OTP for: ${email}`);

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const result = await pool.query(
      `SELECT * FROM otp_verifications 
       WHERE email = $1 AND verified = false
       ORDER BY created_at DESC LIMIT 1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No OTP found for this email' });
    }

    const record = result.rows[0];

    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    await pool.query(
      'UPDATE otp_verifications SET verified = true, verified_at = CURRENT_TIMESTAMP WHERE id = $1',
      [record.id]
    );

    console.log(`✅ OTP verified for ${email}`);

    res.json({
      success: true,
      message: 'OTP verified successfully',
    });

  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    res.status(500).json({
      error: 'Failed to verify OTP',
      details: error.message,
    });
  }
};

// ===== RESEND OTP =====
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const userCheck = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Check if there's an existing OTP for this email
    const existingOTP = await pool.query(
      'SELECT id FROM otp_verifications WHERE email = $1 AND verified = false',
      [email.toLowerCase()]
    );

    if (existingOTP.rows.length > 0) {
      // Update existing OTP
      await pool.query(
        `UPDATE otp_verifications 
         SET otp = $1, expires_at = $2, created_at = CURRENT_TIMESTAMP, verified = false
         WHERE email = $3 AND verified = false`,
        [otp, expiresAt, email.toLowerCase()]
      );
      console.log(`🔄 Updated existing OTP for ${email}`);
    } else {
      // Insert new OTP
      await pool.query(
        `INSERT INTO otp_verifications (email, otp, expires_at, created_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [email.toLowerCase(), otp, expiresAt]
      );
      console.log(`✅ Inserted new OTP for ${email}`);
    }

    // ===== SEND EMAIL WITH OTP =====
    try {
      await sendOTPEmail(email, otp);
      console.log(`✅ OTP email resent to ${email}`);
    } catch (emailError) {
      console.error('❌ Failed to resend OTP email:', emailError.message);
      return res.status(500).json({
        error: 'Failed to resend OTP email',
        details: emailError.message,
      });
    }

    const isDevelopment = process.env.NODE_ENV === 'development';

    res.json({
      success: true,
      message: 'OTP resent successfully',
      debug_otp: isDevelopment ? otp : undefined,
    });

  } catch (error) {
    console.error('❌ Resend OTP error:', error);
    res.status(500).json({
      error: 'Failed to resend OTP',
      details: error.message,
    });
  }
};