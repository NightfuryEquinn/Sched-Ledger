import { Icon } from "@/frontend/components/ui";
import { useTheme } from "@/frontend/lib/hooks/useTheme";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { dark, toggle } = useTheme();

  return (
    <button
      type="button"
      className={"icon-btn theme-toggle" + (className ? ` ${className}` : "")}
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      <Icon name={dark ? "sun" : "moon"} size={18} />
    </button>
  );
}
