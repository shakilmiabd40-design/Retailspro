import type { ReactNode } from "react";
import { GLProvider } from "@/lib/accounting/gl-store";

/** Detailed double-entry data is fetched only after the user enters Accounting. */
export default function AccountingLayout({ children }: { children: ReactNode }) {
  return <GLProvider>{children}</GLProvider>;
}
