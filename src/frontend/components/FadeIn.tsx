import { useFadeIn } from "@/frontend/lib/animate";
import { useRef, type CSSProperties, type ReactNode } from "react";

type FadeInProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "span";
};

/** Inline wrapper that fades in on mount. */
export function FadeIn({ children, className, style, as = "span" }: FadeInProps) {
  const ref = useRef<HTMLDivElement | HTMLSpanElement>(null);
  useFadeIn(ref);

  const Tag = as;

  return (
    <Tag ref={ref as never} className={className} style={style}>
      {children}
    </Tag>
  );
}
