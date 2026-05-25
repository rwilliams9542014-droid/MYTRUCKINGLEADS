const variants = {
  default: "bg-white/10 text-white/80",
  brand: "bg-brand-500/20 text-brand-300",
  success: "bg-accent-500/20 text-accent-300",
  warning: "bg-warning-500/20 text-warning-300",
  danger: "bg-danger-500/20 text-danger-300",
  outline: "border border-white/20 text-white/70",
};

export function Badge({ variant = "default", children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
