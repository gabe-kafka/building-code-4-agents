---
title: "Digital Twin Frontend — App Flow"
date: 2026-04-03
status: draft
style-ref: ~/Desktop/canonical docs/style-guide.md
---

# Digital Twin Frontend — App Flow

A page-faithful, queryable rendering of building codes. Every page numbered identically to the ASCE print edition. Every provision, table, equation, figure, and definition in its original position. The PDF in structured form — not a reinterpretation, a twin.

---

## 1. INFORMATION ARCHITECTURE

### 1.1 Page Model

The atomic unit is the **page**, not the section. Each page corresponds 1:1 with the ASCE PDF page number.

```
Page 363 (ASCE 7-22)  =  Page 363 (Digital Twin)
```

Content that spans pages is split at the same break point as the print edition. No reflowing. No collapsing. The twin IS the document with a different rendering engine.

### 1.2 Content Hierarchy

```
Standard (ASCE 7-22)
  └── Chapter (26 — Wind Load Parameters)
        └── Page (363, 364, ... )
              └── Element[]
                    ├── provision   (green)
                    ├── definition  (purple)
                    ├── formula     (blue)
                    ├── table       (cyan)
                    ├── figure      (amber)
                    ├── exception   (red)
                    ├── user_note   (muted)
                    └── text_block  (dim)
```

### 1.3 Data Contract

Each page is a JSON object:

```json
{
  "standard": "ASCE 7-22",
  "chapter": 26,
  "page": 363,
  "section_range": ["26.1", "26.1.2"],
  "elements": [
    {
      "id": "ASCE7-22-26.1.1-P1",
      "type": "provision",
      "section": "26.1.1",
      "text": "...",
      "cross_references": ["ASCE7-22-27", "ASCE7-22-32"],
      "bbox": { "y_start": 0.12, "y_end": 0.34 }
    }
  ]
}
```

`bbox` is normalized (0–1) vertical position on the page, preserving original layout ordering and approximate spatial position.

---

## 2. VIEWS

### 2.1 Status Bar (persistent, top)

24px. 10px mono. Always visible.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ASCE 7-22  CH.26  WIND LOAD PARAMETERS     P.363/412   API:LIVE    │
└──────────────────────────────────────────────────────────────────────┘
```

Fields: standard | chapter | chapter title | current page / total pages | API connection state

### 2.2 KPI Strip (persistent, below status bar)

```
┌────────────┬─────────────┬──────────────┬──────────────┬────────────┐
│ PROVISIONS │ DEFINITIONS │ FORMULAS     │ TABLES       │ FIGURES    │
│ 525        │ 33          │ 16           │ 9            │ 11         │
│ ch.26      │ ch.26       │ ch.26        │ ch.26        │ ch.26      │
├────────────┴─────────────┴──────────────┴──────────────┴────────────┤
│ ELEMENTS ON PAGE: 12   SECTIONS: 26.3–26.3.2   EXTRACTION: 94.7%   │
└─────────────────────────────────────────────────────────────────────┘
```

Top row: chapter-wide element counts by type (clickable — filters to that type).
Bottom row: current-page summary.

### 2.3 Main View — Page Reader

The primary view. Full-width. Renders one page at a time, numbered to match the ASCE document.

```
┌─────────────────────────────────────────────────────────────────────┐
│ PAGE 363                                                    26.1   │
│─────────────────────────────────────────────────────────────────────│
│                                                                     │
│  ┌ FIGURE ──────────────────────────────────────────────────────┐   │
│  │ Figure 26.1-1. Outline of process for determining           │   │
│  │ wind loads. [linked PNG]                                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  26.1.1 SCOPE                                                       │
│                                                                     │
│  TEXT  Buildings and other structures, including the main wind      │
│        force resisting system (MWFRS) and all components and       │
│        cladding (C&C) thereof, shall be designed and constructed   │
│        to resist the wind loads determined in accordance with      │
│        Chapters 26 through 31.                                     │
│                                                                     │
│  PROV  Risk Category III and IV buildings... shall also be         │
│        designed to resist tornado loads per Chapter 32.            │
│        → ASCE7-22-32                                               │
│                                                                     │
│  NOTE  User Note: A building designed for wind loads exclusively   │
│        in accordance with Chapter 26 cannot be designated as a     │
│        storm shelter without meeting additional requirements...    │
│                                                                     │
│─────────────────────────────────────────────────────────────────────│
│  ◄ 362                                                   364 ►     │
└─────────────────────────────────────────────────────────────────────┘
```

Rules:
- Page number top-left matches ASCE page number exactly
- Section numbers top-right (first section on page)
- Elements rendered in document order within page
- Type tag (7px uppercase, 1px border) left of each element — same color coding as V1 demo
- Cross-references rendered inline as `→ ELEMENT_ID` links (blue, clickable)
- Tables rendered as actual HTML tables (mono, right-aligned numbers, 7px uppercase headers)
- Formulas rendered with expression text, parameters listed below
- Figures: linked PNG thumbnail (if available) or placeholder with caption
- Page break is hard — content does not flow between pages
- Footer: prev/next page navigation

### 2.4 Sidebar — Section Index

Left sidebar. 200px. Collapsible to 0px.

```
┌──────────────────────┐
│ SECTIONS             │
│──────────────────────│
│ 26.1         p.363   │
│   26.1.1     p.363   │
│   26.1.2     p.363   │
│ 26.2         p.364   │
│ 26.3         p.365   │
│   26.3.1     p.365   │
│   26.3.2     p.366   │
│ 26.4         p.367   │
│   ...                │
│ 26.10        p.378   │
│   26.10.1    p.378   │
│   26.10.2    p.381   │
│ 26.11        p.389   │
│ 26.12        p.400   │
│──────────────────────│
│ DEFINITIONS    p.364 │
│ TABLES         p.378 │
│ FIGURES        p.363 │
│ FORMULAS       p.383 │
└──────────────────────┘
```

- Nested indentation (section depth = indent level)
- Page numbers right-aligned, muted
- Click navigates to that page
- Current page/section highlighted with left border accent
- Bottom: jump-to links for definitions, tables, figures, formulas (grouped)

### 2.5 Search + Filter Bar

Below KPI strip. Inline, not modal.

```
┌─────────────────────────────────────────────────────────────────────┐
│ [search___________________________]  TYPE: [ALL ▾]  SEC: [ALL ▾]   │
└─────────────────────────────────────────────────────────────────────┘
```

- Full-text search across all elements (provisions, definitions, formulas, etc.)
- Filter by element type (dropdown, multi-select)
- Filter by section range
- Results render as a list below the bar: element ID, type tag, truncated text, page number
- Click result → navigates to that page, scrolls to element, highlights it

---

## 3. INTERACTIONS

### 3.1 Navigation

| Action | Behavior |
|---|---|
| Click page number in sidebar | Jump to page |
| Click section in sidebar | Jump to page containing that section |
| `←` / `→` arrow keys | Prev / next page |
| Click `→ ELEMENT_ID` cross-ref | Jump to page containing referenced element, highlight it |
| Click element type in KPI strip | Filter: show only pages containing that type |
| Search result click | Jump to page, scroll to element |
| URL hash | `#p363` loads page 363. `#ASCE7-22-26.3.1-P1` loads the page containing that element |

### 3.2 Element Interaction

| Action | Behavior |
|---|---|
| Hover element | Subtle bg shift (state transition, 150ms ease-out) |
| Click element | Expand metadata panel inline: element ID, extraction method, QC status, all cross-references as clickable links |
| Click table cell | No action (data is read-only) |
| Click figure thumbnail | Open full-resolution PNG in overlay (escape to close) |

### 3.3 Keyboard Shortcuts

```
←/→         prev/next page
g + number  go to page (e.g., g363)
/           focus search
f           toggle filter bar
s           toggle sidebar
esc         close overlay / clear search
```

---

## 4. LAYOUT GRID

```
┌──────────────────────────────────────────────────────────────────────┐
│ STATUS BAR (24px)                                                    │
├──────────────────────────────────────────────────────────────────────┤
│ KPI STRIP (48px)                                                     │
├──────────────────────────────────────────────────────────────────────┤
│ SEARCH / FILTER BAR (32px)                                           │
├─────────────┬────────────────────────────────────────────────────────┤
│ SIDEBAR     │ PAGE READER                                            │
│ 200px       │ flex: 1                                                │
│ section     │                                                        │
│ index       │ page content rendered here                             │
│             │ page-faithful layout                                   │
│ collapsible │                                                        │
│ to 0px      │                                                        │
│             │                                                        │
│             ├────────────────────────────────────────────────────────┤
│             │ PAGE NAV (32px)  ◄ prev          next ►                │
├─────────────┴────────────────────────────────────────────────────────┤
│ (no footer — status bar is persistent)                               │
└──────────────────────────────────────────────────────────────────────┘
```

8px grid. 4px sub-grid for dense panels. Gap: 1px with `var(--border)` on container as dividers.

Desktop: sidebar + reader side-by-side.
Mobile: sidebar hidden, horizontal scroll on tables, full-width reader.

---

## 5. GRAPHICAL STYLE

Per `style-guide.md`:

- **Type**: JetBrains Mono primary. 10–11px for element content. 8px uppercase letterspaced muted for labels/tags. 12px for section headings (bold). Tabular numerals everywhere.
- **Color**: Light/dark via `prefers-color-scheme`. Element types color-coded (green/purple/blue/cyan/amber/red/muted). Color = data channel only.
- **Density**: 50+ data points visible without scroll. Padding 4–6px in panels. 2–4px vert / 4–8px horiz in table cells. No decorative whitespace.
- **Components**: Tables as primary unit. Type tags as 8px uppercase 1px-border badges. Inline micro-bars for extraction confidence. Status dots for API state. No shadows, no gradients, no rounded corners >4px.
- **Motion**: State transitions only. 150ms ease-out. No bounce/spring.
- **Print**: Mono headings, proportional body. Page numbers in footer. Table borders 0.5pt.
- **Never**: Drop shadows, gradients, hamburger menus, skeleton animations, emoji, tooltips for displayable data, padding >16px.

---

## 6. DATA FLOW

```
ASCE PDF
  ↓ (extraction pipeline — V1 proven)
Chapter JSON (per-page, per-element)
  ↓ (ingestion)
Chapter Database
  ↓ (GraphQL API)
Frontend fetches page data
  ↓
Renders page-faithful twin
```

The frontend consumes the chapter GraphQL API. Each page request returns the elements for that page in document order with their types, text, cross-references, and spatial metadata.

### 6.1 API Queries (Frontend Perspective)

```graphql
# Load a single page
query Page($standard: String!, $chapter: Int!, $page: Int!) {
  page(standard: $standard, chapter: $chapter, page: $page) {
    page
    section_range
    elements {
      id
      type
      section
      text
      cross_references
      bbox { y_start y_end }
      metadata { extracted_by qc_status }
      # type-specific fields
      ... on Formula { expression parameters }
      ... on Table { columns rows }
      ... on Figure { image_url caption }
    }
  }
}

# Search across chapter
query Search($chapter: Int!, $query: String!, $type: ElementType) {
  search(chapter: $chapter, query: $query, type: $type) {
    id
    type
    section
    page
    snippet
  }
}

# Chapter metadata (for sidebar, KPI)
query ChapterMeta($standard: String!, $chapter: Int!) {
  chapter(standard: $standard, chapter: $chapter) {
    title
    page_range { start end }
    sections { number title page depth }
    element_counts { type count }
    extraction_score
  }
}
```

---

## 7. PAGE FIDELITY RULES

These rules enforce the "digital twin" contract:

1. **Page numbers are authoritative.** Page 363 in the twin contains exactly what page 363 of the ASCE PDF contains. No more, no less.
2. **Element order matches document order.** Elements appear top-to-bottom as they do on the printed page.
3. **No content reflow.** A table that starts on page 378 and ends on page 379 is split across those two pages in the twin. The page break is visible.
4. **Section continuity markers.** If a section spans pages, the twin shows `26.10.1 (continued)` at the top of the continuation page, matching ASCE convention.
5. **No content omission.** Every element extracted from the PDF appears. Figures that can't be digitized show as placeholders with their figure number and caption.
6. **Cross-reference integrity.** Every `→ ELEMENT_ID` link resolves to a real element on a real page. Broken links are flagged visually (red border).

---

## 8. MULTI-CHAPTER NAVIGATION

When multiple chapters are loaded:

```
┌──────────────────────────────────────────────────────────────────────┐
│ STATUS BAR                                                           │
│ ASCE 7-22  [CH.26 ▾]  WIND LOAD PARAMETERS     P.363/412   API:OK  │
└──────────────────────────────────────────────────────────────────────┘
```

- Chapter selector in status bar (dropdown, not tabs — could be dozens of chapters)
- Cross-references that point to other chapters navigate there: clicking `→ ASCE7-22-27.3.1-P1` switches to Ch. 27, page containing that element
- Sidebar updates to show the active chapter's section index
- KPI strip updates to show active chapter's counts

---

## 9. SCREEN MAP

```
[1] Landing           → Chapter selector (if multiple chapters loaded)
                        OR directly into Page Reader at page 1 of sole chapter

[2] Page Reader       → Primary view. One page at a time. Navigate via
                        sidebar, arrows, search, cross-refs, URL hash.

[3] Search Results    → Inline below search bar. Click → Page Reader
                        at target page with element highlighted.

[4] Figure Overlay    → Full-res figure PNG. Escape to close.
                        No separate "detail page" — overlays only.
```

No separate detail pages. No modals except figure overlay. Everything is either inline or navigates to the page containing the target element.

---

## 10. COMPARISON MODE — TWIN-VERIFIED INGESTION

The twin doubles as the ingestion QC tool. Comparison mode shows the PDF page and the twin page side-by-side for visual verification.

### 10.1 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ STATUS BAR   ASCE 7-22  CH.26   P.363/412   MODE: COMPARE   API:OK │
├──────────────────────────────────────────────────────────────────────┤
│ DIFF SUMMARY: 2 mismatches  SCORE: 0.92  [RUN VISION COMPARE]      │
├─────────────┬──────────────────────┬─────────────────────────────────┤
│ SIDEBAR     │ PDF SOURCE           │ DIGITAL TWIN                    │
│             │                      │                                 │
│ (unchanged) │ rendered page image  │ live twin rendering             │
│             │ from PDF at 200dpi   │ (same page, same number)        │
│             │                      │                                 │
│             │ [page-003.png]       │ [rendered elements]             │
│             │                      │                                 │
│             ├──────────────────────┴─────────────────────────────────┤
│             │ MISMATCH LOG                                           │
│             │ ┌ HIGH  missing_element  right col y≈0.75             │
│             │ │       Exception after 26.1.2 not extracted           │
│             │ ├ MED   wrong_column     ASCE7-22-26.1.1-N1           │
│             │ │       User Note in left col, should be right         │
│             │ └ LOW   text_truncated   ASCE7-22-26.1.2-T1           │
│             │         Last 12 chars of provision text missing        │
├─────────────┴────────────────────────────────────────────────────────┤
│ PAGE NAV   ◄ 362     [APPROVE PAGE]  [FLAG FOR REVIEW]     364 ►    │
└──────────────────────────────────────────────────────────────────────┘
```

### 10.2 Workflow

1. **Load PDF page images** — pre-rendered at 200dpi from the extraction pipeline (`output/pages/asce722-ch26/page-001.png` etc.)
2. **Render twin** — the same page from extracted JSON, two-column layout
3. **Side-by-side view** — PDF on left, twin on right, synced scrolling
4. **Run vision compare** — sends both images to a vision model with a structured diff prompt
5. **Mismatch log** — vision model returns structured JSON with mismatches, rendered as a scrollable log below the side-by-side view
6. **Page-level actions:**
   - **Approve** — marks page as verified, increments chapter extraction score
   - **Flag for Review** — marks page as needing re-extraction or manual correction
7. **Navigate** — arrow keys / prev-next move through pages; the comparison updates for each page

### 10.3 Vision Comparison Prompt (Structured)

The comparison sends two images (PDF source + twin screenshot) to a vision model with this prompt structure:

```
You are comparing a source PDF page against a digital twin rendering of the same page.
The twin should be a faithful structural reproduction: same two-column layout, same
elements in the same positions, same text content, same tables with the same data.

Compare the two images and report mismatches as structured JSON:
- missing_element: content visible in PDF but absent in twin
- extra_element: content in twin not present in PDF
- wrong_column: element in wrong column (left vs right vs full-width)
- wrong_type: element classified incorrectly (e.g., provision tagged as text_block)
- text_mismatch: text content differs (truncated, garbled, merged with adjacent element)
- table_error: table has wrong rows, columns, or values
- figure_missing: figure visible in PDF but placeholder in twin
- ordering_error: elements in wrong vertical order within their column
- boundary_error: two elements merged into one, or one element split into two

For each mismatch, report: type, description, approximate location (column + y position),
severity (high/medium/low), and the element_id if identifiable.

Score the page 0.0–1.0 based on overall fidelity.
```

### 10.4 Automation

- A CLI command runs comparison across all pages in a chapter: `npm run compare -- --chapter 26`
- Each page comparison is an independent vision call — runs in parallel (batch of 10)
- Results accumulate into a chapter-level report: page scores, aggregate mismatch counts by type, worst pages flagged first
- Target threshold: 95% average page score before a chapter is marked "ingested"
- Pages below 90% are auto-flagged for review

### 10.5 Data Flow

```
PDF (source of truth)
    ├── pdf_renderer.py → page PNGs (200dpi)
    └── pipeline_v3.py  → extracted JSON
                              ↓
                    Digital twin renders page
                              ↓
                    Puppeteer screenshots twin page
                              ↓
            Vision model compares: PDF PNG vs twin PNG
                              ↓
                    Structured diff JSON
                              ↓
            Mismatch log in comparison mode UI
                              ↓
            Human reviews → approves or flags
                              ↓
            Fix extraction → re-render → re-compare → converge
```
