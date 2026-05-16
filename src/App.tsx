/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, type DragEvent } from 'react';
import { 
  FileText, 
  Upload, 
  ChevronRight, 
  Download, 
  Trash2, 
  Plus, 
  Settings2, 
  Check,
  CheckCircle2, 
  ArrowLeft,
  Loader2,
  FileDown,
  Info,
  ExternalLink,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parsePDF, splitPDF, type Chapter } from './lib/pdfUtils';
import { PdfPreview } from './components/PdfPreview';

type AppState = 'idle' | 'analyzing' | 'selection' | 'auto_categories' | 'results' | 'splitting' | 'complete';

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pageCount, setPageCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'list' | 'edit'>('list');
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [manualInputs, setManualInputs] = useState({ title: '', start: '', end: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [showToast, setShowToast] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (selectedFile: File) => {
    if (!selectedFile || selectedFile.type !== 'application/pdf') return;
    
    setFile(selectedFile);
    setState('analyzing');
    setAnalyzeProgress(10);
    
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(URL.createObjectURL(selectedFile));

    try {
      const result = await parsePDF(selectedFile, (progress) => {
        setAnalyzeProgress(progress);
      });
      // Do not set chapters here, let user choose splitting strategy
      setPageCount(result.pageCount);
      setState('selection');
    } catch (error) {
      console.error(error);
      alert('Failed to parse PDF. It might be corrupted or encrypted.');
      setState('idle');
    }
  };

  const startAutoSplit = (category: 'small' | 'medium' | 'long') => {
    let pagesPerSplit = 5;
    if (category === 'medium') pagesPerSplit = 20;
    if (category === 'long') pagesPerSplit = 50;

    const newChapters: Chapter[] = [];
    for (let i = 1; i <= pageCount; i += pagesPerSplit) {
      const end = Math.min(i + pagesPerSplit - 1, pageCount);
      newChapters.push({
        id: crypto.randomUUID(),
        title: `Segment ${newChapters.length + 1} (Pages ${i}-${end})`,
        startPage: i,
        endPage: end,
        source: 'manual'
      });
    }
    setChapters(newChapters);
    setSelectedIds(new Set(newChapters.map(c => c.id)));
    setState('results');
    setActiveTab('list');
  };

  const createManualSplit = () => {
    const start = parseInt(manualInputs.start);
    const end = parseInt(manualInputs.end);
    
    if (!manualInputs.title || isNaN(start) || isNaN(end) || start < 1 || start > pageCount || end < start || end > pageCount) return;

    const newChapter: Chapter = {
      id: crypto.randomUUID(),
      title: manualInputs.title,
      startPage: start,
      endPage: end,
      source: 'manual'
    };

    setChapters(prev => [...prev, newChapter].sort((a,b) => (a.startPage || 0) - (b.startPage || 0)));
    setSelectedIds(prev => new Set(prev).add(newChapter.id));
    setManualInputs({ ...manualInputs, title: '', start: '', end: '' });
    
    // Show success toast
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleSplit = async () => {
    if (!file || selectedIds.size === 0) return;
    
    // Soft limit check
    if (selectedIds.size > 100) {
      alert(`Download limit: Maximum 100 files at once. You have selected ${selectedIds.size}. Please reduce your selection.`);
      return;
    }

    setState('splitting');
    const selectedChapters = chapters.filter(c => selectedIds.has(c.id));
    
    try {
      const blobs = await splitPDF(file, selectedChapters);
      
      // Download each blob
      blobs.forEach((blob, index) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const chapter = selectedChapters[index];
        const fileName = `${chapter.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });

      setState('complete');
    } catch (error) {
      console.error(error);
      alert('Failed to split PDF.');
      setState('results');
    }
  };

  const downloadSingle = async (chapter: Chapter) => {
    if (!file) return;
    try {
      const [blob] = await splitPDF(file, [chapter]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = `${chapter.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('Failed to split PDF.');
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    handleFile(droppedFile);
  };

  const mergeChapters = () => {
    if (selectedIds.size < 2) return;
    
    setChapters(prev => {
      const selected = prev.filter(c => selectedIds.has(c.id)).sort((a, b) => (a.startPage || 0) - (b.startPage || 0));
      const start = Math.min(...selected.map(c => c.startPage || 1));
      const end = Math.max(...selected.map(c => c.endPage || pageCount));
      
      const newChapter: Chapter = {
        id: crypto.randomUUID(),
        title: `Merged Segment (${start}-${end})`,
        startPage: start,
        endPage: end,
        source: 'manual'
      };

      const remaining = prev.filter(c => !selectedIds.has(c.id));
      const combined = [...remaining, newChapter].sort((a, b) => (a.startPage || 0) - (b.startPage || 0));
      
      setSelectedIds(new Set([newChapter.id]));
      return combined;
    });
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const updateTitle = (id: string, title: string) => {
    setChapters(prev => prev.map(c => c.id === id ? { ...c, title } : c));
  };

  const updateChapterPage = (id: string, startPage: number) => {
    setChapters(prev => prev.map(c => c.id === id ? { ...c, startPage: isNaN(startPage) ? null : Math.max(1, Math.min(startPage, pageCount)) } : c));
  };

  const updateChapterEndPage = (id: string, endPage: number) => {
    setChapters(prev => prev.map(c => c.id === id ? { ...c, endPage: isNaN(endPage) ? null : Math.max(1, Math.min(endPage, pageCount)) } : c));
  };

  const removeChapter = (id: string) => {
    setChapters(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F8FAFC]">
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0 z-20 shadow-sm relative">
        <div className="flex items-center gap-3 md:gap-8 min-w-0">
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <div className="w-8 h-8 md:w-9 md:h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <FileText className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <h1 className="text-lg md:text-xl font-black tracking-tight text-slate-900 hidden sm:block">
              PDFSplit
            </h1>
          </div>

          {state !== 'idle' && file && (
            <div className="flex items-center min-w-0">
              <div className="flex items-center h-9 md:h-10 px-3 md:px-4 bg-slate-50 border border-slate-200 rounded-2xl max-w-[120px] xs:max-w-[160px] sm:max-w-md lg:max-w-2xl group cursor-help relative">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] md:text-[12px] font-bold text-slate-800 truncate leading-none" title={file.name}>{file.name}</p>
                  <p className="text-[8px] md:text-[9px] font-extrabold text-slate-400 mt-1 uppercase tracking-widest leading-none truncate">
                    {pageCount} Pgs • {(file.size / (1024 * 1024)).toFixed(1)}MB
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-6 shrink-0">
          {state !== 'idle' && state !== 'selection' && state !== 'auto_categories' && (
            <div className="flex items-center gap-1 md:gap-2">
              {activeTab === 'list' && (
                <button 
                  onClick={() => setActiveTab('edit')}
                  className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-2xl text-[11px] md:text-[13px] font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <Settings2 className="w-4 h-4" />
                  <span className="hidden md:inline">Customize Splits</span>
                  <span className="md:hidden">Edit</span>
                </button>
              )}
              {activeTab === 'edit' && chapters.some(c => c.source !== 'manual') && (
                <button 
                  onClick={() => setActiveTab('list')}
                  className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-2xl text-[11px] md:text-[13px] font-bold bg-slate-900 text-white shadow-xl shadow-slate-900/10 transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden md:inline">Finish Editing</span>
                  <span className="md:hidden">Done</span>
                </button>
              )}
            </div>
          )}

          <div className="hidden md:block h-8 w-px bg-slate-200"></div>

          <div className="flex items-center gap-2 md:gap-3">
             <div className="hidden lg:flex flex-col items-end mr-1">
                <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest leading-none mb-1">Secure</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter leading-none">Local Only</span>
             </div>
            {state !== 'idle' && (
              <button 
                onClick={() => setState('idle')}
                className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-md group whitespace-nowrap"
              >
                <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                <span className="text-[10px] md:text-[11px] font-black uppercase tracking-widest hidden sm:inline">New PDF</span>
                <span className="sm:hidden text-[9px] font-black uppercase tracking-widest">New</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          {state === 'idle' ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center p-8"
            >
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-2xl group border-2 border-dashed border-slate-300 rounded-[2rem] p-16 bg-white hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer text-center relative overflow-hidden"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="application/pdf"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                  <Upload className="w-10 h-10 text-blue-600" />
                </div>
                <h3 className="text-3xl font-bold mb-3 tracking-tight">Split Your Library</h3>
                <p className="text-slate-500 text-lg mb-10">Drop any PDF book to extract its chapters automatically.</p>
                
                <div className="flex justify-center gap-8">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <Settings2 className="w-5 h-5 text-slate-400" />
                    </div>
                    <span className="text-xs font-semibold text-slate-500">Auto-Detect</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <Download className="w-5 h-5 text-slate-400" />
                    </div>
                    <span className="text-xs font-semibold text-slate-500">Fast Export</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-slate-400" />
                    </div>
                    <span className="text-xs font-semibold text-slate-500">100% Private</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : state === 'analyzing' ? (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="relative mb-8">
                <Loader2 className="w-20 h-20 text-blue-600 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <FileText className="w-8 h-8 text-blue-600/50" />
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-2">Analyzing Document...</h3>
              <p className="text-slate-500 max-w-xs mx-auto">Scaling for bookmarks, TOC, and structural chapter indicators.</p>
              <div className="w-full max-w-sm mt-12 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <motion.div 
                  className="bg-blue-600 h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${analyzeProgress}%` }}
                />
              </div>
            </motion.div>
          ) : state === 'selection' ? (
            <motion.section
              key="selection"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex items-center justify-center p-8"
            >
              <div className="max-w-xl w-full space-y-8">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-blue-100">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">PDF Analyzed</h2>
                  <p className="text-slate-500 font-medium tracking-tight">Choose your splitting strategy</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <button
                    onClick={() => { 
                      setChapters([]); 
                      setSelectedIds(new Set());
                      setState('results'); 
                      setActiveTab('edit'); 
                    }}
                    className="group p-8 bg-white border border-slate-200 rounded-[2.5rem] hover:border-blue-500 hover:ring-8 hover:ring-blue-50 transition-all text-left space-y-4 shadow-sm"
                  >
                    <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/20">
                      <Plus className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-lg leading-tight mb-1">Manual Split</h3>
                      <p className="text-slate-500 text-sm font-medium leading-relaxed">Create custom segments while viewing the book.</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setState('auto_categories')}
                    className="group p-8 bg-white border border-slate-200 rounded-[2.5rem] hover:border-amber-500 hover:ring-8 hover:ring-amber-50 transition-all text-left space-y-4 shadow-sm"
                  >
                    <div className="w-12 h-12 bg-amber-500 text-white rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-amber-500/20">
                      <Zap className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-lg leading-tight mb-1">Auto Split</h3>
                      <p className="text-slate-500 text-sm font-medium leading-relaxed">System handles it with predefined ranges.</p>
                    </div>
                  </button>
                </div>
              </div>
            </motion.section>
          ) : state === 'auto_categories' ? (
            <motion.section
              key="auto_categories"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col items-center justify-center p-8"
            >
              <div className="max-w-2xl w-full space-y-8">
                <button 
                  onClick={() => setState('selection')}
                  className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors font-bold text-xs uppercase tracking-widest"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Choice
                </button>
                
                <div className="text-center space-y-3">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Split Category</h2>
                  <p className="text-slate-500 font-medium tracking-tight">Select desired range depth</p>
                </div>

                <div className="grid grid-cols-3 gap-6">
                  <button
                    onClick={() => startAutoSplit('small')}
                    className="group p-8 bg-white border border-slate-200 rounded-[2rem] hover:border-blue-500 hover:ring-8 hover:ring-blue-50 transition-all text-center space-y-4"
                  >
                    <div className="text-3xl font-black text-blue-600">Very Small</div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">~5 Pages / File</p>
                  </button>

                  <button
                    onClick={() => startAutoSplit('medium')}
                    className="group p-8 bg-white border border-slate-200 rounded-[2rem] hover:border-blue-500 hover:ring-8 hover:ring-blue-50 transition-all text-center space-y-4"
                  >
                    <div className="text-3xl font-black text-blue-600">Medium</div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">~20 Pages / File</p>
                  </button>

                  <button
                    onClick={() => startAutoSplit('long')}
                    className="group p-8 bg-white border border-slate-200 rounded-[2rem] hover:border-blue-500 hover:ring-8 hover:ring-blue-50 transition-all text-center space-y-4"
                  >
                    <div className="text-3xl font-black text-blue-600">Long Range</div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">~50 Pages / File</p>
                  </button>
                </div>
              </div>
            </motion.section>
          ) : (
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
              {/* Book View Sidebar (Only in Edit Mode) */}
              {activeTab === 'edit' && pdfUrl && (
                <div className="w-full lg:w-[45%] h-[400px] lg:h-full bg-slate-100 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col shrink-0">
                  <div className="h-14 pb-1 pt-4 px-6 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
                    <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Book Preview</span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <label className="text-[9px] font-bold text-slate-400">JUMP TO</label>
                        <input 
                          type="number"
                          value={currentPage}
                          min={1}
                          max={pageCount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val)) {
                              setCurrentPage(Math.max(1, Math.min(val, pageCount)));
                            } else if (e.target.value === '') {
                              setCurrentPage(1);
                            }
                          }}
                          className="w-12 h-7 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-center outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 bg-slate-800 overflow-hidden relative">
                    <PdfPreview 
                      file={file}
                      pageNumber={currentPage}
                    />
                  </div>
                </div>
              )}

              {/* Main Feed */}
              <section className="flex-1 flex flex-col p-4 md:p-6 lg:px-16 overflow-y-auto lg:overflow-hidden relative">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-4 mt-2 shrink-0 gap-4">
                  <div>
                    <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter leading-none mb-2">
                      {activeTab === 'list' ? 'Review Splits' : 'Refine Segments'}
                    </h2>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <p className="text-slate-400 font-bold text-sm">
                          {selectedIds.size} / {chapters.length} selected
                        </p>
                        {activeTab === 'list' && chapters.length > 0 && (
                          <div className="flex items-center gap-2 ml-4">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setSelectedIds(new Set(chapters.map(c => c.id))); }}
                              className="px-3 py-1 bg-slate-100 text-slate-600 hover:bg-blue-600 hover:text-white transition-all text-[9px] font-black uppercase tracking-widest rounded-lg"
                            >
                              Select All
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setSelectedIds(new Set()); }}
                              className="px-3 py-1 bg-slate-100 text-slate-600 hover:bg-red-600 hover:text-white transition-all text-[9px] font-black uppercase tracking-widest rounded-lg"
                            >
                              Deselect All
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-lg">
                        <Info className="w-3 h-3 text-slate-400" />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Physical PDF order</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 lg:overflow-y-auto lg:pr-4 custom-scrollbar pb-20">
                  <AnimatePresence mode="wait">
                    {activeTab === 'list' ? (
                      <div key="list" className="space-y-4">
                        {chapters.length === 0 ? (
                          <div className="p-20 border-2 border-dashed border-slate-200 rounded-[3rem] text-center">
                            <p className="text-slate-400 font-bold">No segments found or created.</p>
                          </div>
                        ) : (
                          chapters.map((chapter) => (
                            <div 
                              key={chapter.id}
                              onClick={() => toggleSelection(chapter.id)}
                              className={`group cursor-pointer p-6 rounded-[2rem] border-2 transition-all ${
                                selectedIds.has(chapter.id) 
                                  ? 'bg-white border-blue-500 shadow-xl shadow-blue-500/10' 
                                  : 'bg-slate-50/50 border-transparent hover:border-slate-200'
                              }`}
                            >
                              <div className="grid grid-cols-1 md:grid-cols-12 items-center gap-4 md:gap-0">
                                <div className="hidden md:block col-span-1">
                                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                                    selectedIds.has(chapter.id) ? 'bg-blue-600 text-white' : 'bg-slate-200 text-transparent'
                                  }`}>
                                    <Check className="w-4 h-4" />
                                  </div>
                                </div>
                                <div className="col-span-12 md:col-span-7 font-bold text-slate-800 truncate pr-4">{chapter.title}</div>
                                <div className="col-span-12 md:col-span-2 text-sm font-mono text-slate-500">p. {chapter.startPage} — {chapter.endPage}</div>
                                <div className="col-span-12 md:col-span-2 flex items-center justify-end gap-2 pr-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveTab('edit');
                                    }}
                                    className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                    title="Edit Range"
                                  >
                                    <Settings2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeChapter(chapter.id);
                                    }}
                                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                    title="Delete Split"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* New Manual Split Creator */}
                        <div className="bg-blue-600 rounded-[2.5rem] p-6 lg:p-10 text-white shadow-2xl space-y-8">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                              <Plus className="w-5 h-5 text-white" />
                            </div>
                            <div>
                               <h3 className="text-xl md:text-2xl font-black tracking-tight leading-none mb-1">Create Manual Split</h3>
                               <p className="text-blue-100 text-[9px] font-extrabold uppercase tracking-[0.2em] opacity-70 leading-none">Define a custom range to export</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                            <div className="md:col-span-12">
                              <label className="text-[10px] font-black text-blue-100 uppercase tracking-widest block mb-2 opacity-80">Segment Name</label>
                              <input 
                                value={manualInputs.title}
                                onChange={(e) => setManualInputs({...manualInputs, title: e.target.value})}
                                className="w-full bg-white text-slate-900 font-bold text-xl py-4 px-6 rounded-2xl outline-none focus:ring-4 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-blue-600 transition-all shadow-inner"
                                placeholder="e.g. Chapter 1: Introduction"
                              />
                            </div>
                            <div className="md:col-span-6">
                              <label className="text-[10px] font-black text-blue-100 uppercase tracking-widest block mb-2 opacity-80">Start Page (1-{pageCount})</label>
                              <input 
                                type="number"
                                value={manualInputs.start}
                                min={1}
                                max={pageCount}
                                onChange={(e) => setManualInputs({...manualInputs, start: e.target.value})}
                                className="w-full bg-white text-slate-900 font-bold text-xl py-4 px-6 rounded-2xl outline-none transition-all shadow-inner"
                                placeholder="1"
                              />
                            </div>
                            <div className="md:col-span-6">
                              <label className="text-[10px] font-black text-blue-100 uppercase tracking-widest block mb-2 opacity-80">End Page (1-{pageCount})</label>
                              <input 
                                type="number"
                                value={manualInputs.end}
                                min={1}
                                max={pageCount}
                                onChange={(e) => setManualInputs({...manualInputs, end: e.target.value})}
                                className="w-full bg-white text-slate-900 font-bold text-xl py-4 px-6 rounded-2xl outline-none transition-all shadow-inner"
                                placeholder={String(pageCount)}
                              />
                            </div>
                          </div>

                          <button 
                            disabled={
                              !manualInputs.title || 
                              !manualInputs.start || 
                              !manualInputs.end || 
                              parseInt(manualInputs.start) < 1 || 
                              parseInt(manualInputs.end) > pageCount || 
                              parseInt(manualInputs.end) < parseInt(manualInputs.start)
                            }
                            onClick={createManualSplit}
                            className="w-full h-20 bg-white text-blue-600 rounded-[80px] font-black text-xl uppercase tracking-widest flex items-center justify-center gap-4 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-blue-900/40 disabled:opacity-30 disabled:scale-100 disabled:shadow-none"
                          >
                            <Plus className="w-6 h-6" /> Create Split
                          </button>

                          {(parseInt(manualInputs.start) < 1 || parseInt(manualInputs.end) > pageCount || (manualInputs.start && manualInputs.end && parseInt(manualInputs.end) < parseInt(manualInputs.start))) && (
                            <div className="flex items-center gap-2 text-amber-200 bg-blue-800/50 p-4 rounded-2xl border border-blue-400/30">
                              <Info className="w-4 h-4 flex-shrink-0" />
                              <p className="text-[10px] font-bold uppercase tracking-widest">Error: Invalid page range. Must be between 1 and {pageCount}.</p>
                            </div>
                          )}
                        </div>

                        <div className="h-px bg-slate-200 my-8"></div>
                        
                        <div className="space-y-4">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] pl-4">Existing Splits</h4>
                          {chapters.length === 0 && (
                             <div className="p-12 border-2 border-dashed border-slate-200 rounded-[2.5rem] text-center text-slate-400">
                               <p className="font-bold text-sm">No splits created yet.</p>
                             </div>
                          )}
                          {chapters.map((chapter) => (
                            <div 
                                key={chapter.id}
                                className="bg-white border border-slate-200 rounded-[2.5rem] p-6 md:p-8 flex flex-col gap-6 shadow-sm hover:shadow-md transition-shadow"
                            >
                                <div className="flex flex-col md:flex-row gap-6 items-start">
                                <div className="flex-1 w-full">
                                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1 px-1">Segment Name</label>
                                    <input 
                                    value={chapter.title}
                                    onChange={(e) => updateTitle(chapter.id, e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-100 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none font-bold text-xl py-3 px-4 rounded-2xl transition-all"
                                    placeholder="Enter Split name..."
                                    />
                                </div>
                                <div className="flex gap-4 w-full md:w-auto">
                                    <div className="flex-1">
                                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1 px-1">Start Page</label>
                                    <div className="bg-slate-50 border border-slate-100 py-3 px-4 rounded-2xl transition-all flex items-baseline gap-2 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
                                        <input 
                                          type="number"
                                          value={chapter.startPage === null ? '' : chapter.startPage}
                                          min={1}
                                          max={pageCount}
                                          onChange={(e) => updateChapterPage(chapter.id, parseInt(e.target.value))}
                                          className="w-16 font-mono font-bold text-blue-600 outline-none text-lg bg-transparent"
                                        />
                                    </div>
                                    </div>
                                    <div className="flex-1">
                                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1 px-1">End Page</label>
                                    <div className="bg-slate-50 border border-slate-100 py-3 px-4 rounded-2xl transition-all flex items-baseline gap-2 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
                                        <input 
                                          type="number"
                                          value={chapter.endPage === null ? '' : chapter.endPage}
                                          min={1}
                                          max={pageCount}
                                          onChange={(e) => updateChapterEndPage(chapter.id, parseInt(e.target.value))}
                                          className="w-16 font-mono font-bold text-slate-700 outline-none text-lg bg-transparent"
                                        />
                                    </div>
                                    </div>
                                </div>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                <p className="text-[10px] text-slate-400 italic">Manual Edit: Overlaps are allowed.</p>
                                <div className="flex gap-3">
                                    <button 
                                      onClick={() => downloadSingle(chapter)}
                                      className="px-4 py-2 bg-blue-50 text-blue-600 text-xs font-bold rounded-xl hover:bg-blue-100 transition-colors uppercase tracking-widest flex items-center gap-2"
                                    >
                                      <Download className="w-3.5 h-3.5" /> Download
                                    </button>
                                    <button 
                                      onClick={() => removeChapter(chapter.id)}
                                      className="px-4 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-xl hover:bg-red-100 transition-colors uppercase tracking-widest flex items-center gap-2"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" /> Delete
                                    </button>
                                </div>

                                <div className="hidden md:block bg-slate-50 px-4 py-1.5 rounded-full border border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    {(chapter.endPage || 0) - (chapter.startPage || 0) + 1} Pages
                                    </span>
                                </div>
                                </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Footer Selection Controls for List View */}
                {activeTab === 'list' && chapters.length > 0 && (
                   <div className="mt-4 flex flex-col md:flex-row items-center justify-between shrink-0 bg-white border border-slate-200 p-4 rounded-3xl shadow-lg shadow-slate-200/50 gap-4 mb-2">
                      <div className="flex items-center gap-6">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5 leading-none">Selected</p>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-slate-900 tracking-tighter leading-none">{selectedIds.size}</span>
                            <span className="text-slate-400 font-bold text-[10px] uppercase">PDFs</span>
                          </div>
                        </div>
                        <div className="hidden md:block h-8 w-px bg-slate-100"></div>
                        <div className="hidden md:block">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5 leading-none">Est. Size</p>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-slate-900 tracking-tighter leading-none">
                              {selectedIds.size > 0 ? (selectedIds.size * 2).toFixed(0) : 0}
                            </span>
                            <span className="text-slate-400 font-bold text-[10px] uppercase">MB</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 w-full md:w-auto">
                        <button 
                          onClick={() => handleSplit()}
                          disabled={selectedIds.size === 0 || state === 'splitting'}
                          className="flex-1 md:flex-none px-8 h-12 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-30 disabled:scale-100 disabled:shadow-none"
                        >
                          {state === 'splitting' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-5 h-5" />
                          )}
                          <span>Download Selected</span>
                        </button>
                      </div>
                   </div>
                )}

                {/* Toast Notification */}
                <AnimatePresence>
                  {showToast && (
                    <motion.div 
                      initial={{ opacity: 0, y: 50, x: '-50%' }}
                      animate={{ opacity: 1, y: 0, x: '-50%' }}
                      exit={{ opacity: 0, y: 20, x: '-50%' }}
                      className="fixed bottom-10 left-1/2 z-[100] px-8 py-4 bg-emerald-600 text-white rounded-2xl shadow-2xl font-bold flex items-center gap-3 border border-emerald-400/30"
                    >
                      <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                      Split created successfully
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </div>
          )}
        </AnimatePresence>
      </main>

      <footer className="h-10 border-t border-slate-200 bg-white flex items-center justify-center px-6 shrink-0">
        <div className="flex items-center gap-2">
           <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Developed by Maryam</span>
        </div>
      </footer>
    </div>
  );
}

