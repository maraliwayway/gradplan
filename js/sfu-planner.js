// Reads an SFU Computing Science major graduation planner (the two-page PDF from
// sfu.ca/computing) into the course lists gradplan needs. It uses where each piece
// of text sits on the first page: Table I columns, Table III, lower division courses
// and upper division writing.

import { scan } from "./course-code.js"

const RIGHT_COLUMN = /REQUIRED WQB|UPPER DIVISION WRITING|CREDENTIAL|TABLE III|UPPER DIVISION ELECTIVES/i
const DESIGNATION = /\b(B-SCI|B-SOC|B-HUM)\b/i
const TAG_NAMES = { "B-SCI": "B-Sci", "B-SOC": "B-Soc", "B-HUM": "B-Hum" }

const titleCase = (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()

export class PlannerError extends Error {}

export function parsePlanner(pages) {
  const items = (pages[0] || []).filter((item) => item.str && item.str.trim())
  const find = (pattern) => items.find((item) => pattern.test(item.str))

  const title = pages.flat().find((item) => /COMPUTING SCIENCE MAJOR/i.test(item.str || ""))
  if (!title) throw new PlannerError("This file does not look like an SFU Computing Science major planner.")
  const term = title.str.match(/(FALL|SPRING|SUMMER)\s+(\d{4})/i)
  const catalog = term ? `${titleCase(term[1])} ${term[2]}` : "Unknown catalog"

  const tableOne = find(/TABLE I:/i)
  const tableThree = find(/TABLE III/i)
  const lowerHead = find(/COMPUTING SCIENCE \(\d/i)
  const bottom = find(/CO-OP EDUCATION/i) || find(/OPTIONAL REQUIREMENTS/i) || { y: 0 }
  const writingHead = find(/UPPER DIVISION WRITING/i)
  const credentialHead = find(/CREDENTIAL/i)
  const electivesHead = find(/UPPER DIVISION ELECTIVES/i) || { y: 0 }
  if (!tableOne || !tableThree || !lowerHead) {
    throw new PlannerError("Could not find Table I, Table III and the lower division courses in this planner.")
  }
  const rightX = Math.min(...items.filter((item) => RIGHT_COLUMN.test(item.str)).map((item) => item.x)) - 15

  const coded = items
    .map((item) => ({ ...item, codes: scan(item.str) }))
    .filter((item) => item.codes.length)

  // Table I: course codes below its heading and left of the right-hand column, grouped by x.
  const tableCodes = coded
    .filter((item) => item.y < tableOne.y && item.y > bottom.y && item.x < rightX)
    .sort((a, b) => a.x - b.x)
  const columns = []
  for (const item of tableCodes) {
    const last = columns.at(-1)
    if (last && item.x - last.x < 40) last.items.push(item)
    else columns.push({ x: item.x, items: [item], words: [] })
  }
  if (columns.length < 4) throw new PlannerError("Could not read the concentration columns in Table I.")

  const firstRowY = Math.max(...tableCodes.map((item) => item.y))
  const headerWords = items.filter((item) => item.y < tableOne.y && item.y > firstRowY + 5 && item.x < rightX && !scan(item.str).length)
  for (const word of headerWords) {
    const nearest = columns.reduce((best, col) => (Math.abs(col.x - word.x) < Math.abs(best.x - word.x) ? col : best))
    nearest.words.push(word)
  }

  const parsedColumns = columns.map((col, index) => ({
    name: col.words
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((w) => w.str.trim())
      .join(" ")
      .replace(/&/g, "and")
      .replace(/\s+/g, " ")
      .trim() || `Column ${index + 1}`,
    codes: [...new Set(col.items.sort((a, b) => b.y - a.y).flatMap((item) => item.codes))]
  }))
  const requiredBreadth = [...new Set(tableCodes.filter((item) => item.str.includes("‡")).flatMap((item) => item.codes))]

  const tableThreeCodes = coded
    .filter((item) => item.x >= rightX && item.y < tableThree.y && item.y > electivesHead.y)
    .flatMap((item) => item.codes)

  const lowerItems = coded
    .filter((item) => item.y < lowerHead.y && item.y > tableOne.y && item.x < rightX)
    .sort((a, b) => Math.round(a.x / 20) - Math.round(b.x / 20) || b.y - a.y)
  const required = []
  const choices = []
  const tags = {}
  for (const item of lowerItems) {
    if (item.codes.length > 1) choices.push(item.codes)
    else required.push(item.codes[0])
    const designation = item.str.match(DESIGNATION)
    if (designation) item.codes.forEach((code) => { tags[code] = [TAG_NAMES[designation[1].toUpperCase()]] })
  }
  if (!required.length) throw new PlannerError("Could not read the lower division courses in this planner.")

  const writing = writingHead
    ? coded.filter((item) => item.x >= rightX && item.y < writingHead.y && item.y > (credentialHead?.y ?? 0)).flatMap((item) => item.codes)
    : []

  return {
    catalog,
    source: "upload",
    lowerDivision: { required: [...new Set(required)], choices },
    writing: [...new Set(writing)],
    columns: parsedColumns,
    requiredBreadth,
    tableThree: [...new Set(tableThreeCodes)],
    tags
  }
}
