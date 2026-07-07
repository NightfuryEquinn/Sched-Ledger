import logoUrl from "@/frontend/assets/logo.png";

type BrandProps = {
  variant?: "sidebar" | "auth";
};

export function Brand({ variant = "sidebar" }: BrandProps) {
  return (
    <div className={"brand brand--" + variant}>
      <img src={logoUrl} alt="Ledger Sched" className="brand-logo" />
    </div>
  );
}
