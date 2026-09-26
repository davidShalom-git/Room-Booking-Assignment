/** Digits with country code. A bare 10-digit Indian mobile (or a 0-prefixed one) gets +91. */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10 && /^[6-9]/.test(d)) return "91" + d;
  if (d.length === 11 && d.startsWith("0")) return "91" + d.slice(1);
  return d;
}

/** Looks like a full international mobile number (country code included). */
export const validPhone = (digits: string) => digits.length >= 11 && digits.length <= 15;
