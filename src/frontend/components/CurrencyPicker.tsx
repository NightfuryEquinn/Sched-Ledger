import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CURRENCIES, getCurrency } from "@/frontend/lib/data";

function ChevDown({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

type CurrencyPickerProps = {
  value: string;
  onChange: (code: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  /** Optional suffix next to a code in the menu (e.g. wallet currency). */
  badgeFor?: (code: string) => string | null | undefined;
};

export function CurrencyPicker({
  value,
  onChange,
  className,
  disabled,
  id,
  badgeFor,
}: CurrencyPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const selected = getCurrency(value);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    activeRef.current?.scrollIntoView({ block: "nearest" });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  const menu = open && !disabled ? (
    <div
      className="picker-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={menuRef}
        className="picker-menu picker-menu--currency"
        role="listbox"
        aria-label="Currency"
      >
        <div className="picker-currency-list">
          {CURRENCIES.map((c) => {
            const active = c.code === selected.code;
            const badge = badgeFor?.(c.code);
            return (
              <button
                key={c.code}
                ref={active ? activeRef : undefined}
                type="button"
                role="option"
                aria-selected={active}
                className={"picker-currency-item" + (active ? " active" : "")}
                onClick={() => choose(c.code)}
              >
                <span className="pci-code num">{c.code}</span>
                <span className="pci-label">
                  {c.label}
                  {badge ? <span className="pci-badge"> · {badge}</span> : null}
                </span>
                <span className="pci-sym num">{c.symbol}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className={"picker-wrap" + (className ? ` ${className}` : "")} ref={rootRef}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="picker-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className="picker-trigger-label">
          <span className="picker-currency-sym num">{selected.symbol}</span>
          <span className="num">{selected.code}</span>
          <span className="picker-currency-name">{selected.label}</span>
        </span>
        <ChevDown />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
