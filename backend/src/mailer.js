'use strict';
const { HttpError } = require('./http');

const outbox = [];

function transport() {
  if (process.env.EMAIL_TRANSPORT) return process.env.EMAIL_TRANSPORT;
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) return 'none';
  return 'console';
}

async function sendMail({ to, subject, text, html }) {
  const kind = transport();

  if (kind === 'memory') {
    outbox.push({ to, subject, text });
    return;
  }

  if (kind === 'console') {
    console.log(`\n[DEV EMAIL - not really sent]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }

  if (kind === 'brevo') {
    const sender = process.env.EMAIL_FROM;
    if (!sender) {
      console.error('EMAIL_FROM is not set. It must be a sender address verified in Brevo.');
      throw new HttpError(503, 'Email service is not configured.');
    }
    let res;
    try {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: process.env.EMAIL_FROM_NAME || 'FindIt', email: sender },
          to: [{ email: to }],
          subject,
          textContent: text,
          htmlContent: html,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      console.error('Email request failed:', err.message);
      throw new HttpError(502, 'Could not send the verification email. Please try again.');
    }
    if (!res.ok) {
      console.error('Brevo rejected the email:', res.status, await res.text().catch(() => ''));
      throw new HttpError(502, 'Could not send the verification email. Please try again.');
    }
    return;
  }

  console.error('No email provider configured. Set BREVO_API_KEY and EMAIL_FROM.');
  throw new HttpError(503, 'Email service is not configured.');
}

function verificationEmail(name, code) {
  const text = `Hi ${name},\n\nYour FindIt verification code is ${code}.\nIt expires in 10 minutes. If you did not sign up, you can ignore this email.\n`;
  const html = `<p>Hi ${String(name).replace(/[<>&]/g, '')},</p><p>Your FindIt verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you did not sign up, you can ignore this email.</p>`;
  return { subject: 'Your FindIt verification code', text, html };
}

function resetEmail(name, code) {
  const text = `Hi ${name},\n\nYour FindIt password reset code is ${code}.\nIt expires in 10 minutes. If you did not ask to reset your password, you can ignore this email and your password will stay the same.\n`;
  const html = `<p>Hi ${String(name).replace(/[<>&]/g, '')},</p><p>Your FindIt password reset code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you did not ask to reset your password, you can ignore this email and your password will stay the same.</p>`;
  return { subject: 'Reset your FindIt password', text, html };
}

module.exports = { sendMail, verificationEmail, resetEmail, outbox };
