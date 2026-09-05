import logoUrl from "@/frontend/assets/logo.png";

type BrandProps = {
  variant?: "sidebar" | "auth";
};

/** Render the product mark for sidebar or auth hero placements. */
export function Brand({ variant = "sidebar" }: BrandProps) {
  return (
    <div className={"brand brand--" + variant}>
      <img src={logoUrl} alt="Custos" className="brand-logo" />
    </div>
  );
}
