import 'server-only';

import sgMail from '@sendgrid/mail';

export class EmailSendError extends Error {
  constructor(cause: unknown) {
    super('Failed to send verification email');
    this.name = 'EmailSendError';
    this.cause = cause;
  }
}

let configured = false;

function ensureConfigured(): { fromEmail: string } {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    throw new Error(
      'SENDGRID_API_KEY and SENDGRID_FROM_EMAIL must be set (see .env.example).'
    );
  }
  if (!configured) {
    sgMail.setApiKey(apiKey);
    configured = true;
  }
  return { fromEmail };
}

// FR-005. Success is measured at "send accepted by SendGrid" — inbox
// delivery is outside this system's control (SC-003).
export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const { fromEmail } = ensureConfigured();
  try {
    await sgMail.send({
      to,
      from: fromEmail,
      subject: 'Your verification code',
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
    });
  } catch (err) {
    throw new EmailSendError(err);
  }
}
