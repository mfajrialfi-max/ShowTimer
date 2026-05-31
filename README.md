# ShowTimer

ShowTimer adalah aplikasi timer acara/panggung siap pakai untuk rundown event. Operator mengontrol timer dari satu halaman, sementara layar panggung dan panitia mendapatkan update real-time melalui link masing-masing.

## Jalankan

```bash
npm install
npm start
```

Di Windows, bisa juga double-click `start-showtimer.bat`.

Buka:

- Operator: `http://localhost:3000/control/main`
- Layar panggung: `http://localhost:3000/stage/main`
- Panitia: `http://localhost:3000/panitia/main`

Untuk perangkat lain di jaringan yang sama, pakai alamat LAN yang muncul di terminal saat server berjalan, misalnya `http://192.168.1.20:3000/stage/main`.

## Cara cepat via CMD

Masuk ke folder proyek:

```cmd
cd /d D:\ShowTimer
```

Mulai ulang server dan buat link publik baru:

```cmd
start-public-links.bat
```

Lihat link publik yang sedang aktif:

```cmd
show-links.bat
```

Cek apakah link lokal dan publik merespons:

```cmd
check-public-links.bat
```

Refresh server tanpa mengganti link publik:

```cmd
refresh-keep-link.bat
```

## Link publik sementara untuk panitia dan stage

Untuk membuka layar panitia atau stage lewat internet tanpa deploy penuh, jalankan ShowTimer lalu buka terminal kedua:

```bash
cloudflared tunnel --url http://localhost:3000
```

Cloudflare akan memberi URL `https://...trycloudflare.com`. Bagikan link `/panitia/main` atau `/stage/main`, misalnya:

```text
https://...trycloudflare.com/panitia/main
https://...trycloudflare.com/stage/main
```

Saat dibuka dari host publik, ShowTimer mengizinkan halaman panitia dan stage. Halaman stage bersifat read-only dan menerima update dari operator. Halaman operator publik tetap diarahkan ke halaman panitia. Kontrol operator tetap gunakan `localhost` atau alamat LAN.

## Auto-start saat laptop menyala

Di Windows, double-click:

```text
install-autostart.bat
```

Ini membuat Windows Task Scheduler bernama `ShowTimer Public Tunnel` yang otomatis menjalankan ShowTimer dan Cloudflare tunnel saat user login. URL publik terbaru disimpan di:

```text
artifacts\public-panitia-url.txt
artifacts\public-stage-url.txt
```

Untuk menampilkan link dari terminal:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\show-public-link.ps1
```

Untuk refresh server tanpa mengganti link publik yang sedang aktif:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\refresh-server-keep-link.ps1
```

Atau double-click `refresh-keep-link.bat`. Jangan pakai opsi `-Restart` kalau ingin URL tetap sama.

Catatan: Quick Tunnel Cloudflare bisa mengganti URL setiap kali tunnel dibuat ulang. Untuk URL permanen, gunakan Cloudflare Tunnel bernama dengan domain sendiri atau deploy ke host Node.

## Fitur

- Timer countdown real-time dengan start, pause, reset, tambah/kurangi waktu, dan overtime.
- Rundown event dengan judul sesi, speaker, durasi, catatan, urutan, dan sesi aktif.
- Tampilan operator, stage fullscreen, dan panitia.
- Link terpisah untuk operator, panggung, dan panitia non-operator.
- Pesan operator ke layar panggung/panitia.
- Pesan panitia non-operator yang masuk ke inbox operator.
- Rundown acara tampil di layar panitia.
- Pengaturan warning/danger time, jam stage, sesi berikutnya, dan overtime.
- Data room tersimpan di `data/rooms.json`.
