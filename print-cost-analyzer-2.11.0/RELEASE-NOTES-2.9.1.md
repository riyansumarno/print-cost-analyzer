# Print Cost Analyzer 2.9.1

Rilis 2.9.1 memperbaiki konversi Word dan menyederhanakan navigasi tab tanpa mengubah tarif.

## Konversi Word

- DOCX tidak lagi dipaksa menjadi A4 portrait.
- Konversi DOCX membaca tata letak halaman dari dokumen: ukuran halaman, orientasi, section, header/footer, dan page break yang tersimpan.
- PDF hasil konversi dibentuk per halaman sehingga A5, A4, landscape, portrait, dan dokumen dengan section berbeda dapat dipertahankan sesuai sumber sejauh informasi layout tersimpan di DOCX.
- Page break hasil render terakhir dari Word ikut digunakan agar halaman tidak digabung menjadi satu halaman panjang.
- DOC lama tetap didukung dalam mode kompatibilitas. Untuk tata letak paling akurat, DOCX atau PDF tetap lebih dianjurkan.

## UI/UX

- Tab Dokumen/Halaman pada panel Berkas dihapus karena menduplikasi navigasi halaman pada Pratinjau.
- Pengaturan Cetak tetap memakai empat tab utama: Dokumen, Media, Tata Letak, dan Cetak.
- Ringkasan aktif di atas tab sekarang hanya status pasif, bukan navigasi kedua.
- Pilihan Ukuran / Beberapa Halaman / Booklet di dalam Tata Letak diubah menjadi pemilih mode (segmented control), bukan tab bersarang.
- Responsivitas panel unggah dari 2.9.0 tetap dipertahankan.

## Harga

Tidak ada perubahan tarif dari 2.9.0. Hanya nilai `app_version` yang berubah menjadi 2.9.1.
