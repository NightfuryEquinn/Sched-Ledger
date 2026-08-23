import { EmptyState, Icon, Segmented, glyphTint } from "@/frontend/components/ui";
import { DatePicker } from "@/frontend/components/DateTimePicker";
import {
  nextCategoryColor,
  resolveCategoryType,
  slugId,
  type CategoryType,
} from "@/frontend/lib/categories";
import type { Category, CategoryIndex } from "@/frontend/lib/types";
import { CATEGORY_GLYPH_OPTIONS, DEFAULT_GLYPH, displayGlyph } from "@/lib/glyphs";
import { useEffect, useState } from "react";

/*
 * Categories view
 * ───────────────
 * Category / subcategory taxonomy editor: expandable tree with a
 * single modal editor covering add-category, add-subcategory,
 * edit-category and rename-subcategory modes. Savings deadlines use the
 * custom DatePicker (same as Capitals and Transactions).
 */

type CategoriesViewProps = {
  categoryIndex: CategoryIndex;
  onSave: (categories: Category[]) => Promise<unknown>;
  /** Subcategory ids that have transaction history — drives archive vs delete. */
  usedSubIds?: Set<string>;
};

type EditorMode =
  | { type: "add-cat"; catType: CategoryType }
  | { type: "add-sub"; catId: string }
  | { type: "edit-cat"; catId: string }
  | { type: "edit-sub"; catId: string; subId: string }
  | null;

const GLYPHS = CATEGORY_GLYPH_OPTIONS;

/** Human label for a category type badge. */
function typeLabel(type: CategoryType) {
  if (type === "income") return "Income";
  if (type === "savings") return "Savings";

  return "Expense";
}

export function Categories({ categoryIndex, onSave, usedSubIds }: CategoriesViewProps) {
  // Hold the FULL taxonomy: `persist` writes this list wholesale, so dropping
  // archived entries here would delete them on the next save.
  const [categories, setCategories] = useState(categoryIndex.allCategories);
  const [filter, setFilter] = useState<"all" | CategoryType>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editor, setEditor] = useState<EditorMode>(null);
  const [name, setName] = useState("");
  const [glyph, setGlyph] = useState(DEFAULT_GLYPH);
  const [color, setColor] = useState("#4a6fa5");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCategories(categoryIndex.allCategories);
  }, [categoryIndex.allCategories]);

  const activeCategories = categories.filter((c) => !c.archived);
  const archivedCategories = categories.filter((c) => Boolean(c.archived));

  /** Whether a category matches the active type filter. */
  const catMatches = (cat: Category) => {
    if (filter === "all") return true;

    return resolveCategoryType(cat) === filter;
  };
  const visibleCount = activeCategories.reduce((n, c) => n + (catMatches(c) ? 1 : 0), 0);

  /** True when any of the category's subs carries transaction history. */
  const catInUse = (cat: Category) =>
    Boolean(usedSubIds && cat.subs.some((s) => usedSubIds.has(s.id)));

  /** Last remaining live category of its type cannot be retired. */
  const isLastOfType = (cat: Category) => {
    const type = resolveCategoryType(cat);
    if (type === "savings") return false;

    return activeCategories.filter((c) => resolveCategoryType(c) === type).length <= 1;
  };

  /** Persist taxonomy changes through the parent save handler. */
  const persist = async (next: Category[]) => {
    setBusy(true);
    setError("");
    try {
      await onSave(next);
      setCategories(next);
      setEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save categories");
    } finally {
      setBusy(false);
    }
  };

  /** Open the add-category editor for the given type. */
  const openAddCat = (catType: CategoryType) => {
    setEditor({ type: "add-cat", catType });
    setName("");
    setGlyph(DEFAULT_GLYPH);
    setColor(nextCategoryColor(categories));
    setTarget("");
    setDeadline("");
    setError("");
  };

  /** Open the add-subcategory editor. */
  const openAddSub = (catId: string) => {
    setEditor({ type: "add-sub", catId });
    setName("");
    setTarget("");
    setDeadline("");
    setError("");
  };

  /** Open the edit-category editor. */
  const openEditCat = (cat: Category) => {
    setEditor({ type: "edit-cat", catId: cat.id });
    setName(cat.name);
    setGlyph(displayGlyph(cat.glyph, cat.id));
    setColor(cat.color);
    setTarget(cat.target != null ? String(cat.target) : "");
    setDeadline(cat.deadline ?? "");
    setError("");
  };

  /** Open the rename-subcategory editor. */
  const openEditSub = (catId: string, sub: { id: string; name: string; target?: number; deadline?: string }) => {
    setEditor({ type: "edit-sub", catId, subId: sub.id });
    setName(sub.name);
    setTarget(sub.target != null ? String(sub.target) : "");
    setDeadline(sub.deadline ?? "");
    setError("");
  };

  /** Parse the target field into a nonnegative number, or undefined when unset/invalid. */
  const parsedTarget = () => {
    const n = Number(target.trim());
    return target.trim() && Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const parsedDeadline = () => (deadline.trim() ? deadline.trim() : undefined);

  /**
   * Retire a non-builtin category. One with transaction history is archived,
   * not deleted: the taxonomy is the only record of whether a subcategory was
   * spending or a savings envelope, so removing it outright would silently
   * reclassify every past transaction as spending. Unused categories are
   * deleted outright so the taxonomy does not grow without bound.
   */
  const removeCategory = async (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    if (!cat || cat.builtin) return;
    if (isLastOfType(cat)) {
      setError(`Keep at least one ${typeLabel(resolveCategoryType(cat)).toLowerCase()} category.`);

      return;
    }

    if (!catInUse(cat)) {
      await persist(categories.filter((c) => c.id !== catId));

      return;
    }

    await persist(categories.map((c) => (c.id === catId ? { ...c, archived: true } : c)));
  };

  /** Bring an archived category back into the pickers. */
  const restoreCategory = async (catId: string) => {
    await persist(categories.map((c) => (c.id === catId ? { ...c, archived: false } : c)));
  };

  /**
   * Remove a subcategory when more than one remains. A sub with history is kept
   * — same reasoning as `removeCategory`, since classification resolves through
   * the sub before it reaches the category.
   */
  const removeSub = async (catId: string, subId: string) => {
    if (usedSubIds?.has(subId)) {
      setError("That subcategory has transactions — archive its category instead.");

      return;
    }

    const next = categories.map((c) => {
      if (c.id !== catId) return c;
      if (c.subs.length <= 1) return c;

      return { ...c, subs: c.subs.filter((s) => s.id !== subId) };
    });
    await persist(next);
  };

  /** Commit the active editor mode. */
  const submitEditor = async () => {
    if (!name.trim()) {
      setError("Name is required");

      return;
    }
    if (!editor) return;

    if (editor.type === "add-cat") {
      const id = slugId("cat", name);
      const isSavings = editor.catType === "savings";
      const cat: Category = {
        id,
        name: name.trim(),
        color,
        glyph,
        type: editor.catType,
        builtin: false,
        ...(isSavings ? { target: parsedTarget(), deadline: parsedDeadline() } : {}),
        subs: [{ id: slugId("sub", name), name: name.trim() }],
      };
      await persist([...categories, cat]);
      setExpanded((e) => ({ ...e, [id]: true }));

      return;
    }

    if (editor.type === "add-sub") {
      const parent = categories.find((c) => c.id === editor.catId);
      const isSavings = parent ? resolveCategoryType(parent) === "savings" : false;
      const sub = {
        id: slugId("sub", name),
        name: name.trim(),
        ...(isSavings ? { target: parsedTarget(), deadline: parsedDeadline() } : {}),
      };
      const next = categories.map((c) =>
        c.id === editor.catId ? { ...c, subs: [...c.subs, sub] } : c,
      );
      await persist(next);

      return;
    }

    if (editor.type === "edit-cat") {
      const next = categories.map((c) => {
        if (c.id !== editor.catId) return c;
        const isSavings = resolveCategoryType(c) === "savings";

        return {
          ...c,
          name: name.trim(),
          color,
          glyph,
          ...(isSavings ? { target: parsedTarget(), deadline: parsedDeadline() } : {}),
        };
      });
      await persist(next);

      return;
    }

    if (editor.type === "edit-sub") {
      const parent = categories.find((c) => c.id === editor.catId);
      const isSavings = parent ? resolveCategoryType(parent) === "savings" : false;
      const next = categories.map((c) =>
        c.id === editor.catId
          ? {
              ...c,
              subs: c.subs.map((s) =>
                s.id === editor.subId
                  ? {
                      ...s,
                      name: name.trim(),
                      ...(isSavings ? { target: parsedTarget(), deadline: parsedDeadline() } : {}),
                    }
                  : s,
              ),
            }
          : c,
      );
      await persist(next);
    }
  };

  /** Whether the open editor is scoped to a savings category (target/deadline apply). */
  const editorIsSavings = (() => {
    if (!editor) return false;
    if (editor.type === "add-cat") return editor.catType === "savings";
    if (editor.type === "edit-cat") {
      const cat = categories.find((c) => c.id === editor.catId);
      return cat ? resolveCategoryType(cat) === "savings" : false;
    }
    if (editor.type === "add-sub" || editor.type === "edit-sub") {
      const cat = categories.find((c) => c.id === editor.catId);
      return cat ? resolveCategoryType(cat) === "savings" : false;
    }
    return false;
  })();

  const editorTitle =
    editor?.type === "add-cat"
      ? `Add ${typeLabel(editor.catType)} Category`
      : editor?.type === "add-sub"
        ? "Add Subcategory"
        : editor?.type === "edit-cat"
          ? "Edit Category"
          : editor?.type === "edit-sub"
            ? "Rename Subcategory"
            : "";

  return (
    <div className="view">
      <div className="cat-toolbar" data-tour="tour-categories-toolbar">
        <Segmented
          options={[
            { v: "all", label: "All" },
            { v: "expense", label: "Expense" },
            { v: "savings", label: "Savings" },
            { v: "income", label: "Income" },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="cat-toolbar-actions">
          <button className="primary-btn primary-btn--expense" type="button" onClick={() => openAddCat("expense")}>
            <Icon name="plus" size={15} /> Expense
          </button>
          <button className="primary-btn primary-btn--savings" type="button" onClick={() => openAddCat("savings")}>
            <Icon name="plus" size={15} /> Savings
          </button>
          <button className="primary-btn primary-btn--income" type="button" onClick={() => openAddCat("income")}>
            <Icon name="plus" size={15} /> Income
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Your Taxonomy</h2>
            <p className="panel-sub">
              {activeCategories.length} categories ·{" "}
              {activeCategories.reduce((n, c) => n + c.subs.length, 0)} subcategories
              {archivedCategories.length ? ` · ${archivedCategories.length} archived` : ""}
            </p>
          </div>
        </div>

        <div className="cat-tree" data-tour="tour-categories-tree">
          {activeCategories.length ? activeCategories.map((cat) => {
            const catType = resolveCategoryType(cat);
            const open = expanded[cat.id] ?? true;
            const filteredOut = !catMatches(cat);

            return (
              <div
                key={cat.id}
                className={
                  "cat-block"
                  + (open ? "" : " is-collapsed")
                  + (filteredOut ? " is-filtered-out" : "")
                }
                aria-hidden={filteredOut || undefined}
              >
                <div className="cat-block-head">
                  <button
                    type="button"
                    className="cat-expand"
                    onClick={() => setExpanded((e) => ({ ...e, [cat.id]: !open }))}
                    aria-expanded={open}
                    tabIndex={filteredOut ? -1 : undefined}
                  >
                    <Icon name="chevD" size={16} />
                  </button>
                  <span className="cat-block-glyph" style={glyphTint(cat.color)}>
                    {displayGlyph(cat.glyph, cat.id)}
                  </span>
                  <div className="cat-block-main">
                    <div className="cat-block-name">{cat.name}</div>
                    <div className="cat-block-tags">
                      {cat.builtin ? <span className="wallet-badge">Built-in</span> : null}
                      <span className="wallet-badge">{typeLabel(catType)}</span>
                    </div>
                    <div className="cat-block-meta">
                      {cat.subs.length} subcategories
                      {catType === "savings" && cat.target ? ` · goal ${cat.target}` : ""}
                      {catType === "savings" && cat.deadline ? ` by ${cat.deadline}` : ""}
                    </div>
                  </div>
                  <div className="cat-block-actions">
                    <button type="button" onClick={() => openEditCat(cat)} aria-label="Edit" tabIndex={filteredOut ? -1 : undefined}>
                      <Icon name="edit" size={16} />
                    </button>
                    <button type="button" onClick={() => openAddSub(cat.id)} aria-label="Add Subcategory" tabIndex={filteredOut ? -1 : undefined}>
                      <Icon name="plus" size={16} />
                    </button>
                    {!cat.builtin ? (
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => removeCategory(cat.id)}
                        aria-label={catInUse(cat) ? "Archive" : "Delete"}
                        title={
                          catInUse(cat)
                            ? "Archive — keeps past transactions classified correctly"
                            : "Delete"
                        }
                        tabIndex={filteredOut ? -1 : undefined}
                      >
                        <Icon name={catInUse(cat) ? "archive" : "trash"} size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="cat-sub-reveal">
                  <ul className="cat-sub-list">
                    {cat.subs.map((sub) => (
                      <li key={sub.id} className="cat-sub-row">
                        <div className="cat-sub-main">
                          <span className="cat-sub-name">{sub.name}</span>
                          <span className="cat-sub-id num">{sub.id}</span>
                        </div>
                        <div className="cat-sub-actions">
                          <button type="button" onClick={() => openEditSub(cat.id, sub)} aria-label="Rename" tabIndex={filteredOut || !open ? -1 : undefined}>
                            <Icon name="edit" size={16} />
                          </button>
                          {cat.subs.length > 1 ? (
                            <button type="button" className="danger" disabled={busy} onClick={() => removeSub(cat.id, sub.id)} aria-label="Remove" tabIndex={filteredOut || !open ? -1 : undefined}>
                              <Icon name="trash" size={16} />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          }) : (
            <EmptyState title="No Categories" sub="Add a category to start organizing transactions." />
          )}
          {activeCategories.length && !visibleCount ? (
            <EmptyState title="Nothing Matches" sub="Try a different filter." />
          ) : null}
        </div>
      </section>

      {archivedCategories.length ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Archived</h2>
              <p className="panel-sub">
                Retired categories, kept so past transactions keep their type. Hidden from
                pickers and budgets.
              </p>
            </div>
          </div>

          <div className="cat-archived-list">
            {archivedCategories.map((cat) => (
              <div key={cat.id} className="cat-archived-row">
                <span className="cat-block-glyph" style={glyphTint(cat.color)}>
                  {displayGlyph(cat.glyph, cat.id)}
                </span>
                <div className="cat-archived-copy">
                  <div className="cat-block-name">{cat.name}</div>
                  <div className="cat-block-tags">
                    <span className="wallet-badge">{typeLabel(resolveCategoryType(cat))}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={busy}
                  onClick={() => restoreCategory(cat.id)}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {editor ? (
        <div className="modal-scrim center" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditor(null); }}>
          <div className="modal sm" role="dialog" aria-modal="true">
            <div className="modal-head">
              <h3>{editorTitle}</h3>
              <button className="icon-btn" type="button" onClick={() => setEditor(null)} aria-label="Close">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body modal-scroll">
              <div className="dm-sec">
                <label className="fld-label" htmlFor="cat-name">Name</label>
                <input
                  id="cat-name"
                  className="text-in wallet-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  placeholder={editor.type === "add-sub" || editor.type === "edit-sub" ? "Subcategory name" : "Category name"}
                />

                {editor.type === "add-cat" || editor.type === "edit-cat" ? (
                  <>
                    <label className="fld-label">Color</label>
                    <div className="cat-color-row">
                      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Category Color" />
                      <span className="cat-color-preview" style={{ background: color }} aria-hidden />
                    </div>

                    <label className="fld-label">Icon</label>
                    <div className="cat-glyph-row">
                      {GLYPHS.map((g) => (
                        <button
                          key={g}
                          type="button"
                          className={"cat-glyph-btn" + (glyph === g ? " active" : "")}
                          style={glyph === g ? { borderColor: color, color } : undefined}
                          onClick={() => setGlyph(g)}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                {editorIsSavings ? (
                  <>
                    <label className="fld-label" htmlFor="cat-target">Target Amount (optional)</label>
                    <input
                      id="cat-target"
                      className="text-in wallet-field"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="No goal"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    />

                    <label className="fld-label" htmlFor="cat-deadline">Deadline (optional)</label>
                    <DatePicker value={deadline} onChange={setDeadline} className="wallet-field" />
                  </>
                ) : null}

                {error ? <p className="auth-error">{error}</p> : null}

                <div className="wallet-form-actions">
                  <button className="ghost-btn full" type="button" onClick={() => setEditor(null)}>Cancel</button>
                  <button className="primary-btn full" type="button" disabled={busy || !name.trim()} onClick={submitEditor}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
