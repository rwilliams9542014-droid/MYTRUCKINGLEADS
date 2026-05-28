import ScoutMascot from "@/components/ScoutMascot";

export default function ScoutEmptyState({ title, message, actionLabel, onAction, className = "" }) {
  return (
    <div className={`mx-auto flex max-w-xl flex-col items-center text-center ${className}`}>
      <ScoutMascot size="md" className="mb-3" />
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {message && <p className="mt-1 text-sm leading-6 text-navy-400">{message}</p>}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="btn-secondary mt-4 px-4 py-2 text-sm">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
