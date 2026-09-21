# Print Cost Analyzer 2.6.0

Tanggal: 20 September 2026

## Perubahan utama

- Istilah sumber media diubah menjadi **Dari toko** dan **Bawa Sendiri**.
- Tarif **Bawa Sendiri** dipisahkan dari tarif media toko. Harga hanya memakai komponen jasa cetak berdasarkan ukuran dan kelas warna; harga bahan/media tidak ikut dihitung.
- Untuk HVS A4/F4 Bawa Sendiri, tarif 1 sisi reguler: BW Rp200, sebagian warna Rp300, full warna Rp400, pekat Rp800. Tarif volume: BW Rp150, sebagian Rp250, full Rp300; pekat tetap Rp800. BW+BW 2 sisi Rp300/lembar.
- Bagian **Ukuran & Penanganan** dipisahkan menjadi tiga mode: **Ukuran**, **Beberapa Halaman**, dan **Booklet**. Booklet tidak lagi menjadi pilihan ganda di dalam tab Ukuran.
- Preset **Booklet A5 dari A4** sekarang otomatis mengaktifkan tab Booklet dan pengaturan fisik booklet.
- Unggah diperluas ke PDF, DOC, DOCX, JPG/JPEG, PNG, WebP, dan BMP.
- DOC/DOCX dikonversi menjadi PDF di browser sebelum dianalisis.
- Beberapa gambar dapat dipilih sekaligus; gambar diurutkan secara natural berdasarkan nama file lalu digabung menjadi satu PDF, satu gambar per halaman.
- ZIP tidak dijadikan alur utama karena multi-select lebih cepat dan tidak menambah tahap ekstraksi/pengurutan.

## Catatan konversi Word

Konversi Word dilakukan di browser sebelum masuk ke mesin analisis PDF. Dokumen dengan tata letak Word yang sangat kompleks dapat mengalami perbedaan tata letak setelah konversi; pratinjau PDF hasil konversi adalah dasar analisis yang digunakan aplikasi.
