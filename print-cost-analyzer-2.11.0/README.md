# Print Cost Analyzer 2.11.0

Aplikasi browser untuk menganalisis PDF, mengatur pekerjaan cetak, meninjau dokumen/hasil cetak/3D, dan menghitung estimasi harga.

## Alur kerja 2.11.0

Setelah dokumen dibuka, aplikasi memakai satu ruang kerja terpadu. Pada desktop, **Berkas Cetak** dan **Pengaturan Cetak** berada sejajar (4/12 + 8/12). Di bawahnya, **Pratinjau** dan **Hasil Analisis** dibagi dua kolom agar pemeriksaan halaman tidak memerlukan perpindahan dialog.

Klik halaman pada Hasil Analisis akan langsung memindahkan Pratinjau ke halaman tersebut tanpa menutup hasil.

## Pengaturan cetak

Pengaturan mengikuti pola Adobe Reader yang disederhanakan: preset, halaman/salinan, media, ukuran & penanganan, sisi cetak, dan warna. Tidak ada pemilihan mesin. Tab Media menampilkan katalog ukuran berkelompok; ukuran yang belum didukung oleh media terpilih tetap terlihat tetapi tidak dapat dipilih.

Preset dikelompokkan agar tetap ringkas tetapi mencakup pekerjaan umum hingga A3/A3+: dokumen BW/warna A4, F4, A3; 2-up; booklet A5 dari A4 dan A4 dari A3; foto A4/A3; Art Paper A3; serta stiker A4/A3+. Setiap preset mengatur Dokumen, Media, Tata Letak, dan Cetak sekaligus sehingga nilai preset sebelumnya tidak tertinggal.

## Pratinjau

Pratinjau Dokumen menyediakan navigasi halaman, perbesar/perkecil, **Sesuaikan halaman**, **Sesuaikan lebar**, **Ukuran asli (1:1)**, dan putar 90°. Mode Hasil Cetak dan Simulasi 3D menyediakan navigasi awal, sebelumnya, berikutnya, dan akhir. Hasil Cetak mengikuti urutan sisi fisik untuk mode Ukuran, Beberapa Halaman, maupun Booklet. Simulasi 3D menyiapkan sisi depan/belakang lembar aktif secara otomatis.

Untuk booklet, mode Buku Terbuka dimulai dari halaman 1: halaman 1 muncul sebagai halaman kanan untuk jilid kiri, atau halaman kiri untuk jilid kanan.

## Media yang disederhanakan

Media yang serumpun dan bertarif sama/hampir sama digabung agar daftar lebih ringkas, antara lain:

- HVS Putih 70–80 gsm.
- Kertas Foto Glossy 210–230 gsm.
- Stiker Glossy 120–145 gsm (A4 dan A3+).

Media lain yang perbedaan biayanya masih bermakna tetap dipisahkan.

## Aturan harga utama

Harga **1 sisi** dihitung per kelas warna dan dapat turun progresif setelah ambang jumlah sisi tercapai. Untuk HVS A4/F4/A4s:

- BW: Rp300/sisi; Rp250 mulai sisi BW ke-250.
- Sebagian warna: Rp500/sisi; Rp400 mulai sisi ke-50.
- Full warna: Rp1.000/sisi; Rp800 mulai sisi ke-25.
- Pekat: Rp1.500/sisi tanpa diskon volume otomatis.

Harga **2 sisi** memakai tarif pasangan tetap per lembar sejak lembar pertama; tidak ada ambang volume tambahan. Pilihan 2 sisi hanya aktif pada media dan ukuran yang memang mempunyai dukungan duplex. Media 1 sisi seperti stiker tertentu atau kertas foto satu sisi otomatis mengunci job ke 1 sisi.

## Menjalankan

Layani folder melalui web server statis agar modul ES, PDF.js, dan `fetch()` konfigurasi dapat bekerja normal.


## Input berkas 2.11.0

Mendukung PDF, DOC/DOCX, serta JPG/JPEG/PNG/WebP/BMP. Word dan gambar dikonversi menjadi PDF di browser sebelum dianalisis. Beberapa gambar dapat dipilih sekaligus.

Untuk **DOCX**, aplikasi membaca metadata halaman yang disimpan Word (jumlah halaman, ukuran, orientasi, dan section), memakai `lastRenderedPageBreak` sebagai anchor, lalu memecah section yang memanjang berdasarkan ukuran fisik halaman. Ini memperbaiki kasus Word menyimpan 34 halaman tetapi renderer browser hanya membentuk 29 anchor. Jika jumlah halaman hasil konversi masih berbeda dari metadata Word, aplikasi menampilkan peringatan dan tidak menganggap hasil itu identik 100%. `docx-preview` tetap menjadi fallback kompatibilitas. **DOC** lama diproses dalam mode kompatibilitas; PDF hasil ekspor Word tetap menjadi acuan paling presisi.

Sumber media menggunakan istilah **Dari toko** dan **Bawa Sendiri**. Tarif Bawa Sendiri tidak memasukkan harga bahan.


## UI 2.11.0

Berkas Cetak dan Pengaturan Cetak berada pada satu baris di desktop (4/12 + 8/12). Panel Berkas tidak lagi mempunyai tab Dokumen/Halaman karena navigasi halaman sudah tersedia pada Pratinjau dan Hasil Analisis. Pengaturan Cetak mempunyai satu tingkat tab utama: Dokumen, Media, Tata Letak, dan Cetak. Pilihan Ukuran / Beberapa Halaman / Booklet adalah pemilih mode di dalam Tata Letak, bukan tab kedua. Pratinjau dan Hasil Analisis tetap berada berdampingan di bagian bawah.


## Filter hasil 2.11.0

Kartu **Semua / BW / Sebagian warna / Full warna / Pekat** menjadi satu-satunya kontrol filter daftar halaman. Baris filter kedua dihapus agar fungsi tidak ganda.


## Ukuran media dan mode warna 2.11.0

Tab Media menampilkan Seri A (A7 sampai A3+), Seri B (B7 sampai B4), Seri F/Folio (F5, F4, Folio), serta ukuran khusus A4s. Entri yang belum mempunyai tarif untuk media terpilih ditampilkan sebagai **tidak tersedia** dan tidak dapat dipilih. Ini menjaga daftar ukuran lengkap tanpa mengarang tarif baru.

Pada tab Cetak, pilihan warna hanya **Otomatis** dan **Hitam-putih**. Otomatis mempertahankan warna sumber dan membiarkan analyzer mengklasifikasikan BW, sebagian warna, full warna, atau pekat per sisi. Hitam-putih memaksa seluruh job dihitung sebagai BW.
