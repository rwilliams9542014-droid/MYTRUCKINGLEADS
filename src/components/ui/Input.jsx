export function Input({ label, error, icon, className = "", ...props }) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-navy-200 mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400">
            {icon}
          </div>
        )}
        <input
          className={`input-field ${icon ? "pl-10" : ""} ${error ? "border-danger-500 focus:border-danger-500 focus:ring-danger-500/50" : ""}`}
          {...props}
        />
      </div>
      {error && <p className="mt-1.5 text-sm text-danger-400">{error}</p>}
    </div>
  );
}
