# 🎮 Code & Cure: Co-op Survival Protocol

Proyek ini telah dikembangkan dengan estetika premium dan fitur modern untuk memberikan pengalaman terbaik bagi kamu dan Nabila.

## 🌟 Fitur Utama
- **Real-time Synchronization**: Status base sinkron secara instan menggunakan Supabase.
- **Progressive Web App (PWA)**: Bisa diinstal di HP (Add to Home Screen) agar terasa seperti aplikasi native.
- **Premium Aesthetics**: Menggunakan Glassmorphism, animations dengan Framer Motion, dan font Outfit.
- **Role-based Gameplay**: Pembagian tugas yang jelas antara Engineer (Salman) dan Pharmacist (Nabila).

## 📁 Struktur Proyek
- [App.jsx](file:///c:/Users/salman/Desktop/game%20supabase/code-and-cure/src/App.jsx): Logika utama dan antarmuka game.
- [supabaseClient.js](file:///c:/Users/salman/Desktop/game%20supabase/code-and-cure/src/supabaseClient.js): Konfigurasi koneksi database.
- [tailwind.config.js](file:///c:/Users/salman/Desktop/game%20supabase/code-and-cure/tailwind.config.js): Tema warna kustom (Engineer Orange & Pharmacist Emerald).
- [vite.config.js](file:///c:/Users/salman/Desktop/game%20supabase/code-and-cure/vite.config.js): Konfigurasi PWA.

## 🛠️ Langkah Persiapan Supabase
Agar game ini berjalan, jalankan script SQL berikut di **Supabase SQL Editor**:

```sql
-- 1. Buat tabel sesi game
create table game_sessions (
  id uuid primary key,
  base_health float default 100,
  power_level float default 100,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Masukkan data awal untuk room kalian
insert into game_sessions (id, base_health, power_level)
values ('11111111-1111-1111-1111-111111111111', 100, 100);

-- 3. Aktifkan Realtime
-- Pergi ke Database -> Publications -> 'supabase_realtime' 
-- Pastikan tabel 'game_sessions' sudah dicentang.
```

## 🚀 Cara Menjalankan
1. Pastikan file `.env.local` di folder `code-and-cure` sudah berisi:
   ```env
   VITE_SUPABASE_URL=https://sqapywuycsdcegnbtcyj.supabase.co
   VITE_SUPABASE_ANON_KEY=PASTE_YOUR_ANON_KEY_HERE
   ```
2. Jalankan perintah di terminal:
   ```bash
   cd code-and-cure
   npm run dev
   ```

## 🖼️ Visual Preview
![App Icon](C:\Users\salman\.gemini\antigravity\brain\ece73bc4-b558-4975-8d37-29fadfb075d5\code_and_cure_icon_1778264787787.png)
*Konsep Ikon Aplikasi*

![Game Background](C:\Users\salman\.gemini\antigravity\brain\ece73bc4-b558-4975-8d37-29fadfb075d5\game_background_base_1778264812056.png)
*Suasana Base di dalam Game*

> [!TIP]
> Jangan lupa untuk membagikan URL setelah di-deploy (misal via Vercel atau Netlify) agar Nabila bisa langsung menginstalnya di HP-nya!
