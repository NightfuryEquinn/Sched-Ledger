import type { ViewId } from "@/frontend/lib/types";
import type { StepOptions } from "shepherd.js";

type TourStep = StepOptions & { id: string };

function navTarget(view: ViewId): string {
  return `[data-tour="tour-nav-${view}"]`;
}

function btn(text: string, action: "next" | "back" | "complete") {
  return { text, classes: action === "back" ? "shepherd-button-secondary" : "shepherd-button-primary", action };
}

function step(
  id: string,
  title: string,
  text: string,
  element: string,
  on: StepOptions["attachTo"] extends { on?: infer O } ? O : never = "bottom",
  extra: Partial<TourStep> = {},
): TourStep {
  return {
    id,
    title,
    text,
    attachTo: { element, on },
    buttons: [btn("Back", "back"), btn("Next", "next")],
    ...extra,
  };
}

function lastStep(
  id: string,
  title: string,
  text: string,
  element: string,
  on: StepOptions["attachTo"] extends { on?: infer O } ? O : never = "bottom",
): TourStep {
  return step(id, title, text, element, on, {
    buttons: [btn("Back", "back"), btn("Done", "complete")],
  });
}

export const SHELL_TOUR_STEPS: TourStep[] = [
  step(
    "shell-nav",
    "Navigation",
    "Jump between Overview, tasks, schedule, transactions, and more. On mobile, use the bar at the bottom.",
    ".sidebar .nav, .bottom-nav",
    "right",
  ),
  step(
    "shell-wallet",
    "Wallets",
    "Switch between wallets or open Manage wallets to set income, currency, and defaults.",
    '[data-tour="tour-wallet"]',
    "bottom",
  ),
  step(
    "shell-month",
    "Month",
    "Most views are scoped to the selected month. Use the arrows or tap the label to pick another month.",
    '[data-tour="tour-month"]',
    "bottom",
  ),
  step(
    "shell-fab",
    "Quick add",
    "Use the floating button to add a transaction or calendar event from anywhere in the app.",
    '[data-tour="tour-fab"]',
    "top",
  ),
  lastStep(
    "shell-account",
    "Account",
    "Theme, exports & imports, privacy settings, and sign out live here. You can also restart any tab tour from Take a tour.",
    '[data-tour="tour-account"]',
    "bottom",
  ),
];

const VIEW_STEPS: Record<ViewId, TourStep[]> = {
  overview: [
    step("overview-nav", "Overview", "Your monthly snapshot — income, spend, savings, and what's left.", navTarget("overview"), "right"),
    step("overview-summary", "Summary cards", "These four cards show your pool, spending, savings, and remaining balance for the month.", '[data-tour="tour-overview-summary"]'),
    step("overview-trend", "Spending trend", "Track cumulative spending against your total budget as the month progresses.", '[data-tour="tour-overview-trend"]', "top"),
    step("overview-donut", "By category", "Hover slices to see how spending breaks down across categories.", '[data-tour="tour-overview-donut"]', "left"),
    step("overview-budgets", "Budget tracker", "See progress per category. Tap Manage to edit allocations on the Budgets tab.", '[data-tour="tour-overview-budgets"]'),
    lastStep("overview-recent", "Recent activity", "Your latest transactions appear here. Tap one to edit, or See all for the full list.", '[data-tour="tour-overview-recent"]'),
  ],
  todos: [
    step("todos-nav", "TO-DO List", "Organize tasks into separate lists — groceries, work, travel, and more.", navTarget("todos"), "right"),
    step("todos-summary", "List stats", "Quick counts for lists, open tasks, and completed items.", '[data-tour="tour-todos-summary"]'),
    step("todos-toolbar", "New list", "Create a named list with an icon to keep tasks grouped.", '[data-tour="tour-todos-toolbar"]', "bottom"),
    step("todos-tabs", "Switch lists", "Each tab is a list. The badge shows completed vs total tasks.", '[data-tour="tour-todos-tabs"]'),
    lastStep("todos-tasks", "Tasks", "Check items off, add new tasks at the bottom, or edit the list with the icons above.", '[data-tour="tour-todos-tasks"]'),
  ],
  schedule: [
    step("schedule-nav", "Schedule", "Plan events and reminders on a calendar tied to your selected month.", navTarget("schedule"), "right"),
    step("schedule-summary", "At a glance", "See how many events you have, the next reminder, and email alerts queued.", '[data-tour="tour-schedule-summary"]'),
    step("schedule-cal", "Calendar", "Click a day to focus it in the agenda below. Click an event chip to edit.", '[data-tour="tour-schedule-cal"]', "top"),
    lastStep("schedule-agenda", "Agenda", "Browse day by day, add events with New event, and review what's coming up.", '[data-tour="tour-schedule-agenda"]'),
  ],
  transactions: [
    step("transactions-nav", "Transactions", "Every expense and income entry for the month, grouped by day.", navTarget("transactions"), "right"),
    step("transactions-search", "Search", "Filter by note text or category name to find a specific entry.", '[data-tour="tour-txn-toolbar"]'),
    step("transactions-filters", "Category filters", "Narrow the list to one category or income only.", '[data-tour="tour-txn-filters"]'),
    lastStep("transactions-list", "Entries", "Transactions are grouped by date. Tap a row to edit or delete.", '[data-tour="tour-txn-list"]'),
  ],
  budgets: [
    step("budgets-nav", "Budgets", "Set how much you plan to spend in each category for the month.", navTarget("budgets"), "right"),
    step("budgets-summary", "Totals", "Total budget, amount spent so far, and what's left to allocate.", '[data-tour="tour-budgets-summary"]'),
    lastStep("budgets-list", "Per category", "Tap an amount to edit a category budget. Progress bars show spend vs limit.", '[data-tour="tour-budgets-list"]'),
  ],
  categories: [
    step("categories-nav", "Categories", "Your expense and income taxonomy — categories and subcategories.", navTarget("categories"), "right"),
    step("categories-toolbar", "Filter & add", "Filter by type or add new expense and income categories.", '[data-tour="tour-categories-toolbar"]'),
    lastStep("categories-tree", "Category tree", "Expand categories to manage subcategories, colors, and icons.", '[data-tour="tour-categories-tree"]'),
  ],
  recurring: [
    step("recurring-nav", "Recurring", "Fixed charges that repeat weekly, monthly, or on another interval.", navTarget("recurring"), "right"),
    step("recurring-summary", "This month", "Total recurring due and the normalized monthly equivalent.", '[data-tour="tour-recurring-summary"]'),
    lastStep("recurring-list", "Scheduled items", "Tap a row to edit the underlying transaction. Add new ones via Add transaction with Recurring enabled.", '[data-tour="tour-recurring-list"]'),
  ],
  insights: [
    step("insights-nav", "Insights", "Longer-range trends, comparisons, and currency views.", navTarget("insights"), "right"),
    step("insights-fx", "Currency view", "Preview amounts in another currency using live exchange rates.", '[data-tour="tour-insights-fx"]'),
    step("insights-chart", "Month over month", "Switch between daily, monthly, quarterly, and yearly bars. Tap a bar to jump to that period.", '[data-tour="tour-insights-chart"]', "top"),
    lastStep("insights-trends", "Breakdowns", "Category trends vs last month and your top subcategories this month.", '[data-tour="tour-insights-trends"]'),
  ],
  transparency: [
    step("transparency-nav", "Transparency", "A read-only map of how Sched Ledger stores your data in MongoDB.", navTarget("transparency"), "right"),
    step("transparency-flow", "Relationships", "See how your wallet address links users, wallets, expenses, events, and more.", '[data-tour="tour-transparency-flow"]'),
    step("transparency-e2ee", "Encryption path", "Sensitive fields are AES-GCM encrypted in the browser before they hit the database.", '[data-tour="tour-transparency-e2ee"]'),
    lastStep("transparency-collections", "Keys & values", "Browse every collection and the document fields it saves.", '[data-tour="tour-transparency-collections"]'),
  ],
};

export function getViewTourSteps(view: ViewId): TourStep[] {
  return VIEW_STEPS[view];
}
