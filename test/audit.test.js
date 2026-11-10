import { test } from "node:test"
import assert from "node:assert/strict"
import { runAudit, segments, progressText } from "../js/audit.js"

const SETS = {
  AI: ["CMPT 310", "CMPT 340", "CMPT 410", "CMPT 411", "CMPT 413"],
  VIC: ["CMPT 361", "CMPT 461"],
  PLS: ["CMPT 383", "CMPT 473"],
  Theory: ["CMPT 307", "CMPT 405"]
}

const req = (id, kind, amount, { pool = null, optional = false, level_rule = {}, ...match } = {}) =>
  ({ id, name: `Requirement ${id}`, category: "General", kind, amount, pool, optional, match, level_rule, position: Number(id.slice(1)) })
const course = (id, code, status = "completed", { units = 3, tags = [], pin = null } = {}) =>
  ({ id, code, units, status, tags, pinnedRequirementId: pin, sortKey: 1 })
const audit = (requirements, courses, selectedIds = []) => runAudit({ requirements, courses, courseSets: SETS, selectedIds })

test("every-course requirement offers the missing courses", () => {
  const result = audit([req("r1", "all", null, { courses: ["CMPT 300", "CMPT 307"] })], [course("c1", "CMPT 307", "in_progress")]).results[0]
  assert.equal(result.state, "open")
  assert.equal(result.remainingText, "Needs CMPT 300")
  assert.deepEqual(result.options, ["CMPT 300"])
})

test("state reflects the weakest course needed", () => {
  const r = req("r1", "count", 2, { courses: ["CMPT 310", "CMPT 340", "CMPT 410"] })
  assert.equal(audit([r], [course("a", "CMPT 310"), course("b", "CMPT 340")]).results[0].state, "done")
  assert.equal(audit([r], [course("a", "CMPT 310"), course("b", "CMPT 340", "in_progress")]).results[0].state, "in_progress")
  assert.equal(audit([r], [course("a", "CMPT 310"), course("b", "CMPT 410", "planned")]).results[0].state, "planned")
})

test("requirements in the same pool do not share a course", () => {
  const report = audit([
    req("r1", "count", 1, { pool: "major", sets: ["AI"] }),
    req("r2", "count", 1, { pool: "major", sets: ["AI"], min_level: 400 })
  ], [course("a", "CMPT 410"), course("b", "CMPT 310")])
  assert.deepEqual(report.results[0].chosen.map((c) => c.code), ["CMPT 310"])
  assert.deepEqual(report.results[1].chosen.map((c) => c.code), ["CMPT 410"])
  assert.ok(report.complete)
})

test("flexible courses are saved for later requirements", () => {
  const report = audit([
    req("r1", "count", 1, { pool: "major", sets: ["AI", "Theory"] }),
    req("r2", "count", 1, { pool: "major", sets: ["AI"], min_level: 400 })
  ], [course("a", "CMPT 410"), course("b", "CMPT 405")])
  assert.deepEqual(report.results[0].chosen.map((c) => c.code), ["CMPT 405"])
  assert.deepEqual(report.results[1].chosen.map((c) => c.code), ["CMPT 410"])
})

test("courses without a pool count everywhere", () => {
  const report = audit([req("r1", "units", 6, { patterns: ["ANY"] }), req("r2", "units", 3, { patterns: ["ANY 3XX"] })],
    [course("a", "CMPT 310"), course("b", "PHIL 105")])
  assert.equal(report.results[0].total, 6)
  assert.equal(report.results[1].total, 3)
  assert.deepEqual(report.requirementIdsFor("a"), ["r1", "r2"])
})

test("units requirements skip zero unit courses", () => {
  const result = audit([req("r1", "units", 3, { pool: "major", patterns: ["ANY 4XX"] })], [course("a", "CMPT 426", "completed", { units: 0 })]).results[0]
  assert.equal(result.chosen.length, 0)
  assert.equal(result.remainingText, "3 more units")
})

test("different-groups requirement needs one course per group", () => {
  const result = audit([req("r1", "distinct_sets", 3, { pool: "major", sets: ["AI", "VIC", "PLS"] })],
    [course("a", "CMPT 310"), course("b", "CMPT 340"), course("c", "CMPT 383", "in_progress")]).results[0]
  assert.deepEqual(result.chosen.map((c) => c.code), ["CMPT 310", "CMPT 383"])
  assert.equal(result.remainingText, "1 more course, each from a different column: VIC")
  assert.deepEqual(result.options, ["CMPT 361", "CMPT 461"])
})

test("optional tracks only count when selected, and level rules prefer higher levels", () => {
  const r = req("r1", "count", 4, { optional: true, sets: ["AI"], level_rule: { level: 400, count: 2 } })
  const courses = [course("a", "CMPT 310"), course("b", "CMPT 340"), course("c", "CMPT 410", "planned")]
  assert.equal(audit([r], courses).results.length, 0)
  const result = audit([r], courses, ["r1"]).results[0]
  assert.equal(result.remainingText, "1 more course, including 1 at 400 level or above")
  assert.equal(result.options[0], "CMPT 411")
})

test("pinned courses count where pinned", () => {
  const report = audit([
    req("r1", "count", 1, { pool: "major", courses: ["CMPT 310"] }),
    req("r2", "units", 3, { pool: "major", patterns: ["ANY 4XX"] })
  ], [course("a", "CMPT 415", "completed", { pin: "r1" })])
  assert.equal(report.results[0].state, "done")
  assert.equal(report.results[1].state, "open")
})

test("tags match case insensitively and segments add up", () => {
  const result = audit([req("r1", "units", 6, { pool: "wqb", tags: ["B-Hum"] })],
    [course("a", "PHIL 105", "completed", { tags: ["b-hum"] }), course("b", "CA 149", "planned", { tags: ["B-HUM"] })]).results[0]
  assert.equal(result.state, "planned")
  assert.deepEqual(segments(result), { completed: 50, in_progress: 0, planned: 50 })
  assert.equal(progressText(result), "6 of 6 units")
})
