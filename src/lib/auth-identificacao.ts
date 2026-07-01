const LOGIN_EMAIL_DOMAIN = "estrategic.internal";

/** Matrícula do técnico (alfanumérica, maiúscula). */
export function normalizeMatricula(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export const matriculaSchema = /^[A-Z0-9]{2,20}$/;

export function isValidMatricula(value: string): boolean {
  return matriculaSchema.test(normalizeMatricula(value));
}

/** Login usado para entrar no sistema. */
export function normalizeLogin(value: string): string {
  return value.trim().toLowerCase();
}

export const loginSchema = /^[a-z0-9._-]{3,30}$/;

export function isValidLogin(value: string): boolean {
  return loginSchema.test(normalizeLogin(value));
}

export function loginToAuthEmail(login: string): string {
  return `${normalizeLogin(login)}@${LOGIN_EMAIL_DOMAIN}`;
}

/** Aceita login ou e-mail legado (admin inicial). */
export function parseLoginIdentifier(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return loginToAuthEmail(trimmed);
}

/** Apenas dígitos do celular (10 ou 11 dígitos BR). */
export function normalizeCelularDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

/** Máscara visual: (XX) X XXXX-XXXX */
export function formatCelularMask(value: string): string {
  const d = normalizeCelularDigits(value);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 3) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
}

export function isValidCelular(value: string): boolean {
  const d = normalizeCelularDigits(value);
  return d.length === 10 || d.length === 11;
}

/** Link WhatsApp (DDI 55). */
export function celularToWhatsAppUrl(digits: string): string | null {
  const d = normalizeCelularDigits(digits);
  if (d.length < 10) return null;
  return `https://api.whatsapp.com/send?phone=55${d}`;
}
