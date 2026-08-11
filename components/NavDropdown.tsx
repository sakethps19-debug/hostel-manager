"use client";

import { useEffect, useRef, useState } from "react";

type NavItem = { label: string; href: string; section?: string };

export default function NavDropdown({
  label,
  items,
  variant = "default",
}: {
  label: string;
  items: NavItem[];
  variant?: "default" | "primary";
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={
          variant === "primary"
            ? "flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            : "flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        }
      >
        {label}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 transition-transform ${
            variant === "primary" ? "text-white" : "text-slate-400"
          } ${open ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-10 mt-2 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {items.map((item, index) => {
            const showSectionHeader =
              item.section && item.section !== items[index - 1]?.section;

            return (
              <div key={item.href}>
                {showSectionHeader && (
                  <p
                    className={`px-4 pb-1 text-xs font-bold uppercase tracking-wide text-slate-400 ${
                      index === 0 ? "pt-3" : "border-t border-slate-100 pt-3"
                    }`}
                  >
                    {item.section}
                  </p>
                )}
                <a
                  href={item.href}
                  className={`block px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 ${
                    !showSectionHeader && index > 0 && !item.section
                      ? "border-t border-slate-100"
                      : ""
                  }`}
                >
                  {item.label}
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
