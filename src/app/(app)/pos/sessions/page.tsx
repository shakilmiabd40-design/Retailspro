"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Lock, Wallet } from "lucide-react";
import { useAccess } from "@/lib/settings/access";
import { useToast } from "@/components/toast";
import { formatDateTime } from "@/lib/settings/runtime";
import { usePos } from "@/lib/pos/store";
import type { PosSession } from "@/lib/pos/types";
import { inRange } from "@/lib/reports/dates";
import { useReportFilters } from "@/lib/reports/use-filters";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, ReportHeader } from "@/components/reports/kpi";
import { Tag } from "@/components/settings/ui";
import { CashMovementModal, CloseSessionModal, OpenSessionFields } from "@/components/pos/session-modals";
import { GhostBtn, Loading, PrimaryBtn, money } from "@/components/pos/ui";

export default function SessionsPage() {
  const pos = usePos();
  const { sessions, mySession, hydrated, summaryFor } = pos;
  const { can, currentUser } = useAccess();
  const toast = useToast();
  const seeAll = can("pos", "financial");
  const filters = useReportFilters("pos_sale");
  const f = filters.applied;
  const [modal, setModal] = useState<null | "cash" | "close">(null);
  const [cash, setCash] = useState("");
  const [err, setErr] = useState<string | null>(null);
  // The session being closed is captured here: once it closes, mySession disappears, but the result dialog still needs it.
  const [closing, setClosing] = useState<PosSession | null>(null);

  const rows = useMemo(() => sessions.filter((s) => (seeAll || s.cashierId === currentUser.id) && inRange(new Date(s.openedAt), f.from, f.to)), [sessions, seeAll, currentUser.id, f.from, f.to]);
  if (!hydrated) return <Loading />;

  const expected = (s: PosSession) => (s.status === "closed" ? (s.expectedCash ?? 0) : summaryFor(s).expectedCash);
  const openNow = () => {
    const res = pos.openSession(cash.trim() === "" ? NaN : parseFloat(cash));
    if (!res.ok) setErr(res.error);
    else {
      toast(`Session ${res.session.sessionNumber} opened`);
      setCash("");
      setErr(null);
    }
  };

  const columns: Column<PosSession>[] = [
    { key: "no", header: "Session", value: (s) => s.sessionNumber, cell: (s) => <Link href={`/pos/sessions/${s.id}`} className="font-semibold hover:underline" style={{ color: "var(--brand-strong)" }}>{s.sessionNumber}</Link> },
    { key: "cashier", header: "Cashier", value: (s) => s.cashierName },
    { key: "open", header: "Opened", value: (s) => formatDateTime(s.openedAt) },
    { key: "close", header: "Closed", value: (s) => (s.closedAt ? formatDateTime(s.closedAt) : "—") },
    { key: "opening", header: "Opening cash", value: (s) => s.openingCash, align: "right" },
    { key: "sales", header: "Sales", value: (s) => summaryFor(s).salesTotal, align: "right", total: (rs) => rs.reduce((t, s) => t + summaryFor(s).salesTotal, 0).toLocaleString() },
    { key: "expected", header: "Expected cash", value: (s) => expected(s), align: "right" },
    { key: "counted", header: "Counted", value: (s) => (s.countedCash ?? "—"), align: "right" },
    {
      key: "diff",
      header: "Short / over",
      value: (s) => (s.status === "closed" ? (s.difference ?? 0) : "—"),
      align: "right",
      cell: (s) => (s.status !== "closed" ? <Tag tone="green">Open</Tag> : <span style={{ color: (s.difference ?? 0) === 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{(s.difference ?? 0) === 0 ? "Balanced" : (s.difference ?? 0) < 0 ? `Short ${money(Math.abs(s.difference ?? 0))}` : `Over ${money(s.difference ?? 0)}`}</span>),
      total: (rs) => {
        const d = rs.filter((s) => s.status === "closed").reduce((t, s) => t + (s.difference ?? 0), 0);
        return d === 0 ? "0" : d.toLocaleString();
      },
    },
  ];

  const mine = mySession ? summaryFor(mySession) : null;

  return (
    <div className="space-y-4">
      <ReportHeader title="Cash Register" description={seeAll ? "Every cashier's sessions, from opening cash to the counted close." : "Your sessions, from opening cash to the counted close."} />

      <div className="card p-5">
        {mySession && mine ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--green)" }} /> Your session {mySession.sessionNumber} is open
                </p>
                <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Since {formatDateTime(mySession.openedAt)}</p>
              </div>
              <div className="flex gap-2">
                <GhostBtn onClick={() => setModal("cash")}><Wallet size={15} /> Cash in / out</GhostBtn>
                <PrimaryBtn
                  onClick={() => {
                    setClosing(mySession);
                    setModal("close");
                  }}
                >
                  <Lock size={15} /> Close session
                </PrimaryBtn>
              </div>
            </div>
            <KpiGrid
              items={[
                { label: "Opening cash", value: money(mine.openingCash) },
                { label: "Sales (walk-in)", value: money(mine.salesTotal), sub: `${mine.invoices} invoice${mine.invoices === 1 ? "" : "s"}` },
                { label: "Cash sales", value: money(mine.cashSales), sub: `card ${money(mine.cardSales)} · mobile ${money(mine.mobileSales)}` },
                { label: "Expected in drawer", value: money(mine.expectedCash), tone: "brand" },
              ]}
            />
          </div>
        ) : (
          <div className="max-w-sm space-y-3">
            <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>You have no open session</p>
            <OpenSessionFields cash={cash} setCash={setCash} onEnter={openNow} error={err} />
            <PrimaryBtn onClick={openNow} disabled={!can("pos", "create")}>Open session</PrimaryBtn>
          </div>
        )}
      </div>

      <FilterBar state={filters} dateTypes={["pos_sale"]} />
      <DataTable exportName="pos-sessions" columns={columns} rows={rows} rowKey={(s) => s.id} canExport={can("pos", "export")} emptyText="No sessions for these dates." />
      {!seeAll && <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>You only see your own sessions. Seeing everyone&apos;s needs POS → Financial.</p>}

      {modal === "cash" && mySession && <CashMovementModal session={mySession} onClose={() => setModal(null)} />}
      {modal === "close" && closing && <CloseSessionModal session={closing} onClose={() => setModal(null)} />}
    </div>
  );
}
