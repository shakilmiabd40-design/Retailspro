/**
 * Best-effort detection of a Bangladeshi district and (for Dhaka) area/thana
 * from a free-text delivery address. Used to auto-fill the District / Area
 * fields on the order form so staff don't have to retype what's already in
 * the address — they can still edit the result by hand.
 */

export const BD_DISTRICTS = [
  "Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj",
  "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail",
  "Bogura", "Joypurhat", "Naogaon", "Natore", "Chapainawabganj", "Pabna", "Rajshahi", "Sirajganj",
  "Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon",
  "Barguna", "Barisal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur",
  "Bandarban", "Brahmanbaria", "Chandpur", "Chattogram", "Cumilla", "Cox's Bazar", "Feni",
  "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati",
  "Habiganj", "Moulvibazar", "Sunamganj", "Sylhet",
  "Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira",
  "Jamalpur", "Mymensingh", "Netrokona", "Sherpur",
] as const;

/** Common Dhaka areas/thanas — matching one of these implies the district is Dhaka. */
export const DHAKA_AREAS = [
  "Uttara", "Mirpur", "Pallabi", "Kazipara", "Shewrapara", "Kafrul", "Cantonment",
  "Mohammadpur", "Adabor", "Shyamoli", "Dhanmondi", "Kalabagan", "Hazaribagh", "Lalbagh",
  "Gulshan", "Banani", "Baridhara", "Niketan", "Bashundhara", "Nikunja", "Khilkhet",
  "Badda", "Rampura", "Malibagh", "Khilgaon", "Basabo", "Sabujbagh", "Motijheel", "Paltan",
  "Shahbagh", "Segunbagicha", "Kakrail", "Shantinagar", "Wari", "Old Dhaka", "Jatrabari",
  "Demra", "Kamrangirchar", "Tejgaon", "Farmgate", "Agargaon", "Mohakhali", "Aftabnagar",
  "Keraniganj", "Savar", "Tongi", "Uttarkhan", "Dakshinkhan", "Turag",
] as const;

export interface DetectedGeo {
  district?: string;
  area?: string;
}

/** Other spellings people actually type → the canonical name used above. */
const DISTRICT_ALIASES: Record<string, string> = {
  chittagong: "Chattogram", chattagram: "Chattogram", ctg: "Chattogram",
  comilla: "Cumilla", barishal: "Barisal", bogra: "Bogura", jessore: "Jashore", jessor: "Jashore",
  "coxs bazar": "Cox's Bazar", "cox bazar": "Cox's Bazar", "cox's bazar": "Cox's Bazar", coxbazar: "Cox's Bazar", "coxs bazaar": "Cox's Bazar",
  narayangonj: "Narayanganj", narayanganj: "Narayanganj", narsingdi: "Narsingdi", norsingdi: "Narsingdi",
  moulvibazar: "Moulvibazar", maulvibazar: "Moulvibazar", brahmanbaria: "Brahmanbaria", "b baria": "Brahmanbaria",
  nawabganj: "Chapainawabganj", "chapai nawabganj": "Chapainawabganj", netrakona: "Netrokona", jhalakathi: "Jhalokati",
  patuakhali: "Patuakhali", laxmipur: "Lakshmipur", khagrachari: "Khagrachhari", "sylhet sadar": "Sylhet",
  dacca: "Dhaka",
  // Bangla
  "ঢাকা": "Dhaka", "চট্টগ্রাম": "Chattogram", "সিলেট": "Sylhet", "রাজশাহী": "Rajshahi", "খুলনা": "Khulna", "বরিশাল": "Barisal",
  "রংপুর": "Rangpur", "ময়মনসিংহ": "Mymensingh", "কুমিল্লা": "Cumilla", "গাজীপুর": "Gazipur", "নারায়ণগঞ্জ": "Narayanganj",
  "বগুড়া": "Bogura", "যশোর": "Jashore", "কক্সবাজার": "Cox's Bazar", "টাঙ্গাইল": "Tangail", "ফরিদপুর": "Faridpur",
  "নরসিংদী": "Narsingdi", "মানিকগঞ্জ": "Manikganj", "মুন্সিগঞ্জ": "Munshiganj", "দিনাজপুর": "Dinajpur", "পাবনা": "Pabna",
  "নোয়াখালী": "Noakhali", "ফেনী": "Feni", "কুষ্টিয়া": "Kushtia", "ব্রাহ্মণবাড়িয়া": "Brahmanbaria", "চাঁদপুর": "Chandpur",
};

const AREA_ALIASES: Record<string, string> = {
  "mirpur": "Mirpur", "dhanmondi": "Dhanmondi", "mohammadpur": "Mohammadpur", "mohamadpur": "Mohammadpur", "gulshan": "Gulshan",
  "bashundhara": "Bashundhara", "jatrabari": "Jatrabari", "jatrabary": "Jatrabari", "khilgaon": "Khilgaon", "motijheel": "Motijheel",
  "moghbazar": "Moghbazar", "malibag": "Malibagh", "tejgaon": "Tejgaon", "badda": "Badda", "uttarkhan": "Uttarkhan",
  // Bangla
  "উত্তরা": "Uttara", "মিরপুর": "Mirpur", "ধানমন্ডি": "Dhanmondi", "মোহাম্মদপুর": "Mohammadpur", "গুলশান": "Gulshan", "বনানী": "Banani",
  "বসুন্ধরা": "Bashundhara", "মতিঝিল": "Motijheel", "যাত্রাবাড়ী": "Jatrabari", "খিলগাঁও": "Khilgaon", "রামপুরা": "Rampura",
  "বাড্ডা": "Badda", "মালিবাগ": "Malibagh", "তেজগাঁও": "Tejgaon", "ফার্মগেট": "Farmgate", "মহাখালী": "Mohakhali", "শ্যামলী": "Shyamoli",
  "আদাবর": "Adabor", "পল্টন": "Paltan", "শাহবাগ": "Shahbagh", "সাভার": "Savar", "টঙ্গী": "Tongi", "কেরানীগঞ্জ": "Keraniganj",
};

const norm = (s: string) => s.toLowerCase().replace(/[’`´]/g, "'").replace(/\s+/g, " ");
const isBangla = (s: string) => /[\u0980-\u09FF]/.test(s);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Position of `needle` in `hay`, only as a whole word (letters on either side don't count; digits/punctuation do). -1 if absent. */
function findWord(hay: string, needle: string): number {
  const n = norm(needle);
  if (isBangla(n)) return hay.indexOf(n);
  const m = new RegExp(`(?<![a-z])${esc(n)}(?![a-z])`).exec(hay);
  return m ? m.index : -1;
}

function bestMatch(hay: string, canon: readonly string[], aliases: Record<string, string>, pick: "first" | "last"): string | undefined {
  const hits: { name: string; at: number }[] = [];
  const consider = (label: string, name: string) => {
    const at = findWord(hay, label);
    if (at >= 0) hits.push({ name, at });
  };
  for (const c of canon) consider(c, c);
  for (const [alias, name] of Object.entries(aliases)) consider(alias, name);
  if (!hits.length) return undefined;
  hits.sort((a, b) => a.at - b.at);
  return (pick === "last" ? hits[hits.length - 1] : hits[0]).name;
}

/**
 * Scans free-text `address` for a known district and Dhaka area name. Handles common alternate spellings
 * (Chittagong, Comilla, Bogra…), Bangla names, and text like "Mirpur10" or "Mirpur-10". The district is normally
 * written last in an address, so if several are mentioned the last one wins; for the area the first one wins.
 */
export function detectDistrictArea(address: string): DetectedGeo {
  if (!address?.trim()) return {};
  const hay = norm(address);

  const area = bestMatch(hay, DHAKA_AREAS, AREA_ALIASES, "first");
  const district = bestMatch(hay, BD_DISTRICTS, DISTRICT_ALIASES, "last");

  // An area match without an explicit district mention is almost always inside Dhaka.
  return { district: district ?? (area ? "Dhaka" : undefined), area };
}
