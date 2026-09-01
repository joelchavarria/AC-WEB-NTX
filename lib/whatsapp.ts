export function toWhatsAppNumber(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";

  if (!digits) {
    return "";
  }

  if (digits.startsWith("505") && digits.length === 11) {
    return digits;
  }

  if (digits.length === 8) {
    return `505${digits}`;
  }

  return digits;
}
