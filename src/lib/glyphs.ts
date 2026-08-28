/** Legacy geometric markers replaced by emojis. */
const LEGACY_GLYPHS = new Set([
  "◓", "◇", "◈", "△", "◐", "◆", "●", "◎", "◉", "□", "☑", "✦", "★", "♥", "⚡",
]);

const BUILTIN_GLYPHS: Record<string, string> = {
  food: "🍽️",
  transport: "🚗",
  utilities: "💡",
  sport: "🏃",
  fun: "🎬",
  savings: "🐷",
  income: "💵",
  bill: "🧾",
  renewal: "🔄",
  appointment: "📅",
  personal: "📌",
  custom: "✨",
};

export const DEFAULT_GLYPH = "📁";

/** Emoji picker when adding or editing a category. */
export const CATEGORY_GLYPH_OPTIONS = [
  "🍽️", "🚗", "💡", "🏃", "🎬", "🐷", "💵", "🏠", "👕", "✈️",
  "🛒", "💊", "🎓", "📱", "🐾", "🎁", "☕", "🧾", "📅", "⭐",
  "💼", "🏦", "🎮", "📚", "🧘", "🍕", "🚌", "💳", "🔧", "🌿",
] as const;

/** Emoji picker for to-do list icons. */
export const TODO_ICON_OPTIONS = [
  "📋", "✅", "🛒", "💼", "🏠", "✈️", "🎯", "⭐", "💡", "🎉",
  "📝", "🏋️", "🍽️", "🎓", "💊", "🐾", "🎁", "☕", "📅", "🔔",
] as const;

export function displayGlyph(glyph: string | undefined, id?: string): string {
  if ((!glyph || LEGACY_GLYPHS.has(glyph)) && id && BUILTIN_GLYPHS[id]) {
    return BUILTIN_GLYPHS[id];
  }
  return glyph || (id ? (BUILTIN_GLYPHS[id] ?? DEFAULT_GLYPH) : DEFAULT_GLYPH);
}
