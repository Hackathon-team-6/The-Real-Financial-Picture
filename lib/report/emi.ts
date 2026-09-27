/** Default annual interest rate (%) assumed when the user doesn't give one. */
export const DEFAULT_ANNUAL_RATE_PCT = 14;

/** Monthly EMI for a reducing-balance loan. Unrounded; callers round for display. */
export function emi(principal: number, annualRatePct: number, months: number): number {
  if (!(months > 0) || !(principal > 0)) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}
