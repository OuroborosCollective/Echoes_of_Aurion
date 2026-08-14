import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import React from "react";
import type { ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { ThemeProvider } from "@/contexts/ThemeContext";

const baseUrl = process.env.AURION_TEST_BASE_URL ?? "http://127.0.0.1:3000";

export function RealClientHarness({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = trpc.createClient({ links: [httpBatchLink({ url: `${baseUrl}/api/trpc`, transformer: superjson, fetch(input, init) { return globalThis.fetch(input, { ...init, credentials: "include" }); } })] });
  return <trpc.Provider client={client} queryClient={queryClient}><QueryClientProvider client={queryClient}><ThemeProvider defaultTheme="dark">{children}</ThemeProvider></QueryClientProvider></trpc.Provider>;
}
