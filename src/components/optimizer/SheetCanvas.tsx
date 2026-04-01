import { useRef, useEffect, useState } from 'react'
import type { SheetResult } from '#/lib/cutOptimizer'

interface SheetCanvasProps {
  sheetResult: SheetResult
  colorMap: Map<string, string>
  containerWidth: number
}

// Parse a hex color into [r, g, b] components
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff]
}

// Luminance-based contrast check
function textColorForBg(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  const luminance = (r * 299 + g * 587 + b * 114) / 1000
  return luminance > 150 ? '#222222' : '#f5f5f5'
}

// Slightly darken a hex color for borders
function darken(hex: string, amount = 0.2): string {
  const [r, g, b] = hexToRgb(hex)
  const d = 1 - amount
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * d)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function getIsDark(): boolean {
  const dataTheme = document.documentElement.dataset['theme']
  if (dataTheme === 'dark') return true
  if (dataTheme === 'light') return false
  // 'auto' or not set — follow system preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export default function SheetCanvas({
  sheetResult,
  colorMap,
  containerWidth,
}: SheetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { sheetDef, placements } = sheetResult
  const [isDark, setIsDark] = useState(getIsDark)

  // Observe theme attribute changes so canvas redraws on toggle
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(getIsDark())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sheetW = sheetDef.width
    const sheetH = sheetDef.height

    const maxCanvasW = Math.max(300, containerWidth - 4)
    const maxCanvasH = 600

    const scale = Math.min(maxCanvasW / sheetW, maxCanvasH / sheetH)
    const cssW = Math.round(sheetW * scale)
    const cssH = Math.round(sheetH * scale)

    const dpr = window.devicePixelRatio || 1
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`

    ctx.scale(dpr, dpr)

    // Sheet background
    ctx.fillStyle = isDark ? '#1e2a2e' : '#faf5ec'
    ctx.fillRect(0, 0, cssW, cssH)

    // Sheet border
    ctx.strokeStyle = isDark ? 'rgba(141,229,219,0.25)' : 'rgba(23,58,64,0.2)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, cssW - 1, cssH - 1)

    // Draw placements
    for (const placement of placements) {
      const color = colorMap.get(placement.partDefId) ?? '#D4A373'
      const px = Math.round(placement.x * scale)
      const py = Math.round(placement.y * scale)
      const pw = Math.round(placement.w * scale)
      const ph = Math.round(placement.h * scale)

      // Fill
      ctx.fillStyle = color
      ctx.fillRect(px, py, pw, ph)

      // Border
      ctx.strokeStyle = darken(color, 0.25)
      ctx.lineWidth = 1
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1)

      // Label
      const textColor = textColorForBg(color)
      ctx.fillStyle = textColor

      const line1 = placement.label
      const line2 = `${placement.w}×${placement.h}`

      // Find max font size that fits
      let fontSize = 12
      const minFontSize = 7
      const paddingX = 6
      const paddingY = 4

      while (fontSize >= minFontSize) {
        ctx.font = `600 ${fontSize}px Manrope, system-ui, sans-serif`
        const line1W = ctx.measureText(line1).width
        const line2W = ctx.measureText(line2).width
        const neededW = Math.max(line1W, line2W) + paddingX * 2
        const neededH = fontSize * 2 + paddingY * 3

        if (neededW <= pw && neededH <= ph) break
        fontSize -= 1
      }

      if (fontSize >= minFontSize) {
        ctx.font = `600 ${fontSize}px Manrope, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        const cx = px + pw / 2
        const line2H = fontSize + paddingY

        // Check if there's room for two lines
        const totalH = fontSize * 2 + paddingY * 3
        if (totalH <= ph - paddingY * 2) {
          ctx.fillText(line1, cx, py + ph / 2 - line2H / 2, pw - paddingX * 2)
          ctx.fillText(line2, cx, py + ph / 2 + line2H / 2, pw - paddingX * 2)
        } else {
          ctx.fillText(line1, cx, py + ph / 2, pw - paddingX * 2)
        }
      }
    }

    // Sheet dimension labels
    const dimFontSize = Math.max(9, Math.min(11, Math.round(scale * 40)))
    ctx.font = `500 ${dimFontSize}px Manrope, system-ui, sans-serif`
    ctx.fillStyle = isDark ? 'rgba(175,205,200,0.7)' : 'rgba(23,58,64,0.5)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`${sheetW}mm`, cssW / 2, 4)

    ctx.save()
    ctx.translate(4, cssH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textBaseline = 'top'
    ctx.fillText(`${sheetH}mm`, 0, 0)
    ctx.restore()

    // ── Draw cut sequence ──────────────────────────────────────────────────────
    const cuts = sheetResult.cuts ?? []
    if (cuts.length > 0) {
      const cutColor = isDark ? 'rgba(255,120,120,0.85)' : 'rgba(220,50,50,0.75)'
      const badgeFill = isDark ? '#1e2a2e' : '#ffffff'
      const badgeText = isDark ? '#ff9999' : '#cc2222'
      const badgeRadius = Math.max(8, Math.min(12, Math.round(scale * 30)))
      const badgeFontSize = Math.max(7, Math.min(10, badgeRadius - 1))

      ctx.save()
      for (const cut of cuts) {
        let x1: number, y1: number, x2: number, y2: number
        if (cut.axis === 'x') {
          // Vertical cut line
          x1 = x2 = Math.round(cut.position * scale)
          y1 = Math.round(cut.start * scale)
          y2 = Math.round((cut.start + cut.length) * scale)
        } else {
          // Horizontal cut line
          y1 = y2 = Math.round(cut.position * scale)
          x1 = Math.round(cut.start * scale)
          x2 = Math.round((cut.start + cut.length) * scale)
        }

        // Dashed cut line
        ctx.beginPath()
        ctx.setLineDash([6, 4])
        ctx.strokeStyle = cutColor
        ctx.lineWidth = 1.5
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        ctx.setLineDash([])

        // Step badge at midpoint
        const mx = (x1 + x2) / 2
        const my = (y1 + y2) / 2

        ctx.beginPath()
        ctx.arc(mx, my, badgeRadius, 0, Math.PI * 2)
        ctx.fillStyle = badgeFill
        ctx.fill()
        ctx.strokeStyle = cutColor
        ctx.lineWidth = 1.5
        ctx.stroke()

        ctx.fillStyle = badgeText
        ctx.font = `700 ${badgeFontSize}px Manrope, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(cut.step), mx, my)
      }
      ctx.restore()
    }
  }, [sheetResult, colorMap, containerWidth, sheetDef, isDark])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Cut diagram for Sheet ${sheetResult.index}: ${sheetDef.label}`}
      className="block rounded-lg"
    />
  )
}
