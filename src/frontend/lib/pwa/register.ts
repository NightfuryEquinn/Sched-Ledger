/**
 * Register the service worker and hint that the app is installable.
 */

/** Register `/sw.js` when the browser supports service workers. */
export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW registration is optional on free hosting / preview deploys. */
    });
  });
}
