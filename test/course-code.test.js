import { test } from "node:test"
import assert from "node:assert/strict"
import * as CC from "../js/course-code.js"

test("normalizes spacing and case", () => {
  assert.equal(CC.normalize(" cmpt105w "), "CMPT 105W")
  assert.equal(CC.normalize("math-1500"), "MATH 1500")
})

test("treats a missing suffix as the same course", () => {
  assert.ok(CC.same("CMPT 105", "CMPT 105W"))
  assert.ok(!CC.same("CMPT 105W", "CMPT 105X"))
  assert.ok(!CC.same("CMPT 310", "CMPT 311"))
})

test("scans planner text including shorthand", () => {
  assert.deepEqual(CC.scan("MATH 150 OR 151 (Q, UB), MATH 154/157, FALL 2023, CMPT 376W"),
    ["MATH 150", "MATH 151", "MATH 154", "MATH 157", "CMPT 376W"])
})

test("only reads lowercase input when asked", () => {
  assert.deepEqual(CC.scan("to reach 120 units (min 120)"), [])
  assert.deepEqual(CC.scan("cmpt 300, 307", { upcase: true }), ["CMPT 300", "CMPT 307"])
  assert.deepEqual(CC.scan("ID 301588878"), [])
})

test("matches patterns", () => {
  assert.ok(CC.matchesPattern("CMPT 410", "ANY 4XX"))
  assert.ok(CC.matchesPattern("CMPT 410", "CMPT 4XX"))
  assert.ok(CC.matchesPattern("PHIL 105", "ANY"))
  assert.ok(CC.matchesPattern("PHIL 105", "PHIL"))
  assert.ok(!CC.matchesPattern("CMPT 310", "CMPT 4XX"))
  assert.ok(!CC.matchesPattern("MATH 310", "CMPT 3XX"))
  assert.ok(!CC.matchesPattern("COMP 3100", "ANY 3XX"))
})
