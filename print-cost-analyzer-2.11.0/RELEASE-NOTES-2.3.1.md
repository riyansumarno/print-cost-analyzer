# Print Cost Analyzer 2.3.1

Patch koreksi tarif HVS BW duplex.

## Perubahan
- HVS A4/F4/A4s dari toko: BW + BW duplex = **Rp400 per lembar fisik sejak lembar pertama**.
- Tidak ada lagi tarif reguler Rp500 untuk pasangan BW + BW pada ukuran tersebut.
- BW simplex tetap Rp300/sisi dan turun progresif menjadi Rp250 mulai ambang BW yang sudah ditetapkan.
- Partial, Full, Dense, media non-HVS, dan HVS A3 tidak diubah pada patch ini.
- Bahan Bawa Sendiri tetap memakai tabel tersendiri.

## Contoh
- 18 halaman BW simplex A4/F4 = 18 × Rp300 = **Rp5.400**.
- 18 halaman BW duplex = 9 lembar fisik × Rp400 = **Rp3.600**.
- 100 halaman BW duplex = 50 lembar fisik × Rp400 = **Rp20.000**.
