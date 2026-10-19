"use client";

import { useCallback, useState } from "react";
import { defaultFilters, type DateTypeKey, type GroupBy, type ReportFilters } from "./dates";

export interface ReportFilterState {
  draft: ReportFilters;
  applied: ReportFilters;
  defaults: ReportFilters;
  /** Edit the draft only (needs Apply). */
  setDraft: (patch: Partial<ReportFilters>) => void;
  /** Edit and apply immediately (presets, tab-driven date type). */
  applyPatch: (patch: Partial<ReportFilters>) => void;
  apply: () => void;
  reset: () => void;
  dirty: boolean;
}

export function useReportFilters(dateType: DateTypeKey, groupBy: GroupBy = "daily"): ReportFilterState {
  const [defaults] = useState(() => defaultFilters(dateType, groupBy));
  const [draft, setDraftState] = useState<ReportFilters>(defaults);
  const [applied, setApplied] = useState<ReportFilters>(defaults);

  const setDraft = useCallback((patch: Partial<ReportFilters>) => setDraftState((d) => ({ ...d, ...patch })), []);
  const applyPatch = useCallback((patch: Partial<ReportFilters>) => {
    setDraftState((d) => ({ ...d, ...patch }));
    setApplied((a) => ({ ...a, ...patch }));
  }, []);

  return {
    draft,
    applied,
    defaults,
    setDraft,
    applyPatch,
    apply: () => setApplied(draft),
    reset: () => {
      setDraftState(defaults);
      setApplied(defaults);
    },
    dirty: JSON.stringify(draft) !== JSON.stringify(applied),
  };
}
