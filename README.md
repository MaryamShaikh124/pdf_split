# 📚 PDFSplit — PDF Chapter Extractor

A **free, open-source web app** that intelligently splits large PDF books into individual chapter PDFs. Perfect for students preparing for exams by dividing large books (PDFs) into small chunks(splits) so that the BCQs generator apps are able to accept light weight PDF splits instead of large(requiring more space) Books.

**Live Demo:** (https://pdf-split-gamma.vercel.app/) | **GitHub:** (https://github.com/MaryamShaikh124/pdf_split)]

---

## 🎯 The Problem It Solves

📖 **Large textbooks (345MB+) can't be processed by AI models** in one go — they hit context length limits.

**Solution:** PDFSplit extracts individual chapters, letting you:
- Upload **full books** (any size)
- Auto-detect or **manually define chapters**
- Download chapter PDFs separately
- Upload each chapter to MCQ generator app for **exam prep MCQs**

---

## ✨ Key Features

### 🤖 Smart Auto-Detection
- **Three-layer detection system** for maximum accuracy:
  1. Reads PDF bookmarks & nested table of contents
  2. Scans page text for chapter headings ("1. Immunology", "Chapter 5", etc.)
  3. Falls back to equal-size splits
- Medical/academic textbook optimized patterns
- Detects both **Part-level and Chapter-level** entries

### ✏️ Manual Split Control
Complete manual control over chapter boundaries:

| Feature | Capability |
|---------|-----------|
| **Add splits** | Define custom chapter name + page range |
| **Edit splits** | Click to change start/end page numbers |
| **Delete splits** | Remove unwanted chapters (pages absorbed by neighbors) |
| **Rename chapters** | Click name to edit on the fly |


### 💾 Zero Server, 100% Browser
- **No uploads to servers** — all processing happens in your browser
- Works **offline** after page loads
- **PDF.js** for reading, **pdf-lib** for splitting
- Base64 data URLs for reliable downloads in all sandboxed environments

### 📥 Download Options
- **Individual downloads** — download each chapter PDF separately
- **Download All** — trigger downloads with staggered delays
- Works in iframe sandboxes (Claude artifacts, etc.)

---

## 📋 How to Use

### Step 1: Upload Your Book
1. Click the upload zone or drag-drop a PDF
2. App analyzes structure for ~10–15 seconds
3. select any one option: manual or auto split
4. For manual, create split by your own self by viewing the PDF on the right hand side.
5. For auto split, select small (5 pages per split), medium (20 pages per split), large (50 pages per split)
6. and then the splits are created auto according to selected option that can also be edit if needed.

### Step 2: Review & Customize (Optional)
- **See all chapters** in a scrollable list
- **Click a chapter name** to rename it
- **Click page numbers** to edit the range
- **Delete** unwanted chapters with the delete button

### Step 3: Add Custom Splits (Optional)
Fill in the "+ ADD / DEFINE A SPLIT" form:
- **Split Name:** e.g., "Chapter 3 — Immunology"
- **From page:** Starting page number
- **To page:** Ending page number


### Step 4: Generate & Download
1. Click **✂️ Generate N PDFs**
2. Wait for splitting to complete (shows progress)
3. Download individual PDFs or all at once
  

### Step 5: Prepare for Exams
Upload any chapter PDF to app and ask:
- "Generate 20 multiple-choice questions from this chapter"
- "Create short-answer questions testing core concepts"
- "Make a quiz with difficulty levels from beginner to advanced"

---

## 🏗️ Project Structure

```
pdfsplit/
├── src/
│   ├── App.tsx             # Main application component
│   ├── components/
│   │   └── PdfPreview.tsx  # PDF Renderer & Preview
│   └── lib/
│       └── pdfUtils.ts      # PDF splitting logic
├── index.html               # Entry point
├── package.json             # Dependencies
└── vite.config.ts           # Vite build config
```

### Architecture Overview

```
User PDF → PDF.js (read) → Auto-detect chapters → React UI
    ↓                              ↓
  Manual edits → Reconcile logic → Split logic → pdf-lib (write)
    ↓                              ↓
  Download (base64 data URL) ← Generate PDFs
```

---

## 🛠️ Tech Stack

| Tool | Purpose |
|------|---------|
| **React 18** | UI component framework |
| **Vite** | Lightning-fast build tool |
| **PDF.js** | Read PDF structure, extract text |
| **pdf-lib** | Create & manipulate PDF documents |
| **Motion** | Fluid UI animations |
| **Tailwind CSS** | Utility-first styling |

### Browser Requirements
- Modern browser with **ES2020+ support**
- **10MB+ free RAM** (for processing large PDFs)
- Works on: Chrome, Firefox, Safari, Edge (latest versions)

---

### Option 3: GitHub Pages
```bash
npm run build
# Push dist/ to gh-pages branch
```

---

## 🔧 Local Development

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Clone repo
git clone https://github.com/MaryamShaikh124/pdf_split.git
cd pdfsplit

# Install dependencies
npm install

# Start dev server
npm run dev
# Open http://localhost:3000

# Build for production
npm run build

# Preview production build locally
npm run preview
```

---

## 🎓 Use Cases

### For Students
- ✅ Extract chapters from textbooks
- ✅ Upload to Claude → generate study MCQs
- ✅ Test exam readiness chapter-by-chapter
- ✅ Share specific chapters with classmates

### For Teachers
- ✅ Create chapter-wise quiz banks
- ✅ Generate auto-MCQs for each section
- ✅ Build custom study guides

### For Researchers
- ✅ Split research papers into sections
- ✅ Analyze individual parts separately
- ✅ Preserve bookmarks and structure

---

## ⚙️ Advanced Features

### Edge Cases Handled
- ✅ **Page range out of bounds** → validation errors
- ✅ **Zero-width splits** → auto-removed
- ✅ **Large PDFs (300MB+)** → processed in-browser with streaming


Example:
```
Before: [1-20] [21-40] [41-60]
Edit split 1 to [1-35]

---

## 📧 Contact & Support

- **Issues & Bugs:** [GitHub Issues](https://github.com/MaryamShaikh124/pdf_split/issues)

---

**Made with ❤️ for students preparing for exams.**

---

*Last updated: May 2026 | PDFSplit v1.0*
