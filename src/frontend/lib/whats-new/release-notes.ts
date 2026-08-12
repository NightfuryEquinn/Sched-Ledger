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
        "the root — the loading and loaded states now use the exact same hooks.",
    },
    {
      icon: "download",
      title: "Install icon, fixed",
      body:
        "The home-screen icon and splash screen were pointing at a path that didn't exist in " +
        "production. Installing Sched Ledger now shows the right icon immediately.",
    },
  ],
};
