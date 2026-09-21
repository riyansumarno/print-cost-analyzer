# Print Cost Analyzer 2.7.0

Tanggal: 20 September 2026

## Fokus rilis

Rilis ini memperbaiki efisiensi ruang kerja dan memastikan **Hasil Cetak** serta **Simulasi 3D** mengikuti pengaturan cetak secara langsung untuk mode **Ukuran**, **Beberapa Halaman**, dan **Booklet**. Tidak ada perubahan tarif dibanding 2.6.0.

## Pengaturan Cetak

- Panel Pengaturan Cetak memakai lebar penuh ruang kerja seperti konsep grid 12 kolom.
- Empat bagian utama ditampilkan berdampingan pada desktop: Halaman & Salinan, Media, Ukuran & Penanganan, dan Warna.
- Preset tetap ringkas dan tidak ada pemilihan mesin.
- Semua bagian dapat dilihat sekaligus dan masih dapat dilipat secara mandiri bila diperlukan.

## Pratinjau Hasil Cetak

- Navigasi lengkap: **awal · sebelumnya · berikutnya · akhir**.
- Menampilkan seluruh urutan sisi hasil cetak dari awal sampai akhir.
- Mode 1 sisi menampilkan satu sisi per lembar; mode 2 sisi menampilkan sisi depan dan belakang dalam urutan fisik.
- Jika sisi belakang terakhir kosong pada pekerjaan 2 sisi, sisi kosong tersebut tetap dapat dilihat agar representasi lembar fisik lengkap.
- Tata letak otomatis mengikuti mode Ukuran, Beberapa Halaman/N-up, dan Booklet.

## Simulasi 3D

- Simulasi 3D memakai hasil susunan cetak aktual, bukan hanya tampilan generik.
- Tekstur sisi depan dan belakang lembar aktif disiapkan otomatis ketika masuk ke 3D atau ketika pengaturan cetak berubah.
- Untuk pekerjaan biasa dan N-up tersedia navigasi sisi awal/sebelumnya/berikutnya/akhir.
- Untuk Booklet, tampilan **Buku Terbuka** menjadi mode awal agar halaman 1 langsung terlihat.
- Buku Terbuka mempunyai navigasi pasangan halaman **awal · sebelumnya · berikutnya · akhir**, sehingga seluruh halaman booklet dapat ditelusuri sampai selesai.
- Lembar Induk dan Booklet Tertutup tetap tersedia untuk melihat bentuk fisik/imposisi.

## Hasil Analisis

- Lebar panel Hasil Analisis diperbesar karena Pratinjau dan Hasil dibagi 50:50 pada desktop.
- Total harga dibuat lebih ringkas.
- Kartu BW/Sebagian/Full/Pekat dipadatkan.
- Rincian pekerjaan dan rincian harga ditempatkan dalam panel yang dapat dibuka-tutup.
- Daftar hasil per halaman memperoleh area gulir yang lebih luas; metrik dan alasan klasifikasi tetap tersedia.
- Klik hasil halaman tetap langsung membuka halaman tersebut di Pratinjau tanpa menyembunyikan Hasil Analisis.

## Kompatibilitas

- PDF, DOC/DOCX, dan multi-gambar tetap didukung seperti 2.6.0.
- Kebijakan **Dari toko** dan **Bawa Sendiri** tetap sama.
- Seluruh tabel tarif, ambang volume simplex, dan tarif flat duplex tidak diubah.
