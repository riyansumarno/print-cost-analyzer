# 2.11.0 — 20 September 2026

- Tab Media sekarang menampilkan katalog ukuran yang lebih lengkap dan dikelompokkan menjadi Seri A, Seri B, Seri F/Folio, dan ukuran khusus.
- Ukuran yang belum memiliki tarif/dukungan pada media terpilih tetap terlihat tetapi dinonaktifkan, sehingga pengguna tahu ukuran yang tersedia dan yang belum didukung.
- Opsi 2 sisi hanya aktif jika kombinasi media–ukuran mempunyai dukungan duplex dan tarif pasangan 2 sisi; jika media diganti ke media 1 sisi, job otomatis kembali ke 1 sisi.
- Mode Booklet ikut dinonaktifkan pada media yang tidak mendukung 2 sisi.
- Opsi warna global disederhanakan menjadi hanya Otomatis dan Hitam-putih; mode Paksa full warna serta pengaturan warna depan/belakang dihapus dari UI.
- Preset foto/art paper/stiker memakai mode warna Otomatis agar kelas warna tetap ditentukan oleh analisis dokumen.
- Kebijakan harga tidak berubah dari 2.10.0.

# 2.9.2 — 20 September 2026

- DOCX memakai docx-renderer 0.1.2 sebagai pagination utama.
- Pengaman overflow mencegah isi halaman DOCX terpotong saat dibentuk menjadi PDF.
- Filter hasil analisis disatukan ke kartu ringkasan; filter kedua dihapus.
- Harga tidak berubah.

# Changelog

## 2.9.1 — 2026-09-20

- Memperbaiki DOCX → PDF agar tidak lagi dipaksa A4 portrait; ukuran halaman, orientasi, section, dan page break sumber dipertahankan sejauh tersedia di DOCX.
- Memisahkan jalur DOCX (page-aware) dan DOC lama (mode kompatibilitas).
- Menghapus tab Dokumen/Halaman pada panel Berkas karena menduplikasi navigasi halaman pada Pratinjau.
- Ringkasan Pengaturan Cetak diubah menjadi status pasif; hanya empat tab utama yang berfungsi sebagai navigasi.
- Ukuran / Beberapa Halaman / Booklet diubah menjadi pemilih mode di dalam Tata Letak, bukan tab bersarang.
- Tidak ada perubahan tarif.

## 2.8.0 — 2026-09-20

- Berkas Cetak dan Pengaturan Cetak disusun sejajar pada desktop dengan rasio 4/12 dan 8/12.
- Setelah berkas dimuat, area unggah diringkas menjadi informasi dokumen dan tombol Ganti berkas.
- Panel Berkas mendapat tab Dokumen/Halaman. Tab Halaman menampilkan thumbnail sumber secara lazy-render dan dapat digunakan untuk navigasi pratinjau.
- Pengaturan Cetak tetap aktif di panel kanan; sebelum berkas dimuat ditampilkan keadaan kosong yang ringkas.
- Pratinjau dan Hasil Analisis tetap 6/12 + 6/12 pada bagian bawah.
- Tidak ada perubahan kebijakan harga dari 2.7.0.

## 2.7.0 — 2026-09-20
- Pengaturan Cetak kini memakai lebar penuh ruang kerja (12 kolom) dan dibagi menjadi beberapa bagian yang tetap terlihat.
- Pratinjau dan Hasil Analisis dibagi dua kolom pada desktop.
- Hasil Cetak memiliki navigasi awal/sebelumnya/berikutnya/akhir untuk seluruh urutan sisi hasil cetak.
- Simulasi 3D mengikuti mode Ukuran, Beberapa Halaman, dan Booklet serta menyiapkan tekstur sisi depan/belakang otomatis.
- Navigasi 3D lengkap ditambahkan; Buku Terbuka booklet memiliki navigasi awal/sebelumnya/berikutnya/akhir dari halaman pertama sampai akhir.
- Sisi belakang kosong pada pekerjaan 2 sisi tetap dapat dipratinjau agar urutan fisik lembar lengkap.
- Hasil Analisis diringkas tanpa menghilangkan detail: kartu warna lebih padat, rincian pekerjaan/harga dapat dibuka-tutup, dan daftar halaman mendapat area baca lebih luas.
- Tarif dan pengelompokan media dari 2.6.0 tidak diubah.

## 2.6.0 — 2026-09-20
- Mengganti workflow dialog menjadi ruang kerja terpadu Pengaturan–Pratinjau–Hasil.
- Klik hasil per halaman kini langsung memperbarui pratinjau tanpa menutup hasil.
- Menambahkan Sesuaikan halaman, Sesuaikan lebar, Ukuran asli, dan rotasi pada pratinjau dokumen.
- Memperbaiki simulasi booklet 3D agar halaman 1 muncul pada awal Buku Terbuka.
- Menyederhanakan preset.
- Menggabungkan media serumpun dari 21 menjadi 15 kelompok.
- Mempertahankan tarif simplex progresif dan duplex flat yang sudah disepakati.

## 2.3.1
- Koreksi tarif BW duplex HVS A4/F4/A4s dari Rp500 menjadi Rp400 per lembar fisik sejak lembar pertama.
- Tarif simplex dan ambang progresif BW/Partial/Full tidak diubah.
- HVS A3 tidak diubah karena memakai kelas ukuran berbeda.

## 2.3.0
- Pricing schema v6: volume progresif per kelas warna.
- Ambang HVS: BW 250, Partial 50, Full 25; Dense tanpa diskon otomatis.
- Menyesuaikan ambang seluruh media cetak.
- Memisahkan tarif duplex HVS reguler dan harga dasar.
- Menjaga pricing publik tanpa HPP/margin/biaya mesin.

## 2.2.0
- Build publik tanpa data dapur/HPP/margin.
- Pengaturan, preview, dan hasil dipindahkan ke dialog.

## 2.4.0 — 2026-09-15
- Menyederhanakan UI/UX pengaturan dan hasil analisis.
- Menghapus teks publik yang tidak diperlukan.
- Menambahkan ringkasan pada accordion pengaturan.
- Menampilkan rincian subtotal harga di hasil analisis.
- Mengubah seluruh tarif 2 sisi menjadi pasangan flat tanpa ambang volume.
- Menetapkan HVS A4/F4/A4s Pekat+Pekat Rp2.500/lembar.
