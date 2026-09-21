# Print Cost Analyzer 2.10.0

Tanggal: 20 September 2026

## DOCX -> PDF

- Memperbaiki sumber masalah pada 2.9.x: halaman hasil renderer DOCX yang memanjang tidak lagi dianggap sebagai satu halaman fisik.
- Aplikasi membaca metadata `docProps/app.xml` untuk jumlah halaman terakhir yang disimpan Microsoft Word serta `word/document.xml` untuk ukuran/orientasi halaman dan anchor `lastRenderedPageBreak`.
- Tinggi fisik halaman sekarang dihitung dari rasio ukuran halaman Word, bukan dari tinggi DOM yang dapat membesar mengikuti isi.
- Section panjang diiris kembali berdasarkan tinggi halaman fisik. Ini menangani dokumen yang Word simpan sebagai 34 halaman tetapi hanya memiliki 28 `lastRenderedPageBreak` (29 anchor page) di OOXML.
- Jumlah halaman Word dipakai sebagai pemeriksaan silang. Bila hasil browser masih berbeda, aplikasi menampilkan peringatan sebelum pengguna mempercayai hasil analisis.
- PDF ekspor langsung dari Microsoft Word tetap menjadi acuan tertinggi bila dibutuhkan kesamaan 100% dengan mesin layout Word.

## Preset

Preset sekarang selalu mengatur seluruh kelompok secara deterministik: Dokumen, Media, Tata Letak, dan Cetak. Nilai dari preset sebelumnya tidak lagi tertinggal.

Preset dikelompokkan menjadi:
- Dokumen: BW/warna A4, F4, dan A3; 1 sisi/2 sisi untuk kombinasi yang paling umum.
- Beberapa Halaman & Booklet: 2-up A4 1 sisi/2 sisi, Booklet A5 dari A4, Booklet A4 dari A3.
- Foto & Media Khusus: Foto A4/A3, Art Paper A3, Stiker Glossy A4/A3+, dan Chromo/Bontax A3+.

## Harga

Tidak ada perubahan harga dari 2.9.2. Perubahan `pricing-config.json` hanya mencakup versi aplikasi dan daftar preset.
