// src/services/emailService.js
const nodemailer = require('nodemailer');

// Create transporter from environment variables
const createTransporter = () => {
  console.log('📧 Creating SMTP transporter with:');
  console.log(`   Host: ${process.env.SMTP_HOST}`);
  console.log(`   Port: ${process.env.SMTP_PORT}`);
  console.log(`   Secure: ${process.env.SMTP_SECURE}`);
  console.log(`   User: ${process.env.SMTP_USER}`);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || 'info@movexpress.co.uk',
      pass: process.env.SMTP_PASS || 'London@london13',
    },
    tls: {
      rejectUnauthorized: false,
    },
    debug: true, // Enable debug output
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
  });
};

// Send email function
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transporter = createTransporter();
    
    // Verify connection first
    try {
      await transporter.verify();
      console.log('✅ SMTP connection verified successfully');
    } catch (verifyError) {
      console.error('❌ SMTP verification failed:', verifyError.message);
      throw new Error(`SMTP connection failed: ${verifyError.message}`);
    }
    
    const mailOptions = {
      from: process.env.SMTP_FROM || '"MealCart Portal" <info@movexpress.co.uk>',
      to,
      subject,
      html,
      text,
    };

    console.log(`📧 Sending email to ${to}...`);
    console.log(`📧 Subject: ${subject}`);
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}: ${info.messageId}`);
    console.log(`📧 Response: ${info.response}`);
    return info;
  } catch (error) {
    console.error('❌ Email send error:', error.message);
    console.error('❌ Full error:', error);
    throw error;
  }
};

// ===== OTP EMAIL =====
const sendOTPEmail = async (email, otp) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>OTP Verification</title>
      <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; margin: 0; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        .header { text-align: center; border-bottom: 3px solid #0A2A5A; padding-bottom: 20px; margin-bottom: 20px; }
        .header h1 { color: #0A2A5A; margin: 0; font-size: 24px; }
        .header p { color: #666; margin: 5px 0 0; font-size: 14px; }
        .otp-code { 
          font-size: 36px; 
          font-weight: bold; 
          color: #0A2A5A; 
          text-align: center; 
          padding: 20px; 
          background: #f0f4ff; 
          border-radius: 8px; 
          margin: 20px 0; 
          letter-spacing: 12px;
          font-family: monospace;
        }
        .message { color: #333; line-height: 1.6; }
        .footer { text-align: center; color: #999; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏷️ MealCart Portal</h1>
          <p>SMART DELIVERY MANAGEMENT</p>
        </div>
        
        <div class="message">
          <h2 style="color: #0A2A5A;">Verify Your Email</h2>
          <p>You requested to reset your password. Enter the following verification code:</p>
        </div>
        
        <div class="otp-code">${otp}</div>
        
        <div class="message">
          <p>This code will expire in <strong>10 minutes</strong>.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
        
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} MealCart. All rights reserved.</p>
          <p>20/191-195 Greens Road, Dandenong South VIC 3175</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    MealCart Portal - Email Verification
    ------------------------------------
    
    Your verification code is: ${otp}
    
    This code will expire in 10 minutes.
    
    If you didn't request this, please ignore this email.
    
    © ${new Date().getFullYear()} MealCart. All rights reserved.
  `;

  return sendEmail({
    to: email,
    subject: 'MealCart - Password Reset Verification Code',
    html,
    text,
  });
};

// ===== WELCOME EMAIL =====
const sendWelcomeEmail = async (email, firstName) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; }
        .header { text-align: center; border-bottom: 3px solid #0A2A5A; padding-bottom: 20px; }
        .header h1 { color: #0A2A5A; margin: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏷️ MealCart Portal</h1>
        </div>
        <h2>Welcome ${firstName}! 🎉</h2>
        <p>Your account has been created successfully.</p>
        <p>You can now log in to start managing your deliveries.</p>
        <div class="footer" style="text-align:center;color:#999;font-size:12px;border-top:1px solid #eee;padding-top:20px;margin-top:20px;">
          <p>&copy; ${new Date().getFullYear()} MealCart. All rights reserved.</p>
          <p>20/191-195 Greens Road, Dandenong South VIC 3175</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Welcome to MealCart Portal! 🎉',
    html,
    text: `Welcome ${firstName}! Your account has been created successfully.`,
  });
};

// ===== PASSWORD RESET CONFIRMATION =====
const sendPasswordResetConfirmation = async (email) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; }
        .header { text-align: center; border-bottom: 3px solid #4CAF50; padding-bottom: 20px; }
        .header h1 { color: #4CAF50; margin: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Password Reset Successful</h1>
        </div>
        <p>Your password has been successfully reset.</p>
        <p>If you didn't perform this action, please contact support immediately.</p>
        <div class="footer" style="text-align:center;color:#999;font-size:12px;border-top:1px solid #eee;padding-top:20px;margin-top:20px;">
          <p>&copy; ${new Date().getFullYear()} MealCart. All rights reserved.</p>
          <p>20/191-195 Greens Road, Dandenong South VIC 3175</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Password Reset Confirmation - MealCart',
    html,
    text: `Your password has been successfully reset. If you didn't perform this action, please contact support immediately.`,
  });
};

module.exports = {
  sendEmail,
  sendOTPEmail,
  sendWelcomeEmail,
  sendPasswordResetConfirmation,
};