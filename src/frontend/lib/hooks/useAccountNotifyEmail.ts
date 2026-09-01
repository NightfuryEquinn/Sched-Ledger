import { api } from "@/frontend/lib/api";
import { useEffect, useState } from "react";

export const NOTIFY_EMAIL_CHANGED = "ledger:notify-email-changed";

/** Tell open views to reload the account notify email from the server. */
export function emitNotifyEmailChanged(): void {
  window.dispatchEvent(new Event(NOTIFY_EMAIL_CHANGED));
}

/** Load the account notify email and refresh after Data & privacy saves it. */
export function useAccountNotifyEmail(): string {
  const [email, setEmail] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      void api.users.me().then(({ user }) => {
        if (!cancelled) setEmail(user.notifyEmail?.trim() || "");
      });
    };

    load();
    window.addEventListener(NOTIFY_EMAIL_CHANGED, load);

    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFY_EMAIL_CHANGED, load);
    };
  }, []);

  return email;
}
