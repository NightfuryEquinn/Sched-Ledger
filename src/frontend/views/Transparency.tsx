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
      { key: "address", value: '"0xabc…"', note: "SIWE login address only (unique); prefer a ledger-only key" },
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
      { key: "accountId", value: '"64b6…"', note: "users._id hex (opaque)" },
      { key: "currentMonth", value: '"2026-07"', note: "YYYY-MM" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "financial_wallets",
    purpose: "Wallets — income, starting balance, and budgets",
    encrypted: true,
    fields: [
      { key: "accountId", value: '"64b6…"', note: "users._id hex (opaque)" },
      { key: "currency", value: '"MYR"' },
      { key: "fundingMode", value: '"monthly" | "starting"' },
      { key: "enc", value: "1", note: "E2EE version" },
      { key: "payload", value: "base64 AES-GCM", note: "name, income, startingBalance, budgets" },
      { key: "isDefault", value: "true" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "category_taxonomies",
    purpose: "Expense / income category tree per user",
    encrypted: true,
    fields: [
      { key: "accountId", value: '"64b6…"', note: "users._id hex (opaque)" },
      { key: "enc", value: "1", note: "E2EE version" },
      { key: "payload", value: "base64 AES-GCM", note: "categories[] tree" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "expenses",
    purpose: "Transactions (expense or income)",
    encrypted: true,
    fields: [
      { key: "accountId", value: '"64b6…"', note: "users._id hex (opaque)" },
      { key: "walletId", value: "ObjectId", note: "random ObjectId (no timestamp)" },
      { key: "kind", value: '"expense" | "income"' },
      { key: "date", value: '"2026-07-16"' },
      { key: "recurring", value: "false | interval" },
      { key: "enc", value: "1" },
      { key: "payload", value: "base64 AES-GCM", note: "sub, amount, note" },
      { key: "seriesKey?", value: "sha256 hex", note: "recurring series id" },
      { key: "eventId?", value: "ObjectId", note: "optional link to a schedule event (plaintext)" },
      { key: "skipped?", value: "false", note: "soft-delete for recurring cron" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "events",
    purpose: "Calendar events and reminders",
    encrypted: true,
    fields: [
      { key: "accountId", value: '"64b6…"', note: "users._id hex (opaque)" },
      { key: "enc", value: "1", note: "E2EE version" },
      { key: "payload", value: "base64 AES-GCM", note: "title, comments, customLabel/Glyph, budget hold fields" },
      { key: "catId", value: '"bill" | "custom" | …' },
      { key: "date", value: '"2026-07-20"' },
      { key: "allDay / time / repeat", value: "schedule metadata" },
      { key: "exceptDates? / until?", value: "recurrence exceptions / end date" },
      { key: "notify / lead / email", value: "reminder settings (plaintext for cron)", note: "emails use a generic title; real title stays encrypted" },
      { key: "expenseId?", value: "ObjectId", note: "optional link when a bill payment was logged" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "todo_lists",
    purpose: "Named task lists",
    encrypted: true,
    fields: [
      { key: "accountId", value: '"64b6…"', note: "users._id hex (opaque)" },
      { key: "enc", value: "1", note: "E2EE version" },
      { key: "payload", value: "base64 AES-GCM", note: "name, icon, tasks[]" },
      { key: "createdAt / updatedAt", value: "ISO dates" },
    ],
  },
  {
    name: "consent",
    purpose: "Third-party data-sharing opt-in",
    fields: [
      { key: "accountId", value: '"64b6…"', note: "users._id hex (opaque)" },
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
      { key: "createdAt", value: "Date" },
    ],
  },
  {
    name: "sessions",
    purpose: "Authenticated browser sessions",
    fields: [
      { key: "accountId", value: '"64b6…"', note: "opaque users._id" },
      { key: "tokenHash", value: "hashed cookie token (rotated on sliding renewal)" },
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
    purpose: "Dedupes budget-near-limit email delivery (client evaluates; server delivers)",
    fields: [
      { key: "accountId", value: '"64b6…"', note: "users._id hex (opaque)" },
      { key: "walletId / categoryId", value: "ids" },
      { key: "month", value: '"2026-07"' },
      { key: "level", value: '"warning" | "exceeded"' },
      { key: "email / channels? / sentAt", value: "delivery record" },
    ],
  },
  {
    name: "rate_limits",
    purpose: "Shared API rate-limit buckets across serverless instances",
    fields: [
      { key: "_id", value: '"global:1.2.3.4"', note: "prefix + client key" },
      { key: "count", value: "12" },
      { key: "resetAt", value: "Date", note: "TTL index expires the bucket" },
    ],
  },
];

const RELATIONSHIP_CHART = `flowchart TB
  subgraph Client["Browser client"]
    UI["React UI"]
    Key["In-memory ledger key<br/>from wallet signature"]
    LS["localStorage<br/>identities · session · theme · tour<br/>active wallet · prefs"]
  end

  subgraph API["API / MongoDB"]
    Users["users"]
    Profile["ledger_profiles"]
    Wallets["financial_wallets<br/>enc + payload"]
    Cats["category_taxonomies<br/>enc + payload"]
    Exp["expenses<br/>enc + payload"]
    Ev["events<br/>enc + payload"]
    Todos["todo_lists<br/>enc + payload"]
    Consent["consent"]
    Auth["auth_nonces · sessions"]
    Logs["reminder_logs · budget_alert_logs"]
  end

  UI --> Key
  UI --> LS
  UI -->|"session cookie"| API
  Key -->|"AES-256-GCM encrypt/decrypt"| Wallets
  Key -->|"AES-256-GCM encrypt/decrypt"| Cats
  Key -->|"AES-256-GCM encrypt/decrypt"| Exp
  Key -->|"AES-256-GCM encrypt/decrypt"| Ev
  Key -->|"AES-256-GCM encrypt/decrypt"| Todos
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

/** Mobile: stack client above API with TB-only subgraphs (avoids side-by-side). */
const RELATIONSHIP_CHART_MOBILE = `flowchart TB
  subgraph Client["Browser client"]
    direction TB
    UI["React UI"]
    Key["In-memory ledger key<br/>from wallet signature"]
    LS["localStorage<br/>identities · session · theme · tour<br/>active wallet · prefs"]
    UI --> Key
    UI --> LS
  end

  subgraph API["API / MongoDB"]
    direction TB
    Users["users"]
    Profile["ledger_profiles"]
    Wallets["financial_wallets<br/>enc + payload"]
    Cats["category_taxonomies<br/>enc + payload"]
    Exp["expenses<br/>enc + payload"]
    Ev["events<br/>enc + payload"]
    Todos["todo_lists<br/>enc + payload"]
    Consent["consent"]
    Auth["auth_nonces · sessions"]
    Logs["reminder_logs · budget_alert_logs"]
    Users --> Profile
    Users --> Wallets
    Users --> Cats
    Users --> Exp
    Users --> Ev
    Users --> Todos
    Users --> Consent
    Users --> Auth
    Ev --> Logs
    Wallets --> Logs
  end

  Client -->|"session cookie"| API
  Key -.->|"AES-256-GCM"| Wallets
  Key -.->|"AES-256-GCM"| Cats
  Key -.->|"AES-256-GCM"| Exp
  Key -.->|"AES-256-GCM"| Ev
  Key -.->|"AES-256-GCM"| Todos
`;

const E2EE_CHART = `flowchart LR
  Plain["Plain fields<br/>titles · categories · amounts<br/>notes · tasks · wallet names · budgets"]
  Enc["AES-256-GCM encrypt<br/>with ledger key"]
  Doc["Mongo document<br/>enc: 1<br/>payload: base64 blob"]
  DB[("MongoDB")]
  DbOut["Fetch document"]
  Decr["AES-256-GCM decrypt<br/>in browser"]
  Ready["UI sees plaintext<br/>E2EE fields stay ciphertext on server"]

  Plain --> Enc --> Doc --> DB
  DB --> DbOut --> Decr --> Ready
`;

/** Mobile: same write path stacked top-to-bottom. */
const E2EE_CHART_MOBILE = `flowchart TB
  Plain["Plain fields<br/>titles · categories · amounts<br/>notes · tasks · wallet names · budgets"]
  Enc["AES-256-GCM encrypt<br/>with ledger key"]
  Doc["Mongo document<br/>enc: 1<br/>payload: base64 blob"]
  DB[("MongoDB")]
  DbOut["Fetch document"]
  Decr["AES-256-GCM decrypt<br/>in browser"]
  Ready["UI sees plaintext<br/>E2EE fields stay ciphertext on server"]

  Plain --> Enc --> Doc --> DB
  DB --> DbOut --> Decr --> Ready
`;

/** Hosting and scheduler roles — free-tier stack. */
const SYSTEM_CHART = `flowchart LR
  Browser["Browser<br/>unlock · encrypt · PWA cache"]
  Vercel["Vercel Hobby<br/>host SPA + API<br/>Analytics only"]
  Atlas[("MongoDB Atlas M0<br/>ciphertext + metadata")]
  Cron["cron-job.org<br/>HTTP poll every ~5 min"]
  Resend["Resend<br/>reminder / alert email"]

  Browser -->|"HTTPS session"| Vercel
  Vercel -->|"read/write docs"| Atlas
  Cron -->|"GET /api/cron/reminders"| Vercel
  Vercel -->|"send email"| Resend
`;

const SYSTEM_CHART_MOBILE = `flowchart TB
  Browser["Browser<br/>unlock · encrypt · PWA cache"]
  Vercel["Vercel Hobby<br/>host SPA + API<br/>Analytics only"]
  Atlas[("MongoDB Atlas M0<br/>ciphertext + metadata")]
  Cron["cron-job.org<br/>HTTP poll every ~5 min"]
  Resend["Resend<br/>reminder / alert email"]

  Browser --> Vercel --> Atlas
  Cron --> Vercel
  Vercel --> Resend
`;

const MOBILE_MQ = "(max-width: 860px)";

/** Read the current color theme for Mermaid. */
function readTheme(): "dark" | "neutral" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "neutral";
}

/** Track whether the viewport matches the tablet/mobile breakpoint. */
function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_MQ).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    /** Sync React state when the media query flips. */
    const onChange = () => setMobile(mq.matches);

    onChange();
    mq.addEventListener("change", onChange);

    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mobile;
}

function MermaidDiagram({
  chart,
  mobileChart,
  label,
}: {
  chart: string;
  mobileChart?: string;
  label: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replace(/:/g, "");
  const isMobile = useIsMobile();
  const activeChart = isMobile && mobileChart ? mobileChart : chart;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    /** Render (or re-render) the Mermaid SVG into the host. */
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
        const { svg } = await mermaid.render(id, activeChart);
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
  }, [activeChart, reactId]);

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
            <h2>How the Whole System Works</h2>
            <p className="panel-sub">
              Sched Ledger is private by design: your browser derives a ledger key from your wallet signature,
              encrypts secrets with AES-256-GCM, and syncs ciphertext to MongoDB Atlas. Vercel hosts the app and API
              (plus Analytics / Speed Insights) but does not run cron. cron-job.org is the only scheduler — it polls
              <code> GET /api/cron/reminders </code>
              about every five minutes for email reminders and recurring expense rows. Optional email uses Resend.
              A device passphrase wraps your in-app recovery key on this browser; encrypted backups download to your
              machine only. The installable PWA may cache ciphertext locally for offline reads — saves still need the network.
            </p>
          </div>
        </div>
      </section>

      <section className="panel" data-tour="tour-transparency-system">
        <div className="panel-head panel-head--stack">
          <div>
            <h2>Hosting &amp; Jobs</h2>
            <p className="panel-sub">Free-tier roles: Vercel hosts, Atlas stores, cron-job.org schedules</p>
          </div>
        </div>
        <MermaidDiagram
          chart={SYSTEM_CHART}
          mobileChart={SYSTEM_CHART_MOBILE}
          label="System Hosting Flowchart"
        />
      </section>

      <section className="panel" data-tour="tour-transparency-infer">
        <div className="panel-head panel-head--stack">
          <div>
            <h2>What the Server Can Infer</h2>
            <p className="panel-sub">
              Even with E2EE, plaintext metadata remains for queries and accurate schedule reminders (day-level dates
              and lead times are intentional — not bucketed). Owned documents are keyed by an opaque{" "}
              <code>accountId</code> (<code>users._id</code>); the SIWE wallet address lives only on{" "}
              <code>users</code> for login. The server can still see that address, session cookies (HttpOnly, rotated
              on sliding renewal), wallet currencies/funding modes, expense dates/kinds/recurrence flags, schedule
              timing, reminder email addresses and lead times, and that a budget-alert email was delivered — but not
              amounts, wallet names, category trees, notes, event titles, or to-do text. Reminder emails use a generic
              subject; titles stay encrypted. Linking a bill payment stores plaintext <code>eventId</code> /{" "}
              <code>expenseId</code> references only.
            </p>
            <p className="panel-sub" style={{ marginTop: "0.75rem" }}>
              If the same auth key is ever used on-chain, chain analysis can correlate it with this account. Prefer a{" "}
              <strong>ledger-only</strong> identity created in-app (not a funded exchange or hot wallet). Optional
              notification email plus timing metadata still form an identity/behavior graph without decrypting
              ciphertext. E2EE does not remove data-protection obligations for plaintext metadata under regimes like
              GDPR/CCPA — not legal advice; get a lawyer&apos;s read if you ship commercially.
            </p>
          </div>
        </div>
      </section>

      <section className="panel" data-tour="tour-transparency-flow">
        <div className="panel-head panel-head--stack">
          <div>
            <h2>Data Relationships</h2>
            <p className="panel-sub">Opaque accountId anchors every user-owned collection; SIWE address stays on users</p>
          </div>
        </div>
        <MermaidDiagram
          chart={RELATIONSHIP_CHART}
          mobileChart={RELATIONSHIP_CHART_MOBILE}
          label="Collection Relationship Flowchart"
        />
      </section>

      <section className="panel" data-tour="tour-transparency-e2ee">
        <div className="panel-head panel-head--stack">
          <div>
            <h2>Encrypted Write Path</h2>
            <p className="panel-sub">
              Categories, events, todos, expenses, and wallet names/budgets are AES-256-GCM encrypted client-side before save
            </p>
          </div>
        </div>
        <MermaidDiagram
          chart={E2EE_CHART}
          mobileChart={E2EE_CHART_MOBILE}
          label="E2EE save flowchart"
        />
      </section>

      <section className="panel" data-tour="tour-transparency-collections">
        <div className="panel-head panel-head--stack">
          <div>
            <h2>Collections · Keys &amp; Values</h2>
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
