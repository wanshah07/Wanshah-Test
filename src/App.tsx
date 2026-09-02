import Dashboard from '@/components/hermes/Dashboard';
import SaasTemplate from '@/components/ui/saa-s-template';

/* Dua paparan, dipilih oleh ?view=.
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
  if (view === 'dashboard') return <Dashboard />;
  return <SaasTemplate />;
}
