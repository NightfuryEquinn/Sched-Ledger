/** Glyph names available on the shared Icon component. */
type HighlightIcon =
  | "calendar"
  | "wallet"
  | "bell"
  | "insights"
  | "calculator"
  | "shield"
  | "download"
  | "sparkle"
  | "info"
  | "budget"
  | "piggy"
  | "capital";

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
 * Changelog shown by the What's New modal, newest first. Adding a release
 * means prepending an entry and bumping APP_VERSION in @/lib/version, which
 * re-announces the popup to every device that has not seen that version.
 */
export const RELEASE_NOTES: ReleaseNotes[] = [
  {
    version: "3.0.1",
    date: "August 2026",
    lead: "Every reminder now also fires right at the event — plus a fix for a blank-page load.",
    highlights: [
      {
        icon: "bell",
        title: "A reminder at the event, always",
        body:
          "Any event with reminders on now also sends one right at its own start — the clock " +
          "time for a timed event, or 9:00 AM on the day for an all-day one — on top of whatever " +
          "lead time you picked.",
      },
      {
        icon: "shield",
        title: "Fixed a blank-load bug",
        body:
          "Some deploys of 3.0.0 could load to a blank screen. The build now always ships the " +
          "correct startup script.",
      },
    ],
  },
  {
    version: "3.0.0",
    date: "August 2026",
    lead: "Capitals: plan for the big stuff, plus subcategory breakdowns and a snappier app load.",
    highlights: [
      {
        icon: "capital",
        title: "Meet Capitals",
        body:
          "Plan for marriages, trips, loans, or anything custom with a template or a blank plan, " +
          "check off line items as paid, and log a real payment straight into your ledger.",
      },
      {
        icon: "budget",
        title: "By Category, expanded",
        body:
          "Overview's By Category card and Transactions now break down every category into its " +
          "subcategories, with amounts and share of total.",
      },
      {
        icon: "sparkle",
        title: "Faster to open",
        body:
          "Views now load on demand instead of all at once, so the app starts noticeably faster, " +
          "especially on a cold cache.",
      },
      {
        icon: "calendar",
        title: "New Event picks up where you left off",
        body:
          "Select a day on the Schedule calendar first — New Event now defaults to that date " +
          "instead of always today.",
      },
    ],
  },
  {
    version: "2.0.0",
    date: "August 2026",
    lead: "Piggies: a one-glance tracker for every savings goal, plus a Saving Insights engine.",
    highlights: [
      {
        icon: "piggy",
        title: "Meet Piggies",
        body:
          "Every savings category is now a piggy with a real balance, an optional target and " +
          "deadline, and a progress ring. Subcategories show as piglets inside it.",
      },
      {
        icon: "sparkle",
        title: "Saving Insights",
        body:
          "Streaks, best months, savings rate, and pace-vs-deadline projections, generated from " +
          "your saving history and surfaced on both the Piggies and Insights views.",
      },
      {
        icon: "wallet",
        title: "Withdrawals, properly accounted",
        body:
          "Take money back out of a piggy without it being mistaken for income anywhere in the " +
          "app — budgets, charts, and your savings rate all account for it correctly.",
      },
      {
        icon: "budget",
        title: "Connected everywhere",
        body:
          "Piggies link from Overview, Budgets, and Categories, and export to their own CSV " +
          "alongside your transactions, schedule, and to-do lists.",
      },
    ],
  },
  {
    version: "1.1.1",
    date: "August 2026",
    lead: "A full changelog, a type refresh, and menus that stay on screen on a phone.",
    highlights: [
      {
        icon: "sparkle",
        title: "Changelog, not a one-shot note",
        body:
          "Account → What's New lists every version in one scroll. Got It stays at the bottom, " +
          "so you can close the modal without reading the whole archive.",
      },
      {
        icon: "info",
        title: "Type refresh",
        body:
          "Headlines, body copy, and figures now use Fraunces, Inter, and Roboto Mono. The " +
          "ledger should read a little clearer on both desktop and phone.",
      },
      {
        icon: "budget",
        title: "Chart labels stay inside the circle",
        body:
          "Donut-chart totals and captions no longer spill out of the ring. Long values ellipsize " +
          "instead of colliding with the slices.",
      },
      {
        icon: "wallet",
        title: "Menus you can actually reach",
        body:
          "On tablet and phone, the account, wallet, and month dropdowns now scroll inside the " +
          "panel. Sign Out and Manage Wallets no longer sit under the bottom nav.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "August 2026",
    lead: "A maintenance release: a faster Insights tab, a fixed install icon, and a squashed startup crash.",
    highlights: [
      {
        icon: "insights",
        title: "Snappier Insights",
        body:
          "The overview and spending-habit panels no longer recompute on every render. Switching " +
          "months, periods, or currency now updates only what actually changed.",
      },
      {
        icon: "shield",
        title: "Fixed a load-time crash",
        body:
          "A hooks-ordering bug could crash the app right as your ledger finished loading. Fixed at " +
          "the root: the loading and loaded states now use the exact same hooks.",
      },
      {
        icon: "download",
        title: "Install icon, fixed",
        body:
          "The home-screen icon and splash screen were pointing at a path that didn't exist in " +
          "production. Installing Sched Ledger now shows the right icon immediately.",
      },
    ],
  },
  {
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
  },
];
