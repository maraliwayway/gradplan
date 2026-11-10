// Matches a student's courses against a program's requirements.
//
// Requirements are checked in position order. Requirements that share a pool never
// count the same course twice. Requirements without a pool (unit totals,
// concentrations) can reuse any course. Within a requirement, completed courses are
// used before in-progress and planned ones, and courses that fit fewer of the
// remaining requirements in the pool are used first.

import * as CC from "./course-code.js"

export const STATUS_RANK = { completed: 0, in_progress: 1, planned: 2 }
const STATES = ["done", "in_progress", "planned"]
export const MAX_OPTIONS = 8

export function fmt(value) {
  const n = Number(value) || 0
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

const plural = (count, word) => (count === 1 ? `1 ${word}` : `${count} ${word}s`)
const rank = (course) => STATUS_RANK[course.status] ?? 2
const sumUnits = (list) => list.reduce((total, c) => total + (Number(c.units) || 0), 0)

export function matchOf(req) {
  const raw = req.match || {}
  return {
    courses: [].concat(raw.courses || []).map(CC.normalize),
    patterns: [].concat(raw.patterns || []).map(String),
    tags: [].concat(raw.tags || []).map((t) => String(t).trim().toUpperCase()),
    sets: [].concat(raw.sets || []).map(String),
    min_level: parseInt(raw.min_level, 10) || 0
  }
}

function levelRuleOf(req) {
  const level = parseInt(req.level_rule?.level, 10) || 0
  const count = parseInt(req.level_rule?.count, 10) || 0
  return level > 0 && count > 0 ? { level, count } : null
}

const poolOf = (req) => (String(req.pool ?? "").trim() || null)
const amountOf = (req) => Number(req.amount) || 0

export function progressText(result) {
  const counted = fmt(result.total)
  const goal = fmt(result.target)
  return result.unitBased ? `${counted} of ${goal} units` : `${counted} of ${goal}`
}

// Width of each status segment in a progress bar, as percentages.
export function segments(result) {
  if (!(result.target > 0)) return { completed: 100, in_progress: 0, planned: 0 }
  let running = 0
  const out = {}
  for (const status of Object.keys(STATUS_RANK)) {
    const before = running
    running = Math.min(running + ((result.breakdown[status] || 0) / result.target) * 100, 100)
    out[status] = Math.round((running - before) * 100) / 100
  }
  return out
}

export function runAudit({ requirements, courses, courseSets = {}, selectedIds = [], knownCodes = null }) {
  const sets = Object.fromEntries(Object.entries(courseSets || {}).map(([name, codes]) => [name, [].concat(codes).map(CC.normalize)]))
  const known = (knownCodes ?? courses.map((c) => c.code)).map(CC.normalize)
  const ordered = [...requirements].sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
  const active = ordered.filter((req) => !req.optional || selectedIds.includes(req.id))

  const setsFor = (code, names) => names.filter((name) => (sets[name] || []).some((member) => CC.same(member, code)))

  const isEligible = (req, course) => {
    const m = matchOf(req)
    if (m.min_level > 0 && CC.number(course.code) < m.min_level) return false
    const tags = [].concat(course.tags || []).map((t) => String(t).trim().toUpperCase())
    return m.courses.some((code) => CC.same(code, course.code)) ||
      setsFor(course.code, m.sets).length > 0 ||
      m.patterns.some((pattern) => CC.matchesPattern(course.code, pattern)) ||
      (m.tags.length > 0 && tags.some((t) => m.tags.includes(t)))
  }

  const eligible = new Map(active.map((req) => [req.id, new Set(courses.filter((c) => isEligible(req, c)).map((c) => c.id))]))
  const used = new Map()
  const usedIn = (pool) => {
    if (!used.has(pool)) used.set(pool, new Set())
    return used.get(pool)
  }

  // Courses pinned to a pooled requirement are reserved before anything else.
  const activeById = new Map(active.map((req) => [req.id, req]))
  for (const course of courses) {
    const req = activeById.get(course.pinnedRequirementId)
    if (req && poolOf(req)) usedIn(poolOf(req)).add(course.id)
  }

  const chooseAll = (req, pinned, candidates) => {
    const available = [...pinned, ...[...candidates].sort((a, b) => rank(a) - rank(b))]
    const taken = new Set()
    const missing = []
    const chosen = []
    for (const code of matchOf(req).courses) {
      const course = available.find((c) => !taken.has(c.id) && CC.same(code, c.code))
      if (course) {
        taken.add(course.id)
        chosen.push(course)
      } else {
        missing.push(code)
      }
    }
    for (const course of pinned) if (!taken.has(course.id)) chosen.push(course)
    return [chosen, { missing }]
  }

  const chooseUnits = (req, pinned, candidates, pool) => {
    const chosen = [...pinned]
    for (const course of candidates) {
      if (!(Number(course.units) > 0)) continue
      if (pool && sumUnits(chosen) >= amountOf(req)) break
      chosen.push(course)
    }
    return [chosen, {}]
  }

  const chooseCount = (req, pinned, candidates) => {
    const need = Math.ceil(amountOf(req))
    const rule = levelRuleOf(req)
    const chosen = [...pinned]
    const taken = new Set(chosen.map((c) => c.id))
    if (rule) {
      let have = chosen.filter((c) => CC.number(c.code) >= rule.level).length
      for (const course of candidates) {
        if (have >= rule.count || chosen.length >= need) break
        if (CC.number(course.code) < rule.level) continue
        chosen.push(course)
        taken.add(course.id)
        have += 1
      }
    }
    for (const course of candidates) {
      if (chosen.length >= need) break
      if (taken.has(course.id)) continue
      chosen.push(course)
      taken.add(course.id)
    }
    return [chosen, { rule }]
  }

  const chooseDistinct = (req, pinned, candidates) => {
    const need = Math.ceil(amountOf(req))
    const names = matchOf(req).sets
    const chosen = []
    const usedSets = []
    for (const course of pinned) {
      chosen.push(course)
      const free = setsFor(course.code, names).filter((n) => !usedSets.includes(n))
      if (free.length) usedSets.push(free[0])
    }
    for (const course of candidates) {
      if (chosen.length >= need) break
      const free = setsFor(course.code, names).filter((n) => !usedSets.includes(n))
      if (!free.length) continue
      chosen.push(course)
      usedSets.push(free[0])
    }
    return [chosen, { usedSets, names }]
  }

  const satisfied = (req, subset, extra) => {
    switch (req.kind) {
      case "all":
        return extra.missing.length === 0 && matchOf(req).courses.every((code) => subset.some((c) => CC.same(code, c.code)))
      case "units":
        return sumUnits(subset) >= amountOf(req)
      case "distinct_sets":
        return subset.length >= Math.ceil(amountOf(req))
      default: {
        const enough = subset.length >= Math.ceil(amountOf(req))
        const rule = extra.rule
        return enough && (!rule || subset.filter((c) => CC.number(c.code) >= rule.level).length >= rule.count)
      }
    }
  }

  const remainingText = (req, chosen, extra) => {
    switch (req.kind) {
      case "all":
        return `Needs ${extra.missing.join(", ")}`
      case "units":
        return `${fmt(amountOf(req) - sumUnits(chosen))} more units`
      case "distinct_sets": {
        const left = Math.ceil(amountOf(req)) - chosen.length
        const open = extra.names.filter((n) => !extra.usedSets.includes(n))
        return `${plural(left, "more course")}, each from a different column: ${open.join(", ")}`
      }
      default: {
        const left = Math.ceil(amountOf(req)) - chosen.length
        let text = left > 0 ? plural(left, "more course") : null
        const rule = extra.rule
        if (rule) {
          const short = rule.count - chosen.filter((c) => CC.number(c.code) >= rule.level).length
          if (short > 0) {
            const levelText = `${short} at ${rule.level} level or above`
            text = text ? `${text}, including ${levelText}` : `Swap in ${levelText}`
          }
        }
        return text
      }
    }
  }

  const optionsFor = (req, extra) => {
    const m = matchOf(req)
    let list
    if (req.kind === "all") list = extra.missing
    else if (req.kind === "distinct_sets") list = extra.names.filter((n) => !extra.usedSets.includes(n)).flatMap((n) => sets[n] || [])
    else list = [...m.courses, ...m.sets.flatMap((n) => sets[n] || [])]
    list = [...new Set(list)]
    if (m.min_level > 0) list = list.filter((code) => CC.number(code) >= m.min_level)
    list = list.filter((code) => !known.some((k) => CC.same(k, code)))
    if (extra.rule) {
      const level = extra.rule.level
      list = [...list.filter((c) => CC.number(c) >= level), ...list.filter((c) => CC.number(c) < level)]
    }
    return req.kind === "all" ? list : list.slice(0, MAX_OPTIONS)
  }

  const courseMap = {}
  const results = active.map((req, index) => {
    const pool = poolOf(req)
    const pinned = courses.filter((c) => c.pinnedRequirementId === req.id)
    const pinnedIds = new Set(pinned.map((c) => c.id))
    const later = pool ? active.slice(index + 1).filter((other) => poolOf(other) === pool) : []
    const candidates = courses
      .filter((c) => eligible.get(req.id).has(c.id) && !pinnedIds.has(c.id) && !(pool && usedIn(pool).has(c.id)))
      .map((c) => ({ c, flex: later.filter((o) => eligible.get(o.id).has(c.id)).length }))
      .sort((a, b) => rank(a.c) - rank(b.c) || a.flex - b.flex || (a.c.sortKey || 0) - (b.c.sortKey || 0) || a.c.code.localeCompare(b.c.code))
      .map((entry) => entry.c)

    let picked
    if (req.kind === "all") picked = chooseAll(req, pinned, candidates)
    else if (req.kind === "units") picked = chooseUnits(req, pinned, candidates, pool)
    else if (req.kind === "distinct_sets") picked = chooseDistinct(req, pinned, candidates)
    else picked = chooseCount(req, pinned, candidates)
    const [chosen, extra] = picked
    if (pool) chosen.forEach((c) => usedIn(pool).add(c.id))

    let state = "open"
    for (let level = 0; level < STATES.length; level++) {
      if (satisfied(req, chosen.filter((c) => rank(c) <= level), extra)) {
        state = STATES[level]
        break
      }
    }
    const unitBased = req.kind === "units"
    const breakdown = {}
    for (const status of Object.keys(STATUS_RANK)) {
      const list = chosen.filter((c) => c.status === status)
      breakdown[status] = unitBased ? sumUnits(list) : list.length
    }
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
    chosen.forEach((c) => (courseMap[c.id] ||= []).push(req.id))

    return {
      requirement: req,
      state,
      chosen,
      breakdown,
      total,
      target: req.kind === "all" ? matchOf(req).courses.length : amountOf(req),
      remainingText: state === "open" ? remainingText(req, chosen, extra) : null,
      options: state === "open" ? optionsFor(req, extra) : [],
      unitBased
    }
  })

  const grouped = []
  for (const result of results) {
    const category = result.requirement.category || "General"
    let group = grouped.find((g) => g.category === category)
    if (!group) grouped.push((group = { category, results: [] }))
    group.results.push(result)
  }
  const open = results.filter((r) => r.state === "open")

  return {
    results,
    grouped,
    open,
    complete: results.length > 0 && open.length === 0,
    requirementIdsFor: (courseId) => courseMap[courseId] || []
  }
}
