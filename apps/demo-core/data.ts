/**
 * Synthetic demo bank data — never real PII.
 */

export type Member = {
  id: string;
  name: string;
  status: "active" | "restricted";
  savingsBalance: number;
  checkingBalance: number;
};

export const DEMO_CREDENTIALS = {
  username: "teller",
  password: "demo-pass",
} as const;

export const MEMBERS: Record<string, Member> = {
  "12345": {
    id: "12345",
    name: "Jordan Avery",
    status: "active",
    savingsBalance: 1842.55,
    checkingBalance: 420.1,
  },
  "67890": {
    id: "67890",
    name: "Casey Quinn",
    status: "restricted",
    savingsBalance: 90.0,
    checkingBalance: 12.0,
  },
};

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
