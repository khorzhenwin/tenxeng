"use client";

import { useTheme } from "@/components/ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="fixed right-6 top-6 z-50 inline-flex items-center gap-2 rounded-full border border-slate-400/40 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-900 shadow-sm backdrop-blur hover:border-slate-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100"
      aria-label="Toggle theme"
    >
      <span className="text-sm">{theme === "dark" ? "🌙" : "☀️"}</span>
      {theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}
