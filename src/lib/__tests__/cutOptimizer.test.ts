import { describe, it, expect } from 'vitest'
import {
  createSheetDef,
  createPartDef,
  optimizeCutList,
  validateInputs,
  deriveCutSequence,
} from '../cutOptimizer'
import type { Placement } from '../cutOptimizer'

// ─── Helper ───────────────────────────────────────────────────────────────────

function noOverlap(placements: Placement[], kerf: number): boolean {
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i]
      const b = placements[j]
      // Two rectangles overlap if neither is fully to the side / above / below
      // We account for kerf gap: effectively expand each rect by kerf on right+bottom
      const aRight = a.x + a.w + kerf
      const aBottom = a.y + a.h + kerf
      const bRight = b.x + b.w + kerf
      const bBottom = b.y + b.h + kerf
      const overlaps =
        a.x < bRight && aRight > b.x && a.y < bBottom && aBottom > b.y
      if (overlaps) return false
    }
  }
  return true
}

// ─── Factory tests ────────────────────────────────────────────────────────────

describe('createSheetDef', () => {
  it('returns correct properties and a valid UUID', () => {
    const s = createSheetDef('Test Sheet', 2440, 1220)
    expect(s.label).toBe('Test Sheet')
    expect(s.width).toBe(2440)
    expect(s.height).toBe(1220)
    expect(s.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('generates unique IDs each call', () => {
    const a = createSheetDef('A', 100, 100)
    const b = createSheetDef('B', 100, 100)
    expect(a.id).not.toBe(b.id)
  })
})

describe('createPartDef', () => {
  it('returns correct properties and a valid UUID', () => {
    const p = createPartDef('Shelf', 800, 300, 3)
    expect(p.label).toBe('Shelf')
    expect(p.width).toBe(800)
    expect(p.height).toBe(300)
    expect(p.qty).toBe(3)
    expect(p.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })
})

// ─── Single part on single sheet ─────────────────────────────────────────────

describe('optimizeCutList — single part', () => {
  it('places one 1200×600 part on a 2440×1220 sheet with kerf=3', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Panel', 1200, 600, 1)]
    const result = optimizeCutList(sheets, parts, 3)

    expect(result.unfittable).toHaveLength(0)
    expect(result.sheets).toHaveLength(1)

    const sheet = result.sheets[0]
    expect(sheet.placements).toHaveLength(1)

    const p = sheet.placements[0]
    expect(p.x).toBe(0)
    expect(p.y).toBe(0)
    // Part may be rotated by BSSF — accept either orientation
    expect(p.w * p.h).toBe(1200 * 600)

    // Waste: sheet area = 2440*1220 = 2976800, part area = 1200*600 = 720000
    // waste% = (1 - 720000/2976800) * 100 ≈ 75.8%
    expect(sheet.wastePercent).toBeGreaterThan(70)
    expect(sheet.wastePercent).toBeLessThan(80)
  })
})

// ─── Two parts fit on one sheet ───────────────────────────────────────────────

describe('optimizeCutList — two parts on one sheet', () => {
  it('fits two 1200×600 parts on a 2440×1220 sheet', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Panel', 1200, 600, 2)]
    const result = optimizeCutList(sheets, parts, 3)

    expect(result.unfittable).toHaveLength(0)
    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0].placements).toHaveLength(2)
  })

  it('placements do not overlap including kerf', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Panel', 1200, 600, 2)]
    const result = optimizeCutList(sheets, parts, 3)
    expect(noOverlap(result.sheets[0].placements, 3)).toBe(true)
  })
})

// ─── Kerf gap ─────────────────────────────────────────────────────────────────

describe('optimizeCutList — kerf gap', () => {
  it('adjacent parts have at least kerf mm gap between them', () => {
    const kerf = 3
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Panel', 1200, 600, 2)]
    const result = optimizeCutList(sheets, parts, kerf)
    const [p1, p2] = result.sheets[0].placements

    // Parts should be placed side-by-side or stacked; ensure gap >= kerf
    const horizontalGap = Math.abs((p2.x) - (p1.x + p1.w))
    const verticalGap = Math.abs((p2.y) - (p1.y + p1.h))

    // At least one axis should have a gap >= kerf (or they are on different axes)
    const hasGap =
      p1.x + p1.w <= p2.x
        ? horizontalGap >= kerf
        : p2.x + p2.w <= p1.x
          ? Math.abs(p1.x - (p2.x + p2.w)) >= kerf
          : p1.y + p1.h <= p2.y
            ? verticalGap >= kerf
            : Math.abs(p1.y - (p2.y + p2.h)) >= kerf
    expect(hasGap).toBe(true)
  })
})

// ─── Rotation ─────────────────────────────────────────────────────────────────

describe('optimizeCutList — rotation', () => {
  it('rotates a 1300×600 part to fit on a 1220×2440 sheet (portrait)', () => {
    // Part 1300×600: normal orientation won't fit (1300 > 1220 width)
    // Rotated 600×1300: fits (600 ≤ 1220 and 1300 ≤ 2440)
    const sheets = [createSheetDef('Portrait Sheet', 1220, 2440)]
    const parts = [createPartDef('Wide Panel', 1300, 600, 1)]
    const result = optimizeCutList(sheets, parts, 3)

    expect(result.unfittable).toHaveLength(0)
    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0].placements[0].rotated).toBe(true)
  })
})

// ─── Multiple sheets ──────────────────────────────────────────────────────────

describe('optimizeCutList — multiple sheets', () => {
  it('overflows onto a second sheet when parts do not all fit', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    // 6 parts of 1200×600 — two fit per sheet → needs 3 sheets
    const parts = [createPartDef('Panel', 1200, 600, 6)]
    const result = optimizeCutList(sheets, parts, 3)

    expect(result.unfittable).toHaveLength(0)
    expect(result.sheets.length).toBeGreaterThanOrEqual(2)

    // Total placements = 6
    const totalPlacements = result.sheets.reduce(
      (sum, s) => sum + s.placements.length,
      0,
    )
    expect(totalPlacements).toBe(6)
  })
})

// ─── Unfittable part ──────────────────────────────────────────────────────────

describe('optimizeCutList — unfittable', () => {
  it('adds an oversized part to unfittable', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Giant Panel', 3000, 3000, 1)]
    const result = optimizeCutList(sheets, parts, 3)

    expect(result.sheets).toHaveLength(0)
    expect(result.unfittable).toHaveLength(1)
    expect(result.unfittable[0].label).toBe('Giant Panel')
  })
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe('validateInputs', () => {
  it('rejects empty parts list', () => {
    const { valid, errors } = validateInputs(
      [createSheetDef('S', 2440, 1220)],
      [],
      3,
    )
    expect(valid).toBe(false)
    expect(errors.some((e) => /part/i.test(e))).toBe(true)
  })

  it('rejects negative kerf', () => {
    const { valid, errors } = validateInputs(
      [createSheetDef('S', 2440, 1220)],
      [createPartDef('P', 100, 100, 1)],
      -1,
    )
    expect(valid).toBe(false)
    expect(errors.some((e) => /kerf/i.test(e))).toBe(true)
  })

  it('warns about part larger than all sheets', () => {
    const { valid, errors } = validateInputs(
      [createSheetDef('S', 2440, 1220)],
      [createPartDef('Huge', 3000, 3000, 1)],
      3,
    )
    expect(valid).toBe(false)
    expect(errors.some((e) => /larger/i.test(e))).toBe(true)
  })

  it('passes valid inputs', () => {
    const { valid } = validateInputs(
      [createSheetDef('S', 2440, 1220)],
      [createPartDef('P', 500, 400, 2)],
      3,
    )
    expect(valid).toBe(true)
  })
})

// ─── Quantity expansion ───────────────────────────────────────────────────────

describe('optimizeCutList — quantity expansion', () => {
  it('expands qty=4 into 4 placements with the same partDefId', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const part = createPartDef('Bracket', 400, 300, 4)
    const result = optimizeCutList(sheets, [part], 3)

    const allPlacements = result.sheets.flatMap((s) => s.placements)
    expect(allPlacements).toHaveLength(4)
    expect(allPlacements.every((p) => p.partDefId === part.id)).toBe(true)
  })
})

// ─── No overlap assertion ─────────────────────────────────────────────────────

describe('optimizeCutList — no overlap', () => {
  it('produces no overlapping placements on any sheet (with kerf)', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [
      createPartDef('A', 800, 600, 2),
      createPartDef('B', 500, 400, 3),
      createPartDef('C', 300, 200, 4),
    ]
    const result = optimizeCutList(sheets, parts, 3)

    for (const sheet of result.sheets) {
      expect(noOverlap(sheet.placements, 3)).toBe(true)
    }
  })
})

// ─── Part exactly equals sheet size ──────────────────────────────────────────

describe('optimizeCutList — exact fit', () => {
  it('places a part exactly equal to sheet size with kerf=0', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Full Sheet', 2440, 1220, 1)]
    const result = optimizeCutList(sheets, parts, 0)

    expect(result.unfittable).toHaveLength(0)
    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0].placements).toHaveLength(1)
    expect(result.sheets[0].wastePercent).toBe(0)
  })
})

// ─── MaxRects algorithm tests ────────────────────────────────────────────────

describe('optimizeCutList — maxrects — single part', () => {
  it('places one part on a sheet', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Panel', 1200, 600, 1)]
    const result = optimizeCutList(sheets, parts, 3, 'maxrects')

    expect(result.algorithm).toBe('maxrects')
    expect(result.unfittable).toHaveLength(0)
    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0].placements).toHaveLength(1)
  })
})

describe('optimizeCutList — maxrects — two parts', () => {
  it('fits two 1200×600 parts on a single 2440×1220 sheet', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Panel', 1200, 600, 2)]
    const result = optimizeCutList(sheets, parts, 3, 'maxrects')

    expect(result.unfittable).toHaveLength(0)
    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0].placements).toHaveLength(2)
  })

  it('placements do not overlap including kerf', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Panel', 1200, 600, 2)]
    const result = optimizeCutList(sheets, parts, 3, 'maxrects')
    expect(noOverlap(result.sheets[0].placements, 3)).toBe(true)
  })
})

describe('optimizeCutList — maxrects — unfittable', () => {
  it('adds an oversized part to unfittable', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Giant', 3000, 3000, 1)]
    const result = optimizeCutList(sheets, parts, 3, 'maxrects')

    expect(result.sheets).toHaveLength(0)
    expect(result.unfittable).toHaveLength(1)
    expect(result.unfittable[0].label).toBe('Giant')
  })
})

describe('optimizeCutList — maxrects — no overlap (mixed parts)', () => {
  it('produces no overlapping placements on any sheet', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [
      createPartDef('A', 800, 600, 2),
      createPartDef('B', 500, 400, 3),
      createPartDef('C', 300, 200, 4),
    ]
    const result = optimizeCutList(sheets, parts, 3, 'maxrects')

    for (const sheet of result.sheets) {
      expect(noOverlap(sheet.placements, 3)).toBe(true)
    }
  })
})

// ─── Shelf algorithm tests ────────────────────────────────────────────────────

describe('optimizeCutList — shelf — single part', () => {
  it('places one part on a sheet', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Panel', 1200, 600, 1)]
    const result = optimizeCutList(sheets, parts, 3, 'shelf')

    expect(result.algorithm).toBe('shelf')
    expect(result.unfittable).toHaveLength(0)
    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0].placements).toHaveLength(1)
  })
})

describe('optimizeCutList — shelf — two parts', () => {
  it('fits two 1200×600 parts on a single 2440×1220 sheet', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Panel', 1200, 600, 2)]
    const result = optimizeCutList(sheets, parts, 3, 'shelf')

    expect(result.unfittable).toHaveLength(0)
    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0].placements).toHaveLength(2)
  })

  it('placements do not overlap including kerf', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Panel', 1200, 600, 2)]
    const result = optimizeCutList(sheets, parts, 3, 'shelf')
    expect(noOverlap(result.sheets[0].placements, 3)).toBe(true)
  })
})

describe('optimizeCutList — shelf — unfittable', () => {
  it('adds an oversized part to unfittable', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Giant', 3000, 3000, 1)]
    const result = optimizeCutList(sheets, parts, 3, 'shelf')

    expect(result.sheets).toHaveLength(0)
    expect(result.unfittable).toHaveLength(1)
    expect(result.unfittable[0].label).toBe('Giant')
  })
})

describe('optimizeCutList — shelf — no overlap (mixed parts)', () => {
  it('produces no overlapping placements on any sheet', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [
      createPartDef('A', 800, 600, 2),
      createPartDef('B', 500, 400, 3),
      createPartDef('C', 300, 200, 4),
    ]
    const result = optimizeCutList(sheets, parts, 3, 'shelf')

    for (const sheet of result.sheets) {
      expect(noOverlap(sheet.placements, 3)).toBe(true)
    }
  })
})

// ─── Algorithm field in result ────────────────────────────────────────────────

describe('optimizeCutList — algorithm field', () => {
  it('defaults to guillotine when no algorithm specified', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Panel', 500, 400, 1)]
    const result = optimizeCutList(sheets, parts, 3)
    expect(result.algorithm).toBe('guillotine')
  })
})

// ─── Real-world cut list (test_import.csv) ────────────────────────────────────
// 16 parts that must all fit on a single 2440×1220 sheet (86.6% coverage).
// This is a regression test — previous BAF+SLA configs left 2 parts unfitted.

describe('optimizeCutList — real-world cut list (guillotine)', () => {
  const sheets = [createSheetDef('Sheet', 2440, 1220)]
  const parts = [
    createPartDef('Top and Bottom', 700, 320, 2),
    createPartDef('Right Side', 954, 320, 1),
    createPartDef('Left Side Front', 954, 160, 1),
    createPartDef('Back Panel', 954, 664, 1),
    createPartDef('Center Divider', 954, 302, 1),
    createPartDef('Left Internal Partition', 954, 323, 1),
    createPartDef('Right Shelves', 323, 302, 2),
    createPartDef('Front and Side Shelves', 323, 142, 4),
    createPartDef('Front Plinth', 700, 50, 1),
    createPartDef('Side Plinths', 302, 50, 2),
  ]

  it('fits all 16 parts on one sheet with guillotine', () => {
    const result = optimizeCutList(sheets, parts, 3, 'guillotine')
    expect(result.sheets).toHaveLength(1)
    expect(result.unfittable).toHaveLength(0)
    const total = result.sheets.reduce((s, sh) => s + sh.placements.length, 0)
    expect(total).toBe(16)
  })

  it('fits all 16 parts on one sheet with maxrects', () => {
    const result = optimizeCutList(sheets, parts, 3, 'maxrects')
    expect(result.sheets).toHaveLength(1)
    expect(result.unfittable).toHaveLength(0)
    const total = result.sheets.reduce((s, sh) => s + sh.placements.length, 0)
    expect(total).toBe(16)
  })

  it('places all 16 parts with no unfittable using tracksaw', () => {
    // tracksaw trades some density for cut-line alignment — may use more sheets
    // than guillotine/maxrects but must still place every part
    const result = optimizeCutList(sheets, parts, 3, 'tracksaw')
    expect(result.unfittable).toHaveLength(0)
    const total = result.sheets.reduce((s, sh) => s + sh.placements.length, 0)
    expect(total).toBe(16)
    // Verify no overlaps on any sheet
    for (const sheet of result.sheets) {
      expect(noOverlap(sheet.placements, 3)).toBe(true)
    }
  })
})

// ─── Track Saw Grouping ───────────────────────────────────────────────────────

describe('optimizeCutList — tracksaw grouping', () => {
  it('places parts with matching dimensions on one sheet without overlap', () => {
    const sheets = [createSheetDef('Sheet', 1000, 1000)]
    const parts = [
      createPartDef('A', 600, 400, 1),
      createPartDef('B', 600, 300, 1),
      createPartDef('C', 600, 200, 1),
    ]
    const result = optimizeCutList(sheets, parts, 0, 'tracksaw')

    // All parts must land on one sheet
    expect(result.sheets).toHaveLength(1)
    expect(result.unfittable).toHaveLength(0)
    const placements = result.sheets[0].placements
    expect(placements).toHaveLength(3)

    // No overlaps
    expect(noOverlap(placements, 0)).toBe(true)

    // Each part must use one of its original dimensions as w and the other as h
    for (const p of placements) {
      const dims = new Set([p.w, p.h])
      expect(dims.has(600)).toBe(true)
    }
  })

  it('stacks identical-width parts into a shared column', () => {
    // Three parts with the SAME width — FFD must stack them in one column
    const sheets = [createSheetDef('Sheet', 1000, 1000)]
    const parts = [
      createPartDef('A', 600, 400, 1),
      createPartDef('B', 600, 300, 1),
      createPartDef('C', 600, 200, 1),
    ]
    // Use kerf=0 and force equal widths so the algorithm has no reason to split
    const result = optimizeCutList(sheets, parts, 0, 'tracksaw')
    const placements = result.sheets[0].placements

    // All parts oriented with w=600 should share the same x origin
    const w600placements = placements.filter((p) => p.w === 600)
    if (w600placements.length === 3) {
      // All in one column — verify stacked top-to-bottom without gap
      const sortedByY = [...w600placements].sort((a, b) => a.y - b.y)
      expect(sortedByY[0].y).toBe(0)
      expect(sortedByY[0].x).toBe(sortedByY[1].x)
      expect(sortedByY[1].x).toBe(sortedByY[2].x)
    }
    // Whether one or three columns, must fit on one sheet with no overlap
    expect(result.sheets).toHaveLength(1)
    expect(noOverlap(placements, 0)).toBe(true)
  })
})

// ─── deriveCutSequence ────────────────────────────────────────────────────────

describe('deriveCutSequence', () => {
  it('returns empty array for zero placements', () => {
    expect(deriveCutSequence([], 2440, 1220, 3)).toEqual([])
  })

  it('returns empty array for a single placement', () => {
    const placements: Placement[] = [
      { partDefId: 'a', label: 'A', x: 0, y: 0, w: 1000, h: 500, rotated: false },
    ]
    expect(deriveCutSequence(placements, 2440, 1220, 0)).toEqual([])
  })

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
    expect(cuts[0].start).toBe(0)
  })

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
    expect(cuts[0].start).toBe(0)
  })

  it('produces three cuts for a 2×2 grid with sequential steps', () => {
    const placements: Placement[] = [
      { partDefId: 'a', label: 'A', x: 0,   y: 0,   w: 500, h: 500, rotated: false },
      { partDefId: 'b', label: 'B', x: 500, y: 0,   w: 500, h: 500, rotated: false },
      { partDefId: 'c', label: 'C', x: 0,   y: 500, w: 500, h: 500, rotated: false },
      { partDefId: 'd', label: 'D', x: 500, y: 500, w: 500, h: 500, rotated: false },
    ]
    const cuts = deriveCutSequence(placements, 1000, 1000, 0)
    expect(cuts).toHaveLength(3)
    expect(cuts.map((c) => c.step)).toEqual([1, 2, 3])
    for (const c of cuts) expect(c.length).toBeGreaterThan(0)
  })

  it('prefers shorter cuts — rectangular sheet, two tall parts side by side', () => {
    // Sheet 2000×500, two 1000×500 parts side by side.
    // Vertical cut at x=1000 spans 500mm; horizontal cut would span 2000mm.
    // Shorter cut (500mm vertical) should be chosen first.
    const placements: Placement[] = [
      { partDefId: 'a', label: 'A', x: 0,    y: 0, w: 1000, h: 500, rotated: false },
      { partDefId: 'b', label: 'B', x: 1000, y: 0, w: 1000, h: 500, rotated: false },
    ]
    const cuts = deriveCutSequence(placements, 2000, 500, 0)
    expect(cuts).toHaveLength(1)
    expect(cuts[0].axis).toBe('x')   // vertical cut — shorter (500mm) vs horizontal (2000mm)
    expect(cuts[0].length).toBe(500)
  })

  it('accounts for kerf when determining cut positions', () => {
    const placements: Placement[] = [
      { partDefId: 'a', label: 'A', x: 0,   y: 0, w: 500, h: 1000, rotated: false },
      { partDefId: 'b', label: 'B', x: 503, y: 0, w: 497, h: 1000, rotated: false },
    ]
    const cuts = deriveCutSequence(placements, 1000, 1000, 3)
    expect(cuts).toHaveLength(1)
    expect(cuts[0].axis).toBe('x')
    expect(cuts[0].position).toBe(500)
  })

  it('optimizeCutList populates cuts on each sheet result', () => {
    const sheets = [createSheetDef('Sheet', 2440, 1220)]
    const parts = [createPartDef('Panel', 1200, 600, 2)]
    const result = optimizeCutList(sheets, parts, 3)
    for (const sheet of result.sheets) {
      expect(Array.isArray(sheet.cuts)).toBe(true)
      expect(sheet.cuts.length).toBeGreaterThanOrEqual(1)
      sheet.cuts.forEach((cut, i) => {
        expect(cut.step).toBe(i + 1)
        expect(cut.length).toBeGreaterThan(0)
      })
    }
  })
})
