# Cut List Optimizer — React + TanStack Start

## TL;DR
> **Summary**: Build a woodworking cut-list optimizer as a React SPA within the existing TanStack Start app. Users define sheet stock, parts, and kerf; a guillotine bin-packing algorithm produces color-coded 2D canvas diagrams and waste statistics — all client-side, using the existing design system (Tailwind v4, CSS vars, Manrope/Fraunces fonts).
> **Estimated Effort**: Medium

## Context
### Original Request
A Cut List Optimizer web app. User defines sheet sizes (with labels), parts (with quantity), and kerf (blade thickness). Pressing "Calculate" runs bin-packing and renders visual cut diagrams per sheet plus summary stats. Woodworking-warm aesthetic.

### Key Findings
- **Existing stack**: TanStack Start (React 19), file-based routing in `src/routes/`, Tailwind CSS v4 with `@theme` config, `lucide-react` installed.
- **Path aliases**: `#/` and `@/` both map to `./src/` (tsconfig paths + `vite-tsconfig-paths`).
- **Existing layout**: `__root.tsx` provides `<Header>` + `<Footer>` wrapper with sticky header, theme toggle (light/dark/auto), and TanStack Query provider.
- **Existing CSS vars**: `--sea-ink`, `--sea-ink-soft`, `--lagoon`, `--lagoon-deep`, `--palm`, `--sand`, `--foam`, `--surface`, `--surface-strong`, `--line`, `--inset-glint`, `--kicker`, `--bg-base`, `--header-bg`, `--chip-bg`, `--chip-line`. Full dark-mode variants already defined.
- **Existing utility classes**: `.page-wrap` (max-width 1080px centered), `.island-shell` (glass-card with border/shadow/blur), `.feature-card`, `.display-title` (Fraunces font), `.island-kicker` (small uppercase label), `.rise-in` (entrance animation).
- **Test setup**: Vitest + jsdom + `@testing-library/react` already configured (`npm run test` / `vitest run`).
- **No state management** beyond React Query (which we won't need — this is pure client-side computation).
- **Guillotine-cut bin-packing** is the correct algorithm family: woodworkers make straight, edge-to-edge cuts. The algorithm ensures every placed rectangle can be reached by a sequence of full-width or full-height cuts.

## Objectives
### Core Objective
Replace the starter home page with a fully functional cut-list optimizer that leverages the existing design system, runs entirely client-side, and produces clear visual output.

### Deliverables
- [ ] Pure TypeScript algorithm module (`src/lib/cutOptimizer.ts`) with types + guillotine BSSF packer
- [ ] React hook (`src/hooks/useCutOptimizer.ts`) encapsulating all optimizer state and actions
- [ ] Component suite (`src/components/optimizer/*.tsx`) — input panels, canvas renderer, results display
- [ ] Updated home route (`src/routes/index.tsx`) composing everything into a two-panel layout
- [ ] Unit tests for the algorithm (`src/lib/__tests__/cutOptimizer.test.ts`)

### Definition of Done
- [ ] `npm run dev` starts the app; home page shows the optimizer UI
- [ ] Can add/remove sheet sizes and parts; kerf is configurable (default 3mm)
- [ ] "Calculate" produces correct, non-overlapping placements respecting kerf
- [ ] Each sheet renders as a color-coded 2D canvas diagram with part labels
- [ ] Summary shows total sheets used and waste % per sheet
- [ ] Parts that don't fit produce a clear warning
- [ ] Dark mode works correctly (all new UI respects existing CSS var system)
- [ ] `npm run test` passes with algorithm unit tests
- [ ] Responsive layout works from 375px to 1440px+

### Guardrails (Must NOT)
- Do NOT install new npm dependencies (use only React, lucide-react, Tailwind, existing stack)
- Do NOT modify `__root.tsx`, `router.tsx`, or the TanStack Query integration
- Do NOT use React Query for optimizer state (this is synchronous client-side computation)
- Do NOT use `<svg>` for sheet rendering — use `<canvas>` for performance with many parts
- Do NOT break the existing dark mode or theme toggle

---

## Architecture

### File Structure (new/modified files only)
```
src/
├── lib/
│   ├── cutOptimizer.ts              # Pure algorithm + types (zero React)
│   └── __tests__/
│       └── cutOptimizer.test.ts     # Vitest unit tests
├── hooks/
│   └── useCutOptimizer.ts           # useReducer-based state + actions
├── components/
│   └── optimizer/
│       ├── SheetInputs.tsx          # Sheet definitions panel
│       ├── PartsInputs.tsx          # Parts list panel
│       ├── KerfInput.tsx            # Kerf setting control
│       ├── ResultsPanel.tsx         # Results container + summary
│       └── SheetCanvas.tsx          # Single sheet canvas renderer
├── routes/
│   └── index.tsx                    # MODIFIED — optimizer page
└── styles.css                       # MODIFIED — add optimizer-specific styles
```

### Data Model (in `src/lib/cutOptimizer.ts`)
```
SheetDef      { id: string, label: string, width: number, height: number }
PartDef       { id: string, label: string, width: number, height: number, qty: number }
Placement     { partDefId: string, label: string, x: number, y: number, w: number, h: number, rotated: boolean }
SheetResult   { sheetDef: SheetDef, index: number, placements: Placement[], wastePercent: number }
OptimizeResult { sheets: SheetResult[], unfittable: Array<{ label: string, w: number, h: number }> }
```

### Algorithm — Guillotine BSSF (unchanged from previous plan's logic)
1. Expand parts by quantity → sort by area descending
2. For each part, try to place in existing open sheets using Best Short Side Fit
3. Guillotine split free rects after each placement (Shorter Leftover Axis rule)
4. If no sheet fits, open new sheet (smallest that can contain the part)
5. If no sheet def fits, add to unfittable list
6. Kerf model: inflate each part by `kerf` on right and bottom edges when checking fit and splitting

### State Management (in `useCutOptimizer.ts`)
- `useReducer` with actions: `ADD_SHEET`, `UPDATE_SHEET`, `REMOVE_SHEET`, `ADD_PART`, `UPDATE_PART`, `REMOVE_PART`, `SET_KERF`, `SET_RESULTS`, `CLEAR_RESULTS`, `LOAD_EXAMPLE`
- State shape: `{ sheetDefs: SheetDef[], partDefs: PartDef[], kerf: number, results: OptimizeResult | null, errors: string[] }`
- Hook returns: `{ state, addSheet, updateSheet, removeSheet, addPart, updatePart, removePart, setKerf, calculate, loadExample, clearResults }`

### Canvas Rendering (in `SheetCanvas.tsx`)
- `useRef<HTMLCanvasElement>` + `useEffect` to draw when placements change
- HiDPI support via `devicePixelRatio` scaling
- Scale factor: fit sheet to container width (max ~800px)
- Part color palette: 12+ distinct colors, same `partDefId` → same color
- Labels rendered with auto-sizing font (min 8px, skip if too small)
- Dark mode: adjust sheet background color based on theme

### Part Color Palette
Use 12 warm/craft-toned colors that work in both light and dark mode:
```
["#D4A373", "#E9C46A", "#F4A261", "#E76F51", "#2A9D8F", "#264653",
 "#A8DADC", "#CDB4DB", "#B5838D", "#6D6875", "#FFCDB2", "#B7E4C7"]
```

### UI Layout
```
┌──────────────────────────────────────────────────────┐
│  Header (existing — sticky, theme toggle)            │
├──────────────────────────────────────────────────────┤
│  page-wrap container                                 │
│  ┌────────────────┬─────────────────────────────────┐│
│  │ INPUT PANEL    │ OUTPUT PANEL                    ││
│  │ (island-shell) │ (island-shell)                  ││
│  │                │                                 ││
│  │ [Sheet Sizes]  │ [Sheet canvases with labels]    ││
│  │  + Add Sheet   │                                 ││
│  │                │ [Summary stats table]           ││
│  │ [Kerf input]   │                                 ││
│  │                │ [Unfittable warnings]           ││
│  │ [Parts list]   │                                 ││
│  │  + Add Part    │                                 ││
│  │                │                                 ││
│  │ [CALCULATE]    │                                 ││
│  │ [Load Example] │                                 ││
│  └────────────────┴─────────────────────────────────┘│
├──────────────────────────────────────────────────────┤
│  Footer (existing)                                   │
└──────────────────────────────────────────────────────┘
```
On screens < 768px: stack input panel above output panel (single column).

---

## TODOs

### Phase 1 — Types + Algorithm (pure TypeScript, no React)

- [x] 1. **Create `src/lib/cutOptimizer.ts` — types and algorithm**
  **What**: Pure TypeScript module with zero React imports containing:

  **Types** (all exported):
  - `SheetDef` — `{ id: string, label: string, width: number, height: number }`
  - `PartDef` — `{ id: string, label: string, width: number, height: number, qty: number }`
  - `Placement` — `{ partDefId: string, label: string, x: number, y: number, w: number, h: number, rotated: boolean }`
  - `SheetResult` — `{ sheetDef: SheetDef, index: number, placements: Placement[], wastePercent: number }`
  - `OptimizeResult` — `{ sheets: SheetResult[], unfittable: Array<{ label: string, w: number, h: number }> }`
  - `FreeRect` (internal) — `{ x: number, y: number, w: number, h: number }`

  **Factory functions** (exported):
  - `createSheetDef(label: string, width: number, height: number): SheetDef` — generates `id` via `crypto.randomUUID()`
  - `createPartDef(label: string, width: number, height: number, qty: number): PartDef` — generates `id` via `crypto.randomUUID()`

  **Class `GuillotinePacker`** (internal):
  - Constructor: `(width: number, height: number, kerf: number)`
  - `freeRects: FreeRect[]` — initialized with one full-sheet rect
  - `tryPlace(partW: number, partH: number): { x: number, y: number, w: number, h: number, rotated: boolean } | null`
    - Tests both orientations against all free rects
    - Scoring: BSSF — `min(freeW - effectiveW, freeH - effectiveH)`, lower is better; ties broken by BLSF
    - Effective dimensions: `partW + kerf`, `partH + kerf`
    - On success: calls `guillotineSplit()`, returns placement coords (without kerf inflation)
  - `guillotineSplit(freeRect: FreeRect, placedW: number, placedH: number): void`
    - Shorter Leftover Axis rule to choose horizontal vs vertical split
    - Horizontal: right = `{x+placedW, y, remainW, placedH}`, bottom = `{x, y+placedH, freeW, remainH}`
    - Vertical: right = `{x+placedW, y, remainW, freeH}`, bottom = `{x, y+placedH, placedW, remainH}`
    - `placedW` / `placedH` include kerf
    - Only add rects where `w > kerf && h > kerf` (a free rect smaller than kerf is useless)
  - `usedArea(): number` — tracked incrementally

  **Main function** (exported):
  - `optimizeCutList(sheetDefs: SheetDef[], partDefs: PartDef[], kerf: number): OptimizeResult`
    - Step 1: Expand parts by qty → sort by area descending
    - Step 2: For each rect, try placing on existing open sheets (iterate in order)
    - Step 3: If no fit, open new sheet — pick first sheetDef that fits the part (try both orientations); create new `GuillotinePacker`
    - Step 4: If no sheetDef fits → add to unfittable
    - Step 5: Compute `wastePercent` per sheet: `(1 - usedArea / (w × h)) × 100`, rounded to 1 decimal

  **Validation function** (exported):
  - `validateInputs(sheetDefs: SheetDef[], partDefs: PartDef[], kerf: number): { valid: boolean, errors: string[] }`
    - At least one sheet with positive dimensions
    - At least one part with positive dimensions and qty ≥ 1
    - Kerf ≥ 0
    - Warn about specific parts larger than all sheet defs (both orientations)

  **Files**: `src/lib/cutOptimizer.ts`
  **Acceptance**: Module compiles with `tsc --noEmit`. All types are exported. `optimizeCutList` and `validateInputs` are pure functions with no side effects.

- [x] 2. **Create `src/lib/__tests__/cutOptimizer.test.ts` — algorithm unit tests**
  **What**: Vitest test suite covering:

  - **Factory tests**: `createSheetDef` and `createPartDef` return objects with valid UUIDs and correct properties
  - **Single part on single sheet**: one 1200×600 part on a 2440×1220 sheet, kerf=3 → 1 sheet, 1 placement at (0,0), waste ~70%
  - **Two parts fit on one sheet**: two 1200×600 parts, kerf=3 → both fit on one 2440×1220 sheet, non-overlapping
  - **Kerf gap**: two parts placed adjacently have at least `kerf` mm gap between them (check placement coordinates)
  - **Part requires rotation**: part 1300×600 on a 1220×2440 sheet (note: sheet is portrait) — part should be rotated to fit
  - **Multiple sheets**: enough parts to overflow one sheet → result has 2+ sheets
  - **Unfittable part**: part 3000×3000 with only 2440×1220 sheets → appears in `unfittable`
  - **Validation**: empty parts → invalid; negative kerf → invalid; oversized part → specific warning
  - **Quantity expansion**: one PartDef with qty=4 → 4 placements sharing the same `partDefId`
  - **No overlap assertion**: helper function that checks no two placements on the same sheet overlap (including kerf)
  - **Part exactly equals sheet size**: part 2440×1220 on 2440×1220 sheet, kerf=0 → fits with 0% waste

  **Files**: `src/lib/__tests__/cutOptimizer.test.ts`
  **Acceptance**: `npm run test` passes all tests.

### Phase 2 — React Hook

- [x] 3. **Create `src/hooks/useCutOptimizer.ts` — state management hook**
  **What**: Custom React hook using `useReducer` + `useCallback`:

  **State type**:
  ```
  OptimizerState {
    sheetDefs: SheetDef[]
    partDefs: PartDef[]
    kerf: number
    results: OptimizeResult | null
    errors: string[]
  }
  ```

  **Initial state**:
  - `sheetDefs`: one default `createSheetDef("Plywood 4×8", 2440, 1220)`
  - `partDefs`: empty array `[]`
  - `kerf`: 3
  - `results`: null
  - `errors`: empty array

  **Reducer actions** (discriminated union `OptimizerAction`):
  - `ADD_SHEET` — appends new `createSheetDef("Sheet N", 2440, 1220)` where N is auto-incrementing
  - `UPDATE_SHEET` — payload `{ id: string, field: keyof SheetDef, value: string | number }`, updates in place
  - `REMOVE_SHEET` — payload `{ id: string }`, removes (guard: don't remove if only 1 left)
  - `ADD_PART` — appends new `createPartDef("Part N", 0, 0, 1)`
  - `UPDATE_PART` — payload `{ id: string, field: keyof PartDef, value: string | number }`
  - `REMOVE_PART` — payload `{ id: string }`
  - `SET_KERF` — payload `{ kerf: number }`
  - `SET_RESULTS` — payload `{ results: OptimizeResult }`
  - `SET_ERRORS` — payload `{ errors: string[] }`
  - `CLEAR_RESULTS` — clears results + errors
  - `LOAD_EXAMPLE` — replaces sheetDefs and partDefs with sample data:
    - Sheet: "Plywood 4×8" 2440×1220
    - Kerf: 3
    - Parts: "Side Panel" 800×600 qty 2, "Top" 1200×600 qty 1, "Shelf" 1150×400 qty 3, "Back" 1200×800 qty 1, "Drawer Front" 500×200 qty 4

  **Hook return** (all action dispatchers wrapped in `useCallback`):
  ```
  {
    state: OptimizerState,
    addSheet: () => void,
    updateSheet: (id, field, value) => void,
    removeSheet: (id) => void,
    addPart: () => void,
    updatePart: (id, field, value) => void,
    removePart: (id) => void,
    setKerf: (kerf: number) => void,
    calculate: () => void,     // validates → runs optimizeCutList → dispatches SET_RESULTS or SET_ERRORS
    loadExample: () => void,
    clearResults: () => void,
  }
  ```

  The `calculate` function: calls `validateInputs()`, if invalid dispatches `SET_ERRORS`, otherwise calls `optimizeCutList()` and dispatches `SET_RESULTS`.

  **Files**: `src/hooks/useCutOptimizer.ts`
  **Acceptance**: Hook compiles. Can be used in a component to add/remove sheets and parts, and calling `calculate()` produces results or errors.

### Phase 3 — Components

- [x] 4. **Create `src/components/optimizer/SheetInputs.tsx` — sheet definitions panel**
  **What**: React component receiving props:
  ```
  {
    sheetDefs: SheetDef[],
    onUpdate: (id: string, field: string, value: string | number) => void,
    onRemove: (id: string) => void,
    onAdd: () => void,
  }
  ```

  Renders:
  - Section heading "Sheet Sizes" with `island-kicker` style
  - For each sheet def: a row with:
    - Label text input (flex-grow)
    - Width number input (w-20, min=1, placeholder="Width")
    - `×` separator text
    - Height number input (w-20, min=1, placeholder="Height")
    - "mm" unit label (text-xs, text-[var(--sea-ink-soft)])
    - Remove button (lucide-react `Trash2` icon, 16px) — disabled/hidden if only 1 sheet
  - Inputs styled with: `rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm` + focus ring using `--lagoon`
  - "Add Sheet Size" button at bottom — lucide-react `Plus` icon + text, styled as secondary/outlined button matching the chip style

  **Files**: `src/components/optimizer/SheetInputs.tsx`
  **Acceptance**: Renders sheet def rows. Add/remove/edit all work. Minimum 1 sheet enforced visually.

- [x] 5. **Create `src/components/optimizer/PartsInputs.tsx` — parts list panel**
  **What**: React component receiving props:
  ```
  {
    partDefs: PartDef[],
    onUpdate: (id: string, field: string, value: string | number) => void,
    onRemove: (id: string) => void,
    onAdd: () => void,
  }
  ```

  Renders:
  - Section heading "Parts" with `island-kicker` style
  - For each part def: a row with:
    - Label text input (flex-grow, placeholder="Part name")
    - Width number input (w-20, min=1, placeholder="W")
    - Height number input (w-20, min=1, placeholder="H")
    - "mm" separator
    - Qty number input (w-16, min=1, placeholder="Qty")
    - Remove button (lucide-react `Trash2` icon)
  - "Add Part" button at bottom — `Plus` icon + text
  - If no parts: show a muted helper text "Add parts to get started"
  - Row styling: same input classes as SheetInputs, with `gap-2` flex rows

  **Files**: `src/components/optimizer/PartsInputs.tsx`
  **Acceptance**: Renders part rows. Add/remove/edit all work. Empty state shows helper text.

- [x] 6. **Create `src/components/optimizer/KerfInput.tsx` — kerf setting**
  **What**: Small component receiving `{ kerf: number, onChange: (kerf: number) => void }`.

  Renders:
  - Inline flex row with label "Blade Kerf" (island-kicker style), number input (w-20, min=0, step=0.5), "mm" unit label
  - Tooltip or small helper text: "Thickness of the saw blade cut"
  - Uses lucide-react `Scissors` or `Ruler` icon (16px) next to the label

  **Files**: `src/components/optimizer/KerfInput.tsx`
  **Acceptance**: Kerf value is editable and updates state.

- [x] 7. **Create `src/components/optimizer/SheetCanvas.tsx` — single sheet canvas renderer**
  **What**: React component receiving:
  ```
  {
    sheetResult: SheetResult,
    colorMap: Map<string, string>,   // partDefId → color hex
    containerWidth: number,          // for responsive scaling
  }
  ```

  Implementation:
  - `useRef<HTMLCanvasElement>` for the canvas element
  - `useEffect` that redraws whenever `sheetResult`, `colorMap`, or `containerWidth` changes
  - **Scaling**: `scale = Math.min(containerWidth / sheetW, 600 / sheetH)`. Canvas CSS dimensions = `sheetW * scale` × `sheetH * scale`. Actual canvas pixel dimensions = CSS dims × `devicePixelRatio`. Context scaled by `devicePixelRatio`.
  - **Draw sheet background**: filled rect with `var(--surface-strong)` equivalent — detect dark mode by reading `document.documentElement.classList.contains('dark')` → use `#F5E6CA` (light) or `#2a2420` (dark). 1px border in `--line` color.
  - **Draw each placement**:
    - Fill with color from `colorMap`
    - 1px stroke slightly darker (darken fill by 20%)
    - Coordinates: `(placement.x * scale, placement.y * scale, placement.w * scale, placement.h * scale)`
  - **Draw labels**:
    - Center text: part label on line 1, `w×h` on line 2 (if space allows)
    - Font: Manrope (the `--font-sans` family). Start at 12px, shrink to fit, min 7px. Skip if rect is too small.
    - Text color: `#333` or `#fff` depending on fill color luminance (`(R*299 + G*587 + B*114) / 1000 > 150` → dark text)
  - **Draw dimension labels on sheet edges**: small text showing sheet width along top edge, height along left edge

  **Files**: `src/components/optimizer/SheetCanvas.tsx`
  **Acceptance**: Renders a canvas showing all placements as colored labeled rectangles. No visual overlap. Sharp on HiDPI. Responds to container width.

- [x] 8. **Create `src/components/optimizer/ResultsPanel.tsx` — results container + summary**
  **What**: React component receiving:
  ```
  {
    results: OptimizeResult | null,
    partDefs: PartDef[],    // for building color map
    errors: string[],
  }
  ```

  Implementation:
  - **Error state**: if `errors.length > 0`, show error box with `border-l-4 border-red-500 bg-red-50 dark:bg-red-950/30` styling, listing each error. Use lucide-react `AlertTriangle` icon.
  - **Empty state**: if no results and no errors, show centered muted message: "Add parts and click Calculate to see your optimized cut list." with a lucide-react `LayoutGrid` icon above it.
  - **Results state**: if `results` present:
    - Build `colorMap: Map<string, string>` — assign each unique `partDefId` a color from the 12-color palette (by order of first appearance)
    - Use a `useRef` + `useEffect` + `ResizeObserver` to track container width for responsive canvas sizing
    - For each `SheetResult`:
      - Heading: "Sheet {index}" — sheet def label — "{wastePercent}% waste"
      - `<SheetCanvas>` component
    - **Unfittable warning**: if `results.unfittable.length > 0`, show a warning box (amber/yellow styling) listing unfittable part labels + dimensions
    - **Summary table** below all canvases:
      - Styled with `island-shell` card, striped rows
      - Columns: Sheet #, Size (label), Parts Placed, Used Area (mm²), Waste %, visual bar
      - Totals row: total sheets, total parts, overall waste %
      - Waste % column includes a small inline bar (div with background width proportional to waste)

  **Files**: `src/components/optimizer/ResultsPanel.tsx`
  **Acceptance**: Shows appropriate state (empty/error/results). Canvas diagrams render. Summary table is accurate. Unfittable parts produce warning.

### Phase 4 — Route Integration

- [x] 9. **Modify `src/routes/index.tsx` — optimizer page**
  **What**: Replace the entire starter home page content with the optimizer UI.

  Structure:
  ```tsx
  import { createFileRoute } from '@tanstack/react-router'
  import { useCutOptimizer } from '#/hooks/useCutOptimizer'
  import SheetInputs from '#/components/optimizer/SheetInputs'
  import PartsInputs from '#/components/optimizer/PartsInputs'
  import KerfInput from '#/components/optimizer/KerfInput'
  import ResultsPanel from '#/components/optimizer/ResultsPanel'
  // lucide-react icons: Calculator, Lightbulb

  export const Route = createFileRoute('/')({ component: OptimizerPage })

  function OptimizerPage() {
    const { state, addSheet, updateSheet, removeSheet, addPart, updatePart, removePart, setKerf, calculate, loadExample, clearResults } = useCutOptimizer()

    return (
      <main className="page-wrap px-4 pb-8 pt-6">
        {/* Page title */}
        <div className="mb-6 text-center">
          <h1 className="display-title ...">Cut List Optimizer</h1>
          <p className="...">Optimize your sheet cuts, minimize waste.</p>
        </div>

        {/* Two-panel layout */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Input panel */}
          <aside className="island-shell w-full shrink-0 rounded-2xl p-5 lg:w-[380px]">
            <SheetInputs ... />
            <KerfInput ... />
            <PartsInputs ... />
            {/* Calculate button - full width, prominent */}
            <button onClick={calculate} className="...">
              <Calculator /> Calculate
            </button>
            {/* Load Example link */}
            <button onClick={loadExample} className="...">
              <Lightbulb /> Load Example
            </button>
          </aside>

          {/* Output panel */}
          <section className="min-w-0 flex-1">
            <ResultsPanel results={state.results} partDefs={state.partDefs} errors={state.errors} />
          </section>
        </div>
      </main>
    )
  }
  ```

  **Styling notes**:
  - Calculate button: `w-full rounded-xl bg-[var(--lagoon)] px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-[var(--lagoon-deep)]`
  - Load Example button: `w-full rounded-xl border border-[var(--line)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)]`
  - Use `gap-4` between input sections (sheets, kerf, parts, buttons)
  - Responsive breakpoint: `lg:flex-row` (≥1024px) for side-by-side, stacked below

  **Files**: `src/routes/index.tsx`
  **Acceptance**: Home page shows two-panel optimizer. Input panel on left, output on right (desktop) or stacked (mobile). All interactions work end-to-end.

- [x] 10. **Modify `src/components/Header.tsx` — update branding**
  **What**: Update the header to reflect the app's purpose:
  - Change the brand chip text from "TanStack Start" to "CutList Optimizer"
  - Optionally add a lucide-react `Axe` or `Ruler` icon (16px) in the chip instead of the colored dot
  - Remove the external X/GitHub links and the About/Docs nav links (or keep About if desired — user can decide)
  - Keep the `ThemeToggle` component

  **Files**: `src/components/Header.tsx`
  **Acceptance**: Header shows "CutList Optimizer" branding. Theme toggle still works. No dead links.

- [x] 11. **Modify `src/components/Footer.tsx` — update footer**
  **What**: Update footer text:
  - Change copyright text to "CutList Optimizer" or similar
  - Remove TanStack-specific social links, or replace with generic content
  - Keep `site-footer` styling

  **Files**: `src/components/Footer.tsx`
  **Acceptance**: Footer is clean and relevant to the app.

### Phase 5 — Styling + Polish

- [x] 12. **Modify `src/styles.css` — add optimizer-specific styles**
  **What**: Add CSS for optimizer-specific elements that benefit from being in the global stylesheet rather than Tailwind inline:

  - `.optimizer-input` — shared input styling: `rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[var(--lagoon)]/20`
  - `.optimizer-input-row` — `display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem`
  - `.optimizer-section` — `margin-bottom:1.5rem` with bottom border separator
  - `.summary-table` — table styling with striped rows using `var(--surface)` / `var(--surface-strong)` alternation
  - `.waste-bar` — small inline waste percentage visualization bar
  - `.error-box` / `.warning-box` — alert styling for validation errors and unfittable warnings
  - Update `<title>` in `__root.tsx` head meta from "TanStack Start Starter" to "CutList Optimizer" (this is a one-line change in `__root.tsx`, acceptable as metadata)

  **Files**: `src/styles.css`, `src/routes/__root.tsx` (title only)
  **Acceptance**: All optimizer inputs look cohesive. Dark mode works for all new styles.

- [x] 13. **Responsive polish and canvas resize handling**
  **What**: Ensure the full experience works well at all breakpoints:

  - In `ResultsPanel.tsx`: implement `ResizeObserver` on the results container to update canvas widths when the panel resizes
  - Input panel: at `< lg` (1024px), input panel goes full-width above results
  - Input rows: at `< sm` (640px), part input rows should wrap — label on its own line, dimensions below
  - Canvas: minimum width of 300px, scales down gracefully
  - "Calculate" button: add loading state (change text to "Calculating…", disable) — though the algorithm is synchronous, this provides visual feedback via `setTimeout(..., 0)` to let the UI update before blocking
  - Smooth scroll to results after calculation: `document.querySelector('[data-results]')?.scrollIntoView({ behavior: 'smooth' })`

  **Files**: `src/components/optimizer/ResultsPanel.tsx`, `src/components/optimizer/PartsInputs.tsx`, `src/routes/index.tsx`
  **Acceptance**: App looks good from 375px to 1440px+. Canvases resize on window resize. Results scroll into view after calculation.

- [x] 14. **Keyboard and accessibility polish**
  **What**:
  - All inputs have proper `aria-label` or associated `<label>` elements
  - Remove buttons have `aria-label="Remove {item label}"`
  - Calculate button has proper disabled state styling
  - Pressing Enter in the last part's input row adds a new part row (call `onAdd()`)
  - Tab order is logical: sheets → kerf → parts → calculate
  - Canvas has `role="img"` and `aria-label="Cut diagram for Sheet {index}"`
  - Error/warning boxes have `role="alert"`

  **Files**: `src/components/optimizer/SheetInputs.tsx`, `src/components/optimizer/PartsInputs.tsx`, `src/components/optimizer/SheetCanvas.tsx`, `src/components/optimizer/ResultsPanel.tsx`
  **Acceptance**: Tab through the entire form logically. Screen reader announces errors. Enter adds new rows.

---

## Verification
- [x] `npm run dev` starts the app without errors; home page shows the optimizer UI
- [x] `npm run test` passes all algorithm unit tests
- [x] `npm run build` completes without TypeScript errors
- [x] Add sheets, add parts, set kerf, click Calculate → diagrams and summary appear
- [x] "Load Example" populates sample data and produces ~2 sheets of output
- [x] Parts that don't fit show a clear warning
- [x] Validation errors (no parts, oversized parts, etc.) show appropriate messages
- [x] Dark mode toggle works — all new UI elements respect theme
- [x] Layout is responsive: two-column on desktop (≥1024px), stacked on mobile
- [x] Canvas diagrams are sharp on HiDPI displays and resize with the window
- [x] No console errors or warnings throughout normal usage
- [x] Algorithm respects kerf: adjacent parts have ≥ kerf mm gap
- [x] No overlapping placements on any sheet
