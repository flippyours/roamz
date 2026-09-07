# ROAMZ — THE LOST ROUTE

Mini-game Three.js dan formulir whitelist ROAMZ untuk deployment melalui GitHub + Vercel dengan penyimpanan di Supabase.

## Mulai di komputer lokal

1. Gunakan Node.js 20 atau lebih baru.
2. Salin `.env.example` menjadi `.env.local` dan isi dua variabel Supabase.
3. Jalankan `npm install`.
4. Jalankan `npm run dev`.

## Deployment

Baca [`PANDUAN-UPLOAD.md`](./PANDUAN-UPLOAD.md). Jangan menyimpan `.env.local` atau `SUPABASE_SERVICE_ROLE_KEY` di GitHub.

## File utama

- `app/roamz-experience.tsx` — UI, task X, form WL, dan alur mini-game.
- `lib/roamz-game.ts` — dunia 3D dan kontrol permainan.
- `app/api/route/route.ts` — penyimpanan progres permainan.
- `app/api/whitelist/route.ts` — validasi dan submission WL.
- `supabase/setup.sql` — setup Supabase yang dijalankan satu kali.

Link announcement masih berupa dummy. Ganti `ANNOUNCEMENT_URL` di `app/roamz-experience.tsx` sebelum peluncuran publik.
