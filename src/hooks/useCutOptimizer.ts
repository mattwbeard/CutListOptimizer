import { useReducer, useCallback } from 'react'
import {
  createSheetDef,
  createPartDef,
  optimizeCutList,
  validateInputs,
} from '#/lib/cutOptimizer'
import type { SheetDef, PartDef, OptimizeResult, AlgorithmId } from '#/lib/cutOptimizer'

// ─── State ────────────────────────────────────────────────────────────────────

export interface OptimizerState {
  sheetDefs: SheetDef[]
  partDefs: PartDef[]
  kerf: number
  algorithm: AlgorithmId
  results: OptimizeResult | null
  errors: string[]
}

const initialState: OptimizerState = {
  sheetDefs: [createSheetDef('', 2440, 1220)],
  partDefs: [],
  kerf: 3,
  algorithm: 'guillotine',
  results: null,
  errors: [],
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type OptimizerAction =
  | { type: 'ADD_SHEET' }
  | { type: 'UPDATE_SHEET'; id: string; field: keyof SheetDef; value: string | number }
  | { type: 'REMOVE_SHEET'; id: string }
  | { type: 'ADD_PART' }
  | { type: 'UPDATE_PART'; id: string; field: keyof PartDef; value: string | number }
  | { type: 'REMOVE_PART'; id: string }
  | { type: 'SET_KERF'; kerf: number }
  | { type: 'SET_ALGORITHM'; algorithm: AlgorithmId }
  | { type: 'SET_RESULTS'; results: OptimizeResult }
  | { type: 'SET_ERRORS'; errors: string[] }
  | { type: 'CLEAR_RESULTS' }
  | { type: 'LOAD_EXAMPLE' }
  | { type: 'IMPORT_PARTS'; parts: PartDef[] }

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: OptimizerState, action: OptimizerAction): OptimizerState {
  switch (action.type) {
    case 'ADD_SHEET': {
      return {
        ...state,
        sheetDefs: [...state.sheetDefs, createSheetDef('', 2440, 1220)],
        results: null,
        errors: [],
      }
    }

    case 'UPDATE_SHEET': {
      return {
        ...state,
        sheetDefs: state.sheetDefs.map((s) =>
          s.id === action.id ? { ...s, [action.field]: action.value } : s,
        ),
        results: null,
        errors: [],
      }
    }

    case 'REMOVE_SHEET': {
      // Guard: don't remove the last sheet
      if (state.sheetDefs.length <= 1) return state
      return {
        ...state,
        sheetDefs: state.sheetDefs.filter((s) => s.id !== action.id),
        results: null,
        errors: [],
      }
    }

    case 'ADD_PART': {
      return {
        ...state,
        partDefs: [...state.partDefs, createPartDef('', 0, 0, 1)],
        results: null,
        errors: [],
      }
    }

    case 'UPDATE_PART': {
      return {
        ...state,
        partDefs: state.partDefs.map((p) =>
          p.id === action.id ? { ...p, [action.field]: action.value } : p,
        ),
        results: null,
        errors: [],
      }
    }

    case 'REMOVE_PART': {
      return {
        ...state,
        partDefs: state.partDefs.filter((p) => p.id !== action.id),
        results: null,
        errors: [],
      }
    }

    case 'SET_KERF': {
      return { ...state, kerf: action.kerf, results: null, errors: [] }
    }

    case 'SET_ALGORITHM': {
      return { ...state, algorithm: action.algorithm, results: null, errors: [] }
    }

    case 'SET_RESULTS': {
      return { ...state, results: action.results, errors: [] }
    }

    case 'SET_ERRORS': {
      return { ...state, errors: action.errors, results: null }
    }

    case 'CLEAR_RESULTS': {
      return { ...state, results: null, errors: [] }
    }

    case 'LOAD_EXAMPLE': {
      return {
        ...state,
        sheetDefs: [createSheetDef('Plywood 4×8', 2440, 1220)],
        partDefs: [
          createPartDef('Side Panel', 800, 600, 2),
          createPartDef('Top', 1200, 600, 1),
          createPartDef('Shelf', 1150, 400, 3),
          createPartDef('Back', 1200, 800, 1),
          createPartDef('Drawer Front', 500, 200, 4),
        ],
        kerf: 3,
        results: null,
        errors: [],
      }
    }

    case 'IMPORT_PARTS': {
      return {
        ...state,
        partDefs: [...state.partDefs, ...action.parts],
        results: null,
        errors: [],
      }
    }

    default:
      return state
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCutOptimizer() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const addSheet = useCallback(() => dispatch({ type: 'ADD_SHEET' }), [])

  const updateSheet = useCallback(
    (id: string, field: keyof SheetDef, value: string | number) =>
      dispatch({ type: 'UPDATE_SHEET', id, field, value }),
    [],
  )

  const removeSheet = useCallback(
    (id: string) => dispatch({ type: 'REMOVE_SHEET', id }),
    [],
  )

  const addPart = useCallback(() => dispatch({ type: 'ADD_PART' }), [])

  const updatePart = useCallback(
    (id: string, field: keyof PartDef, value: string | number) =>
      dispatch({ type: 'UPDATE_PART', id, field, value }),
    [],
  )

  const removePart = useCallback(
    (id: string) => dispatch({ type: 'REMOVE_PART', id }),
    [],
  )

  const setKerf = useCallback(
    (kerf: number) => dispatch({ type: 'SET_KERF', kerf }),
    [],
  )

  const calculate = useCallback(() => {
    const { valid, errors } = validateInputs(
      state.sheetDefs,
      state.partDefs,
      state.kerf,
    )
    if (!valid) {
      dispatch({ type: 'SET_ERRORS', errors })
      return
    }
    const results = optimizeCutList(state.sheetDefs, state.partDefs, state.kerf, state.algorithm)
    dispatch({ type: 'SET_RESULTS', results })
  }, [state.sheetDefs, state.partDefs, state.kerf, state.algorithm])

  const loadExample = useCallback(() => dispatch({ type: 'LOAD_EXAMPLE' }), [])

  const clearResults = useCallback(() => dispatch({ type: 'CLEAR_RESULTS' }), [])

  const importParts = useCallback(
    (parts: PartDef[]) => dispatch({ type: 'IMPORT_PARTS', parts }),
    [],
  )

  const setAlgorithm = useCallback(
    (algorithm: AlgorithmId) => dispatch({ type: 'SET_ALGORITHM', algorithm }),
    [],
  )

  return {
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
    clearResults,
    importParts,
  }
}
