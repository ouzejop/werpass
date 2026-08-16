const SENEGAL_COUNTRY_CODE = '+221';

export function sanitizeSenegalNationalNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  const nationalDigits = digits.startsWith('221') ? digits.slice(3) : digits;
  return nationalDigits.slice(0, 9);
}

export function isValidSenegalNationalNumber(value: string): boolean {
  return /^\d{9}$/.test(sanitizeSenegalNationalNumber(value));
}

export function toSenegalE164(value: string): string {
  const nationalNumber = sanitizeSenegalNationalNumber(value);
  if (!/^\d{9}$/.test(nationalNumber)) throw new Error('Le numéro sénégalais doit contenir 9 chiffres.');
  return `${SENEGAL_COUNTRY_CODE}${nationalNumber}`;
}
