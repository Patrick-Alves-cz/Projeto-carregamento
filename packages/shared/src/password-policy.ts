/** Política de senha do EV Charge (cadastro e reset). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_REQUIREMENTS = [
  { id: "length", label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres` },
  { id: "letter", label: "Pelo menos 1 letra" },
  { id: "number", label: "Pelo menos 1 número" },
] as const;

export type PasswordRequirementId = (typeof PASSWORD_REQUIREMENTS)[number]["id"];

export function passwordRequirementChecks(password: string): Record<PasswordRequirementId, boolean> {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    letter: /[A-Za-zÀ-ÿ]/.test(password),
    number: /\d/.test(password),
  };
}

export function isPasswordStrong(password: string): boolean {
  const checks = passwordRequirementChecks(password);
  return checks.length && checks.letter && checks.number;
}

export const PASSWORD_POLICY_MESSAGE =
  "A senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra e 1 número.";

export function passwordSchemaMessage(password: string): string | null {
  if (!password) return "Informe a senha.";
  if (!isPasswordStrong(password)) return PASSWORD_POLICY_MESSAGE;
  return null;
}
