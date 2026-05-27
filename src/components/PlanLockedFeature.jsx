export default function PlanLockedFeature({ message = "Email and text outreach is available on Pro and Elite plans." }) {
  return (
    <div className="rounded-xl border border-warning-500/20 bg-warning-500/10 p-3 text-sm text-warning-200">
      <p className="font-semibold">Locked</p>
      <p className="text-xs mt-1 text-warning-100/80">{message}</p>
    </div>
  );
}
