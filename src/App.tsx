import Shell from '@/components/hermes/Shell';
import SaasTemplate from '@/components/ui/saa-s-template';
import SidebarNavPreview from '@/components/demo/dashboard-sidebar-demo';

/* Tiga paparan, dipilih oleh ?view=.
 *
 * Landing kini muka depan (keputusan Wan, 2026-09-02). Dashboard Hermes
 * TIDAK dibuang — ia berpindah ke ?view=dashboard, dan pautan itu masih
 * pautan yang sama yang boleh dihantar kepada sesiapa.
 *
 * KENAPA ?view DAN BUKAN #hash. Templat itu membawa penanda dalamannya
 * sendiri: #getting-started, #components, #documentation, #new-version.
 * Dengan laluan hash, mengklik mana-mana satu daripadanya menukar hash
 * dan menukar paparan di tengah halaman. Query param tidak disentuh oleh
 * penanda itu.
 */
const view = new URLSearchParams(location.search).get('view');

export default function App() {
  if (view === 'dashboard') return <Shell />;
  /* Pratonton komponen, bukan halaman produk. Ia membawa data mock
     (Acme Corp, Projects, Team) dan tidak disambung kepada apa-apa. */
  if (view === 'sidebar') return <SidebarNavPreview />;
  return <SaasTemplate />;
}
