import HolographicBeams from "@/components/ui/beams-background";

export default function HologramDemo() {
  return (
    <div className="relative w-full h-screen font-sans bg-black overflow-hidden flex items-center justify-center">
      {/* THE COMPONENT */}
      <HolographicBeams 
        density={15}      // Number of pillars
        speed={1.5}       // Movement speed
        aberration={3}    // Intensity of RGB shift
        opacity={90}      // Brightness
      />

      {/* CENTERED HEADING */}
      <h1 className="relative z-30 -translate-y-8 px-4 text-center text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-white/90 to-white/30 drop-shadow-[0_0_35px_rgba(255,255,255,0.25)] select-none">
        Calmness in design
      </h1>
    </div>
  );
}
