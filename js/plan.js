// Terms, transcript import, and the numbers shown on the plan page.

import * as CC from "./course-code.js"
import { runAudit, STATUS_RANK } from "./audit.js"
import { parseTranscript } from "./transcript.js"
import { unitsFor, tagsFor } from "./sfu.js"
import { newId } from "./util.js"

export const SEASON_ORDER = { Spring: 1, Summer: 2, Fall: 3 }
export const STATUSES = { completed: "Completed", in_progress: "In progress", planned: "Planned" }
const CELL_UNITS = 3

export const termLabel = (term) => `${term.season} ${term.year}`
export const termKey = (term) => term.year * 10 + (SEASON_ORDER[term.season] ?? 0)

export function buildTerms({ startSeason, startYear, years, summers = true }) {
  const startKey = startYear * 10 + SEASON_ORDER[startSeason]
  const span = Math.min(Math.max(years || 1, 1), 10)
  const terms = []
  for (let year = startYear; year <= startYear + span; year++) {
    for (const [season, order] of Object.entries(SEASON_ORDER)) {
      const key = year * 10 + order
      if (key < startKey || key >= startKey + span * 10) continue
      if (season === "Summer" && !summers) continue
      terms.push({ id: newId(), year, season })
    }
  }
  return terms
}

export function makeCourse(program, fields) {
  const code = CC.normalize(fields.code)
  return {
    id: newId(),
    code,
    title: fields.title || "",
    units: fields.units ?? unitsFor(program, code),
    status: fields.status || "planned",
    grade: fields.grade || "",
    tags: fields.tags ?? tagsFor(program, code),
    termId: fields.termId ?? null,
    pinnedRequirementId: null
  }
}

// Adds transcript courses to a plan. Existing rows for the same course are updated,
// so a newer transcript can be imported every term.
export function importTranscript(plan, program, text) {
  const { entries, skipped } = parseTranscript(text)
  let created = 0
  let updated = 0
  for (const entry of entries) {
    let term = null
    if (entry.year && SEASON_ORDER[entry.season]) {
      term = plan.terms.find((t) => t.year === entry.year && t.season === entry.season)
      if (!term) plan.terms.push((term = { id: newId(), year: entry.year, season: entry.season }))
    }
    const termId = term ? term.id : null
    const sameCode = plan.courses.filter((c) => c.code === entry.code)
    const existing = sameCode.find((c) => c.termId === termId) || sameCode.find((c) => c.status !== "completed")
    const fields = { termId, status: entry.status, grade: entry.grade || "", units: entry.units ?? unitsFor(program, entry.code) }
    if (entry.title) fields.title = entry.title
    if (existing) {
      Object.assign(existing, fields)
      updated++
    } else {
      plan.courses.push(makeCourse(program, { code: entry.code, ...fields }))
      created++
    }
  }
  return { created, updated, skipped: skipped.map((e) => e.code) }
}

// Sums a set of requirement results into one progress row. Each requirement only
// contributes up to its own target, so extra courses never overfill a row.
// Requirements marked detailOnly (a subset of another one, like "6 of them upper
// division") count toward the row's state but not its bar.
export function groupProgress(results) {
  const filled = { completed: 0, in_progress: 0, planned: 0 }
  let target = 0
  const summed = results.filter((r) => !r.requirement?.detailOnly)
  for (const result of summed) {
    target += result.target
    let running = 0
    for (const status of Object.keys(STATUS_RANK)) {
      const next = Math.min(running + (result.breakdown[status] || 0), result.target)
      filled[status] += next - running
      running = next
    }
  }
  const unitBased = summed.every((r) => r.unitBased)
  const done = results.every((r) => r.state === "done")
  const open = results.some((r) => r.state === "open")
  const state = done ? "done" : open ? "open" : results.some((r) => r.state === "planned") ? "planned" : "in_progress"
  return { filled, target, unitBased, state, counted: filled.completed + filled.in_progress + filled.planned }
}

export function boardFor(plan, program) {
  const terms = [...plan.terms].sort((a, b) => termKey(a) - termKey(b))
  const termsById = Object.fromEntries(terms.map((t) => [t.id, t]))
  const scheduled = plan.courses.filter((c) => c.termId && termsById[c.termId])
  const coursesIn = (termId) => plan.courses.filter((c) => c.termId === termId)
  const backlog = plan.courses.filter((c) => !c.termId || !termsById[c.termId])

  const report = runAudit({
    requirements: program.requirements,
    courses: scheduled.map((c) => ({ ...c, sortKey: termKey(termsById[c.termId]) })),
    courseSets: program.courseSets,
    selectedIds: [],
    knownCodes: plan.courses.map((c) => c.code)
  })

  const groups = program.groups
    .map((group) => {
      const results = report.results.filter((r) => r.requirement.group === group.key)
      return results.length ? { ...group, results, ...groupProgress(results) } : null
    })
    .filter(Boolean)

  const totals = Object.fromEntries(Object.keys(STATUSES).map((s) => [s, scheduled.filter((c) => c.status === s).reduce((t, c) => t + (Number(c.units) || 0), 0)]))
  const targetUnits = Number(program.requirements.find((r) => r.id === "units-total")?.amount) || 120
  const scheduledUnits = Object.values(totals).reduce((a, b) => a + b, 0)

  const lastCompleted = Math.max(0, ...scheduled.filter((c) => c.status === "completed").map((c) => termKey(termsById[c.termId])))
  let firstActive = terms.findIndex((term) => {
    const list = coursesIn(term.id)
    return list.length ? list.some((c) => c.status !== "completed") : termKey(term) > lastCompleted
  })
  if (firstActive < 0) firstActive = terms.length

  const runwayCells = []
  let cumulative = 0
  for (const status of Object.keys(STATUSES)) {
    const before = Math.round(cumulative / CELL_UNITS)
    cumulative += totals[status]
    for (let i = Math.round(cumulative / CELL_UNITS) - before; i > 0; i--) runwayCells.push(status)
  }
  const cellCount = Math.ceil(targetUnits / CELL_UNITS)
  while (runwayCells.length < cellCount) runwayCells.push("empty")
  runwayCells.length = cellCount

  const groupByRequirement = Object.fromEntries(program.requirements.map((r) => [r.id, r.group]))
  const labelByGroup = Object.fromEntries(program.groups.map((g) => [g.key, g.label]))
  const SHORT = { concentration: "Concentration", credential: "Credential", writing: "Writing", electives: "UD elective", fass: "FASS", lower: "Lower division", breadth: "Breadth", depth: "Depth" }
  const countsToward = (course) => {
    const keys = [...new Set(report.requirementIdsFor(course.id).map((id) => groupByRequirement[id]))]
    const wqb = report.requirementIdsFor(course.id).filter((id) => id.startsWith("wqb-")).map((id) => program.requirements.find((r) => r.id === id).name)
    return keys.filter((k) => !["upper", "total", "wqb"].includes(k)).map((k) => SHORT[k] || labelByGroup[k]).concat(wqb)
  }

  const finishTerm = report.complete ? scheduled.map((c) => termsById[c.termId]).sort((a, b) => termKey(b) - termKey(a))[0] : null

  return {
    terms,
    pastTerms: terms.slice(0, firstActive),
    upcomingTerms: terms.slice(firstActive),
    coursesIn,
    unitsIn: (termId) => coursesIn(termId).reduce((t, c) => t + (Number(c.units) || 0), 0),
    backlog,
    report,
    groups,
    totals,
    targetUnits,
    unitsLeft: Math.max(targetUnits - scheduledUnits, 0),
    remainingToComplete: Math.max(targetUnits - totals.completed, 0),
    runwayCells,
    countsToward,
    finishTerm,
    openCount: report.open.length
  }
}
