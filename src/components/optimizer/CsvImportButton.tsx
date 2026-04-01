import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { createPartDef } from '#/lib/cutOptimizer'
import type { PartDef } from '#/lib/cutOptimizer'

interface CsvImportButtonProps {
  onImport: (parts: PartDef[]) => void
}

// Parse a CSV string into PartDef[].
// Accepted column order: length, width  (and optionally: qty, label)
// A header row is detected if the first cell is non-numeric.
// Returns { parts, error } — error is non-null if the file is unparseable.
function parseCsv(text: string): { parts: PartDef[]; error: string | null } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) {
    return { parts: [], error: 'The file is empty.' }
  }

  // Detect header: first cell of first row is not a number
  const firstCells = lines[0].split(',')
  const hasHeader = isNaN(parseFloat(firstCells[0].trim()))
  const dataLines = hasHeader ? lines.slice(1) : lines

  if (dataLines.length === 0) {
    return { parts: [], error: 'No data rows found after the header.' }
  }

  const parts: PartDef[] = []
  const rowErrors: string[] = []

  for (let i = 0; i < dataLines.length; i++) {
    const cols = dataLines[i].split(',').map((c) => c.trim())
    const rowNum = hasHeader ? i + 2 : i + 1

    const length = parseFloat(cols[0] ?? '')
    const width = parseFloat(cols[1] ?? '')

    if (isNaN(length) || isNaN(width) || length <= 0 || width <= 0) {
      rowErrors.push(`Row ${rowNum}: invalid length/width values.`)
      continue
    }

    const qty = cols[2] !== undefined && cols[2] !== '' ? parseInt(cols[2], 10) : 1
    const label = cols[3] !== undefined ? cols[3] : ''

    parts.push(createPartDef(label, length, width, isNaN(qty) || qty < 1 ? 1 : qty))
  }

  if (parts.length === 0 && rowErrors.length > 0) {
    return { parts: [], error: rowErrors[0] }
  }

  return { parts, error: null }
}

export default function CsvImportButton({ onImport }: CsvImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input so same file can be re-imported
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result
      if (typeof text !== 'string') return
      const { parts, error } = parseCsv(text)
      if (error) {
        setError(error)
        return
      }
      setError(null)
      onImport(parts)
    }
    reader.readAsText(file)
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={() => {
          setError(null)
          inputRef.current?.click()
        }}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-transparent px-3 py-1.5 text-sm font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
        title="Import parts from CSV (columns: length, width, qty?, label?)"
      >
        <Upload size={14} aria-hidden="true" />
        Import CSV
      </button>
      {error && (
        <p className="mt-1.5 text-xs text-[var(--color-error)]" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
