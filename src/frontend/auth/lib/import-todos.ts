import {
  colIndex,
  OBJECT_ID,
  parseCsv,
  stripBom,
  type ImportRowError,
  type ImportRowNotice,
} from "@/frontend/auth/lib/csv";
import { slugId } from "@/frontend/lib/categories";
import type { TodoList, TodoTask } from "@/frontend/lib/types";
import { TODO_ICON_OPTIONS } from "@/lib/glyphs";

const TASK_ID = /^[a-z0-9_-]+$/;
const TODO_ICONS = new Set<string>(TODO_ICON_OPTIONS);

export type TodoImportList = {
  listId?: string;
  name: string;
  icon: string;
  tasks: TodoTask[];
};

export type ParseTodosCsvResult = {
  lists: TodoImportList[];
  errors: ImportRowError[];
  notices: ImportRowNotice[];
  stats: { newLists: number; newTasks: number };
};

function parseDone(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "yes" || v === "true" || v === "1" || v === "done";
}

function normalizeIcon(icon: string): string {
  const trimmed = icon.trim();
  return TODO_ICONS.has(trimmed) ? trimmed : "📋";
}

function listKey(listId: string, listName: string): string {
  if (listId) return `id:${listId.toLowerCase()}`;
  return `name:${listName.trim().toLowerCase()}`;
}

export function parseTodosCsv(text: string, existingLists: TodoList[] = []): ParseTodosCsvResult {
  const errors: ImportRowError[] = [];
  const notices: ImportRowNotice[] = [];
  const existingListIds = new Set(existingLists.map((l) => l.id.toLowerCase()));
  const existingListNames = new Map(existingLists.map((l) => [l.name.toLowerCase(), l.id]));
  const existingTaskIds = new Set(existingLists.flatMap((l) => l.tasks.map((t) => t.id)));
  const seenListKeys = new Set<string>();
  const seenTaskIds = new Set<string>();
  const grouped = new Map<string, TodoImportList>();
  let newLists = 0;
  let newTasks = 0;

  const parsed = parseCsv(stripBom(text));
  if (!parsed.length) {
    return { lists: [], errors: [{ row: 0, message: "The file is empty." }], notices, stats: { newLists: 0, newTasks: 0 } };
  }

  const headerMap = Object.fromEntries(parsed[0].map((h, i) => [h.trim().toLowerCase(), i]));
  const listIdIdx = colIndex(headerMap, "listid", "list id");
  const listNameIdx = colIndex(headerMap, "listname", "list name");
  const listIconIdx = colIndex(headerMap, "listicon", "list icon");
  const taskIdIdx = colIndex(headerMap, "taskid", "task id");
  const taskTitleIdx = colIndex(headerMap, "tasktitle", "task title", "title");
  const doneIdx = colIndex(headerMap, "done");

  if (listNameIdx === undefined) {
    return { lists: [], errors: [{ row: 0, message: "Missing required column: ListName." }], notices, stats: { newLists: 0, newTasks: 0 } };
  }

  parsed.slice(1).forEach((cells, i) => {
    const rowNum = i + 2;
    const get = (idx: number | undefined) => (idx === undefined ? "" : (cells[idx] ?? "").trim());

    const csvListId = get(listIdIdx);
    const listName = get(listNameIdx);
    if (!listName) {
      errors.push({ row: rowNum, message: "List name is required." });
      return;
    }
    if (csvListId && !OBJECT_ID.test(csvListId)) {
      errors.push({ row: rowNum, message: `Invalid list ID "${csvListId}".` });
      return;
    }

    const taskTitle = get(taskTitleIdx);
    const csvTaskId = get(taskIdIdx);
    if (!taskTitle && !csvTaskId) {
      /* Empty list placeholder row */
      const key = listKey(csvListId, listName);
      if (!grouped.has(key)) {
        grouped.set(key, { listId: csvListId || undefined, name: listName, icon: normalizeIcon(get(listIconIdx)), tasks: [] });
      }
      return;
    }
    if (!taskTitle) {
      errors.push({ row: rowNum, message: "Task title is required." });
      return;
    }
    if (csvTaskId && !TASK_ID.test(csvTaskId)) {
      errors.push({ row: rowNum, message: `Invalid task ID "${csvTaskId}".` });
      return;
    }

    const taskId = csvTaskId || slugId("task", taskTitle);
    if (existingTaskIds.has(taskId)) {
      errors.push({ row: rowNum, message: "Task already in your lists (duplicate ID)." });
      return;
    }
    if (seenTaskIds.has(taskId)) {
      errors.push({ row: rowNum, message: "Duplicate task ID in this file." });
      return;
    }
    seenTaskIds.add(taskId);

    const key = listKey(csvListId, listName);
    let entry = grouped.get(key);
    if (!entry) {
      const isNew =
        !(csvListId && existingListIds.has(csvListId.toLowerCase())) &&
        !existingListNames.has(listName.toLowerCase());
      if (isNew) newLists++;
      if (!seenListKeys.has(key)) seenListKeys.add(key);
      entry = { listId: csvListId || undefined, name: listName, icon: normalizeIcon(get(listIconIdx)), tasks: [] };
      grouped.set(key, entry);
    }

    entry.tasks.push({ id: taskId, title: taskTitle, done: parseDone(get(doneIdx)) });
    newTasks++;
  });

  const lists = [...grouped.values()];
  for (const list of lists) {
    const byId = list.listId && existingListIds.has(list.listId.toLowerCase());
    const byName = existingListNames.has(list.name.toLowerCase());
    if ((list.listId && !byId) || (!list.listId && !byName)) {
      if (byName) {
        notices.push({
          row: 0,
          message: `List "${list.name}" will merge into your existing list (name match).`,
        });
      }
    }
  }

  return { lists, errors, notices, stats: { newLists, newTasks } };
}
