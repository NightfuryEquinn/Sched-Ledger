import { DEFAULT_GLYPH } from "@/lib/glyphs";
import { z } from "zod";
import { walletAddressSchema } from "./address";

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

export const categoryTypeSchema = z.enum(["expense", "income"]);

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
  subs: z.array(subcategorySchema).min(1),
});

export const categoryTaxonomySchema = z.object({
  userAddress: walletAddressSchema,
  categories: z.array(categorySchema).min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const updateCategoriesSchema = z.object({
  categories: z.array(categorySchema).min(1),
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
    id: "savings", name: "Savings", color: "#7a6fa5", glyph: "🐷", type: "expense", builtin: true,
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
