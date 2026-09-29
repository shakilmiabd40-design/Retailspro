import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10" style={{ background: "var(--bg)" }}>
      {children}
    </div>
  );
}
