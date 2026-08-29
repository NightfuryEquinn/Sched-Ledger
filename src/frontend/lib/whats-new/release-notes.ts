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
  | "capital"
  | "car";

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
    version: "4.1.1",
    date: "August 2026",
    lead: "You choose whether the guided tour runs, tours stop reappearing after you close them, and every button that talks to the server now looks the part while it works.",
    highlights: [
      {
        icon: "info",
        title: "Your call on the tour",
        body:
          "The first time you sign in, Sched Ledger asks whether you want the guided walk-through or would rather explore " +
          "on your own. Pick either — the answer is saved to your account, so it follows you to every device instead of " +
          "being asked again on each new browser.",
      },
      {
        icon: "sparkle",
        title: "Tours that stay closed",
        body:
          "Closing a tour with the X used to count for nothing: it reopened on the very next load, every time. Dismissing " +
          "a tour now settles it. The ? beside any page title still replays that view's tour whenever you want it.",
      },
      {
        icon: "shield",
        title: "Buttons that show their state",
        body:
          "Cancel, Delete, Revoke, and the account menu now dim properly while a request is in flight instead of looking " +
          "clickable, and buttons no longer resize when their label switches to Saving…. Long category names ellipsize " +
          "inside their chip rather than spilling out of the row.",
      },
    ],
  },
  {
    version: "4.1.0",
    date: "August 2026",
    lead: "Smoother transitions across the app, a trefoil loader, safer saves when you tap fast, and stricter dev tooling to keep the codebase lean.",
    highlights: [
      {
        icon: "sparkle",
        title: "Trefoil loader",
        body:
          "Boot, ledger fetch, and lazy view switches now show a branded trefoil spinner instead of the hand-rolled bloom animation — " +
          "same playful wait messages, sharper visual polish.",
      },
      {
        icon: "shield",
        title: "Safer saves",
        body:
          "Double-clicks and Enter-then-blur on budgets, expenses, events, capitals, todos, and sign-out no longer fire duplicate " +
          "requests. Buttons show Saving… or Signing Out… while a change is in flight.",
      },
      {
        icon: "info",
        title: "Dev hygiene",
        body:
          "The repo now runs TypeScript type-checking and knip dead-code detection — run bun run typecheck and bun run knip " +
          "before shipping to catch unused exports and type errors early.",
      },
      {
        icon: "sparkle",
        title: "Unified motion",
        body:
          "Modals, views, pickers, and charts now animate through anime.js instead of scattered CSS keyframes — " +
          "including enter and exit on dialogs. Respects your OS reduce-motion setting.",
      },
    ],
  },
  {
    version: "4.0.0",
    date: "August 2026",
    lead: "Meet Vehicles and Fuel Insights, plus a ranked \"What Stands Out\" feed that forecasts and flags anomalies in Transaction Insights.",
    highlights: [
      {
        icon: "car",
        title: "Meet Vehicles",
        body:
          "Track fuel or charging costs per vehicle — car, EV, bike, or van. Log fill-ups or charges with price, quantity, " +
          "odometer, and station, and optionally link one to a real ledger transaction with Log.",
      },
      {
        icon: "car",
        title: "Fuel Insights",
        body:
          "Once a vehicle has enough fill history, see consumption vs your own baseline, price timing, running-cost " +
          "projections, and cadence — generated on the Vehicles view. EVs automatically read as kWh, charge, and kWh/100km " +
          "instead of litres and fill-ups.",
      },
      {
        icon: "sparkle",
        title: "What Stands Out",
        body:
          "A new ranked feed on Insights surfaces month-end spend forecasts with a confidence band, over-budget categories " +
          "before the month ends, unusually large charges, category spend that has drifted, and recurring charges that are " +
          "new, gone quiet, or creeping up in price.",
      },
    ],
  },
  {
    version: "3.3.1",
    date: "August 2026",
    lead: "A quieter type system shared by the app and marketing site, plus summary cards that keep large amounts readable on phones.",
    highlights: [
      {
        icon: "sparkle",
        title: "Type refresh",
        body:
          "Headlines use Young Serif, UI copy uses Schibsted Grotesk, and amounts use Azeret Mono — " +
          "the same stack on the marketing site. Tracking is opened slightly for easier reading.",
      },
      {
        icon: "budget",
        title: "Summary cards that fit",
        body:
          "Summary amounts stay between 20px and 24px. On tablet and phone the grid reflows " +
          "(including five-card Budgets and Capitals rows) so 8–9 digit figures do not overflow.",
      },
    ],
  },
  {
    version: "3.3.0",
    date: "August 2026",
    lead: "Route savings to a Capital plan as Unspent, pick savings deadlines with the same calendar as Events, and cleaner category rows.",
    highlights: [
      {
        icon: "capital",
        title: "Unspent on Capitals",
        body:
          "When you add a savings deposit, optionally assign it to a Capital plan — it shows as Unspent on that plan's card " +
          "and reduces the monthly save hint. Leave it on Piggies when no plan is selected.",
      },
      {
        icon: "piggy",
        title: "Piggies vs Capitals",
        body:
          "Unassigned savings still land in Piggies as before. Capital-assigned deposits are excluded from piggy balances " +
          "so the same money is never counted twice.",
      },
      {
        icon: "sparkle",
        title: "Savings deadline picker + category layout",
        body:
          "Add Savings Category now uses the custom date picker (same as Capitals and Transactions). " +
          "Category rows in the tree use a flex layout for name, tags, and meta.",
      },
    ],
  },
  {
    version: "3.2.0",
    date: "August 2026",
    lead: "Unlock with Face ID, and the Notification menu is now Preferences.",
    highlights: [
      {
        icon: "shield",
        title: "Face ID / Touch ID unlock",
        body:
          "Skip typing your device passphrase — enable Face ID or Touch ID for this device from Account → Preferences, " +
          "or when offered right after you unlock with your passphrase. Your passphrase is encrypted with a key tied to " +
          "the biometric check and never leaves this device.",
      },
      {
        icon: "bell",
        title: "Notification → Preferences",
        body: "The per-device Notification menu is now Preferences, home to push notifications and Face ID together.",
      },
    ],
  },
  {
    version: "3.1.2",
    date: "August 2026",
    lead: "Capitals plans get a total budget, a monthly save hint from budget minus paid, and a summary of savings across every plan.",
    highlights: [
      {
        icon: "capital",
        title: "Total budget per plan",
        body:
          "Set the total budget for a Capitals plan. Paid line items count against it. The donut shows paid as a " +
          "percent of that budget — and flips to Overpaid when you spend past it.",
      },
      {
        icon: "piggy",
        title: "Monthly save + totals",
        body:
          "With a target date, each card shows how much to save per month: (budget − paid) ÷ months left. " +
          "A new Monthly Saving summary card totals that amount across every plan.",
      },
    ],
  },
  {
    version: "3.0.2",
    date: "August 2026",
    lead: "Capitals uses the same date picker as Events, plus tighter mobile modal spacing.",
    highlights: [
      {
        icon: "capital",
        title: "Capitals date picker",
        body:
          "New and edit plan modals now use the custom calendar picker — the same one on Events " +
          "and Transactions — instead of the browser's native date field.",
      },
      {
        icon: "sparkle",
        title: "Roomier mobile modals",
        body:
          "On phones, every modal gets extra space under the action buttons so Cancel and Save " +
          "no longer sit flush against the screen edge.",
      },
    ],
  },
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
