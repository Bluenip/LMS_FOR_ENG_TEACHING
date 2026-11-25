"use client";

import { useRef, useState, type ReactNode } from "react";
import { SessionProvider, signOut } from "next-auth/react";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { Toaster } from "sonner";
import { I18nProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { ThemeProvider, useTheme } from "@/lib/theme/client";
import { getSessionExpiryReason } from "@/lib/api-client";
import { ErrorReporter } from "@/components/ErrorReporter";
import { NavigationTracker } from "@/components/navigation/NavigationTracker";

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster richColors position="bottom-right" closeButton theme={resolved} />;
}

export function Providers({ children, locale }: { children: ReactNode; locale: Locale }) {
  const signingOutRef = useRef(false);

  const [queryClient] = useState(() => {
    const handleAuthError = (error: unknown) => {
      const reason = getSessionExpiryReason(error);
      if (!reason || signingOutRef.current) return;
      signingOutRef.current = true;
      void signOut({
        callbackUrl: reason === "locked" ? "/login?reason=locked" : "/login?reason=session",
      });
    };

    return new QueryClient({
      queryCache: new QueryCache({ onError: handleAuthError }),
      mutationCache: new MutationCache({ onError: handleAuthError }),
      defaultOptions: {
        queries: {
          staleTime: 20_000,
          refetchOnWindowFocus: false,
          retry: (failureCount, error) => !getSessionExpiryReason(error) && failureCount < 1,
        },
      },
    });
  });

  return (
    <SessionProvider>
      <ThemeProvider>
        <I18nProvider initialLocale={locale}>
          <QueryClientProvider client={queryClient}>
            {children}
            <ErrorReporter />
            <NavigationTracker />
            <ThemedToaster />
          </QueryClientProvider>
        </I18nProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
