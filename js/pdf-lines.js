// Rebuilds text lines from positioned PDF text items, so table rows stay on one line.
// Rotated text, such as an "UNOFFICIAL" watermark, is dropped.

export function itemsToLines(items) {
  const flat = items
    .filter((item) => item.str && item.str.trim() && !item.rotated)
    .sort((a, b) => b.y - a.y || a.x - b.x)

  const rows = []
  for (const item of flat) {
    const tolerance = Math.max(2, (item.size || 10) * 0.4)
    const row = rows.find((r) => Math.abs(r.y - item.y) <= tolerance)
    if (row) row.items.push(item)
    else rows.push({ y: item.y, items: [item] })
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const sorted = row.items.sort((a, b) => a.x - b.x)
      let line = ""
      let end = null
      for (const item of sorted) {
        if (end !== null) {
          const gap = item.x - end
          const size = item.size || 10
          if (gap > size * 1.5) line += "   "
          else if (gap > size * 0.15) line += " "
        }
        line += item.str
        end = item.x + (item.width || 0)
      }
      return line.replace(/\s+$/, "")
    })
}

export function fromPdfItem(item) {
  const [a, b, c, d, x, y] = item.transform
  return {
    str: item.str,
    x,
    y,
    width: item.width,
    size: Math.hypot(c, d) || item.height || 10,
    rotated: Math.abs(b) > 0.01 || Math.abs(c) > 0.01 || a < 0
  }
}
