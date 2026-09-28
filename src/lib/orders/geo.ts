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

/** Scans free-text `address` for a known district and Dhaka area name. */
export function detectDistrictArea(address: string): DetectedGeo {
  if (!address?.trim()) return {};
  const lower = address.toLowerCase();

  const area = DHAKA_AREAS.find((a) => lower.includes(a.toLowerCase()));
  const district = BD_DISTRICTS.find((d) => lower.includes(d.toLowerCase()));

  // An area match without an explicit district mention is almost always inside Dhaka.
  return { district: district ?? (area ? "Dhaka" : undefined), area };
}
