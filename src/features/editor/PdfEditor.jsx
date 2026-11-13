import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowLeft, Check, ChevronDown, CircleHelp, FilePlus2,
  Highlighter, ImagePlus, Link2, MessageSquareText, Pencil, Plus, Printer, Redo2,
  Search, Stamp, TextCursorInput, Undo2, X,
} from 'lucide-react';
import { PDFDocument, PDFName, PDFString, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import { saveDocument } from '../library/documentStore.js';
import './editor.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const toolbar = [
  { id: 'text', label: 'Tambah teks', icon: TextCursorInput },
  { id: 'sign', label: 'Tanda tangan', icon: PenIcon },
  { id: 'draw', label: 'Gambar', icon: Pencil },
  { id: 'line', label: 'Garis', icon: LineIcon },
  { id: 'highlight', label: 'Sorot teks', icon: Highlighter },
  { id: 'image', label: 'Gambar', icon: ImagePlus },
  { id: 'stamp', label: 'Stempel', icon: Stamp },
  { id: 'link', label: 'Tautan', icon: Link2 },
  { id: 'note', label: 'Catatan', icon: MessageSquareText },
];

function PenIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d="m15 5 4 4M4 20l4.4-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.4 16 4 20Z" /><path d="M13 7 17 11" /></svg>;
}
function LineIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d="M5 19 19 5M6 5H5v1m14 13h-1v-1" /></svg>;
}

function fileAsPdf(file) {
  if (!file || (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) {
    throw new Error('Pilih file PDF yang valid.');
  }
  return file;
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return rgb(parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255);
}

function pointOnPage(event, element, width, height) {
  const bounds = element.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(width, (event.clientX - bounds.left) / bounds.width * width)),
    y: Math.max(0, Math.min(height, (bounds.bottom - event.clientY) / bounds.height * height)),
  };
}

export default function PdfEditor({ initialFile = null, ownerId, onBack, onAuthRequired, onSaved }) {
  const [file, setFile] = useState(initialFile);
  const [pdf, setPdf] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [thumbnails, setThumbnails] = useState([]);
  const [activeTool, setActiveTool] = useState('text');
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(18);
  const [color, setColor] = useState('#263c63');
  const [linkUrl, setLinkUrl] = useState('');
  const [image, setImage] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResult, setSearchResult] = useState('');
  const [managePages, setManagePages] = useState(false);
  const [gesture, setGesture] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [dirty, setDirty] = useState(false);
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const fileInput = useRef(null);
  const imageInput = useRef(null);
  const pagesInput = useRef(null);
  const fileRef = useRef(file);
  const pdfRef = useRef(null);
  const pointerPoints = useRef([]);

  function setCurrentFile(nextFile) {
    fileRef.current = nextFile;
    setFile(nextFile);
    setActivePage((page) => Math.min(page, pageCount || 1));
    setMessage('');
    setError('');
  }

  useEffect(() => {
    if (initialFile) setCurrentFile(initialFile);
  }, [initialFile]);

  useEffect(() => {
    if (!file) {
      setPdf(null);
      setPageCount(0);
      setThumbnails([]);
      return undefined;
    }
    let active = true;
    let loadedDocument;
    setError('');
    (async () => {
      try {
        const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        loadedDocument = document;
        if (!active) {
          await document.destroy();
          return;
        }
        pdfRef.current = document;
        setPdf(document);
        setPageCount(document.numPages);
        setActivePage((current) => Math.min(current, document.numPages) || 1);
        const thumbs = [];
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          if (!active) return;
          const page = await document.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 0.18 });
          const canvas = window.document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          thumbs.push(canvas.toDataURL('image/jpeg', 0.72));
          setThumbnails([...thumbs]);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'PDF tidak dapat dibuka.');
      }
    })();
    return () => {
      active = false;
      if (loadedDocument) loadedDocument.destroy();
      if (pdfRef.current === loadedDocument) pdfRef.current = null;
    };
  }, [file]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !canvasWrapRef.current) return undefined;
    let active = true;
    pdf.getPage(activePage).then(async (page) => {
      if (!active || !canvasRef.current || !canvasWrapRef.current) return;
      const base = page.getViewport({ scale: 1 });
      const maxWidth = Math.max(320, canvasWrapRef.current.clientWidth - 58);
      const scale = Math.min(1.45, maxWidth / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.ceil(viewport.width)}px`;
      canvas.style.height = `${Math.ceil(viewport.height)}px`;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Halaman PDF gagal ditampilkan.');
    });
    return () => { active = false; };
  }, [pdf, activePage]);

  async function applyEdit(edit) {
    const source = fileRef.current;
    if (!source) return;
    setBusy(true);
    setError('');
    try {
      const document = await PDFDocument.load(await source.arrayBuffer());
      await edit(document);
      const saved = await document.save();
      const next = new File([saved], source.name, { type: 'application/pdf', lastModified: Date.now() });
      setUndoStack((history) => [...history.slice(-19), source]);
      setRedoStack([]);
      setCurrentFile(next);
      setDirty(true);
      setMessage('Perubahan diterapkan ke PDF.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Perubahan tidak dapat diterapkan.');
    } finally {
      setBusy(false);
      setGesture(null);
    }
  }

  function handleCanvasClick(event) {
    if (!file || !canvasRef.current || gesture) return;
    const pageNumber = activePage;
    if (activeTool === 'draw' || activeTool === 'line' || activeTool === 'highlight') return;
    const point = pointOnPage(event, canvasRef.current, canvasRef.current.width, canvasRef.current.height);

    if (activeTool === 'image') {
      if (!image) {
        imageInput.current?.click();
        return;
      }
      applyEdit(async (document) => {
        const page = document.getPage(pageNumber - 1);
        const bytes = await image.arrayBuffer();
        const embedded = image.type === 'image/png' ? await document.embedPng(bytes) : await document.embedJpg(bytes);
        const size = page.getSize();
        const scale = Math.min(150 / embedded.width, 120 / embedded.height, 1);
        const x = point.x / canvasRef.current.width * size.width;
        const y = size.height - point.y / canvasRef.current.height * size.height;
        page.drawImage(embedded, { x, y: y - embedded.height * scale, width: embedded.width * scale, height: embedded.height * scale });
      });
      return;
    }

    const label = text.trim() || (activeTool === 'stamp' ? 'RuangPDF' : activeTool === 'sign' ? 'Tanda tangan' : '');
    if (!label) {
      setError(activeTool === 'link' ? 'Masukkan teks tautan terlebih dahulu.' : 'Ketik teks sebelum memilih posisi di halaman.');
      return;
    }
    if (activeTool === 'link' && !/^https?:\/\//i.test(linkUrl)) {
      setError('Tautan harus diawali http:// atau https://.');
      return;
    }

    applyEdit(async (document) => {
      const page = document.getPage(pageNumber - 1);
      const size = page.getSize();
      const x = point.x / canvasRef.current.width * size.width;
      const y = size.height - point.y / canvasRef.current.height * size.height;
      const font = await document.embedFont(activeTool === 'sign' ? StandardFonts.TimesRomanItalic : StandardFonts.Helvetica);
      const sizeText = activeTool === 'stamp' ? Math.max(fontSize, 24) : Number(fontSize);
      const ink = activeTool === 'stamp' ? rgb(0.73, 0.25, 0.2) : hexToRgb(color);
      if (activeTool === 'note') {
        page.drawRectangle({ x: x - 5, y: y - 5, width: Math.min(font.widthOfTextAtSize(label, sizeText) + 12, size.width - x), height: sizeText + 15, color: rgb(1, 0.96, 0.73), opacity: 0.48 });
      }
      page.drawText(label, { x, y, size: sizeText, font, color: ink, maxWidth: size.width - x - 24 });
      if (activeTool === 'link') {
        const width = Math.min(font.widthOfTextAtSize(label, sizeText), size.width - x);
        const annotation = document.context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Link'),
          Rect: document.context.obj([x, y - 2, x + width, y + sizeText + 2]),
          Border: document.context.obj([0, 0, 0]),
          A: document.context.obj({ Type: PDFName.of('Action'), S: PDFName.of('URI'), URI: PDFString.of(linkUrl) }),
        });
        const reference = document.context.register(annotation);
        const annotations = page.node.Annots();
        if (annotations) annotations.push(reference);
        else page.node.set(PDFName.of('Annots'), document.context.obj([reference]));
      }
    });
  }

  function handlePointerDown(event) {
    if (!['draw', 'line', 'highlight'].includes(activeTool) || !canvasRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointOnPage(event, canvasRef.current, canvasRef.current.width, canvasRef.current.height);
    pointerPoints.current = [point];
    setGesture({ start: point, current: point });
  }

  function handlePointerMove(event) {
    if (!gesture || !canvasRef.current) return;
    const point = pointOnPage(event, canvasRef.current, canvasRef.current.width, canvasRef.current.height);
    pointerPoints.current.push(point);
    setGesture((current) => current ? { ...current, current: point } : null);
  }

  function handlePointerUp() {
    if (!gesture || !canvasRef.current) return;
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    const start = gesture.start;
    const end = gesture.current;
    const points = [...pointerPoints.current];
    if (Math.hypot(end.x - start.x, end.y - start.y) < 3) {
      setGesture(null);
      return;
    }
    applyEdit(async (document) => {
      const page = document.getPage(activePage - 1);
      const size = page.getSize();
      const convert = (point) => ({ x: point.x / width * size.width, y: size.height - point.y / height * size.height });
      if (activeTool === 'line') {
        page.drawLine({ start: convert(start), end: convert(end), thickness: 1.8, color: hexToRgb(color) });
      } else if (activeTool === 'highlight') {
        const a = convert(start);
        const b = convert(end);
        page.drawRectangle({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), color: rgb(1, 0.86, 0.19), opacity: 0.32 });
      } else {
        for (let i = 1; i < points.length; i += 1) page.drawLine({ start: convert(points[i - 1]), end: convert(points[i]), thickness: 2, color: hexToRgb(color) });
      }
    });
  }

  async function addPages(event) {
    const additional = event.target.files?.[0];
    event.target.value = '';
    if (!additional || !fileRef.current) return;
    try {
      fileAsPdf(additional);
      await applyEdit(async (document) => {
        const source = await PDFDocument.load(await additional.arrayBuffer());
        const pages = await document.copyPages(source, source.getPageIndices());
        pages.forEach((page) => document.addPage(page));
      });
      setMessage('Halaman berhasil ditambahkan.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menambahkan halaman.');
    }
  }

  async function addBlankPage() {
    await applyEdit(async (document) => {
      const page = document.getPage(activePage - 1);
      document.addPage(page.getSize());
    });
    setActivePage(pageCount + 1);
    setManagePages(false);
  }

  async function deleteCurrentPage() {
    if (pageCount <= 1) {
      setError('PDF harus memiliki setidaknya satu halaman.');
      return;
    }
    await applyEdit((document) => document.removePage(activePage - 1));
    setActivePage(Math.max(1, activePage - 1));
  }

  function undo() {
    if (!undoStack.length || busy) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((history) => history.slice(0, -1));
    setRedoStack((history) => [...history, fileRef.current]);
    setCurrentFile(previous);
    setDirty(true);
  }

  function redo() {
    if (!redoStack.length || busy) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((history) => history.slice(0, -1));
    setUndoStack((history) => [...history, fileRef.current]);
    setCurrentFile(next);
    setDirty(true);
  }

  async function saveToWorkspace() {
    if (!ownerId) {
      onAuthRequired();
      return;
    }
    if (!fileRef.current) return;
    setBusy(true);
    setError('');
    try {
      await saveDocument(ownerId, fileRef.current.name, fileRef.current);
      setDirty(false);
      setMessage('PDF disimpan di Ruang Simpanan perangkat ini.');
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan PDF.');
    } finally {
      setBusy(false);
    }
  }

  async function searchPdf() {
    if (!pdf || !searchText.trim()) return;
    setError('');
    try {
      let matches = 0;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const textContent = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
        matches += textContent.toLowerCase().split(searchText.trim().toLowerCase()).length - 1;
      }
      setSearchResult(matches ? `${matches} kecocokan ditemukan.` : 'Teks tidak ditemukan. Dokumen hasil scan perlu OCR terlebih dahulu.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Pencarian teks gagal.');
    }
  }

  function downloadPdf() {
    if (!fileRef.current) return;
    const url = URL.createObjectURL(fileRef.current);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = fileRef.current.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function printPdf() {
    if (!fileRef.current) return;
    const url = URL.createObjectURL(fileRef.current);
    const printWindow = window.open(url, '_blank', 'noopener');
    if (!printWindow) setError('Browser memblokir jendela cetak. Izinkan pop-up lalu coba lagi.');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function selectFile(nextFile) {
    if (dirty && !window.confirm('Perubahan belum disimpan. Ganti dokumen dan buang perubahan tersebut?')) return;
    try {
      const validFile = fileAsPdf(nextFile);
      setUndoStack([]);
      setRedoStack([]);
      setDirty(false);
      setCurrentFile(validFile);
    } catch (caught) {
      setError(caught.message);
    }
  }

  function handleBack() {
    if (dirty && !window.confirm('Perubahan belum disimpan. Tetap keluar dari editor?')) return;
    onBack();
  }

  const positionMarker = gesture && canvasRef.current ? {
    left: `${gesture.current.x / canvasRef.current.width * 100}%`,
    top: `${gesture.current.y / canvasRef.current.height * 100}%`,
  } : null;

  return <section className="pdf-editor" aria-label="Editor PDF">
    <header className="editor-topbar">
      <button className="editor-back" onClick={handleBack} aria-label="Kembali"><ArrowLeft size={18} /></button>
      <div className="editor-brand"><span className="editor-mark">r<span>✳</span></span><b>ruang<span>pdf</span></b><i /></div>
      <div className="editor-file-name">{file?.name || 'Editor PDF'}{busy && <span> · Memproses...</span>}</div>
      <div className="editor-actions"><button onClick={saveToWorkspace} disabled={!file || busy} className="editor-save"><Check size={15} /> Simpan</button><button onClick={downloadPdf} disabled={!file}><ArrowDownToLine size={16} /><span>Unduh</span></button></div>
    </header>

    <div className="editor-toolbar">
      <div className="editor-toolbar-main">
        <button className="add-pages-button" onClick={() => pagesInput.current?.click()}><Plus size={19} /> Tambah halaman <ChevronDown size={14} /></button>
        <input ref={pagesInput} type="file" accept=".pdf,application/pdf" hidden onChange={addPages} />
        <div className="editor-divider" />
        <button title="Urungkan" aria-label="Urungkan" disabled={!undoStack.length || busy} onClick={undo}><Undo2 size={19} /></button>
        <button title="Ulangi" aria-label="Ulangi" disabled={!redoStack.length || busy} onClick={redo}><Redo2 size={19} /></button>
        <div className="editor-divider" />
        {toolbar.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={activeTool === item.id ? 'selected' : ''} title={item.label} onClick={() => { setActiveTool(item.id); setMessage(''); setError(''); }}><Icon size={19} /><span>{item.label}</span></button>;
        })}
        <div className="editor-spacer" />
        <button className={managePages ? 'selected' : ''} onClick={() => setManagePages((value) => !value)}><LayersIcon size={18} /><span>Kelola halaman</span></button>
        <button onClick={printPdf} disabled={!file}><Printer size={18} /><span>Cetak</span></button>
        <button className={searchOpen ? 'selected' : ''} onClick={() => setSearchOpen((value) => !value)}><Search size={18} /><span>Cari</span></button>
      </div>
      <div className="editor-toolbar-options">
        <label className="editor-color"><span style={{ background: color }} /><input type="color" aria-label="Warna" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        <label className="editor-font-select">Aa <select aria-label="Jenis huruf" defaultValue="Helvetica"><option>Helvetica</option><option>Times Roman</option></select></label>
        <label className="editor-size"><input aria-label="Ukuran teks" type="number" min="8" max="72" value={fontSize} onChange={(event) => setFontSize(event.target.value)} /></label>
        {['text', 'sign', 'stamp', 'note', 'link'].includes(activeTool) && <input className="editor-text-input" value={text} onChange={(event) => setText(event.target.value)} placeholder={activeTool === 'sign' ? 'Nama tanda tangan' : activeTool === 'stamp' ? 'Teks stempel' : activeTool === 'note' ? 'Isi catatan' : activeTool === 'link' ? 'Teks tautan' : 'Ketik teks, lalu klik di halaman'} />}
        {activeTool === 'link' && <input className="editor-text-input editor-link-input" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://alamat-tautan..." />}
        {activeTool === 'image' && <button className="editor-pick-image" onClick={() => imageInput.current?.click()}><ImagePlus size={15} />{image?.name || 'Pilih gambar'}</button>}
        <input ref={imageInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => setImage(event.target.files?.[0] || null)} />
        <span className="editor-tip">{activeTool === 'draw' ? 'Tarik untuk menggambar' : activeTool === 'line' || activeTool === 'highlight' ? 'Tarik pada halaman' : activeTool === 'image' ? 'Pilih gambar, lalu klik halaman' : 'Pilih alat, lalu klik pada halaman'}</span>
      </div>
      {searchOpen && <div className="editor-search-row"><Search size={15} /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') searchPdf(); }} placeholder="Cari teks di PDF..." /><button onClick={searchPdf}>Cari</button><span>{searchResult}</span></div>}
    </div>

    <div className="editor-workspace">
      <aside className="editor-pages">
        <div className="pages-heading"><span>HALAMAN</span><button aria-label="Tambah halaman kosong" title="Tambah halaman kosong" onClick={addBlankPage} disabled={!file}><Plus size={16} /></button></div>
        {!file ? <button className="editor-open-file" onClick={() => fileInput.current?.click()}><FilePlus2 size={22} /><b>Buka PDF</b><span>Pilih file dari perangkat</span></button> : thumbnails.map((thumbnail, index) => <div className={`page-thumb ${activePage === index + 1 ? 'active' : ''}`} key={`${index}-${thumbnail.slice(-8)}`}>
          <button onClick={() => setActivePage(index + 1)} aria-label={`Pilih halaman ${index + 1}`}><img src={thumbnail} alt={`Pratinjau halaman ${index + 1}`} /><small>{index + 1}</small></button>
          {managePages && <button className="delete-thumb" aria-label={`Hapus halaman ${index + 1}`} onClick={() => { setActivePage(index + 1); deleteCurrentPage(); }}><X size={13} /></button>}
        </div>)}
      </aside>
      <main className="editor-canvas-area" ref={canvasWrapRef} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files[0]) selectFile(event.dataTransfer.files[0]); }}>
        {!file ? <button className="editor-dropzone" onClick={() => fileInput.current?.click()}><span><Plus size={25} /></span><b>Taruh PDF di sini</b><small>atau pilih file dari perangkat</small></button> : <div className="editor-page-stage">
          <div className="editor-page-canvas">
            <canvas ref={canvasRef} onClick={handleCanvasClick} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} />
            {positionMarker && <span className={`gesture-marker ${activeTool}`} style={positionMarker} />}
          </div>
        </div>}
        <input ref={fileInput} type="file" accept=".pdf,application/pdf" hidden onChange={(event) => { if (event.target.files?.[0]) selectFile(event.target.files[0]); event.target.value = ''; }} />
        {(message || error) && <div className={`editor-feedback ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || message}<button onClick={() => { setError(''); setMessage(''); }} aria-label="Tutup notifikasi"><X size={14} /></button></div>}
        {file && <div className="editor-page-counter">Halaman {activePage} dari {pageCount}</div>}
      </main>
    </div>
    <footer className="editor-statusbar"><span><CircleHelp size={13} /> Perubahan teks ditambahkan sebagai overlay; teks asli PDF tidak diubah.</span><span>{file ? `${pageCount} halaman` : 'Belum ada dokumen'} · File tetap di perangkat</span></footer>
  </section>;
}

function LayersIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></svg>;
}
