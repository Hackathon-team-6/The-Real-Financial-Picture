import type { TransactionType } from "./types";

interface MerchantRule {
  pattern: RegExp;
  merchant: string;
  category: string;
}

// Order matters: more specific rules first.
export const MERCHANT_RULES: MerchantRule[] = [
  { pattern: /\bsalary|\bsal\s*cr|payroll|\bpay\s*credit/i, merchant: "Salary", category: "Income" },
  { pattern: /personal\s*loan|\bpl\s*emi/i, merchant: "Personal Loan", category: "EMI / Debt" },
  { pattern: /car\s*(loan|emi)|auto\s*loan|vehicle\s*loan/i, merchant: "Car EMI", category: "EMI / Debt" },
  { pattern: /home\s*loan|housing\s*loan|mortgage/i, merchant: "Home Loan", category: "EMI / Debt" },
  { pattern: /bajaj\s*(fin|finserv|finance)?/i, merchant: "Bajaj Finserv", category: "EMI / Debt" },
  { pattern: /hdfc\s*loan/i, merchant: "HDFC Loan", category: "EMI / Debt" },
  { pattern: /icici\s*loan/i, merchant: "ICICI Loan", category: "EMI / Debt" },
  { pattern: /credit\s*card\s*(bill|payment)|cc\s*payment/i, merchant: "Credit Card Bill", category: "EMI / Debt" },
  { pattern: /amazon\s*prime|prime\s*video/i, merchant: "Amazon Prime", category: "Subscriptions" },
  { pattern: /amazon|amzn/i, merchant: "Amazon", category: "Shopping" },
  { pattern: /flipkart/i, merchant: "Flipkart", category: "Shopping" },
  { pattern: /myntra/i, merchant: "Myntra", category: "Shopping" },
  { pattern: /swiggy\s*instamart|instamart/i, merchant: "Swiggy Instamart", category: "Groceries" },
  { pattern: /swiggy/i, merchant: "Swiggy", category: "Food" },
  { pattern: /zomato/i, merchant: "Zomato", category: "Food" },
  { pattern: /blinkit|zepto|bigbasket|big\s*basket|dmart|d-mart|grofers|jiomart/i, merchant: "Groceries", category: "Groceries" },
  { pattern: /uber/i, merchant: "Uber", category: "Transport" },
  { pattern: /\bola\b|olacabs|ola\s*cabs/i, merchant: "Ola", category: "Transport" },
  { pattern: /rapido/i, merchant: "Rapido", category: "Transport" },
  { pattern: /metro/i, merchant: "Metro", category: "Transport" },
  { pattern: /petrol|fuel|diesel|\bhpcl\b|\bbpcl\b|indian\s*oil|\bioc\b|shell/i, merchant: "Fuel", category: "Transport" },
  { pattern: /netflix/i, merchant: "Netflix", category: "Subscriptions" },
  { pattern: /spotify/i, merchant: "Spotify", category: "Subscriptions" },
  { pattern: /youtube|yt\s*premium/i, merchant: "YouTube Premium", category: "Subscriptions" },
  { pattern: /claude|anthropic/i, merchant: "Claude", category: "Subscriptions" },
  { pattern: /chatgpt|openai/i, merchant: "ChatGPT", category: "Subscriptions" },
  { pattern: /xbox/i, merchant: "Xbox", category: "Subscriptions" },
  { pattern: /adobe/i, merchant: "Adobe", category: "Subscriptions" },
  { pattern: /hotstar|jiocinema|jio\s*hotstar/i, merchant: "JioHotstar", category: "Subscriptions" },
  { pattern: /google\s*(one|storage)/i, merchant: "Google One", category: "Subscriptions" },
  { pattern: /google\s*play|google/i, merchant: "Google", category: "Subscriptions" },
  { pattern: /apple\s*(music|tv|one)|icloud|itunes|apple\.com|apple/i, merchant: "Apple", category: "Subscriptions" },
  { pattern: /airtel|jio\s*(recharge|prepaid|postpaid|fiber)|\bjio\b|vodafone|\bvi\s*(prepaid|postpaid)|mobile\s*(bill|recharge)/i, merchant: "Mobile", category: "Utilities" },
  { pattern: /electricity|bescom|tata\s*power|adani\s*electric|msedcl|power\s*bill/i, merchant: "Electricity", category: "Utilities" },
  { pattern: /broadband|act\s*fibernet|internet/i, merchant: "Internet", category: "Utilities" },
  { pattern: /gas\s*bill|indane|lpg|water\s*bill/i, merchant: "Utilities", category: "Utilities" },
  { pattern: /\brent\b|house\s*rent|nobroker/i, merchant: "Rent", category: "Housing" },
  { pattern: /insurance|lic\b|policy\s*premium|hdfc\s*life|icici\s*pru/i, merchant: "Insurance", category: "Insurance" },
  { pattern: /pharmacy|apollo|medplus|hospital|clinic|1mg|pharmeasy|netmeds/i, merchant: "Healthcare", category: "Healthcare" },
  { pattern: /pvr|inox|bookmyshow|steam|playstation/i, merchant: "Entertainment", category: "Entertainment" },
  { pattern: /makemytrip|goibibo|irctc|indigo|air\s*india|vistara|cleartrip|oyo|airbnb/i, merchant: "Travel", category: "Travel" },
  { pattern: /udemy|coursera|byju|unacademy|tuition|school\s*fee|college/i, merchant: "Education", category: "Education" },
  { pattern: /starbucks|cafe|coffee|restaurant|dominos|pizza|mcdonald|kfc|burger/i, merchant: "", category: "Food" },
];

/** Keywords that mark a transaction as a loan / EMI repayment. */
export const EMI_PATTERN = /\bemi\b|\bloan\b|personal\s*loan|car\s*loan|home\s*loan|bajaj|hdfc\s*loan|icici\s*loan|\bnach\b.*(loan|fin)/i;

export function isEmiDescription(text: string): boolean {
  return EMI_PATTERN.test(text);
}

const NOISE = [
  /\b(upi|imps|neft|rtgs|pos|ach|nach|ecs|txn|ref|debit|credit|card|payment|paid|to|by|from|via|dr|cr|mb|ib|bil|onl|online|pvt|ltd|private|limited|india|in|co|inc)\b/gi,
  /[0-9]{4,}/g,
  /[@#*_/\\|:;,.\-]+/g,
];

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Best-effort clean-up for merchants we don't have a rule for. Always returns something non-empty. */
function cleanUnknown(description: string): string {
  let s = description;
  for (const re of NOISE) s = s.replace(re, " ");
  s = s.replace(/\s+/g, " ").trim();
  const words = s.split(" ").slice(0, 3).join(" ");
  const out = titleCase(words);
  return out || titleCase(description.slice(0, 24)) || "Unknown";
}

export interface NormalizedMerchant {
  merchant: string;
  category: string;
  matched: boolean;
}

export function normalizeMerchant(description: string): NormalizedMerchant {
  const desc = (description || "").trim();
  for (const rule of MERCHANT_RULES) {
    if (rule.pattern.test(desc)) {
      return {
        merchant: rule.merchant || cleanUnknown(desc),
        category: rule.category,
        matched: true,
      };
    }
  }
  return { merchant: cleanUnknown(desc), category: "Other", matched: false };
}

/** Stable key used to group transactions from the "same" merchant. */
export function merchantKey(merchant: string, type: TransactionType): string {
  return `${type}:${merchant.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}
