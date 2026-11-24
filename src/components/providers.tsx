"use client";

import { useState, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { I18nProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { ThemeProvider, useTheme } from "@/lib/theme/client";

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster richColors position="top-right" closeButton theme={resolved} />;
}

export function Providers({ children, locale }: { children: ReactNode; locale: Locale }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <ThemeProvider>
        <I18nProvider initialLocale={locale}>
          <QueryClientProvider client={queryClient}>
            {children}
            <ThemedToaster />
          </QueryClientProvider>
        </I18nProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
