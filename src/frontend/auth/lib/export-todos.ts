import { buildCsv, downloadCsv } from "@/frontend/auth/lib/csv";
import type { TodoList } from "@/frontend/lib/types";

const HEADER = ["ListId", "ListName", "ListIcon", "TaskId", "TaskTitle", "Done"];

export function buildTodosCsv(todoLists: TodoList[]): string {
  const rows: unknown[][] = [];
  for (const list of todoLists) {
    if (list.tasks.length) {
      for (const task of list.tasks) {
        rows.push([list.id, list.name, list.icon, task.id, task.title, task.done ? "yes" : "no"]);
      }
    } else {
      rows.push([list.id, list.name, list.icon, "", "", ""]);
    }
  }
  return buildCsv(HEADER, rows);
}

export function downloadTodosCsv(todoLists: TodoList[]): void {
  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(`ledger-todos-${date}.csv`, buildTodosCsv(todoLists));
}
