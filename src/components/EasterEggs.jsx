import { useEffect, useState, useCallback } from "react";

const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];

function TruckAnimation() {
  return (
    <div className="fixed bottom-6 z-[9999] pointer-events-none" style={{ animation: "truckDriveCSS 5s linear forwards" }}>
      <div className="text-4xl" style={{ transform: "scaleX(-1)" }}>
        <span role="img" aria-label="truck">&#x1F69B;</span>
      </div>
      <style>{`
        @keyframes truckDriveCSS {
          0% { left: -60px; opacity: 0; }
          5% { opacity: 1; }
          95% { opacity: 1; }
          100% { left: calc(100vw + 60px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ConfettiBurst() {
  const [particles] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.3,
      color: ["#1570EF", "#10B981", "#F59E0B", "#EF4444", "#3B93FF"][Math.floor(Math.random() * 5)],
      rotation: Math.random() * 360,
      size: 6 + Math.random() * 6,
    }))
  );

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute top-1/2 left-1/2 animate-confetti-fall"
          style={{
            left: `${p.x}%`,
            animationDelay: `${p.delay}s`,
            color: p.color,
          }}
        >
          <div
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              transform: `rotate(${p.rotation}deg)`,
              borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            }}
          />
        </div>
      ))}
    </div>
  );
}

function TruckModeOverlay({ onClose }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="text-center animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="text-8xl mb-4 animate-float">&#x1F69B;</div>
        <h2 className="text-2xl font-bold text-white mb-2">TRUCK MODE ACTIVATED</h2>
        <p className="text-navy-300 text-sm mb-4">You found the Konami Code!</p>
        <p className="text-navy-500 text-xs">Keep on truckin'. Click anywhere to close.</p>
      </div>
    </div>
  );
}

export function EasterEggs() {
  const [konamiIndex, setKonamiIndex] = useState(0);
  const [showTruckMode, setShowTruckMode] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showTruck, setShowTruck] = useState(false);

  useEffect(() => {
    function handleKeyDown(e) {
      if (KONAMI[konamiIndex] === e.key) {
        const next = konamiIndex + 1;
        if (next === KONAMI.length) {
          setShowTruckMode(true);
          setKonamiIndex(0);
        } else {
          setKonamiIndex(next);
        }
      } else {
        setKonamiIndex(0);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [konamiIndex]);

  useEffect(() => {
    function handleConfetti() {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2000);
    }
    window.addEventListener("mtl:confetti", handleConfetti);
    return () => window.removeEventListener("mtl:confetti", handleConfetti);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < 0.15) {
        setShowTruck(true);
        setTimeout(() => setShowTruck(false), 4000);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {showTruckMode && <TruckModeOverlay onClose={() => setShowTruckMode(false)} />}
      {showConfetti && <ConfettiBurst />}
      {showTruck && <TruckAnimation />}
    </>
  );
}

export function useLogoEasterEgg() {
  const [clicks, setClicks] = useState(0);

  const handleLogoClick = useCallback(() => {
    const next = clicks + 1;
    setClicks(next);
    if (next >= 5) {
      window.dispatchEvent(new CustomEvent("mtl:confetti"));
      setClicks(0);
    }
    setTimeout(() => setClicks(0), 2000);
  }, [clicks]);

  return handleLogoClick;
}
