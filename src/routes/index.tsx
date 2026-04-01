import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { Calculator, Lightbulb } from 'lucide-react'
import { useCutOptimizer } from '#/hooks/useCutOptimizer'
import SheetInputs from '#/components/optimizer/SheetInputs'
import PartsInputs from '#/components/optimizer/PartsInputs'
import KerfInput from '#/components/optimizer/KerfInput'
import AlgorithmSelector from '#/components/optimizer/AlgorithmSelector'
import ResultsPanel from '#/components/optimizer/ResultsPanel'

export const Route = createFileRoute('/')({ component: OptimizerPage })

function OptimizerPage() {
  const {
    state,
    addSheet,
    updateSheet,
    removeSheet,
    addPart,
    updatePart,
    removePart,
    setKerf,
    setAlgorithm,
    calculate,
    loadExample,
    importParts,
  } = useCutOptimizer()

  const [isCalculating, setIsCalculating] = useState(false)
  const resultsRef = useRef<HTMLElement>(null)

  function handleCalculate() {
    setIsCalculating(true)
    // Let the UI update before the (synchronous) algorithm runs
    setTimeout(() => {
      calculate()
      setIsCalculating(false)
      // Scroll to results on mobile
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }, 0)
  }

  return (
    <main className="page-wrap px-4 pb-12 pt-6">
      {/* Page title */}
      <div className="mb-6 text-center">
        <p className="island-kicker mb-2">Woodworking Tool</p>
        <h1 className="display-title mb-2 text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
          Cut List Optimizer
        </h1>
        <p className="text-sm text-[var(--sea-ink-soft)]">
          Minimize waste — enter your sheet sizes, parts, and kerf, then calculate.
        </p>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Input panel */}
        <aside className="island-shell w-full shrink-0 rounded-2xl p-5 lg:w-[460px]">
          <div className="flex flex-col gap-0">
            <SheetInputs
              sheetDefs={state.sheetDefs}
              onUpdate={updateSheet}
              onRemove={removeSheet}
              onAdd={addSheet}
            />

            <KerfInput kerf={state.kerf} onChange={setKerf} />

            <AlgorithmSelector value={state.algorithm} onChange={setAlgorithm} />

            <PartsInputs
              partDefs={state.partDefs}
              onUpdate={updatePart}
              onRemove={removePart}
              onAdd={addPart}
              onImport={importParts}
            />

            {/* Action buttons */}
            <div className="mt-2 flex flex-col gap-2">
              <button
                onClick={handleCalculate}
                disabled={isCalculating}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--lagoon)] px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-[var(--lagoon-deep)] disabled:cursor-wait disabled:opacity-70"
              >
                <Calculator size={16} aria-hidden="true" />
                {isCalculating ? 'Calculating…' : 'Calculate'}
              </button>

              <button
                onClick={loadExample}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
              >
                <Lightbulb size={15} aria-hidden="true" />
                Load Example
              </button>
            </div>
          </div>
        </aside>

        {/* Output panel */}
        <section ref={resultsRef} className="min-w-0 flex-1" aria-live="polite">
          <ResultsPanel
            results={state.results}
            partDefs={state.partDefs}
            errors={state.errors}
          />
        </section>
      </div>
    </main>
  )
}
