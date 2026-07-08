import { useEffect, useMemo, useState } from "react";
import { EmptyState, glyphTint, Icon, Segmented } from "@/frontend/components/ui";
import { nextCategoryColor, slugId } from "@/frontend/lib/categories";
import { CATEGORY_GLYPH_OPTIONS, DEFAULT_GLYPH, displayGlyph } from "@/lib/glyphs";
import type { Category, CategoryIndex } from "@/frontend/lib/types";

/*
 * Categories view
 * ───────────────
 * Category / subcategory taxonomy editor: expandable tree with a
 * single modal editor covering add-category, add-subcategory,
 * edit-category and rename-subcategory modes.
 */

type CategoriesViewProps = {
  categoryIndex: CategoryIndex;
  onSave: (categories: Category[]) => Promise<void>;
};

type EditorMode =
  | { type: "add-cat"; catType: "expense" | "income" }
  | { type: "add-sub"; catId: string }
  | { type: "edit-cat"; catId: string }
  | { type: "edit-sub"; catId: string; subId: string }
  | null;

const GLYPHS = CATEGORY_GLYPH_OPTIONS;

export function Categories({ categoryIndex, onSave }: CategoriesViewProps) {
  const [categories, setCategories] = useState(categoryIndex.categories);
  const [filter, setFilter] = useState<"all" | "expense" | "income">("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editor, setEditor] = useState<EditorMode>(null);
  const [name, setName] = useState("");
  const [glyph, setGlyph] = useState(DEFAULT_GLYPH);
  const [color, setColor] = useState("#4a6fa5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCategories(categoryIndex.categories);
  }, [categoryIndex.categories]);

  const visible = useMemo(() => {
    if (filter === "all") return categories;
    return categories.filter((c) => (c.type ?? (c.id === "income" ? "income" : "expense")) === filter);
  }, [categories, filter]);

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

  const openAddCat = (catType: "expense" | "income") => {
    setEditor({ type: "add-cat", catType });
    setName("");
    setGlyph(DEFAULT_GLYPH);
    setColor(nextCategoryColor(categories));
    setError("");
  };

  const openAddSub = (catId: string) => {
    setEditor({ type: "add-sub", catId });
    setName("");
    setError("");
  };

  const openEditCat = (cat: Category) => {
    setEditor({ type: "edit-cat", catId: cat.id });
    setName(cat.name);
    setGlyph(displayGlyph(cat.glyph, cat.id));
    setColor(cat.color);
    setError("");
  };

  const openEditSub = (catId: string, sub: { id: string; name: string }) => {
    setEditor({ type: "edit-sub", catId, subId: sub.id });
    setName(sub.name);
    setError("");
  };

  const removeCategory = async (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    if (!cat || cat.builtin) return;
    await persist(categories.filter((c) => c.id !== catId));
  };

  const removeSub = async (catId: string, subId: string) => {
    const next = categories.map((c) => {
      if (c.id !== catId) return c;
      if (c.subs.length <= 1) return c;
      return { ...c, subs: c.subs.filter((s) => s.id !== subId) };
    });
    await persist(next);
  };

  const submitEditor = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!editor) return;

    if (editor.type === "add-cat") {
      const id = slugId("cat", name);
      const cat: Category = {
        id,
        name: name.trim(),
        color,
        glyph,
        type: editor.catType,
        builtin: false,
        subs: [{ id: slugId("sub", name), name: name.trim() }],
      };
      await persist([...categories, cat]);
      setExpanded((e) => ({ ...e, [id]: true }));
      return;
    }

    if (editor.type === "add-sub") {
      const sub = { id: slugId("sub", name), name: name.trim() };
      const next = categories.map((c) =>
        c.id === editor.catId ? { ...c, subs: [...c.subs, sub] } : c,
      );
      await persist(next);
      return;
    }

    if (editor.type === "edit-cat") {
      const next = categories.map((c) =>
        c.id === editor.catId ? { ...c, name: name.trim(), color, glyph } : c,
      );
      await persist(next);
      return;
    }

    if (editor.type === "edit-sub") {
      const next = categories.map((c) =>
        c.id === editor.catId
          ? {
              ...c,
              subs: c.subs.map((s) =>
                s.id === editor.subId ? { ...s, name: name.trim() } : s,
              ),
            }
          : c,
      );
      await persist(next);
    }
  };

  const editorTitle =
    editor?.type === "add-cat"
      ? editor.catType === "income"
        ? "Add income category"
        : "Add expense category"
      : editor?.type === "add-sub"
        ? "Add subcategory"
        : editor?.type === "edit-cat"
          ? "Edit category"
          : editor?.type === "edit-sub"
            ? "Rename subcategory"
            : "";

  return (
    <div className="view">
      <div className="cat-toolbar">
        <Segmented
          options={[
            { v: "all", label: "All" },
            { v: "expense", label: "Expense" },
            { v: "income", label: "Income" },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="cat-toolbar-actions">
          <button className="primary-btn" type="button" onClick={() => openAddCat("expense")}>
            <Icon name="plus" size={15} /> Expense
          </button>
          <button className="primary-btn" type="button" onClick={() => openAddCat("income")}>
            <Icon name="plus" size={15} /> Income
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Your taxonomy</h2>
            <p className="panel-sub">
              {categories.length} categories · {categories.reduce((n, c) => n + c.subs.length, 0)} subcategories
            </p>
          </div>
        </div>

        <div className="cat-tree">
          {visible.length ? visible.map((cat) => {
            const isIncome = (cat.type ?? (cat.id === "income" ? "income" : "expense")) === "income";
            const open = expanded[cat.id] ?? true;
            return (
              <div key={cat.id} className="cat-block">
                <div className="cat-block-head">
                  <button
                    type="button"
                    className="cat-expand"
                    onClick={() => setExpanded((e) => ({ ...e, [cat.id]: !open }))}
                    aria-expanded={open}
                  >
                    <Icon name={open ? "chevD" : "chevR"} size={16} />
                  </button>
                  <span className="cat-block-glyph" style={glyphTint(cat.color)}>
                    {displayGlyph(cat.glyph, cat.id)}
                  </span>
                  <div className="cat-block-main">
                    <div className="cat-block-name">{cat.name}</div>
                    {(cat.builtin || isIncome) ? (
                      <div className="cat-block-tags">
                        {cat.builtin ? <span className="wallet-badge">Built-in</span> : null}
                        {isIncome ? <span className="wallet-badge">Income</span> : null}
                      </div>
                    ) : null}
                    <div className="cat-block-meta">{cat.subs.length} subcategories</div>
                  </div>
                  <div className="cat-block-actions">
                    <button type="button" onClick={() => openEditCat(cat)} aria-label="Edit">
                      <Icon name="edit" size={16} />
                    </button>
                    <button type="button" onClick={() => openAddSub(cat.id)} aria-label="Add subcategory">
                      <Icon name="plus" size={16} />
                    </button>
                    {!cat.builtin ? (
                      <button type="button" className="danger" disabled={busy} onClick={() => removeCategory(cat.id)} aria-label="Delete">
                        <Icon name="trash" size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>

                {open ? (
                  <ul className="cat-sub-list">
                    {cat.subs.map((sub) => (
                      <li key={sub.id} className="cat-sub-row">
                        <div className="cat-sub-main">
                          <span className="cat-sub-name">{sub.name}</span>
                          <span className="cat-sub-id num">{sub.id}</span>
                        </div>
                        <div className="cat-sub-actions">
                          <button type="button" onClick={() => openEditSub(cat.id, sub)} aria-label="Rename">
                            <Icon name="edit" size={16} />
                          </button>
                          {cat.subs.length > 1 ? (
                            <button type="button" className="danger" disabled={busy} onClick={() => removeSub(cat.id, sub.id)} aria-label="Remove">
                              <Icon name="trash" size={16} />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          }) : (
            <EmptyState title="No categories" sub="Add a category to start organizing transactions." />
          )}
        </div>
      </section>

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
                      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Category color" />
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
