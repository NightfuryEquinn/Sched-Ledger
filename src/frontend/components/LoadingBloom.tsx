import { useState } from "react";

/**
 * Unified loading indicator: four copies of the app's leaf mark, spaced
 * evenly around a circle. The ring spins slowly and continuously while
 * each leaf blooms in a staggered wave timed to match the ring's period,
 * so the two motions read as one smooth, seamless loop.
 */
const LEAF_PATH =
  "M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66l.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8";

const RADIUS: Record<"sm" | "md", number> = { sm: 20, md: 34 };

/** Playful copy for open-ended waits (app boot, ledger fetch) — a fixed label overrides this. */
const RANDOM_MESSAGES = [
  "Preparing your ledger…",
  "Finding your budgets…",
  "Transactions inbound…",
  "Tallying your totals…",
  "Balancing the books…",
  "Counting your cents…",
  "Sorting your categories…",
  "Gathering your accounts…",
  "Crunching the numbers…",
  "Aligning your wallets…",
  "Reconciling your records…",
  "Unpacking your insights…",
  "Syncing your savings…",
  "Adding up your expenses…",
];

function randomMessage() {
  return RANDOM_MESSAGES[Math.floor(Math.random() * RANDOM_MESSAGES.length)];
}

export function LoadingBloom({
  label,
  size = "md",
}: {
  label?: string;
  size?: "sm" | "md";
}) {
  const radius = RADIUS[size];
  const [fallback] = useState(randomMessage);
  return (
    <div className={`loading-bloom loading-bloom--${size}`}>
      <div className="loading-bloom__ring" aria-hidden="true">
        {[45, 135, 225, 315].map((deg) => (
          <div
            key={deg}
            className="loading-bloom__pos"
            style={{ transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-${radius}px)` }}
          >
            <svg className="loading-bloom__leaf" viewBox="0 0 24 24">
              <path fill="currentColor" d={LEAF_PATH} />
            </svg>
          </div>
        ))}
      </div>
      <p className="loading-bloom__label">{label ?? fallback}</p>
    </div>
  );
}
