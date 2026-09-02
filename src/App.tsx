import Dashboard from '@/components/hermes/Dashboard';
import SaasTemplate from '@/components/ui/saa-s-template';

/* Dua paparan, dipilih oleh ?view=.
 *
 * Lalai kekal Dashboard. Menukar apa yang muncul di / ialah keputusan
 * penerbitan — repo ini disajikan di wanshah07.github.io/Wanshah-Test —
 * jadi templat itu duduk di sebelahnya sehingga Wan memutuskan
 * sebaliknya. Untuk menjadikannya muka depan, tukar baris terakhir.
 *
 * KENAPA ?view DAN BUKAN #hash. Templat itu membawa penanda dalamannya
 * sendiri: #getting-started, #components, #documentation, #new-version.
 * Dengan laluan hash, mengklik mana-mana satu daripadanya menukar hash
 * dan melontar penonton kembali ke Dashboard di tengah halaman. Query
 * param tidak disentuh oleh penanda itu.
 */
const view = new URLSearchParams(location.search).get('view');

export default function App() {
  if (view === 'landing') return <SaasTemplate />;
  return <Dashboard />;
}
