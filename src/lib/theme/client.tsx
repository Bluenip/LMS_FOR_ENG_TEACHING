"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeChoice = "light" | "dark" | "system";
import { THEME_STORAGE_KEY } from "./config";

interface ThemeContextValue {
  theme: ThemeChoice;
  resolved: "light" | "dark";
  setTheme: (t: ThemeChoice) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    let stored: ThemeChoice = "system";
    try {
      const v = localStorage.getItem(THEME_STORAGE_KEY);
      if (v === "light" || v === "dark" || v === "system") stored = v;
    } catch {
      // storage unavailable: follow the system theme
    }
    setThemeState(stored);
    const r = stored === "system" ? (systemPrefersDark() ? "dark" : "light") : stored;
    setResolved(r);
    apply(r);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      setThemeState((cur) => {
        if (cur === "system") {
          const next = mq.matches ? "dark" : "light";
          setResolved(next);
          apply(next);
        }
        return cur;
      });
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((t: ThemeChoice) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      // ignore
    }
    setThemeState(t);
    const r = t === "system" ? (systemPrefersDark() ? "dark" : "light") : t;
    setResolved(r);
    apply(r);
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
