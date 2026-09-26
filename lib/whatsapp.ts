export function toWhatsAppNumber(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.length === 8) {
    return `505${digits}`;
  }
  if (/^505\d{8}$/.test(digits)) return digits;
  if (/^00505\d{8}$/.test(digits)) return digits.slice(2);
  return "";
}

export function whatsAppMessageUrl(
  phone: string | null | undefined,
  message: string,
) {
  const number = toWhatsAppNumber(phone);
  return number
    ? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
    : null;
}
