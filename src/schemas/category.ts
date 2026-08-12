import { DEFAULT_GLYPH } from "@/lib/glyphs";
import { z } from "zod";
import { accountIdSchema } from "./ids";
import { encryptedPayloadSchema, e2eeVersionSchema } from "./encryption";

export const categoryIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9_]+$/, "Invalid category id");

export const subcategoryIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9_]+$/, "Invalid subcategory id");

export const categoryTypeSchema = z.enum(["expense", "income", "savings"]);

export const subcategorySchema = z.object({
  id: subcategoryIdSchema,
  name: z.string().trim().min(1).max(60),
});

export const categorySchema = z.object({
  id: categoryIdSchema,
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  glyph: z.string().min(1).max(8).default(DEFAULT_GLYPH),
  type: categoryTypeSchema.default("expense"),
  builtin: z.boolean().default(false),
  /**
   * Retired category kept for historical classification. Hidden from pickers
   * and budget editors, but still resolvable so past transactions keep their
   * type — deleting a savings category outright would silently reclassify its
   * whole history as spending.
   */
  archived: z.boolean().default(false),
  subs: z.array(subcategorySchema).min(1),
});

const categoryTaxonomySchema = z.object({
  accountId: accountIdSchema,
  enc: e2eeVersionSchema.optional(),
  payload: encryptedPayloadSchema.optional(),
  /** Legacy plaintext tree (pre-E2EE). */
  categories: z.array(categorySchema).min(1).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const updateCategoriesSchema = z.object({
  enc: e2eeVersionSchema,
  payload: encryptedPayloadSchema,
});

export type Subcategory = z.infer<typeof subcategorySchema>;
export type Category = z.infer<typeof categorySchema>;
export type CategoryTaxonomy = z.infer<typeof categoryTaxonomySchema>;

/* Default taxonomy for new accounts — cool muted palette. */
export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "food", name: "Food & Dining", color: "#5b7a8a", glyph: "🍽️", type: "expense", builtin: true,
    subs: [
      { id: "groceries", name: "Groceries" },
      { id: "meal", name: "Meal" },
      { id: "snacks", name: "Snacks" },
    ],
  },
  {
    id: "transport", name: "Transport", color: "#6f8b6f", glyph: "🚗", type: "expense", builtin: true,
    subs: [
      { id: "petrol", name: "Petrol" },
      { id: "transportation", name: "Transportation" },
    ],
  },
  {
    id: "utilities", name: "Bills & Utilities", color: "#4f8a7b", glyph: "💡", type: "expense", builtin: true,
    subs: [
      { id: "electricity", name: "Electricity" },
      { id: "water", name: "Water" },
      { id: "internet", name: "Internet" },
    ],
  },
  {
    id: "sport", name: "Health & Sport", color: "#4a6fa5", glyph: "🏃", type: "expense", builtin: true,
    subs: [{ id: "gym", name: "Sport" }],
  },
  {
    id: "fun", name: "Entertainment", color: "#a06f95", glyph: "🎬", type: "expense", builtin: true,
    subs: [
      { id: "streaming", name: "Streaming" },
      { id: "outings", name: "Outings" },
      { id: "games", name: "Games" },
    ],
  },
  {
    id: "savings", name: "Savings", color: "#7a6fa5", glyph: "🐷", type: "savings", builtin: true,
    subs: [{ id: "saving", name: "Saving" }],
  },
  {
    id: "income", name: "Income", color: "#6f8b6f", glyph: "💵", type: "income", builtin: true,
    subs: [
      { id: "salary", name: "Salary" },
      { id: "wages", name: "Wages" },
      { id: "bonus", name: "Bonus" },
      { id: "funds", name: "Funds" },
      { id: "other_income", name: "Other" },
    ],
  },
];

/**
 * Validate a plaintext category taxonomy (unique ids, ≥1 income + ≥1 expense).
 * Used client-side before encrypting; the server cannot inspect ciphertext.
 */
export function validateTaxonomy(
  categories: Array<{
    id: string;
    type?: "expense" | "income" | "savings";
    archived?: boolean;
    subs: Array<{ id: string }>;
  }>,
): string | null {
  const catIds = new Set<string>();
  const subIds = new Set<string>();
  let hasIncome = false;
  let hasExpense = false;

  for (const cat of categories) {
    if (catIds.has(cat.id)) return `Duplicate category id: ${cat.id}`;
    catIds.add(cat.id);

    const type =
      cat.type === "income" || cat.id === "income"
        ? "income"
        : cat.type === "savings" || cat.id === "savings"
          ? "savings"
          : "expense";

    // Archived categories still occupy their ids, but cannot satisfy the
    // "at least one income / expense" rule — otherwise archiving the only
    // income category would leave the pickers empty.
    if (!cat.archived) {
      if (type === "income") hasIncome = true;
      else if (type === "expense") hasExpense = true;
    }

    for (const sub of cat.subs) {
      if (subIds.has(sub.id)) return `Duplicate subcategory id: ${sub.id}`;
      subIds.add(sub.id);
    }
  }

  if (!hasIncome) return "At least one income category is required";
  if (!hasExpense) return "At least one expense category is required";

  return null;
}
