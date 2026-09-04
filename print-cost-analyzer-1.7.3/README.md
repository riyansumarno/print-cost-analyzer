# Print Cost Analyzer 1.7.3

Aplikasi statis HTML/CSS/JavaScript untuk menganalisis PDF, mengklasifikasikan kebutuhan cetak H/HW/W, mensimulasikan layout cetak, dan menghitung estimasi biaya. Dapat dipublikasikan melalui GitHub Pages tanpa PHP, MySQL, atau koneksi ke database kasir.

## Baru di 1.7.3

Versi 1.7.3 berfokus pada stabilitas preview PDF. Perbaikan utama meliputi:

- render lama dibatalkan dan ditunggu sampai benar-benar selesai sebelum canvas dipakai kembali;
- token render mencegah permintaan preview lama menimpa halaman terbaru;
- dimensi dan total piksel canvas dibatasi secara aman untuk PDF berukuran halaman ekstrem;
- loader preview dibersihkan saat file dihapus atau aplikasi direset;
- query versi aset dinaikkan ke 1.7.3 agar browser tidak memakai JavaScript 1.7.2 dari cache.

Fitur penyederhanaan pilihan warna yang diperkenalkan pada 1.7.2 tetap dipertahankan: **Sesuai warna dokumen** dan **Hitam-putih semua**. Engine internal tetap menghitung H/HW/W per sisi untuk kebutuhan tarif dan mode produksi.

## Fitur yang dipertahankan

- Analisis PDF 100% di browser.
- Klasifikasi H / HW / W.
- Normal, N-up, simplex, duplex otomatis/manual, booklet, orientasi, flip, range/subset/order halaman, copies, collate, dan border.
- Sumber media `Dari Toko` atau `Dibawa Pelanggan`.
- Tier harga Lantai / Kompetitif / Normal.
- Pricing publik dari `data/pricing-config.json`.
- Owner Access privat untuk mengatur tarif dan mempublikasikan JSON.
- Tidak menggunakan database dan tidak terhubung ke database kasir.

## Owner Access

Halaman konfigurasi tidak ditautkan dari aplikasi publik dan memakai nama file privat. Kunci pemilik disimpan terpisah dalam file `print-cost-analyzer-1.7.3-OWNER-ACCESS.txt` yang **tidak berada di dalam ZIP proyek**.

## GitHub Pages

Upload isi proyek ke repository dan aktifkan GitHub Pages. Aplikasi publik hanya membutuhkan file statis dalam proyek ini.
