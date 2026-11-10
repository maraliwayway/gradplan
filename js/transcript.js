// Pulls courses out of transcript text.
//
// It first looks for rows shaped like most registrar transcripts:
//   CMPT 310  Intro Artificial Intelligence  3.00  3.00  A-  11.01  B+  128
// If none are found it falls back to any line that starts with a course code.

import { STOP_SUBJECTS } from "./course-code.js"

const SEASONS = { WINTER: "Winter", SPRING: "Spring", SUMMER: "Summer", FALL: "Fall", AUTUMN: "Fall" }
const NOT_EARNED = new Set(["F", "N", "NC", "W", "WD", "WE", "FD", "AU", "U", "INC", "DE"])
const GRADE = "(?:[A-D][+-]?|F|P|S|U|CR|NC|WD|WE|FD|W|N|AU|INC|DE)"
const SEASON_WORD = "(?:winter|spring|summer|fall|autumn)"
const TERM_LINE = new RegExp(`^\\s*(?:(\\d{4})\\s+(${SEASON_WORD})|(${SEASON_WORD})\\s+(?:term\\s+|semester\\s+)?(\\d{4}))\\b`, "i")
const ROW = new RegExp(`^\\s*([A-Z]{2,5})\\s+(\\d{3,4}[A-Z]?)\\s+(.*?)\\s+(\\d{1,2}\\.\\d{1,2})\\s+(\\d{1,2}\\.\\d{1,2})\\s+(?:(${GRADE})\\s+)?(\\d{1,3}\\.\\d{1,2})(?:\\s|$)`)
const LOOSE_ROW = /^\s*([A-Z]{2,5})\s?-?(\d{3,4}[A-Z]?)\b(.*)$/

function strict(line) {
  const row = line.match(ROW)
  if (!row || STOP_SUBJECTS.has(row[1])) return null
  return { code: `${row[1]} ${row[2]}`, title: row[3].replace(/\s+/g, " ").trim(), units: parseFloat(row[4]), grade: row[6] || null }
}

function loose(line) {
  const row = line.match(LOOSE_ROW)
  if (!row || STOP_SUBJECTS.has(row[1])) return null
  const rest = row[3] || ""
  const unitsMatch = rest.match(/(?<![\w.])(\d{1,2}(?:\.\d{1,2})?)(?![\w.])/)
  const units = unitsMatch && parseFloat(unitsMatch[1]) <= 12 ? parseFloat(unitsMatch[1]) : null
  const title = unitsMatch ? rest.slice(0, unitsMatch.index) : rest
  const after = unitsMatch ? rest.slice(unitsMatch.index + unitsMatch[0].length) : ""
  const grade = (after.match(new RegExp(`(?:^|\\s)(${GRADE})(?=\\s|$)`)) || [])[1] || null
  return { code: `${row[1]} ${row[2]}`, title: title.replace(/\s+/g, " ").trim(), units, grade }
}

function collect(lines, read) {
  const entries = []
  const skipped = []
  let season = null
  let year = null
  for (const line of lines) {
    const term = line.match(TERM_LINE)
    if (term) {
      season = SEASONS[(term[2] || term[3]).toUpperCase()]
      year = parseInt(term[1] || term[4], 10)
      continue
    }
    const entry = read(line)
    if (!entry) continue
    entry.season = season
    entry.year = year
    if (entry.grade && NOT_EARNED.has(entry.grade)) {
      skipped.push(entry)
    } else {
      entry.status = entry.grade ? "completed" : "in_progress"
      entries.push(entry)
    }
  }
  return { entries, skipped }
}

export function parseTranscript(text) {
  const lines = String(text ?? "").split(/\r?\n/)
  const strictResult = collect(lines, strict)
  return strictResult.entries.length ? strictResult : collect(lines, loose)
}
