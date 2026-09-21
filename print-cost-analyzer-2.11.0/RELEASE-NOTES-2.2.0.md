# Print Cost Analyzer 2.2.0

Tanggal: 14 September 2026

## Fixed

- Dokumen HVS A4/F4 18 halaman yang dipaksa BW sekarang dihitung `18 × Rp300 = Rp5.400`, bukan Rp7.200.
- Penyebab Rp7.200 pada 2.1.0 adalah tarif reguler BW Rp400 yang masih aktif untuk pekerjaan di bawah ambang volume.

## Privacy

- Estimasi biaya produksi internal dan margin dihapus dari tampilan publik.
- Profil biaya mesin dan data biaya media tidak lagi dikirim di konfigurasi publik.
- Halaman Owner Access lama yang bersifat client-side dihapus dari build publik karena bukan mekanisme yang aman untuk menyimpan data privat.

## UI

- Workspace utama dipadatkan menjadi panel unggah + tiga aksi utama.
- `Pengaturan Cetak` dibuka dalam dialog.
- `Preview` dibuka dalam dialog besar dengan tab Dokumen / 2D Teknis / 3D Live.
- `Hasil Analisis` dibuka dalam dialog dan otomatis muncul setelah analisis selesai.
- Klik sebuah halaman pada hasil analisis langsung membuka halaman tersebut pada dialog Preview.

## Pricing publik

HVS A4/F4 70–80 gsm dari toko:

- BW simplex: Rp300/sisi.
- Sebagian warna simplex: Rp500/sisi.
- Full warna simplex: Rp1.000/sisi.
- Dense/full-bleed simplex: Rp1.500/sisi.
- BW+BW duplex: Rp400/lembar fisik.
- Pasangan duplex warna mengikuti tabel tarif publik yang telah ditetapkan.

## Validation

Seluruh test classifier, print job, pricing publik, preview regression, booklet 3D, dan privacy/UI lulus pada source release 2.2.0.
