import { useEffect, useId, useRef, useState } from "react";

/*
 * Transparency — read-only data map
 * ─────────────────────────────────
 * Shows how Sched Ledger persists data: collection relationships,
 * E2EE write path, and each document's keys (with example values).
 */

type Field = { key: string; value: string; note?: string };

type CollectionDoc = {
  name: string;
  purpose: string;
  encrypted?: boolean;
  fields: Field[];
};

const COLLECTIONS: CollectionDoc[] = [
  {
    name: "users",
    purpose: "Wallet identity and notification preferences",
    fields: [
      { key: "address", value: '"0xabc…"', note: "wallet address (unique)" },
      { key: "codename", value: '"Maple Owl"' },
      { key: "notifyEmail?", value: '"you@mail.com"' },
      { key: "timezone?", value: '"Asia/Kuala_Lumpur"' },
      { key: "emailRemindersEnabled?", value: "true" },
      { key: "budgetAlertsEnabled?", value: "true" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "ledger_profiles",
    purpose: "Per-user UI state (selected month)",
    fields: [
      { key: "userAddress", value: '"0xabc…"' },
      { key: "currentMonth", value: '"2026-07"', note: "YYYY-MM" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "financial_wallets",
    purpose: "Wallets — income, starting balance, and budgets",
    encrypted: true,
    fields: [
      { key: "userAddress", value: '"0xabc…"' },
      { key: "name", value: '"Main"' },
      { key: "currency", value: '"MYR"' },
      { key: "fundingMode", value: '"monthly" | "starting"' },
      { key: "enc", value: "1", note: "E2EE version" },
      { key: "payload", value: "base64 AES-GCM", note: "income, startingBalance, budgets" },
      { key: "isDefault", value: "true" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "category_taxonomies",
    purpose: "Expense / income category tree per user",
    fields: [
      { key: "userAddress", value: '"0xabc…"' },
      { key: "categories[]", value: "{ id, name, color, glyph, type, builtin, subs[] }" },
      { key: "categories[].subs[]", value: "{ id, name }" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "expenses",
    purpose: "Transactions (expense or income)",
    encrypted: true,
    fields: [
      { key: "userAddress", value: '"0xabc…"' },
      { key: "walletId", value: "ObjectId" },
      { key: "kind", value: '"expense" | "income"' },
      { key: "date", value: '"2026-07-16"' },
      { key: "recurring", value: "false | interval" },
      { key: "enc", value: "1" },
      { key: "payload", value: "base64 AES-GCM", note: "sub, amount, note" },
      { key: "seriesKey?", value: "sha256 hex", note: "recurring series id" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "events",
    purpose: "Calendar events and reminders",
    fields: [
      { key: "userAddress", value: '"0xabc…"' },
      { key: "title", value: '"Dentist"' },
      { key: "catId", value: '"health" | "custom"' },
      { key: "customLabel? / customGlyph?", value: "when catId is custom" },
      { key: "date", value: '"2026-07-20"' },
      { key: "allDay", value: "true" },
      { key: "time", value: '"14:30" | null' },
      { key: "repeat", value: '"once" | …' },
      { key: "notify / lead / email", value: "reminder settings" },
      { key: "comments[]", value: "{ id, text, at }" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "todo_lists",
    purpose: "Named task lists",
    fields: [
      { key: "userAddress", value: '"0xabc…"' },
      { key: "name", value: '"Groceries"' },
      { key: "icon", value: '"📋"' },
      { key: "tasks[]", value: "{ id, title, done }" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "consent",
    purpose: "Third-party data-sharing opt-in",
    fields: [
      { key: "userAddress", value: '"0xabc…"' },
      { key: "optedIn", value: "false" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "auth_nonces",
    purpose: "One-time SIWE / sign-in challenges",
    fields: [
      { key: "address", value: '"0xabc…"' },
      { key: "nonce", value: "random string" },
      { key: "message", value: "sign-in message" },
      { key: "expiresAt", value: "Date" },
      { key: "usedAt?", value: "Date" },
    ],
  },
  {
    name: "sessions",
    purpose: "Authenticated browser sessions",
    fields: [
      { key: "address", value: '"0xabc…"' },
      { key: "tokenHash", value: "hashed cookie token" },
      { key: "userAgent / ip", value: "client metadata" },
      { key: "createdAt / lastSeenAt / expiresAt", value: "Dates" },
      { key: "revokedAt?", value: "Date" },
    ],
  },
  {
    name: "reminder_logs",
    purpose: "Dedupes sent event reminder emails",
    fields: [
      { key: "eventId", value: "ObjectId" },
      { key: "occurrenceIso", value: "ISO datetime" },
      { key: "lead", value: '"1d"' },
      { key: "email", value: '"you@mail.com"' },
      { key: "channels?", value: '["email"]' },
      { key: "sentAt", value: "Date" },
    ],
  },
  {
    name: "budget_alert_logs",
    purpose: "Dedupes budget-near-limit email delivery",
    fields: [
      { key: "userAddress", value: '"0xabc…"' },
      { key: "walletId / categoryId", value: "ids" },
      { key: "month", value: '"2026-07"' },
      { key: "level", value: '"warning" | "exceeded"' },
      { key: "email / channels? / sentAt", value: "delivery record" },
    ],
  },
];

const RELATIONSHIP_CHART = `flowchart TB
  subgraph Client["Browser client"]
    UI["React UI"]
    Key["In-memory ledger key<br/>from wallet signature"]
    LS["localStorage<br/>identities · session · theme · tour"]
  end

  subgraph API["API / MongoDB"]
    Users["users"]
    Profile["ledger_profiles"]
    Wallets["financial_wallets<br/>enc + payload"]
    Cats["category_taxonomies"]
    Exp["expenses<br/>enc + payload"]
    Ev["events"]
    Todos["todo_lists"]
    Consent["consent"]
    Auth["auth_nonces · sessions"]
    Logs["reminder_logs · budget_alert_logs"]
  end

  UI --> Key
  UI --> LS
  UI -->|"signed requests"| API
  Key -->|"AES-GCM encrypt/decrypt"| Wallets
  Key -->|"AES-GCM encrypt/decrypt"| Exp
  Users -->|"owns"| Profile
  Users -->|"owns"| Wallets
  Users -->|"owns"| Cats
  Users -->|"owns"| Exp
  Users -->|"owns"| Ev
  Users -->|"owns"| Todos
  Users -->|"owns"| Consent
  Users --> Auth
  Ev --> Logs
  Wallets --> Logs
`;

const E2EE_CHART = `flowchart LR
  Plain["Plain fields<br/>sub · amount · note<br/>income · budgets"]
  Enc["AES-GCM encrypt<br/>with ledger key"]
  Doc["Mongo document<br/>enc: 1<br/>payload: base64 blob"]
  DB[("MongoDB")]
  DbOut["Fetch document"]
  Decr["AES-GCM decrypt<br/>in browser"]
  Ready["UI sees plaintext<br/>server never does"]

  Plain --> Enc --> Doc --> DB
  DB --> DbOut --> Decr --> Ready
`;

function readTheme(): "dark" | "neutral" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "neutral";
}

function MermaidDiagram({ chart, label }: { chart: string; label: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    const render = async () => {
      try {
        setLoading(true);
        const mermaid = (await import("mermaid")).default;
        if (cancelled) return;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: readTheme(),
          flowchart: { curve: "basis", htmlLabels: true, padding: 12 },
        });
        const id = `mmd-${reactId}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg } = await mermaid.render(id, chart);
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = svg;
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to render diagram");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void render();

    const obs = new MutationObserver(() => {
      void render();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      cancelled = true;
      obs.disconnect();
    };
  }, [chart, reactId]);

  return (
    <div className="transparency-diagram" role="img" aria-label={label}>
      {loading ? <p className="transparency-loading">Rendering diagram…</p> : null}
      {error ? <p className="transparency-error">{error}</p> : null}
      <div ref={hostRef} className="transparency-mermaid" />
    </div>
  );
}

function CollectionCard({ doc }: { doc: CollectionDoc }) {
  return (
    <article className="transparency-card">
      <header className="transparency-card-head">
        <h3>
          <code>{doc.name}</code>
        </h3>
        {doc.encrypted ? <span className="transparency-badge">E2EE payload</span> : null}
      </header>
      <p className="transparency-card-purpose">{doc.purpose}</p>
      <dl className="transparency-kv">
        {doc.fields.map((f) => (
          <div key={f.key} className="transparency-kv-row">
            <dt>
              <code>{f.key}</code>
            </dt>
            <dd>
              <code>{f.value}</code>
              {f.note ? <span className="transparency-note">{f.note}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function Transparency() {
  return (
    <div className="view transparency-view">
      <section className="panel" data-tour="tour-transparency-intro">
        <div className="panel-head panel-head--stack">
          <div>
            <h2>How your data is stored</h2>
            <p className="panel-sub">
              Read-only map of MongoDB collections, document keys, and the end-to-end encryption path.
              Sensitive money fields never leave your browser as plaintext.
            </p>
          </div>
        </div>
      </section>

      <section className="panel" data-tour="tour-transparency-flow">
        <div className="panel-head panel-head--stack">
          <div>
            <h2>Data relationships</h2>
            <p className="panel-sub">Your wallet address anchors every user-owned collection</p>
          </div>
        </div>
        <MermaidDiagram chart={RELATIONSHIP_CHART} label="Collection relationship flowchart" />
      </section>

      <section className="panel" data-tour="tour-transparency-e2ee">
        <div className="panel-head panel-head--stack">
          <div>
            <h2>Encrypted write path</h2>
            <p className="panel-sub">
              Expenses and wallet secrets are AES-GCM encrypted client-side before save
            </p>
          </div>
        </div>
        <MermaidDiagram chart={E2EE_CHART} label="E2EE save flowchart" />
      </section>

      <section className="panel" data-tour="tour-transparency-collections">
        <div className="panel-head panel-head--stack">
          <div>
            <h2>Collections · keys &amp; values</h2>
            <p className="panel-sub">Each Mongo document stores these fields</p>
          </div>
        </div>
        <div className="transparency-grid">
          {COLLECTIONS.map((doc) => (
            <CollectionCard key={doc.name} doc={doc} />
          ))}
        </div>
      </section>
    </div>
  );
}
