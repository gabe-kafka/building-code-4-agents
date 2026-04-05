---
title: "Building Code for Agents — PRD"
date: 2026-04-02
status: draft
---

# Building Code for Agents — PRD

## Problem

Building codes (ASCE 7, ACI 318, AISC 360, IBC) are dense, cross-referenced prose PDFs. Engineers spend hours navigating them. Agents can't reliably parse them. No machine-readable, queryable version exists.

## V1 Failure Analysis

V1 (JSON pipeline) attempted to force all code chapters into one rigid schema (`element.schema.json` with 6 types: table, provision, formula, figure, skipped_figure, reference). Ingestion worked for ASCE 7-22 Chapter 26 but broke on other chapters because the categories were designed around Ch. 26's structure and didn't generalize. The schema was too rigid to hold heterogeneous code content across chapters.

Key lessons:
- Each chapter has fundamentally different shapes — wind has exposure categories and pressure coefficients, seismic has response spectra, concrete has conditional provisions with nested exceptions
- One schema cannot hold all of this without becoming useless or unmaintainable
- Ingestion is the hard problem — getting diagrams, tables, and provisions out of PDFs into structured data is novel and non-trivial
- The extraction pipeline worked; the output format was the bottleneck

## Core Idea

**Many chapter-specific APIs that a coordinating agent can query across.**

Each code chapter is its own database, its own GraphQL schema, its own agent. A coordinating agent decomposes an engineering question into queries across the relevant chapter APIs, executes them, and computes the answer.

This is not one smart API. It's a federation of chapter-specific APIs with an orchestration layer.

## Example Query

> "A 122' building in 11211 — what are the 100-year wind speeds at all heights up to 122'? I need a table for speeds every 5' based on Chapter 27."

To answer this, the orchestrating agent would:
1. Query Ch. 26 API → basic wind speed V for 11211 (from wind speed maps), exposure category, topographic factor Kzt, directionality factor Kd, ground elevation factor Ke
2. Query Ch. 26 API → velocity pressure exposure coefficient Kz at each height (Table 26.10-1)
3. Query Ch. 27 API → velocity pressure equation (Eq 26.10-1: qz = 0.00256 * Kz * Kzt * Kd * Ke * V²)
4. Compute qz at every 5' increment from 0–122'
5. Return formatted table

The APIs serve the raw data — tables, equations, coefficients. The agent does the math.

## Architecture

```
Engineer (natural language)
    ↓
Orchestrating Agent
    ↓ decomposes into queries
    ├── Ch. 26 API (wind parameters)
    ├── Ch. 27 API (wind loads on buildings)
    ├── ACI 318 Ch. X API (concrete design)
    ├── AISC 360 Ch. X API (steel design)
    └── ... (each chapter = independent GraphQL endpoint)
    ↓
Agent computes answer from raw data
    ↓
Formatted result to engineer
```

### Per-Chapter API

Each chapter gets:
1. **Its own GraphQL schema** — types and fields specific to that chapter's content (no forced uniformity)
2. **Its own database** — ingested provisions, tables, equations, figures
3. **A meta-schema layer** — shared primitives across all chapters: material properties, geometry, load cases, units

### Ingestion Pipeline — Hybrid Extraction + Twin-Verified QC

Ingestion uses two complementary methods, then validates the result visually against the digital twin.

#### Method 1: Docling Hybrid (text-layer extraction)

Proven in V1. Reads the PDF's internal text layer directly — no vision model involved.

```
PDF text layer
    ↓ Docling (document structure, reading order, tables)
    ↓ pdfplumber (font metadata — bold = heading/definition marker)
    ↓ Deterministic classification (font patterns → element types)
    ↓
Structured JSON: elements with text, type, section, page
```

**Strengths:** 100% text fidelity (exact characters from the PDF), fast, deterministic, no API cost. Handles provisions, definitions, formulas, exceptions well because bold-font detection is reliable for these.

**Weaknesses:** No spatial awareness — doesn't know which column an element is in. Can't see figures or diagrams. Misses element boundaries when bold patterns are inconsistent. Doesn't understand table structures that span columns.

#### Method 2: Vision Extraction (page-image analysis)

Sends each PDF page as a 200dpi image to a vision model for structural analysis.

```
PDF page image (200dpi PNG)
    ↓ Vision model (Claude)
    ↓
Structured JSON: elements with column placement, bbox, type, approximate text
```

**Strengths:** Sees the page as a human does — knows left vs. right column, sees figures and diagrams, understands table layouts visually, can detect element boundaries from whitespace and formatting cues.

**Weaknesses:** Text is approximate (OCR-quality, not exact). Expensive per page. Can hallucinate element boundaries or misread numbers in tables.

#### Merge Strategy

The two methods produce complementary outputs. Merge them:

```
Docling output (exact text, types)  +  Vision output (columns, bbox, figures)
                          ↓
                    Merged JSON per page
                          ↓
          For each element:
            - text       → from Docling (exact)
            - type       → from Docling (font-based), cross-checked with vision
            - column     → from Vision (spatial)
            - bbox       → from Vision (spatial)
            - figures    → from Vision only (Docling can't see images)
            - tables     → Docling for cell values, Vision for structure/column count
            - cross_refs → from Docling (text pattern matching)
```

**Conflict resolution:** When Docling and vision disagree on element type, Docling wins for text-based types (provisions, definitions — bold-font detection is more reliable than visual classification). Vision wins for spatial properties (column, bbox) and for figures/diagrams.

#### Twin-Verified QC Loop

The digital twin closes the loop. After merging, the extraction is validated visually:

```
Merged JSON
    ↓
Render → digital twin page (two-column, page-faithful)
    ↓
Screenshot twin page (Puppeteer)
    ↓
Vision compare: PDF page PNG  vs.  twin screenshot PNG
    ↓
Structured diff → list of mismatches
    ↓
Score page 0.0–1.0
    ↓
If score < 0.95: flag for re-extraction or manual correction
    ↓
Fix → re-render → re-compare → converge
```

**Why this works:** The twin renders the merged data in the same two-column layout as the PDF. If the twin page doesn't look like the PDF page, something is wrong in the extraction. A vision model comparing the two images can pinpoint exactly what's different — missing elements, wrong columns, broken tables, dropped figures.

**This replaces V1's three-axis benchmark** (coverage/fidelity/structure) with a single visual ground truth: **does the page look right?**

**Comparison dimensions (vision prompt):**
1. **Layout fidelity** — does the twin's two-column structure match the PDF? Are elements in the correct column?
2. **Content completeness** — is every visible text block, table, figure, and heading present? Nothing dropped?
3. **Element boundaries** — are provisions, definitions, exceptions correctly delineated? Or is one provision merged with the next?
4. **Type classification** — are provisions tagged green, definitions purple, etc.? Does the classification match the semantic role in the PDF?
5. **Table integrity** — do tables have the right number of rows and columns? Are numeric values correct?
6. **Figure placement** — are figures in the correct position with correct captions?
7. **Cross-reference integrity** — are section/table/figure references rendered as links? Do they point to the right targets?

**Output: structured diff per page**

```json
{
  "page": 363,
  "score": 0.92,
  "mismatches": [
    {
      "type": "missing_element",
      "description": "Exception after Section 26.1.2 provision not extracted",
      "location": "right column, y≈0.75",
      "severity": "high"
    },
    {
      "type": "wrong_column",
      "description": "User Note rendered in left column, should be right",
      "element_id": "ASCE7-22-26.1.1-N1",
      "severity": "medium"
    }
  ]
}
```

**Automation:** Each page comparison runs as a standalone vision call. The full chapter (50 pages for Ch. 26) runs in parallel. A chapter-level score is the average of page scores. Target: 95%+ per page before a chapter is marked "ingested."

#### Full Pipeline Summary

```
PDF
 ├── Text layer → Docling + pdfplumber → exact text, types, cross-refs
 ├── Page images → Vision model → columns, bbox, figures, table structure
 ↓
Merge (Docling text + Vision spatial)
 ↓
Render in digital twin
 ↓
Screenshot twin → Vision compare against PDF → structured diff
 ↓
Score ≥ 0.95 → approved │ Score < 0.95 → flag, fix, re-run
```

Diagrams and non-computable figures exported as PNG with metadata and reference pointers (V1's "linked" tier — this was a good idea).

## POC Scope

**ASCE 7-22 Chapters 26 + 27** (wind speed parameters + wind loads on buildings). They're tightly coupled — 26 provides the inputs, 27 provides the calculation procedure. Ch. 26 has partial prior ingestion work from V1.

POC proves:
1. One chapter pair fully ingested into queryable GraphQL endpoints
2. An agent can take the example query above, decompose it into GraphQL queries, execute them, and return a computed answer

## Intelligent Search (Ctrl-F)

The twin replaces browser Ctrl-F with a code-aware search layer. This is not text matching — it's structural search across the entire loaded standard.

Capabilities:
- **Full-text search** across all elements in all loaded chapters, not just the visible page
- **Type-aware filtering** — search only provisions, only definitions, only formulas, etc.
- **Section-scoped search** — restrict results to a section range (e.g., 26.7–26.10)
- **Cross-reference graph** — "show me everything that references Table 26.6-1" or "what does Section 26.10.2 depend on"
- **Semantic aliases** — searching "wind speed" also finds provisions referencing V, basic wind speed, and the wind hazard map
- **Results ranked by structural relevance** — definitions before prose, provisions before user notes, exact section matches before body text

Ctrl-F opens the search bar (same as `/` shortcut). Results appear inline below the bar as a scrollable list: element ID, type tag, section, snippet, page number. Clicking a result navigates to that page and highlights the element. The search index is built client-side from all loaded chapter data.

## Chapter Tree

The left sidebar is a navigable tree of the full standard hierarchy, not just sections within one chapter.

```
ASCE 7-22
├── Ch.26 Wind Load Parameters
│   ├── 26.1 Procedures
│   │   ├── 26.1.1 Scope
│   │   └── 26.1.2 Permitted Procedures
│   ├── 26.2 Definitions
│   ├── 26.3 Symbols
│   ├── ...
│   └── 26.12 Enclosure Classification
├── Ch.27 Wind Loads on Buildings — MWFRS
│   ├── 27.1 Scope
│   ├── ...
├── Ch.28 Wind Loads on Buildings — C&C
├── ...
ACI 318
├── Ch.X ...
AISC 360
├── Ch.X ...
```

Behavior:
- Top level: standards (ASCE 7-22, ACI 318, AISC 360). Expand to chapters. Expand chapters to sections. Expand sections to subsections.
- Clicking any node navigates to the first page of that chapter/section
- Current location highlighted with accent left-border
- Collapse/expand via click on the node or arrow keys
- Unloaded chapters shown as dimmed (not yet ingested) — clicking shows a "not yet available" indicator, no error
- Tree stays synchronized with the page reader — scrolling or navigating updates the active node
- Tree is always visible (no hamburger, no drawer). Collapsible via `s` key to reclaim horizontal space.

## Target Scope (Post-POC)

- ASCE 7-22 (all chapters — wind, seismic, snow, rain, flood, ice)
- ACI 318 (concrete design)
- AISC 360 (steel design)

Each code/chapter is an independent database + schema + API. They don't need to look alike.

## Moat

- **Ingestion is hard** — getting diagrams into usable data, digitizing complex tables, parsing conditional provisions with exceptions. This is novel.
- **Codes are expansive and rich** — not a weekend project to digitize
- **Switching costs** — once agents and integrations are built on top of these APIs, they don't switch
- **Federation model** — each chapter API can be developed, versioned, and maintained independently. Scales to any code.

## Related

- V1 repo: `gabe-kafka/bldg-code-2-json`
- V2 repo: `gabe-kafka/bldg-code-4-agents`
- Vault notes: `Projects/bldg-code-4-agent.md`, `Projects/bldg-code-4-agent-v2.md`
