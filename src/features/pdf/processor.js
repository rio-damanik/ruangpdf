import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun } from "docx";
import pptxgen from "pptxgenjs";
import mammoth from "mammoth";
import { createWorker } from "tesseract.js";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const readPdf = async (file) => PDFDocument.load(await file.arrayBuffer());
const safeName = (name) => name.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*]+/g, "-");

export function saveBlob(blob, filename) {
  saveAs(blob, filename);
}

function parsePageList(value, count) {
  const pages = new Set();
  for (const part of value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) throw new Error(`Rentang halaman "${part}" tidak valid.`);
      for (let page = start; page <= end; page += 1) pages.add(page - 1);
    } else if (/^\d+$/.test(part)) {
      pages.add(Number(part) - 1);
    } else {
      throw new Error(`Format halaman "${part}" tidak valid. Contoh: 1, 3-5.`);
    }
  }
  const result = [...pages].sort((a, b) => a - b);
  if (!result.length || result.some((page) => page < 0 || page >= count)) {
    throw new Error(`Pilih halaman antara 1 dan ${count}.`);
  }
  return result;
}

async function pdfText(file) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lines = [];
    let lastY;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = Math.round(item.transform[5]);
      if (lastY !== undefined && Math.abs(y - lastY) > 4) lines.push("\n");
      lines.push(item.str);
      lines.push(" ");
      lastY = y;
    }
    pages.push(lines.join("").trim());
  }
  return pages;
}

async function renderPages(file, format, quality = 0.9) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const zip = new JSZip();
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, `image/${format}`, quality));
    if (!blob) throw new Error("Halaman PDF gagal dirender menjadi gambar.");
    zip.file(`${safeName(file.name)}-halaman-${i}.${format}`, blob);
  }
  return zip.generateAsync({ type: "blob" });
}

async function renderBitmaps(file) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const zip = new JSZip();
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const stride = Math.ceil((canvas.width * 3) / 4) * 4;
    const pixelBytes = stride * canvas.height;
    const bytes = new Uint8Array(54 + pixelBytes);
    const view = new DataView(bytes.buffer);
    view.setUint8(0, 0x42);
    view.setUint8(1, 0x4d);
    view.setUint32(2, bytes.length, true);
    view.setUint32(10, 54, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, canvas.width, true);
    view.setInt32(22, canvas.height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    view.setUint32(34, pixelBytes, true);
    for (let y = 0; y < canvas.height; y += 1) {
      const sourceY = canvas.height - 1 - y;
      for (let x = 0; x < canvas.width; x += 1) {
        const source = (sourceY * canvas.width + x) * 4;
        const target = 54 + y * stride + x * 3;
        bytes[target] = pixels[source + 2];
        bytes[target + 1] = pixels[source + 1];
        bytes[target + 2] = pixels[source];
      }
    }
    zip.file(`${safeName(file.name)}-halaman-${i}.bmp`, bytes);
  }
  return zip.generateAsync({ type: "blob" });
}

async function renderSvg(file) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const zip = new JSZip();
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const operatorList = await page.getOperatorList();
    const graphics = new pdfjs.SVGGraphics(page.commonObjs, page.objs);
    const svg = await graphics.getSVG(operatorList, viewport);
    const svgString = new XMLSerializer().serializeToString(svg);
    zip.file(`${safeName(file.name)}-halaman-${i}.svg`, svgString);
  }
  return zip.generateAsync({ type: "blob" });
}

async function addTextToPdf(doc, text, { fontSize = 12, margin = 44, color = rgb(0.13, 0.16, 0.19) } = {}) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([595.28, 841.89]);
  const maxWidth = page.getWidth() - margin * 2;
  const lines = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    lines.push(line);
  }
  let y = page.getHeight() - margin;
  for (const line of lines) {
    if (y < margin) {
      page = doc.addPage([595.28, 841.89]);
      y = page.getHeight() - margin;
    }
    page.drawText(line, { x: margin, y, size: fontSize, font, color });
    y -= fontSize * 1.55;
  }
  return font;
}

function wordsToPdfPages(text) {
  return text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function csvRows(text) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.length)
    .map((line) => {
      const cells = [];
      let value = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"' && quoted && line[i + 1] === '"') {
          value += '"';
          i += 1;
        } else if (char === '"') quoted = !quoted;
        else if (char === "," && !quoted) {
          cells.push(value);
          value = "";
        } else value += char;
      }
      cells.push(value);
      return cells;
    });
}

async function imageFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) {
    throw new Error(`Browser tidak dapat membuka gambar ${file.name}: ${error.message}`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function imageToBlob(file, type, quality = 0.92) {
  const { image, width, height } = await imageFromFile(file);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: type !== "image/jpeg" });
  if (type === "image/jpeg") {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error(`Browser tidak dapat mengonversi gambar ke ${type}.`);
  return blob;
}

function bitmapIcon(pngBytes) {
  const bytes = new Uint8Array(22 + pngBytes.length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  view.setUint8(6, 0);
  view.setUint8(7, 0);
  view.setUint8(8, 0);
  view.setUint8(9, 0);
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, pngBytes.length, true);
  view.setUint32(18, 22, true);
  bytes.set(pngBytes, 22);
  return bytes;
}

function rtfEscape(value) {
  return value.replace(/[\\{}]/g, "\\$&").replace(/[^\x00-\x7f]/g, (char) => `\\u${char.charCodeAt(0)}?`);
}

function makeEpub(pages, title) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  const chapters = pages.map((text, index) => {
    const id = `chapter-${index + 1}`;
    zip.file(
      `OEBPS/${id}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Halaman ${index + 1}</title></head><body><h1>Halaman ${index + 1}</h1>${text
        .split(/\r?\n/)
        .map((line) => `<p>${xmlEscape(line)}</p>`)
        .join("")}</body></html>`,
    );
    return `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`;
  });
  const spine = pages.map((_, index) => `<itemref idref="chapter-${index + 1}"/>`).join("");
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">urn:uuid:ruangpdf-${Date.now()}</dc:identifier><dc:title>${xmlEscape(title)}</dc:title><dc:language>id</dc:language></metadata><manifest>${chapters.join("")}</manifest><spine>${spine}</spine></package>`,
  );
  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}

async function extractOfficeText(file, kind) {
  const zip = await JSZip.loadAsync(file);
  const path = kind === "odt" ? "content.xml" : null;
  if (path) {
    const content = zip.file(path);
    if (!content) throw new Error("Tidak menemukan isi dokumen ODT.");
    const xml = new DOMParser().parseFromString(await content.async("text"), "application/xml");
    return [...xml.getElementsByTagName("*")]
      .filter((node) => ["p", "h"].some((tag) => node.localName === tag))
      .map((node) => node.textContent.trim())
      .filter(Boolean)
      .join("\n");
  }
  if (kind === "epub") {
    const container = zip.file("META-INF/container.xml");
    if (!container) throw new Error("File EPUB tidak memiliki container yang valid.");
    const containerXml = new DOMParser().parseFromString(await container.async("text"), "application/xml");
    const opfPath = containerXml.getElementsByTagName("rootfile")[0]?.getAttribute("full-path");
    const opfFile = opfPath && zip.file(opfPath);
    if (!opfFile) throw new Error("Tidak menemukan metadata buku EPUB.");
    const opf = new DOMParser().parseFromString(await opfFile.async("text"), "application/xml");
    const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
    const manifest = new Map([...opf.getElementsByTagName("item")].map((item) => [item.getAttribute("id"), item.getAttribute("href")]));
    const chapters = [];
    for (const ref of [...opf.getElementsByTagName("itemref")]) {
      const href = manifest.get(ref.getAttribute("idref"));
      if (!href) continue;
      const chapter = zip.file(`${base}${href}`);
      if (chapter) chapters.push(new DOMParser().parseFromString(await chapter.async("text"), "application/xhtml+xml").body?.textContent || "");
    }
    return chapters.join("\n\n");
  }
  throw new Error("Format dokumen tidak didukung.");
}

function xmlEscape(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character],
  );
}

function columnName(number) {
  let name = "";
  while (number > 0) {
    number -= 1;
    name = String.fromCharCode(65 + (number % 26)) + name;
    number = Math.floor(number / 26);
  }
  return name;
}

function makeXlsx(rows) {
  const zip = new JSZip();
  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  zip.file(
    "xl/workbook.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ekstrak PDF" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

async function extractWorkbookText(file) {
  const zip = await JSZip.loadAsync(file);
  const workbookFile = zip.file("xl/workbook.xml");
  const relationsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbookFile || !relationsFile) throw new Error("File XLSX tidak memiliki struktur workbook yang valid.");
  const workbook = new DOMParser().parseFromString(await workbookFile.async("text"), "application/xml");
  const relations = new DOMParser().parseFromString(await relationsFile.async("text"), "application/xml");
  const relationTargets = new Map([...relations.getElementsByTagName("Relationship")].map((item) => [item.getAttribute("Id"), item.getAttribute("Target")]));
  const sharedFile = zip.file("xl/sharedStrings.xml");
  const sharedStrings = sharedFile
    ? [...new DOMParser().parseFromString(await sharedFile.async("text"), "application/xml").getElementsByTagName("si")].map((item) => [...item.getElementsByTagName("t")].map((part) => part.textContent).join(""))
    : [];
  const sheets = [...workbook.getElementsByTagName("sheet")];
  if (!sheets.length) throw new Error("Workbook ini tidak memiliki lembar kerja.");
  const output = [];
  for (const sheet of sheets) {
    const id = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    let target = relationTargets.get(id);
    if (!target) continue;
    const parts = target.startsWith("/") ? [] : ["xl"];
    target.split("/").forEach((part) => {
      if (part === "..") parts.pop();
      else if (part && part !== ".") parts.push(part);
    });
    const sheetFile = zip.file(parts.join("/"));
    if (!sheetFile) continue;
    const xml = new DOMParser().parseFromString(await sheetFile.async("text"), "application/xml");
    const rowTexts = [...xml.getElementsByTagName("row")].map((row) => {
      const values = [];
      for (const cell of [...row.getElementsByTagName("c")]) {
        const reference = cell.getAttribute("r") || "";
        const column = reference.match(/^[A-Z]+/i)?.[0] || "";
        const index = [...column.toUpperCase()].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
        const type = cell.getAttribute("t");
        const value = cell.getElementsByTagName("v")[0]?.textContent || "";
        const text = type === "s" ? sharedStrings[Number(value)] || "" : type === "inlineStr" ? [...cell.getElementsByTagName("t")].map((part) => part.textContent).join("") : value;
        values[index] = text;
      }
      return values.map((value) => value ?? "").join("\t");
    });
    output.push(`${sheet.getAttribute("name") || "Sheet"}\n${rowTexts.join("\n")}`);
  }
  if (!output.length) throw new Error("Tidak dapat membaca lembar kerja di file ini.");
  return output.join("\n\n");
}

export async function createFormTemplate(form) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fields =
    form.id === "w9"
      ? ["Nama lengkap", "Nama usaha (jika ada)", "Klasifikasi pajak", "Alamat", "Kota, provinsi, kode pos", "Nomor identifikasi pajak (TIN)"]
      : form.id === "ds11"
        ? ["Nama lengkap pemohon", "Tempat & tanggal lahir", "Alamat tempat tinggal", "Kontak darurat", "Dokumen identitas", "Tanggal pengajuan"]
        : ["Nama penerima", "Alamat penerima", "Nomor identifikasi pajak", "Jenis pembayaran", "Jumlah pembayaran", "Tahun pajak"];
  page.drawText(form.label, { x: 46, y: 776, size: 28, font: bold, color: rgb(0.1, 0.22, 0.4) });
  page.drawText(`${form.description} · Template kerja pribadi`, { x: 46, y: 750, size: 10, font, color: rgb(0.39, 0.43, 0.48) });
  page.drawText("TEMPLATE NON-RESMI — bukan dokumen pemerintah atau formulir pajak resmi.", { x: 46, y: 710, size: 9, font: bold, color: rgb(0.7, 0.25, 0.16) });
  let y = 665;
  fields.forEach((field, index) => {
    page.drawText(`${index + 1}. ${field}`, { x: 46, y, size: 12, font: bold, color: rgb(0.17, 0.2, 0.24) });
    page.drawLine({ start: { x: 46, y: y - 25 }, end: { x: 550, y: y - 25 }, thickness: 0.7, color: rgb(0.8, 0.82, 0.84) });
    y -= 86;
  });
  page.drawText("Periksa situs resmi lembaga terkait untuk mendapatkan formulir resmi dan petunjuk pengisian.", { x: 46, y: 56, size: 8, font, color: rgb(0.39, 0.43, 0.48), maxWidth: 500 });
  return new Blob([await doc.save()], { type: "application/pdf" });
}

async function compressPdf(file, quality, onProgress) {
  const source = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const output = await PDFDocument.create();
  const ratio = Math.max(0.55, Math.min(1, Number(quality || 75) / 100));
  for (let i = 1; i <= source.numPages; i += 1) {
    onProgress(Math.round(((i - 1) / source.numPages) * 100));
    const page = await source.getPage(i);
    const viewport = page.getViewport({ scale: 1.4 * ratio });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const imageBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", Math.max(0.42, Math.min(0.84, Number(quality || 75) / 100))));
    if (!imageBlob) throw new Error(`Halaman ${i} gagal dikompres.`);
    const image = await output.embedJpg(await imageBlob.arrayBuffer());
    const original = page.getViewport({ scale: 1 });
    const outputPage = output.addPage([original.width, original.height]);
    outputPage.drawImage(image, { x: 0, y: 0, width: original.width, height: original.height });
    onProgress(Math.round((i / source.numPages) * 100));
  }
  return output.save({ useObjectStreams: true });
}

async function convertAdditional(tool, files, onProgress) {
  const file = files[0];
  const name = safeName(file.name);

  if (tool.startsWith("pdf-to-")) {
    if (tool === "pdf-to-bmp") return [await renderBitmaps(file), `${name}-bmp.zip`, "application/zip"];
    if (tool === "pdf-to-jpeg" || tool === "pdf-to-picture") return [await renderPages(file, "jpeg"), `${name}-jpeg.zip`, "application/zip"];
    if (tool === "pdf-to-image") return [await renderPages(file, "png"), `${name}-images.zip`, "application/zip"];
    if (tool === "pdf-to-svg") return [await renderSvg(file), `${name}-svg.zip`, "application/zip"];
    const textPages = await pdfText(file);
    if (tool === "pdf-to-txt") return [new Blob([textPages.map((text, index) => `Halaman ${index + 1}\n${text}`).join("\n\n")], { type: "text/plain;charset=utf-8" }), `${name}.txt`, "text/plain"];
    if (tool === "pdf-to-html") {
      const body = textPages.map((text, index) => `<section><h2>Halaman ${index + 1}</h2><pre>${xmlEscape(text)}</pre></section>`).join("\n");
      return [new Blob([`<!doctype html><html lang="id"><meta charset="utf-8"><title>${xmlEscape(file.name)}</title><body>${body}</body></html>`], { type: "text/html;charset=utf-8" }), `${name}.html`, "text/html"];
    }
    if (tool === "pdf-to-rtf") {
      const body = textPages.map((text, index) => `\\b Halaman ${index + 1}\\b0\\par ${rtfEscape(text).replace(/\r?\n/g, "\\par ")}`).join("\\page ");
      return [new Blob([`{\\rtf1\\ansi\\deff0 ${body}}`], { type: "application/rtf" }), `${name}.rtf`, "application/rtf"];
    }
    if (tool === "pdf-to-epub") return [await makeEpub(textPages, file.name), `${name}.epub`, "application/epub+zip"];
    if (tool === "pdf-to-xlsx" || tool === "pdf-to-xls") {
      const rows = textPages.flatMap((text, index) => [[`Halaman ${index + 1}`], ...text.split(/\r?\n/).map((line) => [line])]);
      return [await makeXlsx(rows), `${name}.${tool === "pdf-to-xls" ? "xls" : "xlsx"}`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    }
  }

  if (tool === "png-ico") {
    const png = await imageToBlob(file, "image/png");
    return [bitmapIcon(new Uint8Array(await png.arrayBuffer())), `${name}.ico`, "image/x-icon"];
  }

  if (tool === "image-svg") {
    const mime = file.type || "application/octet-stream";
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    const dataUrl = `data:${mime};base64,${btoa(binary)}`;
    const { width, height } = await imageFromFile(file);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="${dataUrl}"/></svg>`;
    return [new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`, "image/svg+xml"];
  }

  if (["image-jpg", "png-jpg", "webp-jpg", "jfif-jpg", "avif-jpg"].includes(tool)) {
    return [await imageToBlob(file, "image/jpeg"), `${name}.jpg`, "image/jpeg"];
  }
  if (["image-png", "jpg-png", "jpeg-png", "svg-png"].includes(tool)) {
    return [await imageToBlob(file, "image/png"), `${name}.png`, "image/png"];
  }
  if (tool === "image-pdf" || tool === "svg-pdf") {
    const output = await PDFDocument.create();
    for (const input of files) {
      const png = await imageToBlob(input, "image/png");
      const image = await output.embedPng(await png.arrayBuffer());
      const page = output.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }
    return [await output.save(), `${name}.pdf`, "application/pdf"];
  }
  if (tool === "html-pdf" || tool === "txt-pdf" || tool === "csv-pdf" || tool === "md-pdf" || tool === "rtf-pdf") {
    let text = await file.text();
    if (tool === "html-pdf") text = new DOMParser().parseFromString(text, "text/html").body.textContent || "";
    if (tool === "rtf-pdf")
      text = text
        .replace(/\\par[d]?/g, "\n")
        .replace(/\\'[0-9a-f]{2}/gi, " ")
        .replace(/\\[a-z]+-?\d* ?/gi, "")
        .replace(/[{}]/g, "");
    if (tool === "md-pdf")
      text = text
        .replace(/!\[[^\]]*]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/[*_~`]/g, "");
    if (tool === "csv-pdf")
      text = csvRows(text)
        .map((row) => row.join("  |  "))
        .join("\n");
    if (!text.trim()) throw new Error("File ini tidak memiliki teks untuk dikonversi.");
    const output = await PDFDocument.create();
    for (const chunk of wordsToPdfPages(text)) await addTextToPdf(output, chunk);
    return [await output.save(), `${name}.pdf`, "application/pdf"];
  }
  if (tool === "odt-pdf" || tool === "odt-word" || tool === "epub-pdf") {
    const sourceType = tool.startsWith("odt-") ? "odt" : "epub";
    const text = await extractOfficeText(await file.arrayBuffer(), sourceType);
    if (!text.trim()) throw new Error("Tidak ada teks yang dapat dibaca di file ini.");
    if (tool === "odt-word") {
      const doc = new Document({ sections: [{ children: text.split(/\r?\n/).map((line) => new Paragraph(line || " ")) }] });
      return [await Packer.toBlob(doc), `${name}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    }
    const output = await PDFDocument.create();
    for (const chunk of wordsToPdfPages(text)) await addTextToPdf(output, chunk);
    return [await output.save(), `${name}.pdf`, "application/pdf"];
  }
  if (tool === "csv-excel") {
    return [await makeXlsx(csvRows(await file.text())), `${name}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
  }
  if (tool === "xlsx-csv") {
    const text = await extractWorkbookText(await file.arrayBuffer());
    const csv = text
      .split(/\r?\n/)
      .map((line) =>
        line
          .split("\t")
          .map((cell) => `"${cell.replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\r\n");
    return [new Blob([csv], { type: "text/csv;charset=utf-8" }), `${name}.csv`, "text/csv"];
  }
  if (tool === "image-to-gif" || tool === "video-to-gif" || tool === "mp4-gif") {
    throw new Error("Konversi GIF membutuhkan encoder media tambahan. File tidak diunggah; fitur ini belum diaktifkan.");
  }
  if (tool === "image-word" || tool === "image-excel") {
    const worker = await createWorker("ind+eng");
    let fullText = "";
    try {
      for (const input of files) {
        const result = await worker.recognize(input);
        fullText += result.data.text + "\n\n";
      }
    } finally {
      await worker.terminate();
    }
    if (!fullText.trim()) throw new Error("Tidak ada teks yang terdeteksi pada gambar.");

    if (tool === "image-word") {
      const doc = new Document({
        sections: [
          {
            children: fullText.split(/\r?\n/).map((line) => new Paragraph(line || " ")),
          },
        ],
      });
      return [await Packer.toBlob(doc), `${name}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    } else {
      const rows = fullText.split(/\r?\n/).map((line) => [line]);
      return [await makeXlsx(rows), `${name}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    }
  }

  onProgress(0);
  throw new Error(`Konversi ${tool} belum tersedia di versi lokal ini.`);
}

export async function processTool(tool, files, options, onProgress = () => {}) {
  if (!files.length) throw new Error("Pilih file terlebih dahulu.");
  const file = files[0];
  const name = safeName(file.name);

  if (tool === "compress") {
    return [await compressPdf(file, options.quality, onProgress), `${name}-ringkas.pdf`, "application/pdf"];
  }

  if (tool === "merge") {
    if (files.length < 2) throw new Error("Pilih minimal dua file PDF untuk digabung.");
    const merged = await PDFDocument.create();
    for (const input of files) {
      const source = await readPdf(input);
      const copied = await merged.copyPages(source, source.getPageIndices());
      copied.forEach((page) => merged.addPage(page));
    }
    return [await merged.save(), `${name}-gabungan.pdf`, "application/pdf"];
  }

  if (tool === "jpg-pdf" || tool === "png-pdf") {
    const doc = await PDFDocument.create();
    for (const input of files) {
      const bytes = await input.arrayBuffer();
      const image = input.type === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const page = doc.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }
    return [await doc.save(), `${name}-gambar.pdf`, "application/pdf"];
  }

  if (tool === "compress-image") {
    const image = new Image();
    image.src = URL.createObjectURL(file);
    await image.decode();
    const scale = Math.min(1, Number(options.quality || 80) / 100);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    URL.revokeObjectURL(image.src);
    return [blob, `${name}-ringkas.jpg`, "image/jpeg"];
  }

  if (tool === "word-pdf" || tool === "ppt-pdf" || tool === "excel-pdf") {
    let text;
    if (tool === "word-pdf") {
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      text = result.value;
    } else if (tool === "excel-pdf") {
      text = await extractWorkbookText(await file.arrayBuffer());
    } else {
      const zip = await JSZip.loadAsync(file);
      const slides = Object.keys(zip.files)
        .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
        .sort();
      if (!slides.length) throw new Error("Tidak menemukan slide di file PPTX ini.");
      const slideText = [];
      for (const path of slides) {
        const xml = new DOMParser().parseFromString(await zip.file(path).async("text"), "application/xml");
        slideText.push([...xml.getElementsByTagName("a:t")].map((node) => node.textContent).join(" "));
      }
      text = slideText.join("\n\n");
    }
    if (!text.trim()) throw new Error("Tidak ada teks yang dapat dikonversi dari file ini.");
    const doc = await PDFDocument.create();
    for (const chunk of wordsToPdfPages(text)) await addTextToPdf(doc, chunk);
    return [await doc.save(), `${name}.pdf`, "application/pdf"];
  }

  if (tool === "pdf-word" || tool === "pdf-excel" || tool === "pdf-ppt") {
    const textPages = await pdfText(file);
    if (tool === "pdf-word") {
      const doc = new Document({
        sections: [
          {
            children: textPages.flatMap((text, index) => [new Paragraph({ children: [new TextRun({ text: `Halaman ${index + 1}`, bold: true })] }), ...text.split(/\r?\n/).map((line) => new Paragraph(line || " "))]),
          },
        ],
      });
      return [await Packer.toBlob(doc), `${name}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    }
    if (tool === "pdf-excel") {
      const rows = textPages.flatMap((text, index) => [[`Halaman ${index + 1}`], ...text.split(/\r?\n/).map((line) => [line])]);
      return [await makeXlsx(rows), `${name}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    }
    const presentation = new pptxgen();
    presentation.layout = "LAYOUT_WIDE";
    textPages.forEach((text, index) => {
      const slide = presentation.addSlide();
      slide.addText(`Halaman ${index + 1}`, { x: 0.6, y: 0.35, w: 12, h: 0.45, fontSize: 14, color: "78818C" });
      slide.addText(text || "(Tidak ada teks yang dapat diekstrak)", { x: 0.6, y: 1.1, w: 12, h: 5.4, fontSize: 18, breakLine: false, valign: "top", margin: 0.15, fit: "shrink" });
    });
    return [await presentation.write({ outputType: "blob" }), `${name}.pptx`, "application/vnd.openxmlformats-officedocument.presentationml.presentation"];
  }

  if (tool === "pdf-jpg" || tool === "pdf-png") {
    return [await renderPages(file, tool === "pdf-jpg" ? "jpeg" : "png"), `${name}-gambar.zip`, "application/zip"];
  }

  if (
    tool.startsWith("pdf-to-") ||
    [
      "image-jpg",
      "png-jpg",
      "jpg-png",
      "png-ico",
      "image-png",
      "image-svg",
      "webp-jpg",
      "jpeg-png",
      "svg-png",
      "jfif-jpg",
      "avif-jpg",
      "image-pdf",
      "html-pdf",
      "txt-pdf",
      "csv-pdf",
      "md-pdf",
      "rtf-pdf",
      "md-pdf",
      "svg-pdf",
      "odt-pdf",
      "odt-word",
      "epub-pdf",
      "csv-excel",
      "xlsx-csv",
      "image-to-gif",
      "video-to-gif",
      "mp4-gif",
    ].includes(tool)
  ) {
    return convertAdditional(tool, files, onProgress);
  }

  if (tool === "ocr") {
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const worker = await createWorker("ind+eng");
    let text = "";
    try {
      for (let i = 1; i <= pdf.numPages; i += 1) {
        onProgress(Math.round(((i - 1) / pdf.numPages) * 100));
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const result = await worker.recognize(canvas);
        text += `Halaman ${i}\n${result.data.text}\n\n`;
      }
    } finally {
      await worker.terminate();
    }
    return [new Blob([text], { type: "text/plain;charset=utf-8" }), `${name}-ocr.txt`, "text/plain"];
  }

  const doc = await readPdf(file);
  const count = doc.getPageCount();
  const selected = options.pages ? parsePageList(options.pages, count) : doc.getPageIndices();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  if (tool === "split") {
    const output = await PDFDocument.create();
    const copied = await output.copyPages(doc, selected);
    copied.forEach((page) => output.addPage(page));
    return [await output.save(), `${name}-halaman-${options.pages.replace(/\s/g, "")}.pdf`, "application/pdf"];
  }

  if (tool === "delete") {
    if (selected.length >= count) throw new Error("Tidak bisa menghapus semua halaman PDF.");
    selected.sort((a, b) => b - a).forEach((index) => doc.removePage(index));
  } else if (tool === "rotate") {
    selected.forEach((index) => {
      const page = doc.getPage(index);
      page.setRotation(degrees((page.getRotation().angle + Number(options.rotation || 90)) % 360));
    });
  } else if (tool === "crop") {
    selected.forEach((index) => {
      const page = doc.getPage(index);
      const { width, height } = page.getSize();
      const margin = Math.min(Number(options.margin || 24), width / 3, height / 3);
      page.setCropBox(margin, margin, width - margin * 2, height - margin * 2);
    });
  } else if (tool === "watermark") {
    selected.forEach((index) => {
      const page = doc.getPage(index);
      page.drawText(options.text || "RuangPDF", {
        x: page.getWidth() * 0.2,
        y: page.getHeight() * 0.5,
        size: Number(options.fontSize || 48),
        font,
        color: rgb(0.7, 0.73, 0.76),
        opacity: 0.35,
        rotate: degrees(-35),
        maxWidth: page.getWidth() * 0.75,
      });
    });
  } else if (tool === "edit" || tool === "sign") {
    const text = tool === "sign" ? options.signature : options.text;
    if (!text?.trim()) throw new Error(tool === "sign" ? "Masukkan nama untuk tanda tangan." : "Masukkan teks yang ingin ditambahkan.");
    const page = doc.getPage(Math.min(Number(options.page || 1), count) - 1);
    page.drawText(text, {
      x: Number(options.x || 60),
      y: Number(options.y || 100),
      size: Number(options.fontSize || (tool === "sign" ? 24 : 14)),
      font,
      color: rgb(0.08, 0.22, 0.43),
      maxWidth: page.getWidth() - 120,
    });
  } else if (tool === "add-image") {
    const imageFile = options.image;
    if (!imageFile) throw new Error("Pilih gambar yang ingin ditambahkan ke PDF.");
    const bytes = await imageFile.arrayBuffer();
    const image = imageFile.type === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const page = doc.getPage(Math.min(Number(options.page || 1), count) - 1);
    const scale = Math.min(180 / image.width, 120 / image.height, 1);
    page.drawImage(image, { x: Number(options.x || 60), y: Number(options.y || 100), width: image.width * scale, height: image.height * scale });
  } else {
    throw new Error("Tool ini belum tersedia.");
  }

  return [await doc.save({ useObjectStreams: true, addDefaultPage: false }), `${name}-${tool}.pdf`, "application/pdf"];
}
