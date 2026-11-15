import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, Bold, Check, ChevronDown, CircleHelp,
  FilePlus2, Highlighter, Image, ImagePlus, Italic, Link2, ListOrdered, Maximize,
  MessageSquareText, Minimize, Palette, PenTool, Printer, Redo2, RotateCw,
  Scissors, Search, Stamp, TextCursorInput, Trash2, Underline, Undo2, X,
  AlignLeft, AlignCenter, AlignRight, Square, Circle, Zap, Layout, View,
  Eye, EyeOff, ZoomIn, ZoomOut, Menu, BarChart3, Table, Columns, Rows, FileText, ChevronUp,
  PanelRight, PanelBottom, PanelLeft, PanelTop, Grid3x3, Type, Heading, Image as LucideImage,
  File, FilePlus, ChevronsLeft, ChevronsRight, Minus, Maximize2, Minimize2,
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import { saveDocument } from '../library/documentStore.js';
import './editor.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const FONT_MAP = {
  Helvetica: { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold, italic: StandardFonts.HelveticaOblique, boldItalic: StandardFonts.HelveticaBoldOblique },
  'Times Roman': { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesBold, italic: StandardFonts.TimesItalic, boldItalic: StandardFonts.TimesBoldItalic },
  Courier: { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold, italic: StandardFonts.CourierOblique, boldItalic: StandardFonts.CourierBoldOblique },
};

const FONT_LIST = Object.keys(FONT_MAP);
const TABS = [
  { id: 'home', label: 'Beranda', icon: Layout },
  { id: 'insert', label: 'Sisipkan', icon: ImagePlus },
  { id: 'page', label: 'Halaman', icon: Square },
  { id: 'draw', label: 'Gambar', icon: PenTool },
  { id: 'view', label: 'Tampilan', icon: View },
];

const DRAW_TOOLS = ['pen', 'highlighter', 'eraser', 'line', 'arrow', 'rectangle', 'circle', 'select'];
const SHAPE_TOOLS = ['line', 'arrow', 'rectangle', 'circle'];

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return rgb(parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255);
}

function fontFor(fmt) {
  const map = FONT_MAP[fmt.family] || FONT_MAP.Helvetica;
  if (fmt.bold && fmt.italic) return map.boldItalic;
  if (fmt.bold) return map.bold;
  if (fmt.italic) return map.italic;
  return map.regular;
}

function canvasToPdf(cx, cy, cw, ch, pw, ph) {
  return { x: (cx / cw) * pw, y: ph - (cy / ch) * ph };
}

function pdfToCanvas(x, y, pw, ph, cw, ch) {
  return { cx: (x / pw) * cw, cy: (ph - y) / ph * ch };
}

export default function PdfEditor({ initialFile = null, ownerId, onBack, onAuthRequired, onSaved }) {
  const [file, setFile] = useState(initialFile);
  const [pdf, setPdf] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [thumbnails, setThumbnails] = useState([]);
  const [edits, setEdits] = useState([]);
  const [activeTab, setActiveTab] = useState('home');
  const [activeTool, setActiveTool] = useState('text');
  const [fmt, setFmt] = useState({ family: 'Helvetica', bold: false, italic: false, underline: false, strikethrough: false, size: 18, color: '#263c63', highlight: '#ffff00', align: 'left', spacing: 1.4, margin: 72, header: '', footer: '', showHeader: false, showFooter: false });
  const [text, setText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [gesture, setGesture] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [showRuler, setShowRuler] = useState(false);
  const [showNav, setShowNav] = useState(true);
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState('');
  const [findResults, setFindResults] = useState([]);
  const [currentFindIndex, setCurrentFindIndex] = useState(0);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const rulerRef = useRef(null);
  const fileInput = useRef(null);
  const imageInput = useRef(null);
  const pagesInput = useRef(null);
  const fileRef = useRef(file);
  const pdfRef = useRef(null);
  const editIdRef = useRef(0);
  const pointerPoints = useRef([]);
  const overlayCtxRef = useRef(null);

  function setCurrentFile(nextFile) {
    fileRef.current = nextFile;
    setFile(nextFile);
    setActivePage((page) => Math.min(page, pageCount || 1));
    setEdits([]);
    setUndoStack([]);
    setRedoStack([]);
    setDirty(false);
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
        if (!active) { await document.destroy(); return; }
        pdfRef.current = document;
        setPdf(document);
        setPageCount(document.numPages);
        setActivePage((current) => Math.min(current, document.numPages) || 1);
        const thumbs = [];
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          if (!active) return;
          const page = await document.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 0.16 });
          const canvas = window.document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          thumbs.push(canvas.toDataURL('image/jpeg', 0.7));
        }
        setThumbnails(thumbs);
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

  const baseCanvas = useCallback(() => {
    if (!pdf || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const scale = zoom / 100;
    pdf.getPage(activePage).then(async (page) => {
      const base = page.getViewport({ scale: 1 });
      const maxWidth = Math.max(320, wrap.clientWidth - 58);
      const viewScale = Math.min(1.6, maxWidth / base.width);
      const viewport = page.getViewport({ scale: viewScale * scale });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.ceil(viewport.width)}px`;
      canvas.style.height = `${Math.ceil(viewport.height)}px`;
      await page.render({ canvasContext: ctx, viewport }).promise;
      renderOverlays(ctx, viewport);
    }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : 'Halaman PDF gagal ditampilkan.');
    });
  }, [pdf, activePage, zoom]);

  useEffect(() => { baseCanvas(); }, [baseCanvas]);

  function renderOverlays(ctx, viewport) {
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const pw = viewport.width;
    const ph = viewport.height;
    const pageEdits = edits.filter((e) => e.page === activePage);
    pageEdits.forEach((edit) => {
      const { x, y } = pdfToCanvas(edit.x, edit.y, pw, ph, cw, ch);
      ctx.save();
      switch (edit.type) {
        case 'text': {
          const f = fontFor(edit);
          const size = edit.size || 18;
          ctx.font = `${edit.bold ? 'bold ' : ''}${edit.italic ? 'italic ' : ''}${size}px ${edit.family || 'Helvetica'}`;
          ctx.fillStyle = edit.color || '#000';
          ctx.textBaseline = 'middle';
          const maxW = pw - x - 24;
          const lines = wrapText(ctx, edit.text || '', maxW, size);
          let ty = y + size / 2;
          lines.forEach((line, i) => {
            const lx = edit.align === 'center' ? x - ctx.measureText(line).width / 2 : edit.align === 'right' ? x - ctx.measureText(line).width : x;
            if (edit.underline || edit.strikethrough) {
              const w = ctx.measureText(line).width;
              const ly = ty + (edit.underline ? 4 : -size / 3);
              ctx.beginPath();
              ctx.moveTo(lx, ly);
              ctx.lineTo(lx + w, ly);
              ctx.strokeStyle = edit.color || '#000';
              ctx.lineWidth = 1.2;
              ctx.stroke();
            }
            ctx.fillText(line, lx, ty);
            ty += size * 1.35;
          });
          break;
        }
        case 'image': {
          if (edit.imageUrl) {
            const img = new Image();
            img.src = edit.imageUrl;
            img.onload = () => {
              const { x: ix, y: iy } = pdfToCanvas(edit.x, edit.y, pw, ph, cw, ch);
              const iw = (edit.width || 120) / pw * cw;
              const ih = (edit.height || 120) / ph * ch;
              ctx.drawImage(img, ix, iy - ih, iw, ih);
            };
          }
          break;
        }
        case 'rectangle': {
          const { cx: rx, cy: ry } = pdfToCanvas(edit.x, edit.y, pw, ph, cw, ch);
          const w = (edit.width || 100) / pw * cw;
          const h = (edit.height || 100) / ph * ch;
          if (edit.fill) { ctx.fillStyle = edit.fill; ctx.fillRect(rx, ry - h, w, h); }
          if (edit.borderColor) { ctx.strokeStyle = edit.borderColor; ctx.lineWidth = edit.borderWidth || 2; ctx.strokeRect(rx, ry - h, w, h); }
          break;
        }
        case 'circle': {
          const { cx: cx2, cy: cy2 } = pdfToCanvas(edit.x, edit.y, pw, ph, cw, ch);
          const rx = ((edit.width || 100) / 2) / pw * cw;
          const ry = ((edit.height || 100) / 2) / ph * ch;
          ctx.beginPath();
          ctx.ellipse(cx2, cy2 - ry, rx, ry, 0, 0, Math.PI * 2);
          if (edit.fill) { ctx.fillStyle = edit.fill; ctx.fill(); }
          if (edit.borderColor) { ctx.strokeStyle = edit.borderColor; ctx.lineWidth = edit.borderWidth || 2; ctx.stroke(); }
          break;
        }
        case 'line': {
          const p1 = pdfToCanvas(edit.x1, edit.y1, pw, ph, cw, ch);
          const p2 = pdfToCanvas(edit.x2, edit.y2, pw, ph, cw, ch);
          ctx.beginPath();
          ctx.moveTo(p1.cx, p1.cy);
          ctx.lineTo(p2.cx, p2.cy);
          ctx.strokeStyle = edit.color || '#000';
          ctx.lineWidth = edit.thickness || 2;
          ctx.stroke();
          break;
        }
        case 'arrow': {
          const p1 = pdfToCanvas(edit.x1, edit.y1, pw, ph, cw, ch);
          const p2 = pdfToCanvas(edit.x2, edit.y2, pw, ph, cw, ch);
          ctx.beginPath();
          ctx.moveTo(p1.cx, p1.cy);
          ctx.lineTo(p2.cx, p2.cy);
          ctx.strokeStyle = edit.color || '#000';
          ctx.lineWidth = edit.thickness || 2;
          ctx.stroke();
          const angle = Math.atan2(p2.cy - p1.cy, p2.cx - p1.cx);
          const len = 10;
          ctx.beginPath();
          ctx.moveTo(p2.cx, p2.cy);
          ctx.lineTo(p2.cx - len * Math.cos(angle - 0.3), p2.cy - len * Math.sin(angle - 0.3));
          ctx.moveTo(p2.cx, p2.cy);
          ctx.lineTo(p2.cx - len * Math.cos(angle + 0.3), p2.cy - len * Math.sin(angle + 0.3));
          ctx.stroke();
          break;
        }
        case 'highlight': {
          const { cx: hx, cy: hy } = pdfToCanvas(edit.x, edit.y, pw, ph, cw, ch);
          const w = (edit.width || 200) / pw * cw;
          const h = (edit.height || 30) / ph * ch;
          ctx.fillStyle = edit.color || '#ffff00';
          ctx.globalAlpha = 0.35;
          ctx.fillRect(hx, hy - h, w, h);
          ctx.globalAlpha = 1;
          break;
        }
        case 'draw': {
          const pts = edit.points || [];
          if (pts.length < 2) break;
          ctx.beginPath();
          const first = pdfToCanvas(pts[0].x, pts[0].y, pw, ph, cw, ch);
          ctx.moveTo(first.cx, first.cy);
          for (let i = 1; i < pts.length; i += 1) {
            const p = pdfToCanvas(pts[i].x, pts[i].y, pw, ph, cw, ch);
            ctx.lineTo(p.cx, p.cy);
          }
          ctx.strokeStyle = edit.color || '#000';
          ctx.lineWidth = edit.thickness || 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
          break;
        }
        case 'stamp': {
          const f = fontFor(edit);
          const size = edit.size || 24;
          ctx.font = `bold ${size}px ${edit.family || 'Helvetica'}`;
          ctx.fillStyle = edit.color || '#d32f2f';
          ctx.textBaseline = 'middle';
          ctx.fillText(edit.text || 'RuangPDF', x, y + size / 2);
          break;
        }
        case 'note': {
          const { cx: nx, cy: ny } = pdfToCanvas(edit.x, edit.y, pw, ph, cw, ch);
          const w = 120 / pw * cw;
          const h = 60 / ph * ch;
          ctx.fillStyle = '#fff9c4';
          ctx.globalAlpha = 0.6;
          ctx.fillRect(nx, ny - h, w, h);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#fbc02d';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(nx, ny - h, w, h);
          ctx.font = '11px Helvetica';
          ctx.fillStyle = '#000';
          ctx.fillText(edit.text || 'Catatan', nx + 4, ny - h + 14);
          break;
        }
      }
      ctx.restore();
    });
  }

  function wrapText(ctx, text, maxWidth, size) {
    const words = text.split(/\s+/);
    const lines = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else current = candidate;
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  function searchPdfText() {
    if (!findText.trim() || !pdf) { setFindResults([]); return; }
    const results = [];
    const query = findText.toLowerCase();
    for (let p = 1; p <= pageCount; p += 1) {
      const pageEdits = edits.filter((e) => e.page === p && e.type === 'text');
      pageEdits.forEach((edit, i) => {
        const idx = (edit.text || '').toLowerCase().indexOf(query);
        if (idx >= 0) results.push({ page: p, editId: edit.id, index: idx, text: edit.text });
      });
    }
    setFindResults(results);
    setCurrentFindIndex(results.length ? 0 : 0);
  }

  function insertTable() {
    const rows = Math.max(1, Math.min(20, Number(tableRows) || 3));
    const cols = Math.max(1, Math.min(10, Number(tableCols) || 3));
    const cellW = 120;
    const cellH = 24;
    const startX = 60;
    let startY = 100;
    const page = activePage;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        addEdit({
          id: String(Date.now() + r * cols + c),
          page,
          type: 'text',
          x: startX + c * cellW,
          y: startY - r * cellH,
          text: '',
          family: fmt.family,
          bold: false,
          italic: false,
          underline: false,
          strikethrough: false,
          size: 10,
          color: '#000000',
          align: 'left',
          cellBorder: true,
          cellWidth: cellW,
          cellHeight: cellH,
        });
      }
    }
    setMessage(`Tabel ${rows}x${cols} ditambahkan.`);
  }

  function toggleHeaderFooter() {
    setFmt((c) => ({ ...c, showHeader: !c.showHeader }));
  }

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    return () => {
      canvas.removeEventListener('click', handleCanvasClick);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  function handleCanvasClick(event) {
    if (!file || !canvasRef.current || gesture || DRAW_TOOLS.includes(activeTool)) return;
    const point = pointOnPage(event, canvasRef.current, canvasRef.current.width, canvasRef.current.height);
    const { x, y } = canvasToPdf(point.x, point.y, canvasRef.current.width, canvasRef.current.height, 0, 0);
    const page = activePage;
    const pw = canvasRef.current.width / (zoom / 100) / 1;
    const ph = canvasRef.current.height / (zoom / 100) / 1;

    if (activeTool === 'image') {
      if (!imageFile) { imageInput.current?.click(); return; }
      addEdit({
        id: String(Date.now()),
        page, type: 'image', x, y,
        imageUrl: imageUrl, imageType: imageFile.type === 'image/png' ? 'png' : 'jpg',
        width: 150, height: 120,
      });
      setImageFile(null);
      setImageUrl(null);
      return;
    }

    const label = text.trim() || (activeTool === 'stamp' ? 'RuangPDF' : activeTool === 'sign' ? 'Tanda tangan' : '');
    if (!label && activeTool !== 'link') {
      setError('Ketik teks sebelum klik di halaman.');
      return;
    }
    if (activeTool === 'link' && !/^https?:\/\//i.test(linkUrl)) {
      setError('Tautan harus diawali http:// atau https://.');
      return;
    }

    const edit = {
      id: String(Date.now()),
      page,
      type: activeTool === 'text' ? 'text' : 'stamp',
      x, y,
      text: label || activeTool === 'link' ? linkUrl : '',
      url: linkUrl,
      family: fmt.family,
      bold: fmt.bold,
      italic: fmt.italic,
      underline: fmt.underline,
      strikethrough: fmt.strikethrough,
      size: Number(fmt.size),
      color: fmt.color,
      align: fmt.align,
    };
    addEdit(edit);
    setText('');
    setLinkUrl('');
  }

  function pointOnPage(event, element, width, height) {
    const bounds = element.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(width, (event.clientX - bounds.left) / bounds.width * width)),
      y: Math.max(0, Math.min(height, (bounds.bottom - event.clientY) / bounds.height * height)),
    };
  }

  function handlePointerDown(event) {
    if (!DRAW_TOOLS.includes(activeTool) || !canvasRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointOnPage(event, canvasRef.current, canvasRef.current.width, canvasRef.current.height);
    pointerPoints.current = [point];
    setGesture({ start: point, current: point, tool: activeTool });
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
    if (Math.hypot(end.x - start.x, end.y - start.y) < 3 && gesture.tool !== 'pen') {
      setGesture(null);
      pointerPoints.current = [];
      return;
    }
    const page = activePage;
    const pw = width / (zoom / 100);
    const ph = height / (zoom / 100);
    const c2p = (p) => canvasToPdf(p.x, p.y, width, height, pw, ph);

    if (gesture.tool === 'pen' || gesture.tool === 'highlighter' || gesture.tool === 'eraser') {
      addEdit({
        id: String(Date.now()),
        page, type: 'draw',
        points: points.map((p) => { const c = c2p(p); return { x: c.x, y: c.y }; }),
        color: gesture.tool === 'eraser' ? '#ffffff' : gesture.tool === 'highlighter' ? '#ffeb3b' : fmt.color,
        thickness: gesture.tool === 'highlighter' ? 6 : 2,
        opacity: gesture.tool === 'highlighter' ? 0.4 : 1,
      });
    } else if (gesture.tool === 'line') {
      const s = c2p(start), e = c2p(end);
      addEdit({ id: String(Date.now()), page, type: 'line', x1: s.x, y1: s.y, x2: e.x, y2: e.y, color: fmt.color, thickness: 1.8 });
    } else if (gesture.tool === 'arrow') {
      const s = c2p(start), e = c2p(end);
      addEdit({ id: String(Date.now()), page, type: 'arrow', x1: s.x, y1: s.y, x2: e.x, y2: e.y, color: fmt.color, thickness: 1.8 });
    } else if (gesture.tool === 'rectangle') {
      const s = c2p(start), e = c2p(end);
      addEdit({ id: String(Date.now()), page, type: 'rectangle', x: Math.min(s.x, e.x), y: Math.min(s.y, e.y), width: Math.abs(e.x - s.x), height: Math.abs(e.y - s.y), fill: fmt.color, borderColor: fmt.color, borderWidth: 2 });
    } else if (gesture.tool === 'circle') {
      const s = c2p(start), e = c2p(end);
      addEdit({ id: String(Date.now()), page, type: 'circle', x: Math.min(s.x, e.x), y: Math.min(s.y, e.y), width: Math.abs(e.x - s.x), height: Math.abs(e.y - s.y), fill: fmt.color, borderColor: fmt.color, borderWidth: 2 });
    }
    setGesture(null);
    pointerPoints.current = [];
  }

  function addEdit(edit) {
    setEdits((current) => [...current, edit]);
    setUndoStack((history) => [...history.slice(-19), fileRef.current]);
    setRedoStack([]);
    setDirty(true);
    setMessage('Elemen ditambahkan ke halaman.');
  }

  function deleteEdit(id) {
    setEdits((current) => current.filter((e) => e.id !== id));
    setDirty(true);
    setMessage('Elemen dihapus.');
  }

  async function applyEdits(document) {
    const font = await document.embedFont(StandardFonts.Helvetica);
    const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
    const pageEdits = edits.filter((e) => e.page === activePage);
    for (const edit of pageEdits) {
      const page = document.getPage(edit.page - 1);
      const size = page.getSize();
      const embedImage = async (bytes, type) => type === 'png' ? await document.embedPng(bytes) : await document.embedJpg(bytes);
      switch (edit.type) {
        case 'text': {
          const f = fontFor(edit);
          const s = Number(edit.size || 18);
          page.drawText(edit.text || '', {
            x: edit.x, y: edit.y, size: s, font: f, color: hexToRgb(edit.color || '#000'),
            maxWidth: size.width - edit.x - 24,
          });
          break;
        }
        case 'image': {
          if (edit.imageBytes) {
            const image = await embedImage(edit.imageBytes, edit.imageType || 'jpg');
            page.drawImage(image, { x: edit.x, y: edit.y - (edit.height || 120), width: edit.width || 150, height: edit.height || 120 });
          }
          break;
        }
        case 'rectangle': {
          page.drawRectangle({ x: edit.x, y: edit.y, width: edit.width || 100, height: edit.height || 100, color: hexToRgb(edit.borderColor || edit.color || '#000'), borderWidth: edit.borderWidth || 2 });
          if (edit.fill) page.drawRectangle({ x: edit.x, y: edit.y, width: edit.width || 100, height: edit.height || 100, color: hexToRgb(edit.fill), opacity: 0.35 });
          break;
        }
        case 'circle': {
          page.drawEllipse({ center: { x: edit.x + (edit.width || 100) / 2, y: edit.y + (edit.height || 100) / 2 }, xRadius: (edit.width || 100) / 2, yRadius: (edit.height || 100) / 2, color: hexToRgb(edit.borderColor || edit.color || '#000'), borderWidth: edit.borderWidth || 2 });
          if (edit.fill) page.drawEllipse({ center: { x: edit.x + (edit.width || 100) / 2, y: edit.y + (edit.height || 100) / 2 }, xRadius: (edit.width || 100) / 2, yRadius: (edit.height || 100) / 2, color: hexToRgb(edit.fill), opacity: 0.35 });
          break;
        }
        case 'line': {
          page.drawLine({ start: { x: edit.x1, y: edit.y1 }, end: { x: edit.x2, y: edit.y2 }, thickness: edit.thickness || 2, color: hexToRgb(edit.color || '#000') });
          break;
        }
        case 'arrow': {
          page.drawLine({ start: { x: edit.x1, y: edit.y1 }, end: { x: edit.x2, y: edit.y2 }, thickness: edit.thickness || 2, color: hexToRgb(edit.color || '#000') });
          break;
        }
        case 'highlight': {
          page.drawRectangle({ x: edit.x, y: edit.y, width: edit.width || 200, height: edit.height || 30, color: hexToRgb(edit.color || '#ffff00'), opacity: 0.35 });
          break;
        }
        case 'draw': {
          const pts = edit.points || [];
          for (let i = 1; i < pts.length; i += 1) {
            page.drawLine({ start: pts[i - 1], end: pts[i], thickness: edit.thickness || 2, color: hexToRgb(edit.color || '#000'), opacity: edit.opacity });
          }
          break;
        }
        case 'stamp': {
          page.drawText(edit.text || 'RuangPDF', { x: edit.x, y: edit.y, size: Number(edit.size || 24), font: boldFont, color: hexToRgb(edit.color || '#d32f2f') });
          break;
        }
        case 'note': {
          page.drawRectangle({ x: edit.x, y: edit.y, width: 120, height: 60, color: rgb(1, 0.96, 0.73), opacity: 0.48 });
          page.drawText(edit.text || 'Catatan', { x: edit.x + 6, y: edit.y + 8, size: 11, font, color: rgb(0.13, 0.16, 0.19) });
          break;
        }
      }
    }
    return document;
  }

  async function savePdf() {
    if (!fileRef.current) return;
    setBusy(true);
    setError('');
    try {
      const document = await PDFDocument.load(await fileRef.current.arrayBuffer());
      await applyEdits(document);
      const saved = await document.save({ useObjectStreams: true });
      const next = new File([saved], fileRef.current.name, { type: 'application/pdf', lastModified: Date.now() });
      setCurrentFile(next);
      setDirty(false);
      setMessage('Perubahan disimpan ke PDF.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan PDF.');
    } finally {
      setBusy(false);
    }
  }

  async function addPages(event) {
    const additional = event.target.files?.[0];
    event.target.value = '';
    if (!additional || !fileRef.current) return;
    try {
      const source = await PDFDocument.load(await additional.arrayBuffer());
      const pages = await source.copyPages(source, source.getPageIndices());
      setEdits((current) => {
        const offset = pageCount;
        return [...current, ...pages.map((_, i) => ({ id: String(Date.now() + i), page: offset + i + 1, type: 'page', sourcePage: i }))];
      });
      setPageCount(pageCount + pages.length);
      setActivePage(pageCount + 1);
      setMessage('Halaman berhasil ditambahkan.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menambahkan halaman.');
    }
  }

  async function addBlankPage() {
    if (!fileRef.current) return;
    try {
      const source = await PDFDocument.load(await fileRef.current.arrayBuffer());
      const page = source.getPage(activePage - 1);
      source.addPage(page.getSize());
      const saved = await source.save();
      const next = new File([saved], fileRef.current.name, { type: 'application/pdf', lastModified: Date.now() });
      setCurrentFile(next);
      setPageCount(pageCount + 1);
      setActivePage(pageCount + 1);
      setMessage('Halaman kosong ditambahkan.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menambahkan halaman kosong.');
    }
  }

  async function deleteCurrentPage() {
    if (pageCount <= 1) {
      setError('PDF harus memiliki setidaknya satu halaman.');
      return;
    }
    try {
      const source = await PDFDocument.load(await fileRef.current.arrayBuffer());
      source.removePage(activePage - 1);
      const saved = await source.save();
      const next = new File([saved], fileRef.current.name, { type: 'application/pdf', lastModified: Date.now() });
      setCurrentFile(next);
      setPageCount(pageCount - 1);
      setActivePage(Math.max(1, activePage - 1));
      setEdits((current) => current.filter((e) => e.page !== activePage).map((e) => e.page > activePage ? { ...e, page: e.page - 1 } : e));
      setMessage('Halaman dihapus.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menghapus halaman.');
    }
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
    if (!ownerId) { onAuthRequired(); return; }
    if (!fileRef.current) return;
    setBusy(true);
    setError('');
    try {
      await saveDocument(ownerId, fileRef.current.name, fileRef.current);
      setDirty(false);
      setMessage('PDF disimpan di Ruang Simpanan.');
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan PDF.');
    } finally {
      setBusy(false);
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
      setEdits([]);
      setUndoStack([]);
      setRedoStack([]);
      setDirty(false);
      setCurrentFile(nextFile);
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

  const tab = TABS.find((t) => t.id === activeTab) || TABS[0];
  const TabIcon = tab.icon;

  return <section className="pdf-editor" aria-label="Editor PDF">
    <header className="editor-topbar">
      <button className="editor-back" onClick={handleBack} aria-label="Kembali"><ArrowLeft size={18} /></button>
      <div className="editor-brand"><span className="editor-mark">r<span>✳</span></span><b>ruang<span>pdf</span></b><i /></div>
      <div className="editor-file-name">{file?.name || 'Editor PDF'}{busy && <span> · Memproses...</span>}</div>
      <div className="editor-actions">
        <button onClick={undo} disabled={!undoStack.length || busy} className="editor-action-btn" title="Urungkan"><Undo2 size={15} /></button>
        <button onClick={redo} disabled={!redoStack.length || busy} className="editor-action-btn" title="Ulangi"><Redo2 size={15} /></button>
        <button onClick={saveToWorkspace} disabled={!file || busy} className="editor-save"><Check size={15} /> Simpan</button>
        <button onClick={downloadPdf} disabled={!file}><ArrowDownToLine size={16} /><span>Unduh</span></button>
        <button onClick={printPdf} disabled={!file}><Printer size={16} /><span>Cetak</span></button>
      </div>
    </header>

    <div className="editor-ribbon">
      <div className="ribbon-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          return <button key={t.id} className={`ribbon-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}><Icon size={16} strokeWidth={1.6} /><span>{t.label}</span></button>;
        })}
      </div>
      <div className="ribbon-group ribbon-${activeTab}">
        {activeTab === 'home' && (
          <>
            <div className="ribbon-section">
              <div className="ribbon-section-title">Font</div>
              <div className="ribbon-control"><select className="ribbon-select" value={fmt.family} onChange={(e) => setFmt((c) => ({ ...c, family: e.target.value }))}>{FONT_LIST.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
              <div className="ribbon-control"><input className="ribbon-size" type="number" min="8" max="72" value={fmt.size} onChange={(e) => setFmt((c) => ({ ...c, size: Number(e.target.value) || 18 }))} /></div>
              <button className={`ribbon-btn ${fmt.bold ? 'active' : ''}`} onClick={() => setFmt((c) => ({ ...c, bold: !c.bold }))} title="Tebal"><Bold size={14} /><span>Tebal</span></button>
              <button className={`ribbon-btn ${fmt.italic ? 'active' : ''}`} onClick={() => setFmt((c) => ({ ...c, italic: !c.italic }))} title="Miring"><Italic size={14} /><span>Miring</span></button>
              <button className={`ribbon-btn ${fmt.underline ? 'active' : ''}`} onClick={() => setFmt((c) => ({ ...c, underline: !c.underline }))} title="Garis bawah"><Underline size={14} /><span>Garis Bawah</span></button>
            </div>
            <div className="ribbon-section">
              <div className="ribbon-section-title">Warna</div>
              <div className="ribbon-control"><label className="ribbon-color"><span style={{ background: fmt.color }} /><input type="color" value={fmt.color} onChange={(e) => setFmt((c) => ({ ...c, color: e.target.value }))} /></label><span style={{fontSize:8,color:'#888'}}>Teks</span></div>
              <div className="ribbon-control"><label className="ribbon-color"><span style={{ background: fmt.highlight }} /><input type="color" value={fmt.highlight} onChange={(e) => setFmt((c) => ({ ...c, highlight: e.target.value }))} /></label><span style={{fontSize:8,color:'#888'}}>Highlight</span></div>
            </div>
            <div className="ribbon-section">
              <div className="ribbon-section-title">Susunan</div>
              <button className={`ribbon-btn ${fmt.align === 'left' ? 'active' : ''}`} onClick={() => setFmt((c) => ({ ...c, align: 'left' }))} title="Rata kiri"><AlignLeft size={14} /><span>Rata Kiri</span></button>
              <button className={`ribbon-btn ${fmt.align === 'center' ? 'active' : ''}`} onClick={() => setFmt((c) => ({ ...c, align: 'center' }))} title="Rata tengah"><AlignCenter size={14} /><span>Tengah</span></button>
              <button className={`ribbon-btn ${fmt.align === 'right' ? 'active' : ''}`} onClick={() => setFmt((c) => ({ ...c, align: 'right' }))} title="Rata kanan"><AlignRight size={14} /><span>Rata Kanan</span></button>
              <button className={`ribbon-btn ${fmt.align === 'justify' ? 'active' : ''}`} onClick={() => setFmt((c) => ({ ...c, align: 'justify' }))} title="Rata justified"><Columns size={14} /><span>Justify</span></button>
              <div className="ribbon-control"><label className="ribbon-color"><span style={{ background: fmt.highlight }} /><input type="color" value={fmt.highlight} onChange={(e) => setFmt((c) => ({ ...c, highlight: e.target.value }))} /></label></div>
              <div className="ribbon-control"><label className="ribbon-color"><span style={{ background: fmt.color }} /><input type="color" value={fmt.color} onChange={(e) => setFmt((c) => ({ ...c, color: e.target.value }))} /></label></div>
            </div>
            <div className="ribbon-section">
              <div className="ribbon-section-title">Jarak & Margin</div>
              <div className="ribbon-control"><label className="ribbon-color"><span style={{ background: '#fff', border: '1px solid #ccc' }} /><input type="number" min="1" max="10" step="0.1" value={fmt.spacing} onChange={(e) => setFmt((c) => ({ ...c, spacing: Number(e.target.value) || 1.4 }))} style={{ width: 50, height: 24, fontSize: 9 }} /></label><span style={{ fontSize: 8, color: '#888' }}>Spacing</span></div>
              <div className="ribbon-control"><label className="ribbon-color"><span style={{ background: '#fff', border: '1px solid #ccc' }} /><input type="number" min="20" max="200" value={fmt.margin} onChange={(e) => setFmt((c) => ({ ...c, margin: Number(e.target.value) || 72 }))} style={{ width: 50, height: 24, fontSize: 9 }} /></label><span style={{ fontSize: 8, color: '#888' }}>Margin</span></div>
              <button className={`ribbon-btn ${fmt.showHeader ? 'active' : ''}`} onClick={toggleHeaderFooter} title="Header/Footer"><File size={14} /><span>Header</span></button>
              <button className="ribbon-btn" onClick={() => setShowFind(true)} title="Cari & Ganti"><Search size={14} /><span>Cari</span></button>
            </div>
            <div className="ribbon-section">
              <div className="ribbon-section-title">Tabel</div>
              <div className="ribbon-control"><label className="ribbon-color"><span style={{ background: '#fff', border: '1px solid #ccc' }} /><input type="number" min="1" max="10" value={tableCols} onChange={(e) => setTableCols(e.target.value)} style={{ width: 40, height: 24, fontSize: 9 }} /></label><span style={{ fontSize: 8, color: '#888' }}>Kolom</span></div>
              <div className="ribbon-control"><label className="ribbon-color"><span style={{ background: '#fff', border: '1px solid #ccc' }} /><input type="number" min="1" max="20" value={tableRows} onChange={(e) => setTableRows(e.target.value)} style={{ width: 40, height: 24, fontSize: 9 }} /></label><span style={{ fontSize: 8, color: '#888' }}>Baris</span></div>
              <button className="ribbon-btn" onClick={insertTable} title="Sisipkan Tabel"><Table size={14} /><span>Tabel</span></button>
            </div>
            <div className="ribbon-section editor-text-input-section">
              <input className="editor-text-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={activeTool === 'link' ? 'Teks tautan...' : 'Ketik teks, lalu klik halaman'} />
              {activeTool === 'link' && <input className="editor-text-input editor-link-input" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://alamat-tautan..." />}
            </div>
          </>
        )}
{activeTab === 'insert' && (
           <>
             <div className="ribbon-section">
               <div className="ribbon-section-title">Sisipkan</div>
               <button className="ribbon-btn" onClick={() => { setActiveTool('text'); setMessage('Klik halaman untuk menempatkan teks.'); }} title="Teks"><TextCursorInput size={14} /><span>Teks</span></button>
               <button className="ribbon-btn" onClick={() => { setActiveTool('image'); imageInput.current?.click(); }} title="Gambar"><Image size={14} /><span>Gambar</span></button>
               <input ref={imageInput} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImageFile(f); setImageUrl(URL.createObjectURL(f)); } }} />
               <button className="ribbon-btn" onClick={() => { setActiveTool('stamp'); setMessage('Klik halaman untuk menempatkan stempel.'); }} title="Stempel"><Stamp size={14} /><span>Stempel</span></button>
               <button className="ribbon-btn" onClick={() => { setActiveTool('note'); setMessage('Klik halaman untuk menempatkan catatan.'); }} title="Catatan"><MessageSquareText size={14} /><span>Catatan</span></button>
               <button className="ribbon-btn" onClick={() => { setActiveTool('link'); setMessage('Ketik teks dan URL, lalu klik halaman.'); }} title="Tautan"><Link2 size={14} /><span>Tautan</span></button>
             </div>
             <div className="ribbon-section">
               <div className="ribbon-section-title">Bentuk</div>
               {SHAPE_TOOLS.map((tool) => {
                 const labels = { line: 'Garis', arrow: 'Panah', rectangle: 'Persegi', circle: 'Lingkaran' };
                 const Icons = { line: ArrowRight, arrow: ArrowRight, rectangle: Square, circle: Circle };
                 const Icon = Icons[tool];
                 return <button key={tool} className={`ribbon-btn ${activeTool === tool ? 'active' : ''}`} onClick={() => { setActiveTool(tool); setMessage(`Tarik di halaman untuk membuat ${labels[tool]}.`); }} title={labels[tool]}><Icon size={14} /><span>{labels[tool]}</span></button>;
               })}
             </div>
           </>
         )}
{activeTab === 'page' && (
           <>
             <div className="ribbon-section">
               <div className="ribbon-section-title">Manajemen Halaman</div>
               <button className="ribbon-btn" onClick={() => pagesInput.current?.click()} title="Tambah halaman"><PlusIcon size={14} /><span>Tambah</span></button>
               <input ref={pagesInput} type="file" accept=".pdf,application/pdf" hidden onChange={addPages} />
               <button className="ribbon-btn" onClick={addBlankPage} disabled={!file} title="Halaman kosong"><FilePlus2 size={14} /><span>Kosong</span></button>
               <button className="ribbon-btn" onClick={deleteCurrentPage} disabled={!file || pageCount <= 1} title="Hapus halaman"><Trash2 size={14} /><span>Hapus</span></button>
               <button className="ribbon-btn" onClick={() => { setActiveTool('rotate'); setMessage('Putar halaman aktif.'); }} title="Putar halaman"><RotateCw size={14} /><span>Putar</span></button>
             </div>
           </>
         )}
         {activeTab === 'draw' && (
           <>
             <div className="ribbon-section">
               <div className="ribbon-section-title">Alat Gambar</div>
               {DRAW_TOOLS.map((tool) => {
                 const labels = { pen: 'Pena', highlighter: 'Stabilo', eraser: 'Penghapus', select: 'Pilih' };
                 const Icons = { pen: PenTool, highlighter: Highlighter, eraser: Zap, select: BarChart3 };
                 const Icon = Icons[tool];
                 return <button key={tool} className={`ribbon-btn ${activeTool === tool ? 'active' : ''}`} onClick={() => { setActiveTool(tool); setMessage(labels[tool]); }} title={labels[tool]}><Icon size={14} /><span>{labels[tool]}</span></button>;
               })}
             </div>
           </>
         )}
         {activeTab === 'view' && (
           <>
             <div className="ribbon-section">
               <div className="ribbon-section-title">Tampilan</div>
               <button className="ribbon-btn" onClick={() => setZoom((z) => Math.max(50, z - 25))} title="Perbesar"><ZoomOut size={14} /><span>Perbesar</span></button>
               <span className="ribbon-zoom">{zoom}%</span>
               <button className="ribbon-btn" onClick={() => setZoom((z) => Math.min(300, z + 25))} title="Kecilkan"><ZoomIn size={14} /><span>Kecilkan</span></button>
               <button className={`ribbon-btn ${showRuler ? 'active' : ''}`} onClick={() => setShowRuler((v) => !v)} title="Penggaris"><Zap size={14} /><span>Penggaris</span></button>
               <button className={`ribbon-btn ${showNav ? 'active' : ''}`} onClick={() => setShowNav((v) => !v)} title="Panel navigasi"><Layout size={14} /><span>Navigasi</span></button>
             </div>
           </>
         )}
      </div>
    </div>

    <div className="editor-workspace">
      {showNav && <aside className="editor-pages">
        <div className="pages-heading"><span>HALAMAN</span><button aria-label="Tambah halaman kosong" title="Tambah halaman kosong" onClick={addBlankPage} disabled={!file}><PlusIcon size={16} /></button></div>
        {!file ? <button className="editor-open-file" onClick={() => fileInput.current?.click()}><FilePlus2 size={22} /><b>Buka PDF</b><span>Pilih file dari perangkat</span></button> : thumbnails.map((thumbnail, index) => <div className={`page-thumb ${activePage === index + 1 ? 'active' : ''}`} key={`${index}-${thumbnail.slice(-8)}`}>
          <button onClick={() => setActivePage(index + 1)} aria-label={`Pilih halaman ${index + 1}`}><img src={thumbnail} alt={`Pratinjau halaman ${index + 1}`} /><small>{index + 1}</small></button>
          <button className="delete-thumb" aria-label={`Hapus halaman ${index + 1}`} onClick={() => { setActivePage(index + 1); deleteCurrentPage(); }}><X size={13} /></button>
        </div>)}
      </aside>}

      <main className="editor-canvas-area" ref={canvasWrapRef} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files[0]) selectFile(event.dataTransfer.files[0]); }}>
        {!file ? <button className="editor-dropzone" onClick={() => fileInput.current?.click()}><span><PlusIcon size={25} /></span><b>Taruh PDF di sini</b><small>atau pilih file dari perangkat</small></button> : <div className="editor-page-stage">
          <div className={`editor-page-canvas${showRuler ? ' has-ruler' : ''}`}>
            {showRuler && <div className="editor-ruler-top"></div>}
             <canvas ref={canvasRef} style={{ cursor: DRAW_TOOLS.includes(activeTool) ? 'crosshair' : 'pointer' }} />
            {showRuler && <div className="editor-ruler-left"></div>}
            {positionMarker && <span className={`gesture-marker ${activeTool}`} style={positionMarker} />}
          </div>
        </div>}
        <input ref={fileInput} type="file" accept=".pdf,application/pdf" hidden onChange={(event) => { if (event.target.files?.[0]) selectFile(event.target.files[0]); event.target.value = ''; }} />
        {(message || error) && <div className={`editor-feedback ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || message}<button onClick={() => { setError(''); setMessage(''); }} aria-label="Tutup notifikasi"><X size={14} /></button></div>}
        {file && <div className="editor-page-counter">Halaman {activePage} dari {pageCount} · Zoom {zoom}%</div>}
      </main>
    </div>
    <footer className="editor-statusbar"><span>{file ? `${pageCount} halaman · ${edits.length} elemen` : 'Belum ada dokumen'} · File tetap di perangkat</span><span>{dirty ? '<b>Tidak tersimpan</b>' : 'Tersimpan'} · {activeTool}</span></footer>
    <style>{`
      .editor-ribbon { flex: 0 0 auto; border-bottom: 1px solid #dfe4e9; background: #fff; box-shadow: 0 2px 6px rgba(27,39,48,.04); }
      .ribbon-tabs { display: flex; align-items: stretch; gap: 1px; padding: 0 12px; overflow-x: auto; border-bottom: 1px solid #eef0ee; background: #f7f9fc; }
      .ribbon-tab { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: #515c63; font-size: 9px; font-weight: 600; cursor: pointer; white-space: nowrap; }
      .ribbon-tab:hover { background: #f1f3f0; }
      .ribbon-tab.active { border-bottom-color: #5273e0; color: #5273e0; background: #fff; }
      .ribbon-tab svg { color: inherit; }
      .ribbon-group { display: flex; gap: 14px; padding: 7px 14px; background: #fff; overflow-x: auto; }
      .ribbon-section { display: flex; flex-direction: row; align-items: center; gap: 4px; border-right: 1px solid #f0f2f4; padding-right: 12px; margin-right: 10px; min-width: auto; }
      .ribbon-section-title { color: #8a9599; font-size: 7px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-right: 8px; white-space: nowrap; }
      .ribbon-control { display: flex; flex-direction: row; align-items: center; gap: 3px; }
      .ribbon-select, .ribbon-size { width: auto; min-width: 70px; height: 24px; padding: 0 6px; border: 1px solid #e1e6e8; border-radius: 4px; background: #fff; font-size: 9px; color: #455159; }
      .ribbon-btn { display: flex; flex-direction: row; align-items: center; gap: 4px; padding: 4px 8px; border: 0; border-radius: 5px; background: transparent; color: #515c63; font-size: 8px; white-space: nowrap; cursor: pointer; min-width: auto; }
      .ribbon-btn:hover:not(.active) { background: #f6f7f5; color: #25323a; }
      .ribbon-btn.active { background: #fff0ef; color: #d34b42; }
      .ribbon-btn svg { flex-shrink: 0; }
      .ribbon-btn span { font-size: 8px; }
      .ribbon-color { position: relative; display: grid; place-items: center; width: 24px; height: 25px; }
      .ribbon-color > span { width: 16px; height: 16px; border: 1px solid #aeb7bd; border-radius: 50%; pointer-events: none; }
      .ribbon-color input { position: absolute; inset: 0; width: 24px; height: 25px; opacity: 0; cursor: pointer; }
      .editor-text-input-section { display: flex; flex-direction: row; align-items: center; gap: 4px; min-width: 180px; }
      .editor-text-input { width: 180px; height: 26px; padding: 0 7px; border: 1px solid #e1e6e8; border-radius: 5px; background: #fff; color: #455159; font-size: 9px; }
      .editor-link-input { width: 140px; }
      .ribbon-zoom { font-size: 9px; color: #515c63; margin: 0 6px; }
      .editor-workspace { min-height: 0; display: flex; flex: 1; overflow: hidden; }
      .editor-pages { width: 180px; flex: 0 0 180px; overflow-y: auto; padding: 12px 13px 20px; border-right: 1px solid #dfe4e8; background: #fff; display: ${showNav ? 'block' : 'none'}; }
      .pages-heading { display: flex; align-items: center; justify-content: space-between; margin: 1px 3px 12px; color: #8a969b; font-size: 8px; font-weight: 700; letter-spacing: 1.1px; }
      .pages-heading button { display: grid; place-items: center; width: 25px; height: 25px; border: 0; border-radius: 5px; background: #f4f6f3; color: #66764a; cursor: pointer; }
      .pages-heading button:disabled { opacity: .45; cursor: not-allowed; }
      .page-thumb { position: relative; margin: 0 auto 13px; width: 120px; }
      .page-thumb > button:first-child { width: 100%; padding: 5px 5px 4px; border: 1px solid #e1e6e6; border-radius: 4px; background: #f8f9f8; cursor: pointer; }
      .page-thumb.active > button:first-child { border-color: #5273e0; box-shadow: 0 0 0 1px #5273e0; }
      .page-thumb img { display: block; width: 100%; max-height: 180px; object-fit: contain; background: #fff; }
      .page-thumb small { display: block; padding-top: 4px; color: #8d999e; font-size: 8px; text-align: center; }
      .delete-thumb { position: absolute; top: -7px; right: -7px; display: grid; place-items: center; width: 20px; height: 20px; border: 1px solid #f0c4bd; border-radius: 50%; background: #fff; color: #b94a40; cursor: pointer; }
      .editor-open-file { width: 100%; display: grid; justify-items: center; gap: 7px; padding: 14px 5px; border: 1px dashed #dfe5dc; border-radius: 7px; background: #fafbf8; color: #708348; font-size: 9px; cursor: pointer; }
      .editor-open-file b { color: #4a575d; font-size: 10px; }
      .editor-open-file span { color: #9ba4a2; font-size: 8px; }
      .editor-canvas-area { position: relative; min-width: 0; flex: 1; overflow: auto; background-color: #eef1f4; background-image: radial-gradient(#d9dfe4 .7px, transparent .7px); background-size: 12px 12px; }
      .editor-page-stage { min-width: 100%; min-height: 100%; display: flex; justify-content: center; align-items: flex-start; padding: 25px 28px 55px; }
      .editor-page-canvas { position: relative; flex: 0 0 auto; background: white; box-shadow: 0 4px 17px rgba(29,40,49,.16); }
      .editor-page-canvas canvas { display: block; cursor: crosshair; touch-action: none; }
      .editor-ruler-top { position: absolute; top: 0; left: 34px; right: 0; height: 24px; border-bottom: 1px solid #c9d2d7; background: #f1f3f4; z-index: 2; }
      .editor-ruler-left { position: absolute; top: 24px; left: 0; width: 34px; bottom: 0; border-right: 1px solid #c9d2d7; background: #f1f3f4; z-index: 2; writing-mode: vertical-rl; }
      .editor-dropzone { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; border: 0; background: transparent; cursor: pointer; }
      .editor-dropzone span { display: grid; place-items: center; width: 52px; height: 52px; border: 1px solid #dde5d1; border-radius: 15px; background: #fff; color: #6f8446; }
      .editor-dropzone b { color: #48555c; font-size: 13px; }
      .editor-dropzone small { color: #899499; font-size: 10px; }
      .editor-feedback { position: absolute; top: 14px; left: 50%; z-index: 5; display: flex; align-items: center; gap: 10px; max-width: min(80%,520px); padding: 9px 11px; border: 1px solid #e4ebd8; border-radius: 6px; background: #fbfcf8; color: #647749; font-size: 9px; box-shadow: 0 3px 12px rgba(32,43,50,.08); transform: translateX(-50%); }
      .editor-feedback.is-error { border-color: #f1d3ce; background: #fff7f5; color: #a2463b; }
      .editor-feedback button { display: grid; place-items: center; border: 0; background: transparent; color: inherit; cursor: pointer; }
      .editor-page-counter { position: sticky; bottom: 13px; width: fit-content; padding: 6px 9px; margin: -38px auto 10px; border: 1px solid #e2e6e6; border-radius: 4px; background: rgba(255,255,255,.92); color: #78858a; font-size: 8px; }
      .editor-statusbar { min-height: 29px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 13px; border-top: 1px solid #dfe4e8; background: #fff; color: #8a9599; font-size: 8px; }
      .gesture-marker { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: #e85c4e; pointer-events: none; }
      .editor-action-btn { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 5px; background: transparent; color: #515c63; cursor: pointer; }
      .editor-action-btn:hover { background: #f2f4f4; }
      .editor-action-btn:disabled { opacity: .45; cursor: not-allowed; }
      .editor-save { border-color: #d7ed6d; background: #d7ed6d; color: #273233; font-weight: 650; }
      @media (max-width: 900px) { .editor-pages { width: 138px; flex-basis: 138px; padding-right: 8px; padding-left: 8px; } .editor-text-input { width: 120px; } .editor-statusbar { font-size: 7px; } .ribbon-group { gap: 8px; padding: 5px 10px; } .ribbon-section { min-width: 100px; padding-right: 8px; margin-right: 6px; } }
      @media (max-width: 620px) { .editor-pages { width: 93px; flex-basis: 93px; padding: 9px 5px; } .page-thumb { width: 77px; } .ribbon-tabs { padding: 0 5px; } .ribbon-tab { padding: 6px 8px; font-size: 8px; } .ribbon-group { padding: 4px 8px; } .ribbon-section { min-width: 90px; } .editor-text-input { width: 100px; } }
    `}</style>
    {showFind && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowFind(false); }}>
      <section className="tool-modal" role="dialog" aria-modal="true" aria-labelledby="find-title">
        <header className="modal-header"><span className="modal-kicker">CARI & GANTI</span><h2 id="find-title">Cari di dokumen</h2><button className="icon-btn modal-close" onClick={() => setShowFind(false)} aria-label="Tutup"><X size={18} /></button></header>
        <div className="modal-body">
          <div className="options-panel">
            <div className="options-title">Pencarian</div>
            <label className="field-label">Kata kunci<input className="editor-text-input" value={findText} onChange={(e) => { setFindText(e.target.value); }} placeholder="Ketik untuk mencari..." /></label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="process-button" onClick={searchPdfText}>Cari</button>
              <button className="process-button" disabled={!findResults.length} onClick={() => { if (findResults.length) { const next = (currentFindIndex + 1) % findResults.length; setCurrentFindIndex(next); const r = findResults[next]; setActivePage(r.page); } }}>Berikutnya</button>
            </div>
            {findResults.length > 0 && <div className="editor-feedback" style={{ marginTop: 8 }}>Ditemukan {findResults.length} hasil · urutan {currentFindIndex + 1}/{findResults.length}</div>}
          </div>
        </div>
      </section>
    </div>}
  </section>;
}

function PlusIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
