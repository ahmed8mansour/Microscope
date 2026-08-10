// Public by design — no `import 'server-only'`. WhatsApp support link shown on
// the success page. Opens a chat with the business's support number; no
// message is sent automatically (per spec Assumptions).
const SUPPORT_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT ?? '';

export function getWhatsAppSupportUrl(): string {
  const digitsOnly = SUPPORT_NUMBER.replace(/\D/g, '');
  return `https://wa.me/${digitsOnly}`;
}

// Human-readable support number for display in copy (legal pages, contact
// blurbs), e.g. "+61400000000". Empty string if the env var is unset.
export function getWhatsAppSupportNumber(): string {
  const digitsOnly = SUPPORT_NUMBER.replace(/\D/g, '');
  return digitsOnly ? `+${digitsOnly}` : '';
}
