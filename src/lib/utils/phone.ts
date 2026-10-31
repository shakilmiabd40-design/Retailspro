export function normalizePhoneForCourier(phone: string | null | undefined): string {
  if (!phone) return "";
  let s = String(phone).trim();
  // Convert Bangla digits to English digits
  const banglaDigits: Record<string, string> = {
    "০": "0",
    "১": "1",
    "২": "2",
    "৩": "3",
    "৪": "4",
    "৫": "5",
    "৬": "6",
    "৭": "7",
    "৮": "8",
    "৯": "9",
  };
  for (const [bn, en] of Object.entries(banglaDigits)) {
    s = s.split(bn).join(en);
  }
  // Remove dashes, spaces, parentheses, plus signs etc
  s = s.replace(/[-\s()\+\.\u2010-\u2015]/g, "");
  return s;
}
