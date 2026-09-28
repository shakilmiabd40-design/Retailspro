"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-9 w-9 rounded-full" style={{ background: "var(--surface-2)" }} />;
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:opacity-80"
      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
