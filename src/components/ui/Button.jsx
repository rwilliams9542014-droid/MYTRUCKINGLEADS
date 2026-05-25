const variants = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "inline-flex items-center justify-center gap-2 px-6 py-3 bg-danger-500 hover:bg-danger-600 text-white font-semibold rounded-xl transition-all duration-200 active:scale-[0.98]",
};

const sizes = {
  sm: "text-sm px-4 py-2",
  md: "text-sm px-6 py-3",
  lg: "text-base px-8 py-4",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  children,
  className = "",
  ...props
}) {
  return (
    <button
      className={`${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
