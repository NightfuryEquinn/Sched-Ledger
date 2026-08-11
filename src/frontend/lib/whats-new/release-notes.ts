/** Glyph names available on the shared Icon component. */
type HighlightIcon =
  | "calendar"
  | "wallet"
  | "bell"
  | "insights"
  | "calculator"
  | "shield"
  | "download";

export type ReleaseHighlight = {
  icon: HighlightIcon;
  title: string;
  body: string;
};

export type ReleaseNotes = {
  version: string;
  date: string;
  lead: string;
  highlights: ReleaseHighlight[];
};

/**
 * Notes shown by the What's New popup. Adding a release means replacing this
 * content and bumping APP_VERSION in @/lib/version, which re-announces it to
 * every device.
 */
export const RELEASE_NOTES: ReleaseNotes = {
  version: "1.0.0",
  date: "August 2026",
  lead: "Sched Ledger reaches 1.0. Here is what your ledger can do now.",
  highlights: [
    {
      icon: "calendar",
      title: "A schedule that bends",
      body:
        "Events can span multiple days, repeat weekly or biweekly, and recurring series let you " +
        "delete just this occurrence, this and everything after, or the whole series.",
    },
    {
      icon: "wallet",
      title: "Bills tied to your budget",
      body:
        "Put a hold on a budget envelope when you schedule a bill, so the money is already spoken " +
        "for. Logging the payment releases the hold and links the transaction back to the event.",
    },
    {
      icon: "bell",
      title: "Reminders worth reading",
      body:
        "Email reminders now carry the event name, its budget hold and your comments. All-day " +
        "events get day-of reminders, and you can switch on browser push notifications instead.",
    },
    {
      icon: "insights",
      title: "Sharper insights",
      body:
        "The overview trend charts earnings alongside spending, hovering any point breaks the " +
        "total down by category, and spending habits highlight where the month actually went.",
    },
    {
      icon: "calculator",
      title: "Budget calculator",
      body:
        "Build a month's budget from your own categories, see it balance against your income, " +
        "and apply it to the ledger in one step.",
    },
    {
      icon: "shield",
      title: "Private by construction",
      body:
        "Your ledger is end-to-end encrypted in the browser before it is stored. Review active " +
        "sessions, sign out other devices, and clear everything this browser holds at any time.",
    },
    {
      icon: "download",
      title: "Yours to take with you",
      body:
        "Export and re-import transactions, schedule and to-do lists as CSV, or take an encrypted " +
        "backup. Install Sched Ledger to your home screen and it keeps working offline for reads.",
    },
  ],
};
