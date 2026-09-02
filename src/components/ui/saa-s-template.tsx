/* SaaS landing template — from 21st.dev, pasted 2026-09-02.
 *
 * ONE DELIBERATE CHANGE from the source, in the <style> block below:
 * the original carried a bare `* { font-family: 'Poppins' }`. A global
 * selector injected from inside a component leaks Poppins onto the whole
 * app for as long as the component is mounted — including the Hermes
 * dashboard, which is set in IBM Plex Sans on purpose. It is now scoped
 * to `.saas-template`, which is on the root <main>. Everything else is
 * the component as published.
 */
import React from "react";

// Inline Button Component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "gradient";
  size?: "default" | "sm" | "lg";
  children: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "default", className = "", children, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

    const variants = {
      default: "bg-white text-black hover:bg-gray-100",
      secondary: "bg-gray-800 text-white hover:bg-gray-700",
      ghost: "hover:bg-gray-800/50 text-white",
      gradient: "bg-gradient-to-b from-white via-white/95 to-white/60 text-black hover:scale-105 active:scale-95"
    };

    const sizes = {
      default: "h-10 px-4 py-2 text-sm",
      sm: "h-10 px-5 text-sm",
      lg: "h-12 px-8 text-base"
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

// Icons
const ArrowRight = ({ className = "", size = 16 }: { className?: string; size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

const Menu = ({ className = "", size = 24 }: { className?: string; size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <line x1="4" x2="20" y1="12" y2="12" />
    <line x1="4" x2="20" y1="6" y2="6" />
    <line x1="4" x2="20" y1="18" y2="18" />
  </svg>
);

const X = ({ className = "", size = 24 }: { className?: string; size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

// Navigation Component
const Navigation = React.memo(() => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <header className="fixed top-0 w-full z-50 border-b border-gray-800/50 bg-black/80 backdrop-blur-md">
      <nav className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="text-xl font-semibold text-white">Logo</div>

          <div className="hidden md:flex items-center justify-center gap-8 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <a href="#getting-started" className="text-sm text-white/60 hover:text-white transition-colors">
              Getting started
            </a>
            <a href="#components" className="text-sm text-white/60 hover:text-white transition-colors">
              Components
            </a>
            <a href="#documentation" className="text-sm text-white/60 hover:text-white transition-colors">
              Documentation
            </a>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Button type="button" variant="ghost" size="sm">
              Sign in
            </Button>
            <Button type="button" variant="default" size="sm">
              Sign Up
            </Button>
          </div>

          <button
            type="button"
            className="md:hidden text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="md:hidden bg-black/95 backdrop-blur-md border-t border-gray-800/50 animate-[slideDown_0.3s_ease-out]">
          <div className="px-6 py-4 flex flex-col gap-4">
            <a
              href="#getting-started"
              className="text-sm text-white/60 hover:text-white transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Getting started
            </a>
            <a
              href="#components"
              className="text-sm text-white/60 hover:text-white transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Components
            </a>
            <a
              href="#documentation"
              className="text-sm text-white/60 hover:text-white transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Documentation
            </a>
            <div className="flex flex-col gap-2 pt-4 border-t border-gray-800/50">
              <Button type="button" variant="ghost" size="sm">
                Sign in
              </Button>
              <Button type="button" variant="default" size="sm">
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
});

Navigation.displayName = "Navigation";

// Hero Component
const Hero = React.memo(() => {
  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-start px-6 py-20 md:py-24"
      style={{
        animation: "fadeIn 0.6s ease-out"
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

        .saas-template,
        .saas-template * {
          font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <aside className="mb-8 inline-flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full border border-gray-700 bg-gray-800/50 backdrop-blur-sm max-w-full">
        <span className="text-xs text-center whitespace-nowrap" style={{ color: '#9ca3af' }}>
          New version of template is out!
        </span>
        <a
          href="#new-version"
          className="flex items-center gap-1 text-xs hover:text-white transition-all active:scale-95 whitespace-nowrap"
          style={{ color: '#9ca3af' }}
          aria-label="Read more about the new version"
        >
          Read more
          <ArrowRight size={12} />
        </a>
      </aside>

      <h1
        className="text-4xl md:text-5xl lg:text-6xl font-medium text-center max-w-3xl px-6 leading-tight mb-6"
        style={{
          background: "linear-gradient(to bottom, #ffffff, #ffffff, rgba(255, 255, 255, 0.6))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          letterSpacing: "-0.05em"
        }}
      >
        Give your big idea <br />the website it deserves
      </h1>

      <p className="text-sm md:text-base text-center max-w-2xl px-6 mb-10" style={{ color: '#9ca3af' }}>
        Landing page kit template with React, Shadcn/ui and Tailwind <br />that you can copy/paste into your project.
      </p>

      <div className="flex items-center gap-4 relative z-10 mb-16">
        <Button
          type="button"
          variant="gradient"
          size="lg"
          className="rounded-lg flex items-center justify-center"
          aria-label="Get started with the template"
        >
          Get started
        </Button>
      </div>

      {/* Kedua-dua imej hero asal dihoskan di i.postimg.cc, hos pihak
          ketiga yang bukan milik kita dan akan reput satu hari. Ia
          diganti, bukan dimuat turun:

          GLOW ialah kecerunan — kini CSS tulen. Tiada permintaan
          rangkaian, skala pada mana-mana saiz skrin, dan tiada fail
          untuk hilang.

          PRATONTON APP ialah placeholder yang JELAS placeholder, bukan
          tangkapan skrin. Dashboard sebenar dipertimbangkan dan
          ditolak: repo ini AWAM dan kekal, jadi satu bingkai raster
          keadaan operasi hidup akan membeku ke dalam sejarah git tanpa
          melalui redaction dalam sync-hermes.py — dan angka di dalamnya
          menjadi basi pada larian berikutnya.

          Bila Wan mahu tangkapan produk sebenar: letak fail di
          public/media/landing/hero.png dan tukar blok ini kepada satu
          <img src="./media/landing/hero.png" />. */}
      <div className="w-full max-w-5xl relative pb-20">
        <div
          className="absolute left-1/2 top-[-23%] w-[90%] aspect-[2/1] pointer-events-none z-0 -translate-x-1/2"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(120,150,255,0.28), rgba(120,150,255,0.10) 45%, transparent 70%)",
            filter: "blur(40px)"
          }}
        />

        <div
          className="relative z-10 rounded-lg border border-gray-800 bg-gray-900/60 shadow-2xl overflow-hidden"
          aria-hidden="true"
        >
          <div className="flex items-center gap-1.5 border-b border-gray-800 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
          </div>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-[180px_1fr]">
            <div className="hidden flex-col gap-2 md:flex">
              {[64, 48, 56, 40, 52].map((w, i) => (
                <div key={i} className="h-3 rounded bg-gray-800"
                  style={{ width: `${w}%` }} />
              ))}
            </div>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="rounded-md border border-gray-800 bg-gray-900 p-3">
                    <div className="h-2 w-2/3 rounded bg-gray-800" />
                    <div className="mt-3 h-5 w-1/2 rounded bg-gray-700" />
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-gray-800 bg-gray-900 p-4">
                <div className="flex h-32 items-end gap-2">
                  {[38, 62, 45, 78, 55, 88, 47, 70, 60, 92, 51, 66].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t bg-gray-700"
                      style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

Hero.displayName = "Hero";

// Main Component
export default function Component() {
  return (
    <main className="saas-template min-h-screen bg-black text-white">
      <Navigation />
      <Hero />
    </main>
  );
}
