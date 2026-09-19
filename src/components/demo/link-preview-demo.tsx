import { LinkPreview } from '@/components/ui/link-preview';

/* Demo untuk components/ui/link-preview.tsx.
 *
 * Pautan pertama ialah mod langsung: kad itu menunjukkan tangkapan skrin
 * yang diminta daripada api.microlink.io semasa pelawat melayang. Ia menuding
 * ke tapak ini sendiri, supaya URL yang dihantar kepada pihak ketiga itu
 * ialah satu yang sudah awam.
 *
 * Dua pautan statik asal menuding ke imej pada ui.aceternity.com — aset demo
 * pada hos orang lain ialah pautan yang akan mati tanpa memberitahu sesiapa,
 * dan halaman ini awam. Kedua-duanya ditukar kepada Unsplash, dan kedua-dua
 * foto disahkan wujud melalui API Unsplash, bukan diingat:
 *   photo-1499364615650  Matthew Kalapuch, unsplash.com/@matthewkalapuch,
 *                        2804x2107, Unsplash License
 *   photo-1489599849927  Felix Mooneeram, unsplash.com/@felixmooneeram,
 *                        6000x4000, Unsplash License
 * Egress sandbox ini menyekat images.unsplash.com, jadi URL tidak boleh diuji
 * dengan memuatkannya di sini — API itulah pengesahannya.
 *
 * Pautan "/templates" asal ialah laluan dalaman tapak Aceternity; ia
 * digantikan dengan URL penuh, kerana tiada router di sini untuk memahami
 * laluan relatif.
 */

export function LinkPreviewDemoSecond() {
  return (
    <div className="flex justify-center items-start h-[40rem] flex-col px-4">
      <p className="text-neutral-500 dark:text-neutral-400 text-xl md:text-3xl max-w-3xl text-left mb-10">
        Visit{' '}
        <LinkPreview
          url="https://wanshah07.github.io/Wanshah-Test/"
          className="font-bold bg-clip-text text-transparent bg-linear-to-br from-purple-500 to-pink-500"
        >
          this site
        </LinkPreview>{' '}
        and hover the link to see a live screenshot of the page.
      </p>

      <p className="text-neutral-500 dark:text-neutral-400 text-xl md:text-3xl max-w-3xl text-left">
        I listen to{' '}
        <LinkPreview
          url="https://unsplash.com/photos/music-band-playing-on-stage-sqJ4tLBiurw"
          imageSrc="https://images.unsplash.com/photo-1499364615650-ec38552f4f34?w=640&h=400&fit=crop&q=50"
          isStatic
          className="font-bold"
        >
          this band
        </LinkPreview>{' '}
        and I watch{' '}
        <LinkPreview
          url="https://unsplash.com/photos/red-cinema-chair-evlkOfkQ5rE"
          imageSrc="https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=640&h=400&fit=crop&q=50"
          isStatic
          className="font-bold"
        >
          this movie
        </LinkPreview>{' '}
        twice a day
      </p>
    </div>
  );
}
