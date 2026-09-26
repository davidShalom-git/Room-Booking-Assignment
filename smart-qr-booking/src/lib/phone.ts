/** Digits with country code. A bare 10-digit Indian mobile (or a 0-prefixed one) gets +91. */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10 && /^[6-9]/.test(d)) return "91" + d;
  if (d.length === 11 && d.startsWith("0")) return "91" + d.slice(1);
  return d;
}

/** "919876543210" -> "+91 98765 43210" (Indian mobiles); other numbers as "+<digits>". */
export const phonePretty = (digits: string) =>
  /^91[6-9]\d{9}$/.test(digits) ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}` : `+${digits}`;

/** Looks like a full international mobile number (country code included). */
export const validPhone = (digits: string) => digits.length >= 11 && digits.length <= 15;
