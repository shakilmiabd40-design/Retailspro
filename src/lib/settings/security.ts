import type { SecuritySettings } from "./types";

/** Returns the list of policy rules a password fails (empty = OK). */
export function passwordProblems(pw: string, s: SecuritySettings): string[] {
  const problems: string[] = [];
  if (pw.length < s.minPasswordLength) problems.push(`At least ${s.minPasswordLength} characters`);
  if (s.requireUppercase && !/[A-Z]/.test(pw)) problems.push("An uppercase letter");
  if (s.requireNumber && !/[0-9]/.test(pw)) problems.push("A number");
  if (s.requireSymbol && !/[^A-Za-z0-9]/.test(pw)) problems.push("A symbol");
  return problems;
}

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

/** A random temporary password that satisfies the current password policy. */
export function generateTempPassword(s: SecuritySettings): string {
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const pick = (set: string) => set[randomInt(set.length)];
  const length = Math.max(10, s.minPasswordLength);
  const chars: string[] = [pick(lower), pick(upper), pick(digits)];
  if (s.requireSymbol) chars.push(pick(symbols));
  const pool = lower + upper + digits + (s.requireSymbol ? symbols : "");
  while (chars.length < length) chars.push(pick(pool));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function generateResetLink(): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  const token = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/reset-password?token=${token}`;
}
