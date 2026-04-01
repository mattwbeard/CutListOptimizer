import { ALGORITHMS } from '#/lib/cutOptimizer'
import type { AlgorithmId } from '#/lib/cutOptimizer'

interface AlgorithmSelectorProps {
  value: AlgorithmId
  onChange: (algorithm: AlgorithmId) => void
}

const ALGORITHM_IDS = Object.keys(ALGORITHMS) as AlgorithmId[]

export default function AlgorithmSelector({ value, onChange }: AlgorithmSelectorProps) {
  return (
    <div className="border-t border-[var(--line)] pt-4 pb-2">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
        Algorithm
      </p>
      <div className="flex flex-col gap-1.5">
        {ALGORITHM_IDS.map((id) => {
          const algo = ALGORITHMS[id]
          const isSelected = value === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={[
                'flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                isSelected
                  ? 'border-[var(--lagoon)] bg-[var(--surface-strong)] text-[var(--sea-ink)]'
                  : 'border-[var(--line)] bg-transparent text-[var(--sea-ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]',
              ].join(' ')}
              aria-pressed={isSelected}
            >
              {/* Radio dot */}
              <span
                className={[
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition',
                  isSelected
                    ? 'border-[var(--lagoon)] bg-[var(--lagoon)]'
                    : 'border-[var(--sea-ink-soft)] bg-transparent',
                ].join(' ')}
                aria-hidden="true"
              >
                {isSelected && (
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </span>

              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-semibold leading-tight">
                  {algo.label}
                </span>
                <span className="text-xs leading-snug opacity-70">
                  {algo.description}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
