"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import clsx from "clsx";

export type RowAction = {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  onClick: () => void;
  danger?: boolean;
};

export function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, []);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 176; // w-44
      const menuHeight = actions.length * 36 + 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < menuHeight ? rect.top - menuHeight - 4 : rect.bottom + 4;
      const left = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8);
      setCoords({ top, left: Math.max(8, left) });
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className="focus-ring rounded-md p-1.5 transition-colors hover:bg-[var(--surface-2)]"
        style={{ color: "var(--text-faint)" }}
        aria-label="Row actions"
      >
        <MoreVertical size={16} />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 w-44 overflow-hidden rounded-xl border py-1 shadow-lg"
            style={{ background: "var(--surface)", borderColor: "var(--border)", top: coords.top, left: coords.left }}
          >
            {actions.map((action) => (
              <button
                key={action.label}
                onClick={() => {
                  setOpen(false);
                  action.onClick();
                }}
                className={clsx(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-[var(--surface-2)]"
                )}
                style={{ color: action.danger ? "var(--red)" : "var(--text)" }}
              >
                <action.icon size={14} />
                {action.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
