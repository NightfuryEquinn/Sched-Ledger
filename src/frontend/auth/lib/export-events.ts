import { buildCsv, downloadCsv } from "@/frontend/auth/lib/csv";
import { eventCatMeta } from "@/frontend/lib/data";
import type { LedgerEvent } from "@/frontend/lib/types";

const HEADER = [
  "ID",
  "Title",
  "CategoryId",
  "Category",
  "CustomLabel",
  "CustomGlyph",
  "Date",
  "EndDate",
  "AllDay",
  "Time",
  "EndTime",
  "Repeat",
  "Notify",
  "Lead",
  "Email",
  "CommentsJson",
];

function buildEventsCsv(events: LedgerEvent[]): string {
  const rows = events
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((ev) => {
      const cat = eventCatMeta(ev);
      return [
        ev.id,
        ev.title,
        ev.catId,
        cat.name,
        ev.customLabel ?? "",
        ev.customGlyph ?? "",
        ev.date,
        ev.endDate ?? "",
        ev.allDay ? "yes" : "no",
        ev.time ?? "",
        ev.endTime ?? "",
        ev.repeat,
        ev.notify ? "yes" : "no",
        ev.lead,
        ev.email ?? "",
        ev.comments?.length ? JSON.stringify(ev.comments) : "",
      ];
    });
  return buildCsv(HEADER, rows);
}

export function downloadEventsCsv(events: LedgerEvent[]): void {
  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(`ledger-schedule-${date}.csv`, buildEventsCsv(events));
}
