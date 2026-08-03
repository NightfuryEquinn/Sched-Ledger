/** Format an amount for email copy, falling back to `CODE 123` for unknown codes. */
export function formatMoneyLabel(amount: number, currency?: string): string {
  const code = (currency || "MYR").toUpperCase();

  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code} ${Math.round(amount)}`;
  }
}
