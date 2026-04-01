# Cut Order — Guillotine Cut Sequence Generation & Visualization

## TL;DR
> **Summary**: Derive an ordered list of guillotine cut lines from each sheet's placements, improve TrackSawPacker strip affinity, render cut lines on the canvas, and add a collapsible cut-sequence list below each sheet.
> **Estimated Effort**: Medium

## Context
### Original Request
Add a "cut sequence" feature that tells the user **what order to make their cuts** on each sheet. Each cut is a full-width or full-height guillotine cut across the current sub-panel. The feature also improves the TrackSawPacker to prefer strip-based breakdown and renders everything visually.

### Key Findings
- **cutOptimizer.ts** (781 lines) contains all types (`Placement`, `SheetResult`, `OptimizeResult`), four packer classes (`GuillotinePacker`, `MaxRectsPacker`, `ShelfPacker`, `TrackSawPacker`), and the `optimizeCutList()` entry point.
- **SheetCanvas.tsx** (181 lines) is a single `useEffect`-driven Canvas renderer. It draws placements with fill/border/label in a single render pass. Theme-aware via `MutationObserver`.
- **ResultsPanel.tsx** (259 lines) iterates `results.sheets`, rendering one `<SheetCanvas>` per sheet inside an island-shell card. Uses `lucide-react` icons and Tailwind 4 utility classes. No collapsible sections currently exist.
- **cutOptimizer.test.ts** (493 lines) uses Vitest with `describe/it/expect`. Tests all four algorithms. Has a `noOverlap` helper and a real-world 16-part regression test.
- The `TrackSawPacker.guillotineSplit` already uses LLA-style (`remainW > remainH`) logic identical to `GuillotinePacker`. Its scoring adds a `-1000000` bonus for exact dimension matches but has no strip affinity bonus for *close* matches.
- `SheetResult` currently has: `sheetDef`, `index`, `placements`, `wastePercent` — no `cuts` field.

## Objectives
### Core Objective
Give users a numbered, ordered list of guillotine cuts for each sheet, visible both on the canvas diagram and as a text list.

### Deliverables
- [ ] `CutLine` interface and `deriveCutSequence()` function in `cutOptimizer.ts`
- [ ] `cuts: CutLine[]` field on `SheetResult`, populated in `optimizeCutList()`
- [ ] Improved `TrackSawPacker` with strip-affinity scoring and strip-preserving split
- [ ] Canvas overlay rendering cut lines + step badges in `SheetCanvas.tsx`
- [ ] Collapsible "Cut sequence" list below each sheet in `ResultsPanel.tsx`
- [ ] Unit tests for `deriveCutSequence()` in `cutOptimizer.test.ts`

### Definition of Done
- [ ] `npm run test` passes with zero failures
- [ ] `npm run build` produces no TypeScript errors
- [ ] Visual: each sheet canvas shows dashed cut lines with numbered badges
- [ ] Visual: collapsible cut-sequence list appears below each canvas (collapsed by default)
- [ ] Existing algorithm tests remain green (no regressions)

### Guardrails (Must NOT)
- Must NOT change the public API signature of `optimizeCutList()` (only extend the return type)
- Must NOT alter placement coordinates or packing behavior of `GuillotinePacker`, `MaxRectsPacker`, or `ShelfPacker`
- Must NOT add new npm dependencies
- Must NOT break the existing canvas layout or responsiveness

---

## TODOs

- [ ] 1. **Add `CutLine` interface to `cutOptimizer.ts`**
  **What**: Define the new type at the top of the file, near the other exported interfaces.
  **Files**: `src/lib/cutOptimizer.ts` (lines 1–60 region)
  **Exact interface**:
  ```ts
  export interface CutLine {
    axis: 'x' | 'y'       // 'x' = vertical cut (at x=position), 'y' = horizontal cut (at y=position)
    position: number       // coordinate in mm
    step: number           // 1-based cut order
    length: number         // span of the sub-panel being cut (mm), NOT always full sheet
  }
  ```
  **Acceptance**: Type exists, is exported, no compile errors.

- [ ] 2. **Extend `SheetResult` with `cuts` field**
  **What**: Add `cuts: CutLine[]` to the `SheetResult` interface (line 28–33).
  **Files**: `src/lib/cutOptimizer.ts`
  **Change**:
  ```ts
  export interface SheetResult {
    sheetDef: SheetDef
    index: number
    placements: Placement[]
    wastePercent: number
    cuts: CutLine[]        // ← new field
  }
  ```
  **Acceptance**: Interface updated, downstream consumers (SheetCanvas, ResultsPanel) see the new field.

- [ ] 3. **Implement `deriveCutSequence()` function**
  **What**: A pure function that takes `(placements: Placement[], sheetWidth: number, sheetHeight: number, kerf: number)` and returns `CutLine[]`. Place it as a module-level exported function in `cutOptimizer.ts`, just before `optimizeCutList()`.
  **Files**: `src/lib/cutOptimizer.ts`
  **Algorithm** (recursive guillotine decomposition):
  ```
  function deriveCutSequence(placements, sheetW, sheetH, kerf): CutLine[]
  ```
  1. Define an internal recursive helper: `decompose(rects: Placement[], bounds: {x,y,w,h}, step: {current: number}): CutLine[]`
  2. Base case: if `rects.length <= 1`, return `[]` (no cut needed to isolate a single part or empty region).
  3. Collect all candidate split positions:
     - For **vertical splits** (axis='x'): for each placement in `rects`, the right edge `p.x + p.w` (+ kerf if not at sheet boundary) is a candidate. A candidate at position `pos` is **valid** if every placement either lies entirely left of `pos` or entirely right of `pos + kerf` — i.e., the cut doesn't bisect any part.
     - For **horizontal splits** (axis='y'): same logic using `p.y + p.h` as candidates.
     - Exclude positions at the bounds edges (cuts at x=bounds.x, x=bounds.x+bounds.w, y=bounds.y, y=bounds.y+bounds.h are boundaries, not cuts).
  4. For each valid candidate, compute the **cut length**:
     - Vertical cut at `pos` within bounds `{x,y,w,h}` → length = `bounds.h`
     - Horizontal cut at `pos` within bounds → length = `bounds.w`
  5. **Select the best candidate**: prefer the one with the **shortest length** (fewest mm to cut). On tie, prefer axis='y' (horizontal) then lower position.
  6. Record the cut: `{ axis, position: pos, step: step.current++, length }`.
  7. Partition `rects` into two groups (left/right or top/bottom of the cut, adjusting for kerf).
  8. Recurse into both sub-rectangles, adjusting `bounds` accordingly.
  9. Return `[thisCut, ...leftCuts, ...rightCuts]` (but cuts are numbered globally via the shared `step` counter — the step counter is incremented across all recursions so cuts are in the order they'd actually be performed).

  **Edge cases to handle**:
  - Zero placements → return `[]`
  - Single placement → return `[]`
  - No valid guillotine cut exists (placements form an L-shape that can't be split by a single line) → return `[]` for that sub-region (graceful degradation — don't crash)
  - Kerf: when splitting, the cut position should be at `p.x + p.w` and the right group starts at `p.x + p.w + kerf`. The cut consumes `kerf` mm of space.

  **Acceptance**: Function is exported, returns correctly ordered `CutLine[]` for basic test cases.

- [ ] 4. **Wire `deriveCutSequence()` into `optimizeCutList()`**
  **What**: After building each `SheetResult` in the final mapping (lines 764–778), call `deriveCutSequence()` to populate the `cuts` field.
  **Files**: `src/lib/cutOptimizer.ts` (the `openSheets.map(...)` block)
  **Change**: In the `.map()` callback at the end of `optimizeCutList`:
  ```ts
  return {
    sheetDef: sheet.sheetDef,
    index: sheet.index,
    placements: sheet.placements,
    wastePercent,
    cuts: deriveCutSequence(
      sheet.placements,
      sheet.sheetDef.width,
      sheet.sheetDef.height,
      kerf,
    ),
  }
  ```
  **Acceptance**: `optimizeCutList()` returns `SheetResult` objects with populated `cuts` arrays.

- [ ] 5. **Improve `TrackSawPacker` — strip affinity scoring**
  **What**: In `TrackSawPacker.tryPlace()`, add a secondary bonus when the part's dimension (including kerf) is close-but-not-exact to the free rect's dimension. This encourages stacking parts into strips.
  **Files**: `src/lib/cutOptimizer.ts`, class `TrackSawPacker`, method `tryPlace` (lines 475–533)
  **Change**: After the existing perfect-fit bonus (`score -= 1000000`), add a strip-affinity bonus:
  ```ts
  // Strip affinity: bonus when part width matches free rect width (same strip)
  // or part height matches free rect height (fills the strip)
  if (rect.w === effectiveW) score -= 500
  if (rect.h === effectiveH) score -= 500
  ```
  Wait — the existing code already has `score -= 1000000` when `rect.w === effectiveW || rect.h === effectiveH`. The strip affinity bonus should instead reward the case where the part fills one dimension of a free rect that was *created by a prior split* (i.e., the free rect has a dimension matching the part, encouraging strip stacking). The existing bonus is actually already very large (-1M). What we need is a **separate, smaller bonus** specifically for when the free rect width matches the *original strip width* — but we don't track that.

  **Revised approach**: Change the existing bonus to be **additive per matched dimension** instead of either/or:
  ```ts
  // Replace the single: if (rect.w === effectiveW || rect.h === effectiveH) score -= 1000000
  // With two separate bonuses:
  if (rect.w === effectiveW) score -= 1000000  // perfect width match → same-width strip
  if (rect.h === effectiveH) score -= 1000000  // perfect height match → same-height strip
  // Both can fire: if both match, the part perfectly fills the rect (score -= 2000000)
  ```
  This makes a **perfect fit** (both dimensions match) score better than a single-dimension match, which is the correct preference order.

  Apply the same change to the rotated-orientation scoring block.

  **Acceptance**: TrackSawPacker still passes all existing tests. Parts with matching widths are more likely to be stacked into the same strip.

- [ ] 6. **Improve `TrackSawPacker` — strip-preserving split**
  **What**: Change `TrackSawPacker.guillotineSplit()` so that when a part perfectly fills one dimension of the free rect, the split direction is forced to **preserve the full-width or full-height strip** in the larger remainder — not just LLA.
  **Files**: `src/lib/cutOptimizer.ts`, class `TrackSawPacker`, method `guillotineSplit` (lines 535–585)
  **Change**: Replace the `splitHorizontal = remainW > remainH` logic with:
  ```ts
  // Prefer split that keeps larger remainder as a full-width or full-height strip.
  // If the placed piece fills the full width → split horizontally (bottom strip is full-width).
  // If the placed piece fills the full height → split vertically (right strip is full-height).
  // Otherwise, fall back to LLA.
  let splitHorizontal: boolean
  if (placedW === freeRect.w) {
    splitHorizontal = true   // part fills width → bottom remainder is full-width strip
  } else if (placedH === freeRect.h) {
    splitHorizontal = false  // part fills height → right remainder is full-height strip
  } else {
    // LLA fallback: keep larger contiguous remainder
    splitHorizontal = remainW > remainH
  }
  ```
  **Acceptance**: Existing `tracksaw grouping` test still passes (parts with w=600 should still stack vertically). The real-world 16-part test still places all parts.

- [ ] 7. **Render cut lines on canvas (`SheetCanvas.tsx`)**
  **What**: After the existing placement drawing loop (line 155), add a new section that draws cut lines and step badges. Read `sheetResult.cuts` from props.
  **Files**: `src/components/optimizer/SheetCanvas.tsx`
  **Implementation details**:

  After the dimension labels section (after line 170), add:
  ```ts
  // ── Draw cut sequence lines ──
  const cuts = sheetResult.cuts ?? []
  if (cuts.length > 0) {
    const cutColor = isDark ? 'rgba(255,120,120,0.85)' : 'rgba(255,80,80,0.7)'
    const badgeFill = isDark ? '#1e2a2e' : '#ffffff'
    const badgeText = isDark ? '#ff9999' : '#cc3333'
    const badgeRadius = Math.max(8, Math.min(12, Math.round(scale * 30)))
    const badgeFont = Math.max(7, Math.min(10, badgeRadius - 1))

    ctx.save()
    for (const cut of cuts) {
      // Compute line start and end in CSS coords
      let x1: number, y1: number, x2: number, y2: number
      if (cut.axis === 'x') {
        // Vertical cut line
        x1 = x2 = Math.round(cut.position * scale)
        // Determine y-span from the cut's context (use full sheet for now; length gives the span)
        // We need to find the y-range this cut covers. For simplicity: center the length on the sheet.
        // Better: derive from placement bounds. For v1, draw from y=0 down to y=length*scale.
        // Actually, we should derive the y-offset. For the recursive decomposition, the cut always
        // spans from the bounds.y to bounds.y + bounds.h of the sub-rectangle. We'll need to add
        // `start` to CutLine or infer from placements. See note in TODO 3.
        y1 = 0  // Will be refined — see addendum below
        y2 = Math.round(cut.length * scale)
      } else {
        // Horizontal cut line
        y1 = y2 = Math.round(cut.position * scale)
        x1 = 0
        x2 = Math.round(cut.length * scale)
      }

      // Dashed cut line
      ctx.beginPath()
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = cutColor
      ctx.lineWidth = 1.5
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()

      // Step badge at midpoint
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2

      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(mx, my, badgeRadius, 0, Math.PI * 2)
      ctx.fillStyle = badgeFill
      ctx.fill()
      ctx.strokeStyle = cutColor
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.fillStyle = badgeText
      ctx.font = `700 ${badgeFont}px Manrope, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(cut.step), mx, my)
    }
    ctx.restore()
  }
  ```

  **Addendum — CutLine needs `start` coordinate**: To correctly position the cut line on the canvas, we need to know not just the `position` and `length` but also where along the perpendicular axis the cut starts. Add a `start` field to `CutLine`:
  ```ts
  export interface CutLine {
    axis: 'x' | 'y'
    position: number
    step: number
    length: number
    start: number  // perpendicular-axis offset where cut begins (mm)
  }
  ```
  - For axis='x' (vertical cut): `start` is the y-coordinate where the cut begins; it spans from `start` to `start + length`.
  - For axis='y' (horizontal cut): `start` is the x-coordinate where the cut begins; it spans from `start` to `start + length`.

  This allows the canvas renderer to draw:
  ```ts
  if (cut.axis === 'x') {
    x1 = x2 = Math.round(cut.position * scale)
    y1 = Math.round(cut.start * scale)
    y2 = Math.round((cut.start + cut.length) * scale)
  } else {
    y1 = y2 = Math.round(cut.position * scale)
    x1 = Math.round(cut.start * scale)
    x2 = Math.round((cut.start + cut.length) * scale)
  }
  ```

  **Acceptance**: Dashed lines with numbered badges visible on canvas. Lines correctly span the sub-panel region.

- [ ] 8. **Add collapsible "Cut sequence" list in `ResultsPanel.tsx`**
  **What**: Below each `<SheetCanvas>`, inside the same `island-shell` card, add a collapsible section showing the ordered cut list.
  **Files**: `src/components/optimizer/ResultsPanel.tsx`
  **Implementation**: Use a `<details>` / `<summary>` HTML element (no extra deps) with Tailwind styling. Inside the sheet `.map()` (line 146–171), after `<SheetCanvas>`, add:
  ```tsx
  {sheetResult.cuts && sheetResult.cuts.length > 0 && (
    <details className="mt-3 border-t border-[var(--line)] pt-3">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--sea-ink)] select-none">
        Cut sequence ({sheetResult.cuts.length} cut{sheetResult.cuts.length !== 1 ? 's' : ''})
      </summary>
      <ol className="mt-2 space-y-1 pl-5 text-sm text-[var(--sea-ink-soft)] list-decimal">
        {sheetResult.cuts.map((cut) => (
          <li key={cut.step}>
            {cut.axis === 'y' ? 'Horizontal' : 'Vertical'} cut at{' '}
            {cut.axis === 'y' ? 'y' : 'x'}={cut.position}mm ({cut.length}mm long)
          </li>
        ))}
      </ol>
    </details>
  )}
  ```
  Place this right after the `<SheetCanvas ... />` component (line 170) and before the closing `</div>` of the island-shell card (line 171).

  **Acceptance**: Collapsible section visible, collapsed by default. Shows each cut with axis, position, and length. Only renders when `cuts.length > 0`.

- [ ] 9. **Add unit tests for `deriveCutSequence()`**
  **What**: Add a new `describe` block in the test file covering the cut sequence derivation.
  **Files**: `src/lib/__tests__/cutOptimizer.test.ts`
  **Test cases**:

  ```ts
  import { deriveCutSequence } from '../cutOptimizer'
  import type { CutLine } from '../cutOptimizer'
  ```

  **9a. Empty placements → empty cuts**:
  ```ts
  it('returns empty array for zero placements', () => {
    expect(deriveCutSequence([], 2440, 1220, 3)).toEqual([])
  })
  ```

  **9b. Single placement → no cuts needed**:
  ```ts
  it('returns empty array for a single placement', () => {
    const placements: Placement[] = [
      { partDefId: 'a', label: 'A', x: 0, y: 0, w: 1000, h: 500, rotated: false }
    ]
    expect(deriveCutSequence(placements, 2440, 1220, 0)).toEqual([])
  })
  ```

  **9c. Two parts side by side → one vertical cut**:
  ```ts
  it('produces one vertical cut for two parts side by side', () => {
    const placements: Placement[] = [
      { partDefId: 'a', label: 'A', x: 0, y: 0, w: 500, h: 1000, rotated: false },
      { partDefId: 'b', label: 'B', x: 500, y: 0, w: 500, h: 1000, rotated: false },
    ]
    const cuts = deriveCutSequence(placements, 1000, 1000, 0)
    expect(cuts).toHaveLength(1)
    expect(cuts[0].axis).toBe('x')
    expect(cuts[0].position).toBe(500)
    expect(cuts[0].step).toBe(1)
    expect(cuts[0].length).toBe(1000)
  })
  ```

  **9d. Two parts stacked → one horizontal cut**:
  ```ts
  it('produces one horizontal cut for two parts stacked vertically', () => {
    const placements: Placement[] = [
      { partDefId: 'a', label: 'A', x: 0, y: 0, w: 1000, h: 400, rotated: false },
      { partDefId: 'b', label: 'B', x: 0, y: 400, w: 1000, h: 600, rotated: false },
    ]
    const cuts = deriveCutSequence(placements, 1000, 1000, 0)
    expect(cuts).toHaveLength(1)
    expect(cuts[0].axis).toBe('y')
    expect(cuts[0].position).toBe(400)
    expect(cuts[0].step).toBe(1)
    expect(cuts[0].length).toBe(1000)
  })
  ```

  **9e. Four parts in grid → three cuts, shorter first**:
  ```ts
  it('produces three cuts for a 2x2 grid, preferring shorter cuts first', () => {
    // 1000x1000 sheet, four 500x500 parts
    const placements: Placement[] = [
      { partDefId: 'a', label: 'A', x: 0, y: 0, w: 500, h: 500, rotated: false },
      { partDefId: 'b', label: 'B', x: 500, y: 0, w: 500, h: 500, rotated: false },
      { partDefId: 'c', label: 'C', x: 0, y: 500, w: 500, h: 500, rotated: false },
      { partDefId: 'd', label: 'D', x: 500, y: 500, w: 500, h: 500, rotated: false },
    ]
    const cuts = deriveCutSequence(placements, 1000, 1000, 0)
    expect(cuts).toHaveLength(3)
    // Steps are sequential
    expect(cuts.map(c => c.step)).toEqual([1, 2, 3])
  })
  ```

  **9f. Cuts with kerf**:
  ```ts
  it('accounts for kerf when determining cut positions', () => {
    const placements: Placement[] = [
      { partDefId: 'a', label: 'A', x: 0, y: 0, w: 500, h: 1000, rotated: false },
      { partDefId: 'b', label: 'B', x: 503, y: 0, w: 497, h: 1000, rotated: false },
    ]
    const cuts = deriveCutSequence(placements, 1000, 1000, 3)
    expect(cuts).toHaveLength(1)
    expect(cuts[0].position).toBe(500)
    expect(cuts[0].axis).toBe('x')
  })
  ```

  **9g. Integration test: `optimizeCutList` returns cuts**:
  ```ts
  it('optimizeCutList populates cuts on each sheet result', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Panel', 1200, 600, 2)]
    const result = optimizeCutList(sheets, parts, 3)
    for (const sheet of result.sheets) {
      expect(Array.isArray(sheet.cuts)).toBe(true)
      // Two parts → at least 1 cut
      expect(sheet.cuts.length).toBeGreaterThanOrEqual(1)
      // Steps are 1-indexed and sequential
      sheet.cuts.forEach((cut, i) => {
        expect(cut.step).toBe(i + 1)
        expect(cut.length).toBeGreaterThan(0)
      })
    }
  })
  ```

  **Acceptance**: `npm run test` passes with all new tests green.

- [ ] 10. **Verify no regressions**
  **What**: Run the full test suite and build to ensure nothing is broken.
  **Files**: N/A (verification step)
  **Acceptance**:
  - `npm run test` — all tests pass
  - `npm run build` — clean build with no errors
  - Manual check: run `npm run dev`, load the app, click Calculate, see cut lines on canvas and cut sequence list below each sheet

---

## Implementation Order

```
TODO 1 (CutLine type) ──┐
                         ├── TODO 2 (extend SheetResult) ──┐
TODO 5 (strip affinity)  │                                  │
TODO 6 (strip split)     │                                  │
                         │                                  │
                         └── TODO 3 (deriveCutSequence) ────┤
                                                            │
                                                            ├── TODO 4 (wire into optimizeCutList)
                                                            │
                                                            ├── TODO 7 (canvas rendering)
                                                            │
                                                            ├── TODO 8 (ResultsPanel list)
                                                            │
                                                            └── TODO 9 (tests)
                                                                    │
                                                                    └── TODO 10 (verify)
```

**Recommended execution order**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

TODOs 5+6 (TrackSawPacker) are independent of TODOs 3+4 (cut sequence) and can be done in parallel. TODOs 7+8 (UI) can also be done in parallel once TODO 4 is complete.

## Potential Pitfalls

1. **Non-guillotine layouts**: `MaxRectsPacker` can produce placements that are NOT guillotine-decomposable (L-shaped remainders). The `deriveCutSequence()` must handle this gracefully — return partial cuts or an empty array rather than crashing. The function should log a console warning in dev mode if it can't find a valid guillotine cut but there are multiple placements remaining.

2. **Kerf handling in cut positions**: The cut position is at the part's right/bottom edge. The kerf gap is *between* the part edge and the next part. The `deriveCutSequence()` function should use `placement.x + placement.w` as the cut position (where the blade starts), consistent with how the packer places parts with `effectiveW = partW + kerf`.

3. **Canvas scaling precision**: Cut lines must use the same `scale` factor as placements. Use `Math.round()` consistently to avoid sub-pixel blurriness on non-Retina screens.

4. **Badge collision**: When cuts are close together, their step badges may overlap. V1 can accept this — badge overlap is cosmetic and not worth solving in the first iteration.

5. **TrackSawPacker test stability**: The `tracksaw grouping` test (line 466) asserts exact coordinates. Changes to scoring or split logic may alter placement order. Run this test after every TrackSawPacker change to catch regressions early.

## Verification
- [ ] `npm run test` — all existing + new tests pass
- [ ] `npm run build` — zero TypeScript errors
- [ ] No regressions in existing 4-algorithm test suite
- [ ] Canvas shows dashed cut lines with step badges (manual visual check)
- [ ] Cut sequence list appears below canvas, collapsed by default (manual check)
- [ ] TrackSawPacker produces strip-aligned layouts for parts with matching dimensions
