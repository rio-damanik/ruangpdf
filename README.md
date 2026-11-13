# RuangPDF

Workspace PDF gratis berbasis React. File diproses langsung di browser; tidak ada backend unggah file.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Buka alamat lokal yang ditampilkan Vite (biasanya `http://localhost:5173`). Untuk build produksi jalankan `npm run build`.

## Fitur

- Gabung, pisah, putar, crop, hapus halaman, tambah teks/tanda tangan teks/watermark/gambar, dan kompres PDF.
- Ekstrak PDF ke DOCX, XLSX, PPTX, TXT, HTML, RTF, EPUB, JPG, PNG, BMP, dan format gambar ZIP.
- Konversi DOCX, PPTX, XLSX, ODT, EPUB, HTML, CSV, TXT, Markdown, RTF, SVG, JPG, dan PNG ke PDF.
- Konversi gambar browser-compatible ke JPG/PNG/SVG/ICO, CSV ke XLSX, serta XLSX ke CSV.
- Ekstrak teks OCR dari PDF hasil scan sebagai TXT dan kompres gambar.
- Template kerja pribadi W-9, DS-11, dan 1099-MISC (bukan formulir resmi pemerintah).
- Editor PDF dengan anotasi teks/tanda tangan/gambar/coretan, kelola halaman, pencarian teks, undo/redo, cetak, dan unduh.
- Akun lokal opsional untuk menyimpan hasil di IndexedDB pada browser/perangkat ini. Hasil konversi juga disimpan otomatis saat login.

Katalog mencakup juga konversi CAD, format Apple/proprietary, arsip RAR/7Z, GIF, dan audio/video. Kartu berlabel **BELUM LOKAL** ditampilkan untuk transparansi, tetapi dinonaktifkan karena format tersebut memerlukan decoder/encoder tambahan atau perangkat lunak khusus; tidak ada tombol palsu yang menghasilkan file berformat salah.

Konversi dokumen mengutamakan ekstraksi teks, bukan mempertahankan tata letak aslinya. Kompres PDF mengubah halaman menjadi gambar sehingga teks hasilnya tidak dapat dipilih atau dicari. OCR mungkin perlu mengunduh worker dan data bahasa saat pertama digunakan.

## Akun dan penyimpanan

Akun username/password ini hanya untuk pengalaman lokal sementara, bukan autentikasi aman untuk produksi atau sinkronisasi cloud. Password di-hash di browser, sedangkan sesi dan dokumen tersimpan lokal di perangkat yang sama. Jangan gunakan password penting. Tombol Google saat ini hanya menjelaskan konfigurasi OAuth yang diperlukan; login Google belum aktif tanpa Client ID dan konfigurasi OAuth.

## Struktur fitur

- `src/features/auth/`: akun lokal dan dialog masuk.
- `src/features/library/`: penyimpanan dokumen IndexedDB dan pustaka.
- `src/features/editor/`: editor PDF.
- `src/features/pdf/`: pemrosesan PDF dan konversi.
- `src/features/converters/`: katalog konverter.
