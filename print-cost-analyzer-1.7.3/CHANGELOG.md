# Changelog

## 1.7.3

- Memperbaiki race condition pada preview PDF ketika render lama dibatalkan lalu canvas langsung dipakai ulang.
- Menunggu pembatalan render PDF.js selesai sebelum memulai render berikutnya.
- Menambahkan token render agar permintaan preview lama tidak menimpa permintaan terbaru.
- Menambahkan batas aman dimensi canvas untuk PDF dengan ukuran halaman ekstrem.
- Memastikan loader preview selalu dibersihkan saat file dihapus atau aplikasi direset.

## 1.7.2 — Simplified Customer Color Workflow

- Menyederhanakan pilihan warna publik dari lima mode menjadi dua: **Sesuai warna dokumen** dan **Hitam-putih semua**.
- Menghapus `Semua warna`, `Depan / belakang berbeda`, dan `Kustom per sisi` dari UI publik.
- Menyembunyikan override H/HW/W per sisi dari preview publik.
- Analyzer tetap menghitung H/HW/W per sisi untuk tarif ketika memakai mode sesuai dokumen.
- Menambahkan ringkasan `Mode produksi: Hitam-Putih / Auto Color` secara otomatis.
- Preview duplex tetap berurutan sebagai `Sisi Cetak 1, 2, 3, ...`.
- Mempertahankan fitur media pelanggan, static pricing, Owner Access, dan arsitektur tanpa database.

## 1.7.1 — Customer-Supplied Media + Correct Project Identity

- Menggunakan nama proyek **Print Cost Analyzer**.
- Menambahkan sumber media `Dari Toko` dan `Dibawa Pelanggan`.
- Menambahkan tarif jasa khusus media pelanggan untuk H/HW/W, A4/F4 dan A3/A3+.
- Menambahkan pengaturan tarif media pelanggan ke halaman Owner Access.
- Mempertahankan tiga tier yang berbeda: Lantai, Kompetitif, Normal.
- Mempertahankan preview duplex langsung per sisi cetak tanpa grouping depan/belakang.
- Public Analyzer tidak membaca override lokal Owner; hanya `data/pricing-config.json` yang sudah dipublikasikan.
- Owner LocalStorage disimpan terenkripsi AES-GCM dengan kunci yang diturunkan via PBKDF2.
- Publikasi GitHub menggunakan token hanya pada sesi saat tombol publish ditekan dan token tidak disimpan.
- Tidak membuat atau menghubungkan database apa pun.

## 1.7.0 — Owner Access

- Menambahkan halaman konfigurasi privat yang tidak ditautkan dari UI publik.
- Menambahkan penyimpanan konfigurasi privat di browser pemilik.
- Menambahkan ekspor `pricing-config.json` dan publikasi GitHub API.
- File Owner Access dipisahkan dari ZIP proyek.

## 1.6.x

- Static pricing, media/ukuran, tiga tier tarif, serta pemisahan pricing dari classifier inti.
