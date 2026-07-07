import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import logoUrl from "@/frontend/assets/logo.png";
import { Root } from "@/frontend/app/Root";
import { applyTheme, getStoredTheme, resolveDark } from "@/frontend/lib/theme";
import "@/frontend/styles/ledger.css";

applyTheme(resolveDark(getStoredTheme()));

const favicon =
  document.querySelector<HTMLLinkElement>("link[rel='icon']") ??
  Object.assign(document.createElement("link"), { rel: "icon" });
favicon.href = logoUrl;
document.head.appendChild(favicon);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const elem = document.getElementById("root")!;

const tree = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>
);

if (import.meta.hot) {
  const hotData = import.meta.hot.data as { root?: ReturnType<typeof createRoot> };
  if (!hotData.root) hotData.root = createRoot(elem);
  hotData.root.render(tree);
} else {
  createRoot(elem).render(tree);
}
