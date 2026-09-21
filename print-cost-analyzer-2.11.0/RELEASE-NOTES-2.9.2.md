# Print Cost Analyzer 2.9.2

## Koreksi konversi Word

- DOCX sekarang memakai **docx-renderer 0.1.2** sebagai mesin pagination utama, menggantikan `docx-preview` sebagai jalur utama.
- `docx-preview 0.4.0` tetap tersedia hanya sebagai fallback kompatibilitas.
- Ukuran halaman dan orientasi tetap dibaca per halaman/section.
- Overflow DOM tidak lagi dipotong diam-diam; bila renderer menghasilkan konten melampaui tinggi fisik halaman, konverter memecahnya ke halaman PDF berikutnya.
- Acuan manual yang diperiksa untuk kasus **TELUK BABI-KRISIS KUBA** adalah PDF A5 portrait 34 halaman; halaman 1 berakhir pada paragraf yang menyebut Raúl Castro.

## Hasil Analisis

- Filter ganda dihapus.
- Kartu **Semua, BW, Sebagian warna, Full warna, Pekat** sekarang sekaligus menjadi satu-satunya filter halaman.
- Baris tombol filter kedua di bawah kartu dihapus.

## Harga

Tidak ada perubahan harga dari 2.9.1.
