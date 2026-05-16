import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface Chapter {
  id: string;
  title: string;
  startPage: number | null; // 1-indexed
  endPage: number | null;   // 1-indexed
  source: 'bookmark' | 'text' | 'fallback' | 'manual';
}

export async function parsePDF(
  file: File, 
  onProgress: (p: number) => void
): Promise<{ chapters: Chapter[]; pageCount: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdf.numPages;

  onProgress(10);
  let bookmarkChapters: Chapter[] = [];
  let textChapters: Chapter[] = [];

  // Strategy 1: Bookmarks (Outline)
  try {
    const outline = await pdf.getOutline();
    if (outline && outline.length > 0) {
      bookmarkChapters = await resolveOutline(pdf, outline);
    }
  } catch (err) {
    console.warn("Outlines resolution failed", err);
  }

  onProgress(30);

  // Strategy 2: Text Scan (TOC focus)
  try {
    // Only scan the first 60 pages for the Table of Contents
    const tocScanLimit = Math.min(pageCount, 60);
    textChapters = await scanForChapters(pdf, tocScanLimit, (p) => onProgress(30 + p * 0.6));
  } catch (err) {
    console.warn("Text scan failed", err);
  }

  onProgress(90);

  // Decide which to use: 
  // If bookmarks exist and have a decent count (e.g., > 3), trust them as they are metadata-accurate.
  // Otherwise, use textChapters if they found something more substantial.
  let chapters = bookmarkChapters;
  if (bookmarkChapters.length < 5 && textChapters.length > bookmarkChapters.length) {
    chapters = textChapters;
  }

  // Strategy 3: Fallback (Equal split) if nothing found
  if (chapters.length < 2) {
    const splitCount = 10;
    const pageSize = Math.ceil(pageCount / splitCount);
    chapters = [];
    for (let i = 0; i < splitCount; i++) {
      const start = i * pageSize + 1;
      if (start > pageCount) break;
      chapters.push({
        id: crypto.randomUUID(),
        title: `Part ${i + 1}`,
        startPage: start,
        endPage: Math.min((i + 1) * pageSize, pageCount),
        source: 'fallback'
      });
    }
  }

  // Clean up and fill endPages
  chapters = chapters.sort((a, b) => a.startPage - b.startPage);
  // Remove duplicates on same page
  chapters = chapters.filter((c, i, self) => i === 0 || c.startPage !== self[i - 1].startPage);

  for (let i = 0; i < chapters.length; i++) {
    if (i < chapters.length - 1) {
      chapters[i].endPage = chapters[i + 1].startPage - 1;
    } else {
      chapters[i].endPage = pageCount;
    }
  }

  onProgress(100);
  return { chapters, pageCount };
}

async function resolveOutline(pdf: any, items: any[]): Promise<Chapter[]> {
  let results: Chapter[] = [];
  for (const item of items) {
    if (item.dest) {
      try {
        let dest = item.dest;
        if (typeof dest === 'string') {
          dest = await pdf.getDestination(dest);
        }
        if (dest) {
          const pageIndex = await pdf.getPageIndex(dest[0]);
          results.push({
            id: crypto.randomUUID(),
            title: item.title,
            startPage: pageIndex + 1,
            endPage: 0,
            source: 'bookmark'
          });
        }
      } catch (e) {
        console.warn("Could not resolve bookmark destination", e);
      }
    }
    // Recurse into children
    if (item.items && item.items.length > 0) {
      const childResults = await resolveOutline(pdf, item.items);
      results = [...results, ...childResults];
    }
  }
  return results;
}

async function scanForChapters(
  pdf: any, 
  scanLimit: number, 
  onProgress: (p: number) => void
): Promise<Chapter[]> {
  const partRegex = /^(PART|UNIT|SECTION|VOLUME|BOOK)\s+([0-9IVXLCDM]+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)(?::|\s|$)/i;
  const chapterRegex = /^CHAPTER\s+([0-9]+|[IVXLCDM]+)/i;
  const headingRegex = /^([0-9]+)\.\s+([A-Z][A-Z\s,]{3,50})$/; // Matches "1. CLINICAL DECISION" (caps usually found in medical TOCs)
  const detected: Chapter[] = [];

  for (let i = 1; i <= scanLimit; i++) {
    if (i % 5 === 0) onProgress((i / scanLimit) * 100);
    
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Look for lines that look like chapter headings
    const lines = textContent.items
      .map((item: any) => item.str.trim())
      .filter((s: string) => s.length > 2);

    for (const line of lines) {
      if (partRegex.test(line) || chapterRegex.test(line) || headingRegex.test(line)) {
        // Avoid duplicates or very similar pages
        if (detected.some(d => Math.abs(d.startPage - i) < 1)) continue;

        detected.push({
          id: crypto.randomUUID(),
          title: line.substring(0, 80),
          startPage: i,
          endPage: 0,
          source: 'text'
        });
        break; // Found one on this page, move to next page
      }
    }
  }
  onProgress(100);
  return detected;
}

export async function splitPDF(file: File, chapters: Chapter[]): Promise<Blob[]> {
  const arrayBuffer = await file.arrayBuffer();
  const srcPdf = await PDFDocument.load(arrayBuffer);
  const blobs: Blob[] = [];

  for (const chapter of chapters) {
    const newPdf = await PDFDocument.create();
    const indices = [];
    for (let i = chapter.startPage! - 1; i < chapter.endPage!; i++) {
      indices.push(i);
    }
    
    const copiedPages = await newPdf.copyPages(srcPdf, indices);
    copiedPages.forEach(page => newPdf.addPage(page));
    
    const bytes = await newPdf.save();
    blobs.push(new Blob([bytes], { type: 'application/pdf' }));
  }

  return blobs;
}
