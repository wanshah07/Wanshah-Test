import { useEffect, useState } from 'react';
import { Search, PanelLeftClose, PanelLeftOpen, Command, X } from 'lucide-react';
import {
  SidebarNav,
  flattenNavItems,
  mockNavGroups,
  mockBottomItems,
} from '@/components/ui/dashboard-sidebar';

/* Pratonton untuk src/components/ui/dashboard-sidebar.tsx.
 *
 * Sumber 21st.dev menghantar komponen dan pratontonnya sebagai satu
 * fail, dengan setiap baris digandakan dalam demo.tsx. Digandakan
 * bermakna membetulkan sesuatu dalam nav membetulkannya di SATU tempat
 * sahaja, dan salinan yang satu lagi terus melukis versi lama tanpa
 * sebarang ralat. Jadi pratonton mengimport komponen di sini, tidak
 * menyalinnya. */

const flatMockData = flattenNavItems([
  ...mockNavGroups.flatMap((g) => g.items),
  ...mockBottomItems,
]);

export default function SidebarNavPreview() {
  const [isOpen, setIsOpen] = useState(true);
  const [activeId, setActiveId] = useState('home');
  const [activeWorkspace, setActiveWorkspace] = useState('Acme Corp');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  /* Palet itu melukis lencana ESC yang boleh diklik, tetapi sumber
     asal tidak pernah mendengar kekunci Escape — jadi label itu
     menjanjikan pintasan yang tidak wujud, dan satu-satunya jalan
     keluar ialah tetikus. Dijumpai semasa ujian interaksi: menekan
     Escape membiarkan lapisan terbuka dan menyekat halaman. */
  useEffect(() => {
    if (!isSearchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSearchOpen]);

  const activeItem = flatMockData.find((i) => i.id === activeId);
  const activeTitle = activeItem ? activeItem.title : 'Dashboard';

  const handleSelect = (id: string) => {
    if (id === 'search') {
      setIsSearchOpen(true);
      return;
    }
    setActiveId(id);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[700px] bg-background p-4 md:p-8">
      <div className="relative w-full max-w-4xl h-[700px] bg-card rounded-xl border border-border/50 flex overflow-hidden shadow-sm ring-1 ring-black/5 dark:ring-white/5">
        <div
          className={`h-full transition-all duration-300 ease-in-out shrink-0 overflow-hidden bg-card/50 border-r border-border/50 ${
            isOpen ? 'w-[260px] opacity-100' : 'w-0 opacity-0 border-none'
          }`}
        >
          <SidebarNav
            className="w-[260px] border-none bg-transparent"
            activeId={activeId}
            onSelect={handleSelect}
            activeWorkspace={activeWorkspace}
            onWorkspaceSelect={setActiveWorkspace}
          />
        </div>

        <div className="flex-1 bg-black/[0.02] dark:bg-white/[0.02] flex flex-col min-w-0 transition-all duration-300">
          <div className="h-14 border-b border-border/50 flex items-center px-4 justify-between bg-card shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-colors"
              >
                {isOpen ? (
                  <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.5} />
                ) : (
                  <PanelLeftOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />
                )}
              </button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate">{activeWorkspace}</span>
                <span>/</span>
                <span className="font-medium text-foreground truncate">{activeTitle}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-64 h-8 bg-black/5 dark:bg-white/5 rounded-md hidden md:block" />
              <div className="w-8 h-8 bg-primary/10 rounded-full border border-primary/20" />
            </div>
          </div>

          <div className="p-6 md:p-8 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex items-center justify-between mb-8">
              <div className="w-48 h-8 bg-black/5 dark:bg-white/5 rounded-md" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="h-32 bg-card rounded-xl border border-border/50 shadow-sm" />
              <div className="h-32 bg-card rounded-xl border border-border/50 shadow-sm" />
            </div>

            <div className="w-full bg-card rounded-xl border border-border/50 shadow-sm p-6">
              <div className="w-1/3 h-5 bg-black/5 dark:bg-white/5 rounded-md mb-6" />
              <div className="w-full h-[1px] bg-border/50 mb-6" />

              <div className="flex flex-col gap-4">
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded-lg" />
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded-lg" />
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded-lg" />
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded-lg" />
              </div>
            </div>
          </div>
        </div>

        {isSearchOpen && (
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-[15vh] bg-background/40 backdrop-blur-sm px-4">
            <div className="absolute inset-0" onClick={() => setIsSearchOpen(false)} />
            <div className="relative w-full max-w-xl bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center px-4 border-b border-border/50">
                <Search
                  className="w-[18px] h-[18px] text-muted-foreground/70 mr-3 shrink-0"
                  strokeWidth={1.5}
                />
                <input
                  autoFocus
                  className="flex-1 bg-transparent py-4 outline-none text-[14px] text-foreground placeholder:text-muted-foreground/50"
                  placeholder="Search projects, docs, or actions..."
                />
                <kbd
                  onClick={() => setIsSearchOpen(false)}
                  className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 ml-2 text-[10px] font-medium font-mono text-muted-foreground/70 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-[4px] cursor-pointer hover:text-foreground hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                >
                  ESC
                </kbd>
                <button
                  onClick={() => setIsSearchOpen(false)}
                  className="ml-3 p-1 rounded-md text-muted-foreground/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                >
                  <X className="w-[18px] h-[18px]" strokeWidth={1.5} />
                </button>
              </div>
              <div className="p-2 py-8 flex flex-col items-center justify-center">
                <Command className="w-6 h-6 text-muted-foreground/30 mb-2" strokeWidth={1.5} />
                <p className="text-[13px] text-muted-foreground font-medium">
                  Type a command or search...
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
