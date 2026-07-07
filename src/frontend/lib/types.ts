export type Expense = {
  id: string;
  date: string;
  sub: string;
  amount: number;
  note: string;
  recurring: boolean;
};

export type EventComment = {
  id: string;
  text: string;
  at: string;
};

export type LedgerEvent = {
  id: string;
  title: string;
  catId: string;
  date: string;
  allDay: boolean;
  time: string | null;
  repeat: string;
  notify: boolean;
  lead: string;
  email: string;
  comments: EventComment[];
};

export type Budgets = Record<string, number>;

export type Account = {
  address: string;
  codename: string;
  injected?: boolean;
};

export type ViewId =
  | "overview"
  | "transactions"
  | "budgets"
  | "schedule"
  | "insights"
  | "recurring";

export type MonthEntry = {
  key: string;
  year: number;
  m: number;
};

export type Category = {
  id: string;
  name: string;
  color: string;
  glyph: string;
  subs: { id: string; name: string }[];
};

export type IdentityRecord = {
  address: string;
  codename?: string;
  mnemonic?: string;
  privateKey?: string;
  injected?: boolean;
  lastSeen?: number;
};
