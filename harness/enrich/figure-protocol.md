# Figure Description Protocol

Every figure in the digital twin gets a structured description that captures what an engineer would learn by looking at it. The description serves two audiences:
1. **Agents** querying the data — they can't see images, so the description IS the figure for them
2. **Search** — the description is indexed, so searching "exposure category" should find Figure 26.1-1 because it lists exposure category as a parameter

## Fields

```typescript
{
  figure_number: string       // "Figure 26.1-1" — exact as printed
  caption: string             // The printed caption text, verbatim
  figure_type: FigureType     // Structural classification
  description: string         // 1-2 sentence plain English summary
  content: FigureContent      // Structured extraction of what's IN the figure
  cross_references: string[]  // Sections, tables, figures referenced within the figure
}
```

## Figure Types

| Type | When to use | Examples |
|---|---|---|
| `flowchart` | Decision trees, process flows, branching paths | Fig 26.1-1 (wind load procedure) |
| `contour_map` | Geographic maps with isolines, wind speed zones | Fig 26.5-1A through 26.5-1D |
| `geometry_diagram` | Structural geometry, dimensions, force diagrams | Roof slope diagrams, building cross-sections |
| `data_chart` | X-Y plots, bar charts, curves | Gust effect factor curves |
| `lookup_table_image` | Tables rendered as images (not extractable as HTML) | Some coefficient tables |
| `schematic` | System diagrams, wiring, piping | Pressure coefficient layouts |
| `photograph` | Real-world photos | Rarely used in ASCE |

## Content Structure by Figure Type

### flowchart
```typescript
{
  nodes: Array<{
    label: string           // Node text
    type: 'start' | 'process' | 'decision' | 'end'
    details?: string[]      // Bullet points within the node
    section_refs?: string[] // Section numbers referenced
  }>
  edges: Array<{
    from: string            // Node label (abbreviated)
    to: string              // Node label (abbreviated)
    label?: string          // Edge label (e.g., "Yes", "No")
  }>
}
```

### contour_map
```typescript
{
  geography: string         // "Continental United States" | "Hawaii" | etc.
  parameter: string         // "Basic wind speed V (mi/h)"
  risk_category: string     // "Risk Category II"
  value_range: [number, number]  // [90, 200] (min/max contour values)
  units: string             // "mi/h"
  special_regions: string[] // Named special wind regions on the map
  notes: string[]           // Footnotes visible on the map
}
```

### geometry_diagram
```typescript
{
  subject: string           // "Building cross-section with wind pressure distribution"
  dimensions: string[]      // Named dimensions: ["h (mean roof height)", "L (building length)"]
  forces: string[]          // Force arrows/labels: ["qz (velocity pressure)", "p (net pressure)"]
  variables: string[]       // Variables defined in the diagram
  conditions: string[]      // Conditions shown: ["Exposure B", "θ ≤ 10°"]
}
```

### data_chart
```typescript
{
  x_axis: { label: string, units: string, range: [number, number] }
  y_axis: { label: string, units: string, range: [number, number] }
  series: Array<{ label: string, description: string }>
  key_values: Array<{ x: number, y: number, label: string }>
}
```

### lookup_table_image
```typescript
{
  title: string
  columns: string[]
  rows: string[][]          // Full table data extracted via vision
  notes: string[]
}
```

## Description Quality Rules

1. **Caption is not description.** "Outline of process for determining wind loads" tells you nothing about what's in the flowchart. The description must add information the caption doesn't provide.

2. **Extract all text visible in the figure.** Every label, every number, every note. An agent that can't see the image relies entirely on the structured content.

3. **Preserve section references.** If the figure says "see Section 26.5," that's a cross-reference. Extract it.

4. **Capture the structure, not just the data.** For flowcharts: the branching logic. For maps: the geographic scope and what the contours represent. For diagrams: what forces act where.

5. **Numbers are sacred.** Wind speeds, coefficients, ranges — extract them exactly as printed. Never approximate.

## Example: Figure 26.1-1

**Bad (current):**
```json
{
  "caption": "Outline of process for determining wind loads.",
  "description": "Outline of process for determining wind loads."
}
```

**Good (protocol-compliant):**
```json
{
  "figure_number": "Figure 26.1-1",
  "caption": "Outline of process for determining wind loads.",
  "figure_type": "flowchart",
  "description": "Flowchart showing the complete procedure for determining wind loads on buildings. Starts with Chapter 26 general requirements (9 basic parameters), then branches into MWFRS (Chapters 27-29, 31) and C&C (Chapters 30-31) determination procedures.",
  "content": {
    "nodes": [
      {
        "label": "Chapter 26 — General Requirements",
        "type": "start",
        "details": [
          "Basic wind speed, V, see Section 26.5; Figure 26.5-1",
          "Wind directionality factor, Kd, see Section 26.6",
          "Exposure category, see Section 26.7",
          "Topographic factor, Kzt, see Section 26.8",
          "Ground elevation above sea level, see Section 26.9",
          "Velocity pressure, see Section 26.10",
          "Gust Effect Factor, see Section 26.11",
          "Enclosure classification, see Section 26.12",
          "Internal pressure coefficient, GCpi, see Section 26.13"
        ],
        "section_refs": ["26.5", "26.6", "26.7", "26.8", "26.9", "26.10", "26.11", "26.12", "26.13"]
      },
      {
        "label": "MWFRS",
        "type": "decision",
        "details": ["Wind loads on the MWFRS may be determined by"]
      },
      {
        "label": "Chapter 27: Directional Procedure for buildings of all heights",
        "type": "process",
        "section_refs": ["27"]
      },
      {
        "label": "Chapter 28: Envelope Procedure for low-rise buildings",
        "type": "process",
        "section_refs": ["28"]
      },
      {
        "label": "Chapter 29: Directional Procedure for building appurtenances and other structures",
        "type": "process",
        "section_refs": ["29"]
      },
      {
        "label": "C&C",
        "type": "decision",
        "details": ["Wind loads on the C&C may be determined by"]
      },
      {
        "label": "Chapter 30: Envelope/Directional Procedure, appurtenances, nonbuilding structures",
        "type": "process",
        "section_refs": ["30"]
      },
      {
        "label": "Chapter 31: Wind Tunnel Procedure for any building or other structure",
        "type": "end",
        "section_refs": ["31"]
      }
    ],
    "edges": [
      { "from": "Ch.26", "to": "MWFRS" },
      { "from": "Ch.26", "to": "C&C" },
      { "from": "MWFRS", "to": "Ch.27" },
      { "from": "MWFRS", "to": "Ch.28" },
      { "from": "MWFRS", "to": "Ch.29" },
      { "from": "MWFRS", "to": "Ch.31" },
      { "from": "C&C", "to": "Ch.30" },
      { "from": "C&C", "to": "Ch.31" }
    ]
  },
  "cross_references": ["26.5", "26.6", "26.7", "26.8", "26.9", "26.10", "26.11", "26.12", "26.13", "27", "28", "29", "30", "31"]
}
```
