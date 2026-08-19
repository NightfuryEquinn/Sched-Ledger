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
    "Switch between wallets or open Manage Wallets to set income, currency, and defaults.",
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
    "Quick Add",
    "Use the floating button to add a transaction or calendar event from anywhere in the app.",
    '[data-tour="tour-fab"]',
    "top",
  ),
  lastStep(
    "shell-account",
    "Account",
    "Exports & Imports, privacy settings, and sign out live here. Restart this tab's tour anytime from Take a Tour. Theme is in the top bar.",
    '[data-tour="tour-account"]',
    "bottom",
  ),
];

const VIEW_STEPS: Record<ViewId, TourStep[]> = {
  overview: [
    step("overview-nav", "Overview", "Your monthly snapshot — income, spend, savings, and what's left.", navTarget("overview"), "right"),
    step("overview-summary", "Summary Cards", "These four cards show your pool, spending, savings, and remaining balance for the month.", '[data-tour="tour-overview-summary"]'),
    step("overview-oldest-todo", "Recent To-Do", "Up to three of your oldest to-do lists — tap to open TO-DO List.", '[data-tour="tour-overview-oldest-todo"]'),
    step("overview-today-schedule", "Recent Schedule", "Up to three remaining events for today, based on the current time when Overview loads.", '[data-tour="tour-overview-today-schedule"]'),
    step("overview-trend", "Spending & Earning Trend", "Track cumulative spending and earning against your total budget as the month progresses. Hover any day to see what you spent and earned, broken down by category.", '[data-tour="tour-overview-trend"]', "top"),
    step("overview-donut", "By Category", "Hover slices to see how spending breaks down across categories.", '[data-tour="tour-overview-donut"]', "left"),
    step("overview-recent", "Recent Transaction", "Up to three of your latest transactions. Tap one to edit, or See All for the full list.", '[data-tour="tour-overview-recent"]'),
    step("overview-piggies", "Piggies", "Your top savings categories at a glance — tap See All for the full Piggies view.", '[data-tour="tour-overview-piggies"]'),
    lastStep("overview-capitals", "Capitals", "Planning something big — a marriage, a trip, a loan? Capitals in the nav keeps a checklist and logs real payments back to your ledger.", navTarget("capitals"), "right"),
  ],
  todos: [
    step("todos-nav", "TO-DO List", "Organize tasks into separate lists — groceries, work, travel, and more.", navTarget("todos"), "right"),
    step("todos-summary", "List Stats", "Quick counts for lists, total tasks, and completed items.", '[data-tour="tour-todos-summary"]'),
    step("todos-toolbar", "New List", "Create a named list with an icon to keep tasks grouped.", '[data-tour="tour-todos-toolbar"]', "bottom"),
    step("todos-tabs", "Switch Lists", "Each tab is a list. The badge shows completed vs total tasks. Create a list first if you have none yet.", '[data-tour="tour-todos-tabs"]'),
    lastStep("todos-tasks", "Tasks", "Check items off, add new tasks at the bottom, or edit the list with the icons above.", '[data-tour="tour-todos-tasks"]'),
  ],
  schedule: [
    step("schedule-nav", "Schedule", "Plan events and reminders on a calendar tied to your selected month.", navTarget("schedule"), "right"),
    step("schedule-summary", "At a Glance", "See how many events you have, the next reminder, and email alerts queued.", '[data-tour="tour-schedule-summary"]'),
    step("schedule-cal", "Calendar", "Click a day to focus it in the agenda below. Click an event chip to edit.", '[data-tour="tour-schedule-cal"]', "top"),
    lastStep("schedule-agenda", "Agenda", "Browse day by day, add events with New Event (optional email reminders), and review what's coming up.", '[data-tour="tour-schedule-agenda"]'),
  ],
  transactions: [
    step("transactions-nav", "Transactions", "Every expense and income entry for the month, grouped by day.", navTarget("transactions"), "right"),
    step("transactions-search", "Search", "Filter by note text or category name to find a specific entry.", '[data-tour="tour-txn-toolbar"]'),
    step("transactions-filters", "Category Filters", "Narrow the list to one category or income only.", '[data-tour="tour-txn-filters"]'),
    lastStep("transactions-list", "Entries", "Transactions are grouped by date. Tap a row to edit or delete.", '[data-tour="tour-txn-list"]'),
  ],
  budgets: [
    step("budgets-nav", "Budgets", "Set how much you plan to spend in each category for the month.", navTarget("budgets"), "right"),
    step("budgets-summary", "Totals", "Total budget, amount spent so far, and what's left to allocate.", '[data-tour="tour-budgets-summary"]'),
    lastStep("budgets-list", "Per Category", "Tap an amount to edit a category budget. Progress bars show spend vs limit.", '[data-tour="tour-budgets-list"]'),
  ],
  calculator: [
    step("calculator-nav", "Calculator", "Plan budgets from income after custom tax deductions.", navTarget("calculator"), "right"),
    step("calculator-summary", "Totals", "Gross income, tax taken, and net left to allocate across categories.", '[data-tour="tour-calculator-summary"]'),
    step("calculator-income", "Income", "Set the gross amount to plan from — it stays on this screen only until you apply budgets.", '[data-tour="tour-calculator-income"]'),
    step("calculator-tax", "Tax Lines", "Add titled percentage deductions — they stay on this screen only.", '[data-tour="tour-calculator-tax"]'),
    step("calculator-allocate", "Allocate", "Set a percent per expense category until the total is 100%.", '[data-tour="tour-calculator-allocate"]'),
    lastStep("calculator-apply", "Apply", "Confirm to replace all expense category budgets on the active wallet.", '[data-tour="tour-calculator-apply"]', "top"),
  ],
  categories: [
    step("categories-nav", "Categories", "Your expense and income taxonomy — categories and subcategories.", navTarget("categories"), "right"),
    step("categories-toolbar", "Filter & Add", "Filter by type or add new expense, savings, and income categories.", '[data-tour="tour-categories-toolbar"]'),
    lastStep("categories-tree", "Category Tree", "Expand categories to manage subcategories, colors, and icons.", '[data-tour="tour-categories-tree"]'),
  ],
  recurring: [
    step("recurring-nav", "Recurring", "Fixed charges that repeat monthly, quarterly, or yearly.", navTarget("recurring"), "right"),
    step("recurring-summary", "This Month", "Total recurring due and the normalized monthly equivalent.", '[data-tour="tour-recurring-summary"]'),
    lastStep("recurring-list", "Scheduled Items", "Tap a row to edit the underlying transaction. Add new ones via Add Transaction with Recurring enabled.", '[data-tour="tour-recurring-list"]'),
  ],
  piggies: [
    step("piggies-nav", "Piggies", "One glance at every savings category and its lifetime balance.", navTarget("piggies"), "right"),
    step("piggies-summary", "Totals", "Total saved across every piggy, net flow, savings rate, and your current saving streak.", '[data-tour="tour-piggies-summary"]'),
    step("piggies-insights", "Saving Insights", "Streaks, best months, and pace-vs-deadline callouts, generated from your saving history.", '[data-tour="tour-piggies-insights"]'),
    lastStep("piggies-grid", "Piggy Cards", "Each card is a savings category — its progress ring, subcategories, and Add / Withdraw actions.", '[data-tour="tour-piggies-grid"]'),
  ],
  capitals: [
    step("capitals-nav", "Capitals", "Plan for big future expenses — marriage, trips, loans, or anything custom.", navTarget("capitals"), "right"),
    step("capitals-summary", "Totals", "Total planned across every plan, total paid so far, and how many plans have an upcoming target date.", '[data-tour="tour-capitals-summary"]'),
    step("capitals-toolbar", "New Plan", "Start from a template — marriage, trip, car loan, house loan — or build a fully custom plan.", '[data-tour="tour-capitals-toolbar"]', "bottom"),
    lastStep("capitals-grid", "Plan Cards", "Each card is a plan — its progress ring, line items, and Log button to record a real payment in the ledger.", '[data-tour="tour-capitals-grid"]'),
  ],
  insights: [
    step("insights-nav", "Insights", "Longer-range trends, comparisons, and currency views.", navTarget("insights"), "right"),
    step("insights-fx", "Currency View", "Preview amounts in another currency using live exchange rates.", '[data-tour="tour-insights-fx"]'),
    step("insights-habits", "Spending Habit", "After five transaction days, see your month or year spending style — clockwork, burst, dripper, and more.", '[data-tour="tour-insights-habits"]'),
    step("insights-chart", "Month Over Month", "Switch between daily, monthly, quarterly, and yearly bars. Hover a bar for its total spend and income, or tap it to jump to that period.", '[data-tour="tour-insights-chart"]', "top"),
    step("insights-trends", "Breakdowns", "Category trends vs last month and your top subcategories this month.", '[data-tour="tour-insights-trends"]'),
    lastStep("insights-income", "Income", "The same read on money coming in — trends by source, how it compares to last month, and how much you kept.", '[data-tour="tour-insights-income"]', "top"),
  ],
  transparency: [
    step("transparency-nav", "Transparency", "A read-only map of how Sched Ledger stores your data in MongoDB.", navTarget("transparency"), "right"),
    step("transparency-intro", "How Data is Stored", "Collections, document keys, and which fields are encrypted vs plaintext for reminders and queries.", '[data-tour="tour-transparency-intro"]'),
    step("transparency-flow", "Relationships", "See how your wallet address links users, wallets, expenses, events, and more.", '[data-tour="tour-transparency-flow"]'),
    step("transparency-e2ee", "Encryption Path", "Ledger secrets are AES-256-GCM encrypted in the browser before they hit the database.", '[data-tour="tour-transparency-e2ee"]'),
    lastStep("transparency-collections", "Keys & Values", "Browse every collection and the document fields it saves.", '[data-tour="tour-transparency-collections"]'),
  ],
};

export function getViewTourSteps(view: ViewId): TourStep[] {
  return VIEW_STEPS[view];
}
