import React, { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';

// Ensure worker is set (redundant but safe)
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPreviewProps {
  file: File | null;
  pageNumber: number;
}

export function PdfPreview({ file, pageNumber }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!file) return;
    
    let isMounted = true;
    setLoading(true);
    setError(null);
    setRenderedPages(new Set());

    const loadPdf = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        if (isMounted) {
          setPdfDoc(doc);
        }
      } catch (err) {
        console.error("Error loading PDF for preview", err);
        if (isMounted) setError("Failed to load PDF preview");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadPdf();

    return () => { isMounted = false; };
  }, [file]);

  // Jump to page when pageNumber prop changes
  useEffect(() => {
    if (pageNumber && containerRef.current) {
      const pageEl = containerRef.current.querySelector(`[data-page-index="${pageNumber}"]`);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [pageNumber]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full flex flex-col bg-slate-800 overflow-x-auto overflow-y-auto p-4 md:p-8 custom-scrollbar scroll-smooth"
    >
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
          <span className="text-blue-100 font-bold uppercase tracking-widest text-[10px]">Loading Pages...</span>
        </div>
      )}
      {error && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center text-red-400 gap-2">
          <span className="font-bold uppercase tracking-widest text-[10px]">{error}</span>
        </div>
      )}
      {!loading && !error && pdfDoc && (
        <div className="flex flex-col gap-6 min-w-full">
          {Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1).map((pageNum) => (
            <PageRenderer 
              key={pageNum}
              pdfDoc={pdfDoc}
              pageNum={pageNum}
            />
          ))}
        </div>
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.5);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(59, 130, 246, 0.3);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 130, 246, 0.5);
        }
      `}</style>
    </div>
  );
}

interface PageRendererProps {
  pdfDoc: any;
  pageNum: number;
  key?: number;
}

function PageRenderer({ pdfDoc, pageNum }: PageRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !pdfDoc || !canvasRef.current) return;

    let isMounted = true;
    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (!isMounted || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        const viewport = page.getViewport({ scale: 1.2 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
      } catch (err) {
        console.error(`Error rendering page ${pageNum}`, err);
      }
    };

    renderPage();
    return () => { isMounted = false; };
  }, [isVisible, pdfDoc, pageNum]);

  return (
    <div 
      ref={containerRef}
      data-page-index={pageNum}
      className="relative group transition-opacity duration-300 min-h-[400px] w-full flex"
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      <div className="relative mx-auto">
        <canvas 
          ref={canvasRef} 
          className="shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-white rounded-sm transition-transform duration-500" 
        />
        <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg text-white font-mono text-[10px] font-bold shadow-lg">
          PAGE {pageNum}
        </div>
        <div className="absolute inset-0 ring-1 ring-white/10 pointer-events-none rounded-sm"></div>
      </div>
    </div>
  );
}
