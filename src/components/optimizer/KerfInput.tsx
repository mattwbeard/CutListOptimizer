import { Ruler } from 'lucide-react'

interface KerfInputProps {
  kerf: number
  onChange: (kerf: number) => void
}

export default function KerfInput({ kerf, onChange }: KerfInputProps) {
  return (
    <div className="optimizer-section">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Ruler size={14} className="shrink-0 text-[var(--kicker)]" aria-hidden="true" />
          <label
            htmlFor="kerf-input"
            className="island-kicker cursor-pointer"
          >
            Blade Kerf
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="kerf-input"
            type="number"
            value={kerf}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            min={0}
            step={0.5}
            aria-label="Blade kerf in millimetres"
            className="optimizer-input w-20"
          />
          <span className="text-sm text-[var(--sea-ink-soft)]">mm</span>
        </div>
        <p className="w-full text-xs text-[var(--sea-ink-soft)] sm:w-auto">
          Thickness of the saw blade cut
        </p>
      </div>
    </div>
  )
}
