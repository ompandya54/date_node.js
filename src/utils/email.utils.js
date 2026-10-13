import nodemailer from 'nodemailer';

/**
 * Configure Nodemailer Transporter for Gmail / Custom SMTP
 */
const createTransporter = () => {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_PASS;

  if (user && pass) {
    // Auto-detect Gmail address for seamless setup
    if (user.includes('@gmail.com')) {
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user,
          pass, // 16-character Gmail App Password
        },
      });
    }

    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user,
        pass,
      },
    });
  }
  return null;
};

/**
 * Send OTP Email for Registration or Password Reset
 * @param {string} email Target recipient email
 * @param {string} otp 6-digit OTP code
 * @param {string} type 'register' | 'forgot_password'
 */
export const sendOTPEmail = async (email, otp, type = 'register') => {
  const isPasswordReset = type === 'forgot_password';
  const subject = isPasswordReset
    ? '🔑 Gandhinagar Dating - Password Reset OTP'
    : '💖 Gandhinagar Dating - Email Verification OTP';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
      <h2 style="color: #e91e63; text-align: center; margin-bottom: 5px;">💖 Gandhinagar Dating App</h2>
      <p style="text-align: center; color: #888; font-size: 12px; margin-top: 0;">Gandhinagar Exclusive Dating Platform</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 15px 0;" />
      <p style="font-size: 15px; color: #333;">Hello,</p>
      <p style="font-size: 14px; color: #555; line-height: 1.5;">
        ${isPasswordReset ? 'You requested to reset your password. Use the OTP code below:' : 'Thank you for joining Gandhinagar Dating! Use the OTP code below to verify your email:'}
      </p>
      <div style="text-align: center; margin: 25px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #e91e63; background: #fff0f5; padding: 12px 28px; border-radius: 8px; border: 1px dashed #e91e63; display: inline-block;">
          ${otp}
        </span>
      </div>
      <p style="font-size: 13px; color: #777; text-align: center;">
        ⏰ This OTP is valid for <strong>10 minutes</strong>. Please do not share it with anyone.
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #aaa; text-align: center;">
        Sent securely via Gandhinagar Dating Backend System
      </p>
    </div>
  `;

  const transporter = createTransporter();
  const senderEmail = process.env.SMTP_USER || process.env.GMAIL_USER;

  if (transporter && senderEmail) {
    try {
      await transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'Gandhinagar Dating'}" <${senderEmail}>`,
        to: email,
        subject,
        html: htmlContent,
      });
      console.log(`✉️ [REAL EMAIL DELIVERED] OTP sent from ${senderEmail} to ${email}`);
      return true;
    } catch (error) {
      console.error(`❌ [REAL EMAIL ERROR] Failed to send email via ${senderEmail}:`, error.message);
    }
  }

  // Development Console Simulator when credentials are not configured in .env
  console.log(`\n==================================================`);
  console.log(`✉️  [DEV MODE EMAIL SIMULATOR]`);
  console.log(`📧  Recipient: ${email}`);
  console.log(`🔑  Purpose:   ${type.toUpperCase()}`);
  console.log(`🔢  OTP CODE:  👉 ${otp} 👈 (Valid for 10 mins)`);
  console.log(`==================================================\n`);

  return true;
};
