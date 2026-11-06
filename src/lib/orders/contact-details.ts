import { detectDistrictArea } from "./geo";

export type ParsedContactDetails = {
  name?: string;
  phone?: string;
  address?: string;
};

/** Parse common labeled customer details copied into the address field. */
export function parseContactDetails(value: string): ParsedContactDetails {
  const latinDigits = value.replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)));
  // Clipboard sources commonly put labeled fields on one line, one per line, or
  // alongside address text without separators ("Name: ... Phone: ...").
  const normalized = latinDigits
    .replace(/\s+(?=(?:customer\s*)?(?:name|phone|mobile|contact|cell|address)\s*[:=\-])/gi, "\n")
    .replace(/\s+(?=(?:নাম|ফোন|মোবাইল|ঠিকানা)\s*[:=：\-])/g, "\n");
  const lines = normalized.split(/[\r\n,;|]+/).map((line) => line.trim()).filter(Boolean);
  let name: string | undefined;
  let phone: string | undefined;
  const addressLines: string[] = [];
  const phonePattern = /(?:\+?880\s?1[3-9](?:[\s.-]?\d){8}|01[3-9](?:[\s.-]?\d){8})/;

  for (const line of lines) {
    const nameMatch = line.match(/^(?:(?:customer\s*)?name|নাম)\s*[:=：\-]\s*(.+)$/i);
    if (nameMatch) {
      let nameValue = nameMatch[1].trim();
      const phoneInName = nameValue.match(phonePattern);
      if (phoneInName) {
        phone ??= phoneInName[0].replace(/[\s.-]/g, "");
        nameValue = nameValue.replace(phoneInName[0], " ").replace(/\s+/g, " ").trim();
      }
      name = nameValue || name;
      continue;
    }
    const phoneMatch = line.match(/^(?:mobile|phone|contact|cell|number|no\.?)\s*(?:number)?\s*[:=：\-]\s*(.+)$/i)
      ?? line.match(/^(?:ফোন|মোবাইল|নম্বর)\s*[:=：\-]\s*(.+)$/);
    if (phoneMatch) {
      const digits = phoneMatch[1].replace(/[^\d+]/g, "");
      if (digits.replace(/\D/g, "").length >= 7) phone = digits;
      continue;
    }
    const addressMatch = line.match(/^(?:address|ঠিকানা)\s*[:=：\-]\s*(.+)$/i);
    let remainder = addressMatch ? addressMatch[1].trim() : line;
    const inlinePhone = remainder.match(phonePattern);
    if (inlinePhone) {
      phone ??= inlinePhone[0].replace(/[\s.-]/g, "");
      remainder = remainder.replace(inlinePhone[0], " ").replace(/\s+/g, " ").trim();
    }
    if (remainder) addressLines.push(remainder);
  }

  // In the common unlabeled three-line format, infer a name only when a phone
  // was also found and the first remaining line looks like a person, not an address.
  if (!name && phone && addressLines.length > 1) {
    const first = addressLines[0];
    const location = detectDistrictArea(first);
    const looksLikeLocation = location.district || location.area;
    if (!looksLikeLocation && !/\d|\b(?:house|flat|road|street|holding|block|sector|village)\b|বাসা|বাড়ি|রোড|গ্রাম/i.test(first)) {
      name = first;
      addressLines.shift();
    }
  }

  const address = addressLines.join(", ").replace(/\s+,/g, ",").trim();
  return { name, phone, address: address || undefined };
}
