# RuangPDF QC Report

Date: 2026-11-13

## Result

- Production build: PASS.
- Dependency audit: PASS (0 known vulnerabilities).
- Browser catalog: 107 tool cards across 12 navigation categories.
- Local processing: 54 of 54 enabled tools passed with representative local fixtures.
- Form templates: W-9, DS-11, and 1099-MISC all generated valid PDF blobs.
- Intentionally unavailable: 53 tools are disabled and labeled `BELUM LOKAL`; these require format engines not included in the offline app.

## Coverage

The browser QC exercised PDF editing, signing, rotation, merge, split, crop, watermark, image insertion, compression, deletion, OCR, PDF/Office conversion, PDF image/text exports, image conversion, CSV/XLSX, ODT, EPUB, HTML, Markdown, RTF, and SVG.

Additional assertions verified merge output has four pages, split output has two pages, delete output has one page, rotation is 90 degrees, and the crop box has the expected width. PDF-to-XLSX and PDF-to-EPUB round trips also passed.

The local UI showed all 107 cards, marked all 53 unsupported cards disabled, and opened the PDF-to-TXT tool with a PDF file picker.

## Sample

`RuangPDF-QC-Foto.pdf` is a two-page test document with a generated landscape illustration and sample text. The image is synthetic artwork, not a photograph of a real place or person.
