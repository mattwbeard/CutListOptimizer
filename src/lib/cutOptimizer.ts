// ─── Types ────────────────────────────────────────────────────────────────────

export interface SheetDef {
  id: string
  label: string
  width: number
  height: number
}

export interface PartDef {
  id: string
  label: string
  width: number
  height: number
  qty: number
}

export interface Placement {
  partDefId: string
  label: string
  x: number
  y: number
  w: number
  h: number
  rotated: boolean
}

export interface CutLine {
  axis: 'x' | 'y'  // 'x' = vertical cut (at x=position), 'y' = horizontal cut (at y=position)
  position: number  // coordinate of the cut in mm
  step: number      // 1-based cut order
  length: number    // span of the sub-panel being cut (mm)
  start: number     // perpendicular-axis offset where cut begins (mm)
}

export interface SheetResult {
  sheetDef: SheetDef
  index: number
  placements: Placement[]
  wastePercent: number
  cuts: CutLine[]
}

export type AlgorithmId = 'guillotine' | 'maxrects' | 'shelf' | 'tracksaw'

export const ALGORITHMS: Record<AlgorithmId, { label: string; description: string }> = {
  guillotine: {
    label: 'Guillotine',
    description: 'Guillotine cuts with BSSF + LLA — fast, good all-round choice',
  },
  maxrects: {
    label: 'MaxRects',
    description: 'Maximal free rectangles with BSSF — best packing density',
  },
  shelf: {
    label: 'Shelf',
    description: 'Row-based stacking — fastest, most predictable layout',
  },
  tracksaw: {
    label: 'Track Saw',
    description: 'Strip-based packing — minimizes track saw resets and total cuts',
  },
}

export interface OptimizeResult {
  sheets: SheetResult[]
  unfittable: Array<{ label: string; w: number; h: number }>
  algorithm: AlgorithmId
}

interface FreeRect {
  x: number
  y: number
  w: number
  h: number
}

// ─── Factory Functions ─────────────────────────────────────────────────────────

export function createSheetDef(
  label: string,
  width: number,
  height: number,
): SheetDef {
  return { id: crypto.randomUUID(), label, width, height }
}

export function createPartDef(
  label: string,
  width: number,
  height: number,
  qty: number,
): PartDef {
  return { id: crypto.randomUUID(), label, width, height, qty }
}

// ─── Guillotine Packer ────────────────────────────────────────────────────────

class GuillotinePacker {
  private freeRects: FreeRect[]
  private _usedArea = 0
  private kerf: number
  readonly width: number
  readonly height: number

  constructor(width: number, height: number, kerf: number) {
    this.width = width
    this.height = height
    this.kerf = kerf
    this.freeRects = [{ x: 0, y: 0, w: width, h: height }]
  }

  usedArea(): number {
    return this._usedArea
  }

  tryPlace(
    partW: number,
    partH: number,
  ): { x: number; y: number; w: number; h: number; rotated: boolean } | null {
    const effectiveW = partW + this.kerf
    const effectiveH = partH + this.kerf
    const effectiveWr = partH + this.kerf // rotated
    const effectiveHr = partW + this.kerf // rotated

    let bestScore = Infinity
    let bestRect: FreeRect | null = null
    let bestRotated = false

    for (const rect of this.freeRects) {
      // Normal orientation
      if (rect.w >= effectiveW && rect.h >= effectiveH) {
        const score = Math.min(rect.w - effectiveW, rect.h - effectiveH)
        if (score < bestScore) {
          bestScore = score
          bestRect = rect
          bestRotated = false
        }
      }
      // Rotated orientation (only if different dimensions)
      if (partW !== partH && rect.w >= effectiveWr && rect.h >= effectiveHr) {
        const score = Math.min(rect.w - effectiveWr, rect.h - effectiveHr)
        if (score < bestScore) {
          bestScore = score
          bestRect = rect
          bestRotated = true
        }
      }
    }

    if (!bestRect) return null

    const placedW = bestRotated ? partH : partW
    const placedH = bestRotated ? partW : partH
    const placedEffW = placedW + this.kerf
    const placedEffH = placedH + this.kerf

    const result = {
      x: bestRect.x,
      y: bestRect.y,
      w: placedW,
      h: placedH,
      rotated: bestRotated,
    }

    this.guillotineSplit(bestRect, placedEffW, placedEffH)
    this._usedArea += placedW * placedH

    return result
  }

  private guillotineSplit(
    freeRect: FreeRect,
    placedW: number,
    placedH: number,
  ): void {
    // Remove the used rect
    const idx = this.freeRects.indexOf(freeRect)
    if (idx !== -1) this.freeRects.splice(idx, 1)

    const remainW = freeRect.w - placedW
    const remainH = freeRect.h - placedH

    // Longer Leftover Axis (LLA) split rule:
    // If the leftover width is longer, split horizontally so the wide bottom strip is preserved.
    // This keeps larger contiguous free rectangles available for subsequent placements.
    const splitHorizontal = remainW > remainH

    if (splitHorizontal) {
      // Right rect: beside the placed piece, same height
      if (remainW > this.kerf && placedH > this.kerf) {
        this.freeRects.push({
          x: freeRect.x + placedW,
          y: freeRect.y,
          w: remainW,
          h: placedH,
        })
      }
      // Bottom rect: full width, below placed piece
      if (freeRect.w > this.kerf && remainH > this.kerf) {
        this.freeRects.push({
          x: freeRect.x,
          y: freeRect.y + placedH,
          w: freeRect.w,
          h: remainH,
        })
      }
    } else {
      // Vertical split
      // Right rect: full height, beside placed piece
      if (remainW > this.kerf && freeRect.h > this.kerf) {
        this.freeRects.push({
          x: freeRect.x + placedW,
          y: freeRect.y,
          w: remainW,
          h: freeRect.h,
        })
      }
      // Bottom rect: same width as placed, below placed piece
      if (placedW > this.kerf && remainH > this.kerf) {
        this.freeRects.push({
          x: freeRect.x,
          y: freeRect.y + placedH,
          w: placedW,
          h: remainH,
        })
      }
    }
  }
}

// ─── MaxRects Packer ──────────────────────────────────────────────────────────
// Best Short Side Fit (BSSF) scoring with maximal free rectangle splitting and pruning.
// BSSF outperforms Best Area Fit on typical woodworking cut lists.

class MaxRectsPacker {
  private freeRects: FreeRect[]
  private _usedArea = 0
  private kerf: number
  readonly width: number
  readonly height: number

  constructor(width: number, height: number, kerf: number) {
    this.width = width
    this.height = height
    this.kerf = kerf
    this.freeRects = [{ x: 0, y: 0, w: width, h: height }]
  }

  usedArea(): number {
    return this._usedArea
  }

  tryPlace(
    partW: number,
    partH: number,
  ): { x: number; y: number; w: number; h: number; rotated: boolean } | null {
    const effectiveW = partW + this.kerf
    const effectiveH = partH + this.kerf
    const effectiveWr = partH + this.kerf
    const effectiveHr = partW + this.kerf

    let bestScore = Infinity
    let bestRect: FreeRect | null = null
    let bestRotated = false

    for (const rect of this.freeRects) {
      // Normal — BSSF: minimise the shorter leftover side
      if (rect.w >= effectiveW && rect.h >= effectiveH) {
        const score = Math.min(rect.w - effectiveW, rect.h - effectiveH)
        if (score < bestScore) {
          bestScore = score
          bestRect = rect
          bestRotated = false
        }
      }
      // Rotated
      if (partW !== partH && rect.w >= effectiveWr && rect.h >= effectiveHr) {
        const score = Math.min(rect.w - effectiveWr, rect.h - effectiveHr)
        if (score < bestScore) {
          bestScore = score
          bestRect = rect
          bestRotated = true
        }
      }
    }

    if (!bestRect) return null

    const placedW = bestRotated ? partH : partW
    const placedH = bestRotated ? partW : partH
    const placedEffW = placedW + this.kerf
    const placedEffH = placedH + this.kerf
    const px = bestRect.x
    const py = bestRect.y

    const result = { x: px, y: py, w: placedW, h: placedH, rotated: bestRotated }
    this._usedArea += placedW * placedH

    // Split all intersecting free rects
    const newFreeRects: FreeRect[] = []
    for (const rect of this.freeRects) {
      if (this.intersects(rect, px, py, placedEffW, placedEffH)) {
        this.splitRect(rect, px, py, placedEffW, placedEffH, newFreeRects)
      } else {
        newFreeRects.push(rect)
      }
    }

    // Prune contained rectangles
    this.freeRects = this.pruneContained(newFreeRects)

    return result
  }

  private intersects(
    rect: FreeRect,
    px: number,
    py: number,
    pw: number,
    ph: number,
  ): boolean {
    return (
      rect.x < px + pw &&
      rect.x + rect.w > px &&
      rect.y < py + ph &&
      rect.y + rect.h > py
    )
  }

  private splitRect(
    rect: FreeRect,
    px: number,
    py: number,
    pw: number,
    ph: number,
    out: FreeRect[],
  ): void {
    // Left strip
    if (rect.x < px && rect.x + rect.w > rect.x) {
      const rw = px - rect.x
      if (rw > 0) out.push({ x: rect.x, y: rect.y, w: rw, h: rect.h })
    }
    // Right strip
    if (rect.x + rect.w > px + pw) {
      const rx = px + pw
      const rw = rect.x + rect.w - rx
      if (rw > 0) out.push({ x: rx, y: rect.y, w: rw, h: rect.h })
    }
    // Top strip
    if (rect.y < py && rect.y + rect.h > rect.y) {
      const rh = py - rect.y
      if (rh > 0) out.push({ x: rect.x, y: rect.y, w: rect.w, h: rh })
    }
    // Bottom strip
    if (rect.y + rect.h > py + ph) {
      const ry = py + ph
      const rh = rect.y + rect.h - ry
      if (rh > 0) out.push({ x: rect.x, y: ry, w: rect.w, h: rh })
    }
  }

  private pruneContained(rects: FreeRect[]): FreeRect[] {
    return rects.filter((a, i) => {
      for (let j = 0; j < rects.length; j++) {
        if (i === j) continue
        const b = rects[j]
        if (
          b.x <= a.x &&
          b.y <= a.y &&
          b.x + b.w >= a.x + a.w &&
          b.y + b.h >= a.y + a.h
        ) {
          return false
        }
      }
      return true
    })
  }
}

// ─── Shelf Packer ─────────────────────────────────────────────────────────────
// Row-based (shelf) packing — Next Fit Decreasing Height.
// Parts should be pre-sorted by height descending before calling tryPlace.

class ShelfPacker {
  private shelves: Array<{ y: number; h: number; usedW: number }>
  private _usedArea = 0
  private kerf: number
  readonly width: number
  readonly height: number

  constructor(width: number, height: number, kerf: number) {
    this.width = width
    this.height = height
    this.kerf = kerf
    this.shelves = []
  }

  usedArea(): number {
    return this._usedArea
  }

  tryPlace(
    partW: number,
    partH: number,
  ): { x: number; y: number; w: number; h: number; rotated: boolean } | null {
    const effectiveW = partW + this.kerf
    const effectiveH = partH + this.kerf
    const effectiveWr = partH + this.kerf
    const effectiveHr = partW + this.kerf

    // Helper: try placing (eW × eH) into existing shelves or a new shelf
    const tryOrientation = (
      eW: number,
      eH: number,
      rotated: boolean,
      pw: number,
      ph: number,
    ): { x: number; y: number; w: number; h: number; rotated: boolean } | null => {
      if (eW > this.width) return null

      // Try existing shelves
      for (const shelf of this.shelves) {
        const remainW = this.width - shelf.usedW
        if (eW <= remainW && eH <= shelf.h) {
          const x = shelf.usedW
          const y = shelf.y
          shelf.usedW += eW
          this._usedArea += pw * ph
          return { x, y, w: pw, h: ph, rotated }
        }
      }

      // Open a new shelf
      const nextY =
        this.shelves.length === 0
          ? 0
          : this.shelves[this.shelves.length - 1].y +
            this.shelves[this.shelves.length - 1].h

      if (nextY + eH > this.height) return null // No vertical space

      this.shelves.push({ y: nextY, h: eH, usedW: eW })
      this._usedArea += pw * ph
      return { x: 0, y: nextY, w: pw, h: ph, rotated }
    }

    // Try normal orientation first, then rotated
    const normal = tryOrientation(effectiveW, effectiveH, false, partW, partH)
    if (normal) return normal

    if (partW !== partH) {
      const rotated = tryOrientation(effectiveWr, effectiveHr, true, partH, partW)
      if (rotated) return rotated
    }

    return null
  }
}

// ─── Expanded Part ───────────────────────────────────────────────────────────

interface ExpandedPart {
  partDefId: string
  label: string
  w: number
  h: number
  area: number
}

// ─── Track Saw Packer ─────────────────────────────────────────────────────────
// Column-first hybrid: groups parts into VERTICAL strips (columns), packs each
// column top-to-bottom, stacks columns left-to-right.
//
// This mirrors how a track saw operator minimises track travel:
//   1. Make full-height RIP cuts (track travels the SHORT dimension = sheetH)
//      to separate the sheet into vertical columns.
//   2. Cross-cut within each column (track travels the column width).
//
// Column assignment uses First-Fit Decreasing (FFD) by part height:
//   - Sort parts by height descending.
//   - For each part, try both orientations and pick the one that fits the
//     shallowest open column (minimises wasted height).
//   - If no existing column fits, open a new one (width = part's narrower dim,
//     so the rip cut is as short as possible).

// Return both valid orientations for a part, sorted widest-first.
// Widest-first means existing-column fits try the column-filling orientation
// before narrower rotations.  New-column opening uses a separate width-aware
// helper (see pickNewColOrient) so we never blow the sheet budget.
function bothOrientations(
  p: ExpandedPart,
  sheetH: number,
): Array<{ w: number; h: number; rotated: boolean }> {
  const opts: Array<{ w: number; h: number; rotated: boolean }> = []
  if (p.h <= sheetH) opts.push({ w: p.w, h: p.h, rotated: false })
  if (p.w !== p.h && p.w <= sheetH) opts.push({ w: p.h, h: p.w, rotated: true })
  if (opts.length === 0) opts.push({ w: p.w, h: p.h, rotated: false }) // oversized fallback
  opts.sort((a, b) => b.w - a.w)
  return opts
}

// Pick the orientation to use when opening a brand-new column.
// Strategy: use the widest orientation that still leaves the sheet wide enough
// to also fit the tallest remaining part in a future column.  If no orientation
// fits within the remaining budget at all, fall back to the narrowest one that
// fits sheetH (the column will overflow and its parts will carry over).
function pickNewColOrient(
  _p: ExpandedPart,
  orientations: Array<{ w: number; h: number; rotated: boolean }>,
  remainingW: number,  // sheetW - curUsedW (space left for this and future columns)
  sheetH: number,
): { w: number; h: number; rotated: boolean } {
  // Prefer widest orientation whose width fits the remaining budget
  const fits = orientations.filter((o) => o.w <= remainingW && o.h <= sheetH)
  if (fits.length > 0) return fits[0]  // already sorted widest-first
  // Nothing fits the budget — use narrowest valid height (will overflow later)
  return orientations.find((o) => o.h <= sheetH) ?? orientations[0]
}

interface OpenCol {
  colW: number    // locked column width (width of first/widest part placed)
  usedH: number   // height consumed so far (including kerf gaps)
  entries: Array<{ part: ExpandedPart; w: number; h: number; rotated: boolean }>
}

// Full sheet planner for track saw: returns placements for one sheet and a list
// of parts that didn't fit (to carry over to the next sheet).
//
// Algorithm:
//   1. Sort parts by area descending so large parts anchor columns first.
//   2. For each part, find the best existing open column where it fits:
//        - Try both orientations; prefer widest orientation first (fills column
//          width), break ties by least remaining height (best-fit).
//   3. If no column fits, open a new column.  The orientation is chosen to be
//        the widest one that still fits within the remaining sheet width budget,
//        so the algorithm avoids committing to a column so wide that later parts
//        (e.g. 700mm T/B panels) have no room and must rotate unnecessarily.
//   4. Place columns left-to-right widest-first; any column that still overflows
//        the sheet has its parts sent to overflow for the next sheet.
function planTrackSawSheet(
  parts: ExpandedPart[],
  sheetW: number,
  sheetH: number,
  kerf: number,
): { placements: Placement[]; overflow: ExpandedPart[]; usedArea: number } {
  if (parts.length === 0) return { placements: [], overflow: [], usedArea: 0 }

  // Sort by area descending so the largest parts open columns first
  const sorted = [...parts].sort((a, b) => b.area - a.area)

  const openCols: OpenCol[] = []
  // Track committed column width so new-column budget is accurate
  let committedW = 0

  for (const part of sorted) {
    const orientations = bothOrientations(part, sheetH)

    // ── Try to fit into an existing column ──────────────────────────────────
    // Scoring: primary — maximise width utilisation (widest orientation wins,
    // so a 600mm part fills a 600mm column rather than rotating to 300mm);
    // secondary — minimise remaining height (best-fit among equal-width fits).
    let bestCol: OpenCol | null = null
    let bestOrient: { w: number; h: number; rotated: boolean } | null = null
    let bestWidthScore = -1
    let bestRemaining = Infinity

    for (const col of openCols) {
      for (const orient of orientations) {
        if (orient.w > col.colW) continue
        const needed = col.usedH + orient.h + kerf
        if (needed > sheetH + kerf) continue
        const remaining = sheetH - needed
        if (
          orient.w > bestWidthScore ||
          (orient.w === bestWidthScore && remaining < bestRemaining)
        ) {
          bestWidthScore = orient.w
          bestRemaining = remaining
          bestCol = col
          bestOrient = orient
        }
      }
    }

    if (bestCol && bestOrient) {
      bestCol.entries.push({ part, ...bestOrient })
      bestCol.usedH += bestOrient.h + kerf
    } else {
      // ── Open a new column ────────────────────────────────────────────────
      // Budget = remaining sheet width minus kerf gaps for any future columns.
      // We use the full remaining width here; pickNewColOrient will choose the
      // widest orientation that actually fits.
      const remainingW = sheetW - committedW
      const orient = pickNewColOrient(part, orientations, remainingW, sheetH)
      openCols.push({
        colW: orient.w,
        usedH: orient.h + kerf,
        entries: [{ part, ...orient }],
      })
      committedW += orient.w + kerf
    }
  }

  // ── Place columns left-to-right, widest-first ────────────────────────────
  const placements: Placement[] = []
  const usedParts = new Set<ExpandedPart>()
  let curX = 0

  openCols.sort((a, b) => b.colW - a.colW)

  for (const col of openCols) {
    const colEffW = col.colW + kerf
    if (curX + colEffW > sheetW + kerf) continue  // overflow — skip whole column

    col.entries.sort((a, b) => b.h - a.h)

    let curY = 0
    for (const { part, w, h, rotated } of col.entries) {
      placements.push({
        partDefId: part.partDefId,
        label: part.label,
        x: curX,
        y: curY,
        w,
        h,
        rotated,
      })
      usedParts.add(part)
      curY += h + kerf
    }

    curX += colEffW
  }

  const overflow = parts.filter((p) => !usedParts.has(p))
  const usedArea = placements.reduce((s, p) => s + p.w * p.h, 0)

  return { placements, overflow, usedArea }
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateInputs(
  sheetDefs: SheetDef[],
  partDefs: PartDef[],
  kerf: number,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (sheetDefs.length === 0) {
    errors.push('Add at least one sheet size.')
  } else {
    for (const s of sheetDefs) {
      if (s.width <= 0 || s.height <= 0) {
        errors.push(
          `Sheet "${s.label}" has invalid dimensions (must be > 0).`,
        )
      }
    }
  }

  if (partDefs.length === 0) {
    errors.push('Add at least one part.')
  } else {
    for (const p of partDefs) {
      if (p.width <= 0 || p.height <= 0) {
        errors.push(
          `Part "${p.label}" has invalid dimensions (must be > 0).`,
        )
      }
      if (p.qty < 1) {
        errors.push(`Part "${p.label}" quantity must be at least 1.`)
      }
    }
  }

  if (kerf < 0) {
    errors.push('Kerf must be 0 or greater.')
  }

  // Warn about parts that are definitely too large for any sheet
  for (const p of partDefs) {
    if (p.width <= 0 || p.height <= 0) continue
    const fitsAny = sheetDefs.some(
      (s) =>
        (p.width + kerf <= s.width && p.height + kerf <= s.height) ||
        (p.height + kerf <= s.width && p.width + kerf <= s.height),
    )
    if (!fitsAny) {
      errors.push(
        `Part "${p.label}" (${p.width}×${p.height}mm) is larger than all sheet sizes.`,
      )
    }
  }

  return { valid: errors.length === 0, errors }
}

// ─── Cut Sequence Derivation ──────────────────────────────────────────────────
// Derives an ordered list of guillotine cut lines from the placements on a sheet.
// Prefers shorter cuts first (fewer mm of travel per cut).

export function deriveCutSequence(
  placements: Placement[],
  sheetWidth: number,
  sheetHeight: number,
  kerf: number,
): CutLine[] {
  if (placements.length <= 1) return []

  const step = { current: 1 }
  const bounds = { x: 0, y: 0, w: sheetWidth, h: sheetHeight }
  return decompose(placements, bounds, step, kerf)
}

interface Bounds { x: number; y: number; w: number; h: number }

function decompose(
  rects: Placement[],
  bounds: Bounds,
  step: { current: number },
  kerf: number,
): CutLine[] {
  if (rects.length <= 1) return []

  // Collect candidate cut positions for both axes
  const candidates: Array<{ axis: 'x' | 'y'; pos: number; length: number; start: number }> = []

  // Vertical candidates (axis='x'): right edge of each part
  const xPositions = [...new Set(rects.map((p) => p.x + p.w))]
  for (const pos of xPositions) {
    if (pos <= bounds.x || pos >= bounds.x + bounds.w) continue
    // Valid if every rect lies fully left of pos OR fully right of pos+kerf
    const valid = rects.every(
      (p) => p.x + p.w <= pos || p.x >= pos + kerf,
    )
    if (valid) {
      candidates.push({ axis: 'x', pos, length: bounds.h, start: bounds.y })
    }
  }

  // Horizontal candidates (axis='y'): bottom edge of each part
  const yPositions = [...new Set(rects.map((p) => p.y + p.h))]
  for (const pos of yPositions) {
    if (pos <= bounds.y || pos >= bounds.y + bounds.h) continue
    const valid = rects.every(
      (p) => p.y + p.h <= pos || p.y >= pos + kerf,
    )
    if (valid) {
      candidates.push({ axis: 'y', pos, length: bounds.w, start: bounds.x })
    }
  }

  if (candidates.length === 0) return [] // Non-guillotine layout — graceful degradation

  // Pick best: shortest cut first; tiebreak: axis='y' (horizontal) then lower position
  candidates.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length
    if (a.axis !== b.axis) return a.axis === 'y' ? -1 : 1
    return a.pos - b.pos
  })

  const best = candidates[0]
  const cut: CutLine = {
    axis: best.axis,
    position: best.pos,
    step: step.current++,
    length: best.length,
    start: best.start,
  }

  // Partition and recurse
  let leftRects: Placement[]
  let rightRects: Placement[]
  let leftBounds: Bounds
  let rightBounds: Bounds

  if (best.axis === 'x') {
    leftRects = rects.filter((p) => p.x + p.w <= best.pos)
    rightRects = rects.filter((p) => p.x >= best.pos + kerf)
    leftBounds = { x: bounds.x, y: bounds.y, w: best.pos - bounds.x, h: bounds.h }
    rightBounds = { x: best.pos + kerf, y: bounds.y, w: bounds.x + bounds.w - best.pos - kerf, h: bounds.h }
  } else {
    leftRects = rects.filter((p) => p.y + p.h <= best.pos)
    rightRects = rects.filter((p) => p.y >= best.pos + kerf)
    leftBounds = { x: bounds.x, y: bounds.y, w: bounds.w, h: best.pos - bounds.y }
    rightBounds = { x: bounds.x, y: best.pos + kerf, w: bounds.w, h: bounds.y + bounds.h - best.pos - kerf }
  }

  return [
    cut,
    ...decompose(leftRects, leftBounds, step, kerf),
    ...decompose(rightRects, rightBounds, step, kerf),
  ]
}

// ─── Main Optimizer ───────────────────────────────────────────────────────────

interface OpenSheet {
  sheetDef: SheetDef
  index: number
  packer: GuillotinePacker | MaxRectsPacker | ShelfPacker
  placements: Placement[]
}

export function optimizeCutList(
  sheetDefs: SheetDef[],
  partDefs: PartDef[],
  kerf: number,
  algorithm: AlgorithmId = 'guillotine',
): OptimizeResult {
  // Step 1: Expand parts by quantity
  const expanded: ExpandedPart[] = []
  for (const part of partDefs) {
    for (let i = 0; i < part.qty; i++) {
      expanded.push({
        partDefId: part.id,
        label: part.label,
        w: part.width,
        h: part.height,
        area: part.width * part.height,
      })
    }
  }

  // Step 2: Sort parts by area descending (strip planner handles ordering internally)
  expanded.sort((a, b) => b.area - a.area)

  const unfittable: Array<{ label: string; w: number; h: number }> = []
  let sheetCount = 0
  let resultSheets: SheetResult[]

  if (algorithm === 'tracksaw') {
    // ── Track Saw path ────────────────────────────────────────────────────────
    // The strip planner needs to see ALL parts at once to plan strips globally,
    // so we collect everything, run planTrackSawSheet, carry overflow to the
    // next sheet, and repeat until nothing is left.

    // Separate out parts that can't fit any sheet at all
    const fittable: ExpandedPart[] = []
    for (const part of expanded) {
      const fits = sheetDefs.some(
        (s) =>
          (part.w + kerf <= s.width && part.h + kerf <= s.height) ||
          (part.h + kerf <= s.width && part.w + kerf <= s.height),
      )
      if (fits) {
        fittable.push(part)
      } else {
        unfittable.push({ label: part.label, w: part.w, h: part.h })
      }
    }

    const tsSheets: SheetResult[] = []
    let remaining = fittable

    while (remaining.length > 0) {
      // Pick the first sheetDef that can fit at least the largest remaining part
      const largest = remaining[0]
      const sheetDef = sheetDefs.find(
        (s) =>
          (largest.w + kerf <= s.width && largest.h + kerf <= s.height) ||
          (largest.h + kerf <= s.width && largest.w + kerf <= s.height),
      )
      if (!sheetDef) {
        // Largest part doesn't fit any sheet — mark unfittable and remove
        unfittable.push({ label: largest.label, w: largest.w, h: largest.h })
        remaining = remaining.slice(1)
        continue
      }

      const { placements, overflow } = planTrackSawSheet(
        remaining,
        sheetDef.width,
        sheetDef.height,
        kerf,
      )

      if (placements.length === 0) {
        // Guard: strip planner placed nothing (shouldn't happen) — eject largest
        unfittable.push({ label: largest.label, w: largest.w, h: largest.h })
        remaining = remaining.slice(1)
        continue
      }

      const usedArea = placements.reduce((s, p) => s + p.w * p.h, 0)
      const totalArea = sheetDef.width * sheetDef.height
      const wastePercent =
        totalArea > 0
          ? Math.round(((totalArea - usedArea) / totalArea) * 1000) / 10
          : 0

      tsSheets.push({
        sheetDef,
        index: ++sheetCount,
        placements,
        wastePercent,
        cuts: deriveCutSequence(placements, sheetDef.width, sheetDef.height, kerf),
      })

      remaining = overflow
    }

    resultSheets = tsSheets
  } else {
    // ── Standard path (guillotine / maxrects / shelf) ─────────────────────────
    const openSheets: OpenSheet[] = []

    for (const part of expanded) {
      let placed = false

      // Try existing open sheets
      for (const sheet of openSheets) {
        const result = sheet.packer.tryPlace(part.w, part.h)
        if (result) {
          sheet.placements.push({
            partDefId: part.partDefId,
            label: part.label,
            x: result.x,
            y: result.y,
            w: result.w,
            h: result.h,
            rotated: result.rotated,
          })
          placed = true
          break
        }
      }

      if (!placed) {
        // Open a new sheet — pick first sheetDef that fits the part
        const fittingDef = sheetDefs.find(
          (s) =>
            (part.w + kerf <= s.width && part.h + kerf <= s.height) ||
            (part.h + kerf <= s.width && part.w + kerf <= s.height),
        )

        if (fittingDef) {
          const packer =
            algorithm === 'maxrects'
              ? new MaxRectsPacker(fittingDef.width, fittingDef.height, kerf)
              : algorithm === 'shelf'
                ? new ShelfPacker(fittingDef.width, fittingDef.height, kerf)
                : new GuillotinePacker(fittingDef.width, fittingDef.height, kerf)
          const result = packer.tryPlace(part.w, part.h)
          if (result) {
            const newSheet: OpenSheet = {
              sheetDef: fittingDef,
              index: ++sheetCount,
              packer,
              placements: [
                {
                  partDefId: part.partDefId,
                  label: part.label,
                  x: result.x,
                  y: result.y,
                  w: result.w,
                  h: result.h,
                  rotated: result.rotated,
                },
              ],
            }
            openSheets.push(newSheet)
            placed = true
          }
        }
      }

      if (!placed) {
        unfittable.push({ label: part.label, w: part.w, h: part.h })
      }
    }

    resultSheets = openSheets.map((sheet) => {
      const totalArea = sheet.sheetDef.width * sheet.sheetDef.height
      const usedArea = sheet.packer.usedArea()
      const wastePercent =
        totalArea > 0
          ? Math.round(((totalArea - usedArea) / totalArea) * 1000) / 10
          : 0

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
    })
  }

  return { sheets: resultSheets, unfittable, algorithm }
}
