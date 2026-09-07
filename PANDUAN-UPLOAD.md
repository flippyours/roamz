# PANDUAN UPLOAD ROAMZ KE VERCEL

Ikuti urutan ini. Domain `roamz.fun` tidak perlu dilepas atau diatur ulang.

## 1. Siapkan Supabase

1. Masuk ke dashboard Supabase yang sebelumnya digunakan oleh `whitelist.js`.
2. Buka **SQL Editor**.
3. Buka file `supabase/setup.sql` dari project ini.
4. Salin seluruh isinya ke SQL Editor, lalu pilih **Run**.
5. Pastikan tabel lama `whitelist` tetap ada dan tabel baru `roamz_route_runs` muncul.

Script tersebut tidak menghapus entry lama. Script hanya menambahkan kolom pendukung ke tabel `whitelist`, membuat tabel progres permainan, dan membuat fungsi submission yang aman.

## 2. Upload ke branch GitHub baru

Jangan langsung mengganti branch `main`.

1. Extract ZIP project.
2. Di repository GitHub website ROAMZ, buat branch baru bernama `roamz-game-v2` dari `main`.
3. Hapus `index.html` dan `api/whitelist.js` lama pada branch tersebut.
4. Upload seluruh isi folder project ini ke root repository.
5. Pastikan `package.json`, folder `app`, `lib`, `public`, dan `supabase` berada di root.
6. Commit perubahan ke branch `roamz-game-v2`.

Jangan upload file berikut:

- `.env.local`
- folder `node_modules`
- folder `.next`
- service role key atau password apa pun

## 3. Buat Preview Deployment di Vercel

Karena GitHub repository sudah terhubung ke Vercel, push ke branch `roamz-game-v2` akan membuat Preview Deployment.

Di Vercel buka:

**Project ROAMZ → Settings → Environment Variables**

Tambahkan:

| Name | Value | Environment |
| --- | --- | --- |
| `SUPABASE_URL` | URL project Supabase | Preview dan Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key Supabase | Preview dan Production |

Setelah variabel ditambahkan, lakukan **Redeploy** pada Preview Deployment.

Jangan menggunakan anon key untuk `SUPABASE_SERVICE_ROLE_KEY`. Variabel ini hanya dibaca oleh server dan tidak memakai awalan `NEXT_PUBLIC_`.

## 4. Tes Preview

Gunakan URL preview dari Vercel, bukan `roamz.fun`.

1. Buka permainan di desktop dan mobile.
2. Ambil lima signal dan buka Gate 404.
3. Konfirmasi tiga task X.
4. Submit satu wallet percobaan.
5. Buka **Supabase → Table Editor → whitelist**.
6. Pastikan entry baru muncul dengan `review_status` bernilai `pending`.
7. Pastikan kolom `entry_id`, `route_run_id`, `game_duration`, dan `submitted_at` terisi.

Gunakan wallet dan X handle percobaan yang tidak akan dipakai untuk submission resmi karena sistem menolak duplikasi.

## 5. Tampilkan di roamz.fun

Setelah Preview Deployment sudah benar:

1. Merge branch `roamz-game-v2` ke `main`.
2. Vercel otomatis membuat Production Deployment.
3. Domain `roamz.fun` tetap terhubung dan akan menampilkan versi baru.

Jika preview gagal, jangan merge ke `main`; website Coming Soon yang lama akan tetap aman.

## Melihat entry WL

Buka **Supabase → Table Editor → whitelist**.

Atau jalankan di SQL Editor:

```sql
select
  entry_id,
  x_handle,
  wallet_address,
  comment_url,
  review_status,
  game_duration,
  submitted_at
from public.whitelist
order by submitted_at desc nulls last;
```

## Mengganti link task X

Buka `app/roamz-experience.tsx`, lalu ubah:

```ts
const X_PROFILE_URL = "https://x.com/roamznft";
const ANNOUNCEMENT_URL = "LINK_POST_ANNOUNCEMENT";
```

Task X saat ini menggunakan konfirmasi manual. Sistem memvalidasi format reply URL dan memastikan username pada reply sama dengan X handle yang diisi, tetapi belum memeriksa follow, like, atau repost melalui API X.
