import { Trash2, Plus } from 'lucide-react'
import type { SheetDef } from '#/lib/cutOptimizer'

interface SheetInputsProps {
  sheetDefs: SheetDef[]
  onUpdate: (id: string, field: keyof SheetDef, value: string | number) => void
  onRemove: (id: string) => void
  onAdd: () => void
}

export default function SheetInputs({
  sheetDefs,
  onUpdate,
  onRemove,
  onAdd,
}: SheetInputsProps) {
  return (
    <div className="optimizer-section">
      <p className="island-kicker mb-3">Sheet Sizes</p>

      <div className="space-y-2">
        {sheetDefs.map((sheet) => (
          <div key={sheet.id} className="optimizer-input-row">
            <input
              type="number"
              value={sheet.width || ''}
              onChange={(e) =>
                onUpdate(sheet.id, 'width', parseFloat(e.target.value) || 0)
              }
              min={1}
              placeholder="W"
              aria-label={`Width for sheet ${sheet.label || sheet.id}`}
              className="optimizer-input w-20"
            />
            <span className="text-xs text-[var(--sea-ink-soft)]">×</span>
            <input
              type="number"
              value={sheet.height || ''}
              onChange={(e) =>
                onUpdate(sheet.id, 'height', parseFloat(e.target.value) || 0)
              }
              min={1}
              placeholder="H"
              aria-label={`Height for sheet ${sheet.label || sheet.id}`}
              className="optimizer-input w-20"
            />
            <span className="shrink-0 text-xs text-[var(--sea-ink-soft)]">mm</span>
            <input
              type="text"
              value={sheet.label}
              onChange={(e) => onUpdate(sheet.id, 'label', e.target.value)}
              placeholder="Label"
              aria-label={`Label for sheet ${sheet.id}`}
              className="optimizer-input min-w-0 flex-1"
            />
            <button
              onClick={() => onRemove(sheet.id)}
              disabled={sheetDefs.length <= 1}
              aria-label={`Remove sheet ${sheet.label || sheet.id}`}
              className="shrink-0 rounded-lg p-1.5 text-[var(--sea-ink-soft)] transition hover:bg-[color-mix(in_oklab,var(--ctp-red)_12%,transparent)] hover:text-[var(--ctp-red)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={onAdd}
        className="mt-3 flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-transparent px-3 py-1.5 text-sm font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
      >
        <Plus size={14} aria-hidden="true" />
        Add Sheet Size
      </button>
    </div>
  )
}
