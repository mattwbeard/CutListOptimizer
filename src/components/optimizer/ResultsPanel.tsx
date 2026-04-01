import { useRef, useEffect, useState } from 'react'
import { AlertTriangle, LayoutGrid, AlertCircle } from 'lucide-react'
import SheetCanvas from './SheetCanvas'
import type { OptimizeResult, PartDef } from '#/lib/cutOptimizer'
import { ALGORITHMS } from '#/lib/cutOptimizer'

// 12-color warm/craft palette
const PART_COLORS = [
  '#D4A373',
  '#E9C46A',
  '#F4A261',
  '#E76F51',
  '#2A9D8F',
  '#264653',
  '#A8DADC',
  '#CDB4DB',
  '#B5838D',
  '#6D6875',
  '#FFCDB2',
  '#B7E4C7',
]

function buildColorMap(partDefs: PartDef[]): Map<string, string> {
  const map = new Map<string, string>()
  partDefs.forEach((part, index) => {
    map.set(part.id, PART_COLORS[index % PART_COLORS.length])
  })
  return map
}

interface ResultsPanelProps {
  results: OptimizeResult | null
  partDefs: PartDef[]
  errors: string[]
}

export default function ResultsPanel({
  results,
  partDefs,
  errors,
}: ResultsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(600)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setContainerWidth(entry.contentRect.width)
    })
    observer.observe(el)
    setContainerWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  // ── Error state ──────────────────────────────────────────────────────────────
  if (errors.length > 0) {
    return (
      <div
        ref={containerRef}
        data-results
        role="alert"
        className="error-box island-shell rounded-2xl p-5"
      >
        <div className="mb-3 flex items-center gap-2 text-[var(--color-error)]">
          <AlertTriangle size={18} aria-hidden="true" />
          <span className="font-semibold">Please fix the following issues:</span>
        </div>
        <ul className="space-y-1 pl-1">
          {errors.map((err, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[var(--color-error)]">
              <span className="mt-0.5 shrink-0">•</span>
              {err}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!results) {
    return (
      <div
        ref={containerRef}
        data-results
        className="island-shell flex min-h-[320px] flex-col items-center justify-center rounded-2xl p-8 text-center"
      >
        <LayoutGrid
          size={40}
          className="mb-4 text-[var(--lagoon)]"
          aria-hidden="true"
        />
        <p className="text-base font-medium text-[var(--sea-ink)]">
          Ready to optimize
        </p>
        <p className="mt-1 max-w-sm text-sm text-[var(--sea-ink-soft)]">
          Add parts and click Calculate to see your optimized cut list.
        </p>
      </div>
    )
  }

  const colorMap = buildColorMap(partDefs)
  const totalParts = results.sheets.reduce(
    (sum, s) => sum + s.placements.length,
    0,
  )
  const overallWaste =
    results.sheets.length > 0
      ? Math.round(
          (results.sheets.reduce((sum, s) => sum + s.wastePercent, 0) /
            results.sheets.length) *
            10,
        ) / 10
      : 0

  // ── Results state ────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} data-results className="space-y-6">
      {/* Unfittable warning */}
      {results.unfittable.length > 0 && (
        <div
          role="alert"
          className="warning-box island-shell rounded-2xl border-l-4 border-[var(--color-warning)] p-4"
        >
          <div className="mb-2 flex items-center gap-2 text-[var(--color-warning)]">
            <AlertCircle size={16} aria-hidden="true" />
            <span className="font-semibold text-sm">
              {results.unfittable.length} part
              {results.unfittable.length !== 1 ? 's' : ''} could not be placed
            </span>
          </div>
          <ul className="space-y-0.5 pl-1">
            {results.unfittable.map((p, i) => (
              <li key={i} className="text-sm text-[var(--sea-ink-soft)]">
                • {p.label} ({p.w}×{p.h}mm) — too large for any sheet
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sheet canvases */}
      {results.sheets.map((sheetResult) => (
        <div key={`${sheetResult.sheetDef.id}-${sheetResult.index}`} className="island-shell rounded-2xl p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="island-kicker">Sheet {sheetResult.index}</span>
            <span className="text-sm font-medium text-[var(--sea-ink)]">
              {sheetResult.sheetDef.label}
            </span>
            <span className="text-sm text-[var(--sea-ink-soft)]">
              {sheetResult.sheetDef.width}×{sheetResult.sheetDef.height}mm
            </span>
            <span
              className={`ml-auto text-sm font-semibold ${
                sheetResult.wastePercent > 50
                  ? 'text-[var(--color-warning)]'
                  : 'text-[var(--palm)]'
              }`}
            >
              {sheetResult.wastePercent}% waste
            </span>
          </div>
          <SheetCanvas
            sheetResult={sheetResult}
            colorMap={colorMap}
            containerWidth={containerWidth}
          />
          {sheetResult.cuts && sheetResult.cuts.length > 0 && (
            <details className="mt-3 border-t border-[var(--line)] pt-3">
              <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--sea-ink)] hover:text-[var(--lagoon)] transition-colors">
                Cut sequence — {sheetResult.cuts.length} cut{sheetResult.cuts.length !== 1 ? 's' : ''}
              </summary>
              <ol className="mt-2 space-y-1 pl-5 list-decimal text-sm text-[var(--sea-ink-soft)]">
                {sheetResult.cuts.map((cut) => (
                  <li key={cut.step}>
                    <span className="text-[var(--sea-ink)] font-medium">
                      {cut.axis === 'y' ? 'Horizontal' : 'Vertical'} cut
                    </span>
                    {' '}at {cut.axis === 'y' ? 'y' : 'x'}={cut.position}mm
                    {' '}— {cut.length}mm long
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      ))}

      {/* Summary table */}
      {results.sheets.length > 0 && (
        <div className="island-shell overflow-hidden rounded-2xl">
          <div className="border-b border-[var(--line)] px-5 py-3 flex items-baseline gap-3">
            <p className="island-kicker">Summary</p>
            <span className="text-xs text-[var(--sea-ink-soft)]">
              {ALGORITHMS[results.algorithm].label} algorithm
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="summary-table w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  <th className="px-4 py-2.5 text-left font-semibold text-[var(--sea-ink-soft)]">
                    Sheet
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[var(--sea-ink-soft)]">
                    Size
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold text-[var(--sea-ink-soft)]">
                    Parts
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold text-[var(--sea-ink-soft)]">
                    Waste
                  </th>
                  <th className="hidden w-32 px-4 py-2.5 sm:table-cell" />
                </tr>
              </thead>
              <tbody>
                {results.sheets.map((sheet, i) => (
                  <tr
                    key={`${sheet.sheetDef.id}-${sheet.index}`}
                    className={
                      i % 2 === 0
                        ? 'bg-[var(--surface)]'
                        : 'bg-[var(--surface-strong)]'
                    }
                  >
                    <td className="px-4 py-2.5 font-medium text-[var(--sea-ink)]">
                      {sheet.index}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--sea-ink-soft)]">
                      {sheet.sheetDef.label}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[var(--sea-ink)]">
                      {sheet.placements.length}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-[var(--sea-ink)]">
                      {sheet.wastePercent}%
                    </td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--line)]">
                        <div
                          className="waste-bar h-full rounded-full"
                          style={{ width: `${sheet.wastePercent}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--line)] font-semibold">
                  <td className="px-4 py-2.5 text-[var(--sea-ink)]">
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-[var(--sea-ink-soft)]">
                    {results.sheets.length} sheet
                    {results.sheets.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--sea-ink)]">
                    {totalParts}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--sea-ink)]">
                    {overallWaste}% avg
                  </td>
                  <td className="hidden px-4 py-2.5 sm:table-cell" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
