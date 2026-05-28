const sizeClasses = {
  sm: "h-12 w-12",
  md: "h-20 w-20",
  lg: "h-32 w-32",
};

export default function ScoutMascot({ size = "md", className = "", showGlow = true }) {
  return (
    <span className={`relative inline-flex items-center justify-center ${sizeClasses[size] || sizeClasses.md} ${className}`}>
      {showGlow && (
        <span
          aria-hidden="true"
          className="absolute inset-2 rounded-full bg-cyan-400/20 blur-xl"
        />
      )}
      <img
        src="/assets/mtl-scout-mascot.png"
        alt="Scout"
        className="relative z-10 h-full w-full object-contain drop-shadow-[0_0_22px_rgba(34,211,238,0.36)]"
      />
    </span>
  );
}
