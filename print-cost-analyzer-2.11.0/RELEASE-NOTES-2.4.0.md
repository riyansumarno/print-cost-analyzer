# Print Cost Analyzer 2.4.0

Tanggal: 15 September 2026

## UI/UX

- Pengaturan cetak diringkas menjadi empat kelompok: **Halaman & Rangkap**, **Media**, **Layout & Sisi**, dan **Warna**.
- Hanya satu kelompok pengaturan yang terbuka pada satu waktu.
- Setiap kelompok menampilkan ringkasan nilai yang sedang aktif.
- Istilah teknis yang tidak perlu disederhanakan atau diganti dengan istilah yang lebih mudah dibaca operator.
- Teks berulang dan penjelasan yang tidak diperlukan dihapus, termasuk keterangan tentang data biaya usaha.
- Harga pada bagian Media sekarang membedakan dengan jelas:
  - **1 sisi**: tarif reguler + tarif volume progresif per kelas warna.
  - **2 sisi**: tarif pasangan tetap per lembar.
- Hasil analisis menampilkan rincian subtotal harga berdasarkan kelas warna untuk 1 sisi, atau berdasarkan pasangan sisi untuk 2 sisi.
- Label H/HW/W/D pada area utama diganti menjadi BW, Sebagian, Full, dan Pekat.

## Harga 2 sisi

Seluruh pekerjaan 2 sisi sekarang memakai tarif pasangan tetap sejak lembar pertama. Ambang volume hanya berlaku pada pekerjaan 1 sisi.

HVS A4/F4/A4s standar dari toko:

- BW + BW: Rp400/lembar
- BW + Sebagian: Rp600/lembar
- Sebagian + Sebagian: Rp800/lembar
- BW + Full: Rp1.000/lembar
- Sebagian + Full: Rp1.200/lembar
- Full + Full: Rp1.500/lembar
- Pekat + Pekat: Rp2.500/lembar

Pasangan yang melibatkan Pekat lainnya tetap mengikuti tabel media.

## Harga 1 sisi

HVS A4/F4/A4s tetap:

- BW Rp300/sisi → Rp250 mulai sisi ke-250.
- Sebagian warna Rp500/sisi → Rp400 mulai sisi ke-50.
- Full warna Rp1.000/sisi → Rp800 mulai sisi ke-25.
- Pekat Rp1.500/sisi tanpa diskon volume otomatis.

Tarif volume tetap progresif sehingga total tagihan tidak turun saat ambang tercapai.
