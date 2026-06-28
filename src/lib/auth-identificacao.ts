const LOGIN_EMAIL_DOMAIN = "estrategic.internal";

/** Matrícula do técnico (somente referência interna). */
export function normalizeMatricula(value: string): string {
  return value.trim().replace(/\D/g, "");
}

export const matriculaSchema = /^[0-9]{3,20}$/;

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
