"use client";

import { useMemo, useState } from "react";
import { detectDistrictArea } from "./geo";

/**
 * District & Area that follow the address automatically, until staff type their own value.
 *  - Nothing to sync with effects: the shown value is derived from the address on every render, so it can't get stuck
 *    on an old guess (edit the address from Mirpur to Sylhet and the fields follow).
 *  - Typing a value in the field pins it. Clearing the field lets auto-detection take over again on the next address edit.
 */
export function useAutoGeo(address: string, initial?: { district?: string; area?: string }) {
  const detected = useMemo(() => detectDistrictArea(address), [address]);
  type Override = { value: string; at: string } | null;
  const [d, setD] = useState<Override>(initial?.district ? { value: initial.district, at: address } : null);
  const [a, setA] = useState<Override>(initial?.area ? { value: initial.area, at: address } : null);

  // A blank override only holds while the address is unchanged; a non-blank one is a deliberate choice and stays.
  const pick = (o: Override, auto: string | undefined) => (o && (o.value !== "" || o.at === address) ? o.value : (auto ?? ""));

  return {
    district: pick(d, detected.district),
    area: pick(a, detected.area),
    setDistrict: (value: string) => setD({ value, at: address }),
    setArea: (value: string) => setA({ value, at: address }),
  };
}
