export function Card({ children, className = "", hover = false, ...props }) {
  return (
    <div
      className={`card-surface ${hover ? "hover:border-white/10 hover:shadow-card-hover transition-all duration-300" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
