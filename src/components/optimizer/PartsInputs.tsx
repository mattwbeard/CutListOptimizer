import { Trash2, Plus } from 'lucide-react'
import type { PartDef } from '#/lib/cutOptimizer'
import CsvImportButton from './CsvImportButton'

interface PartsInputsProps {
  partDefs: PartDef[]
  onUpdate: (id: string, field: keyof PartDef, value: string | number) => void
  onRemove: (id: string) => void
  onAdd: () => void
  onImport: (parts: PartDef[]) => void
}

export default function PartsInputs({
  partDefs,
  onUpdate,
  onRemove,
  onAdd,
  onImport,
}: PartsInputsProps) {
  return (
    <div className="optimizer-section">
      <p className="island-kicker mb-3">Parts</p>

      {partDefs.length === 0 ? (
        <p className="mb-3 text-sm text-[var(--sea-ink-soft)] italic">
          Add parts to get started
        </p>
      ) : (
        <div className="space-y-2">
          {partDefs.map((part, index) => (
            <div key={part.id} className="optimizer-input-row flex-wrap">
              <input
                type="number"
                value={part.width || ''}
                onChange={(e) =>
                  onUpdate(part.id, 'width', parseFloat(e.target.value) || 0)
                }
                min={1}
                placeholder="L"
                aria-label={`Length for part ${index + 1}`}
                className="optimizer-input w-20"
              />
              <input
                type="number"
                value={part.height || ''}
                onChange={(e) =>
                  onUpdate(part.id, 'height', parseFloat(e.target.value) || 0)
                }
                min={1}
                placeholder="W"
                aria-label={`Width for part ${index + 1}`}
                className="optimizer-input w-20"
              />
              <span className="text-xs text-[var(--sea-ink-soft)]">mm</span>
              <input
                type="number"
                value={part.qty || ''}
                onChange={(e) =>
                  onUpdate(part.id, 'qty', parseInt(e.target.value, 10) || 1)
                }
                min={1}
                placeholder="Qty"
                aria-label={`Quantity for part ${index + 1}`}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    index === partDefs.length - 1
                  ) {
                    onAdd()
                  }
                }}
                className="optimizer-input w-16"
              />
              <input
                type="text"
                value={part.label}
                onChange={(e) => onUpdate(part.id, 'label', e.target.value)}
                placeholder="Label"
                aria-label={`Label for part ${index + 1}`}
                className="optimizer-input min-w-0 flex-1 basis-[100px]"
              />
              <button
                onClick={() => onRemove(part.id)}
                aria-label={`Remove part ${index + 1}`}
                className="shrink-0 rounded-lg p-1.5 text-[var(--sea-ink-soft)] transition hover:bg-[color-mix(in_oklab,var(--ctp-red)_12%,transparent)] hover:text-[var(--ctp-red)]"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-transparent px-3 py-1.5 text-sm font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
        >
          <Plus size={14} aria-hidden="true" />
          Add Part
        </button>
        <CsvImportButton onImport={onImport} />
      </div>
    </div>
  )
}
