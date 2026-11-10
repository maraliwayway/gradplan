import { test } from "node:test"
import assert from "node:assert/strict"
import { FALL_2023, buildProgram } from "../js/sfu.js"
import { parsePlanner, PlannerError } from "../js/sfu-planner.js"
import { buildTerms, importTranscript, boardFor, termLabel, groupProgress } from "../js/plan.js"

const TRANSCRIPT = `2025 Fall
CMPT 295   Intro. to Computer Systems      4.00   4.00   B+   13.32   B-   193
CMPT 310   Intro Artificial Intelligence   3.00   3.00   A-   11.01   B+   128
MACM 316   Numerical Analysis I            3.00   3.00   B     9.00   C+   271
PHIL 105   Critical Thinking               3.00   3.00   A    12.00   B-   264

2026 Fall
CMPT 307   Data Structures                 3.00   0.00          0.00   -    120
CMPT 383   Programming Langs.              3.00   0.00          0.00   -    137`

const emptyPlan = () => ({ terms: [], courses: [] })
const ai = "Artificial Intelligence"

test("built-in planner has the six Table I columns", () => {
  assert.deepEqual(FALL_2023.columns.map((c) => c.name), [
    "Artificial Intelligence", "Visual and Interactive Computing", "Computing Systems",
    "Information Systems", "Programming Languages and Software", "Theoretical Computing Science"
  ])
  assert.deepEqual(FALL_2023.requiredBreadth, ["CMPT 307"])
  assert.ok(FALL_2023.lowerDivision.required.includes("CMPT 201"))
  assert.deepEqual(FALL_2023.lowerDivision.choices, [["MATH 150", "MATH 151"], ["MATH 232", "MATH 240"]])
})

test("breadth is CMPT 307 plus four courses from four other columns", () => {
  const program = buildProgram(FALL_2023, { credential: "BSc" })
  const required = program.requirements.find((r) => r.id === "breadth-required")
  const columns = program.requirements.find((r) => r.id === "breadth-columns")
  assert.deepEqual(required.match.courses, ["CMPT 307"])
  assert.equal(columns.amount, 4)
  assert.equal(columns.match.sets.length, 5)
})

test("an uploaded planner that still lists CMPT 300 gets CMPT 201 instead", () => {
  const old = { ...FALL_2023, requiredBreadth: ["CMPT 300", "CMPT 307"], lowerDivision: { ...FALL_2023.lowerDivision, required: FALL_2023.lowerDivision.required.filter((c) => c !== "CMPT 201") } }
  const program = buildProgram(old, { credential: "BSc" })
  assert.deepEqual(program.requirements.find((r) => r.id === "breadth-required").match.courses, ["CMPT 307"])
  assert.ok(program.requirements.find((r) => r.id === "ld-core").match.courses.includes("CMPT 201"))
  assert.equal(program.requirements.find((r) => r.id === "breadth-columns").amount, 4)
})

test("MACM 101 counts for lower division and B-Sci", () => {
  const program = buildProgram(FALL_2023, { credential: "BSc" })
  const plan = emptyPlan()
  importTranscript(plan, program, "2024 Fall\nMACM 101   Discrete Math I   3.00   3.00   A   12.00   B   200")
  const course = plan.courses[0]
  const ids = boardFor(plan, program).report.requirementIdsFor(course.id)
  assert.ok(ids.includes("ld-core"))
  assert.ok(ids.includes("wqb-b-sci"))
})

test("BSc and BA have different credential rules", () => {
  const bsc = buildProgram(FALL_2023, { credential: "BSc", concentration: "" })
  const ba = buildProgram(FALL_2023, { credential: "BA", concentration: ai })
  assert.ok(bsc.requirements.some((r) => r.id === "bsc-316"))
  assert.ok(!bsc.requirements.some((r) => r.id === "concentration-0"))
  assert.ok(ba.requirements.some((r) => r.id === "ba-fass"))
  assert.ok(!ba.requirements.some((r) => r.id === "bsc-316"))
  assert.ok(ba.groups.some((g) => g.key === "concentration-0" && g.label === "Artificial Intelligence concentration"))
})

test("plan shows grouped progress for breadth, concentration and credential", () => {
  const program = buildProgram(FALL_2023, { credential: "BSc", concentration: ai })
  const plan = emptyPlan()
  importTranscript(plan, program, TRANSCRIPT)
  const board = boardFor(plan, program)
  const group = (key) => board.groups.find((g) => g.key === key)

  assert.equal(board.totals.completed, 13)
  assert.equal(board.totals.in_progress, 6)
  assert.deepEqual([group("breadth").counted, group("breadth").target], [3, 5])
  assert.deepEqual([group("concentration-0").counted, group("concentration-0").target], [1, 4])
  assert.deepEqual([group("credential").filled.completed, group("credential").target], [1, 3])
  assert.equal(group("breadth").state, "open")
  assert.deepEqual(board.upcomingTerms.map(termLabel), ["Fall 2026"])
})

test("supports more than one concentration", () => {
  const program = buildProgram(FALL_2023, { credential: "BSc", concentrations: ["Artificial Intelligence", "Computing Systems"] })
  const concentrations = program.requirements.filter((r) => r.group.startsWith("concentration-"))
  assert.equal(concentrations.length, 2)
  assert.deepEqual(program.groups.filter((g) => g.key.startsWith("concentration-")).map((g) => g.label), [
    "Artificial Intelligence concentration", "Computing Systems concentration"
  ])
})

test("BA counts Arts and Social Sciences units", () => {
  const program = buildProgram(FALL_2023, { credential: "BA", concentration: "" })
  const plan = emptyPlan()
  importTranscript(plan, program, TRANSCRIPT)
  const fass = boardFor(plan, program).groups.find((g) => g.key === "fass")
  assert.equal(fass.filled.completed, 3)
  assert.equal(fass.target, 15)
  assert.equal(fass.state, "open")
})

test("group progress never overfills a requirement", () => {
  const result = (target, completed, state = "done", detailOnly = false) =>
    ({ target, breakdown: { completed, in_progress: 0, planned: 0 }, unitBased: true, state, requirement: { detailOnly } })
  const progress = groupProgress([result(6, 9), result(6, 3, "open"), result(30, 0, "open", true)])
  assert.deepEqual([progress.counted, progress.target, progress.state], [9, 12, "open"])
})

test("terms follow SFU seasons", () => {
  const terms = buildTerms({ startSeason: "Fall", startYear: 2023, years: 1, summers: false })
  assert.deepEqual(terms.map(termLabel), ["Fall 2023", "Spring 2024"])
})

test("planner parser reads columns by position", () => {
  const item = (str, x, y) => ({ str, x, y, width: 40, size: 10 })
  const pages = [[
    item("COMPUTING SCIENCE MAJOR: SPRING 2025 GRADUATION PLANNER", 200, 1210),
    item("COMPUTING SCIENCE (36-37 units)", 200, 930),
    item("CMPT 120", 60, 900), item("MATH 150 OR 151 (Q, UB)", 450, 900), item("MACM 101* (B-SCI)", 260, 870),
    item("UPPER DIVISION WRITING (3 units)", 660, 800), item("CMPT 376W (UD W)", 670, 776),
    item("BSc CREDENTIAL (9 units)", 690, 730),
    item("TABLE I: COMPUTING SCIENCE CONCENTRATIONS", 120, 736),
    item("Artificial", 59, 700), item("Intelligence", 50, 685),
    item("Computing", 248, 700), item("Systems", 255, 685),
    item("Information", 345, 700), item("Systems", 353, 685),
    item("Theoretical", 543, 708), item("Computing", 544, 693), item("Science", 552, 678),
    item("CMPT 310", 52, 647), item("CMPT 300‡", 249, 647), item("CMPT 353", 347, 647), item("CMPT 307‡", 544, 647),
    item("CMPT 410", 52, 618), item("CMPT 471", 249, 618), item("CMPT 454", 347, 618), item("CMPT 405", 544, 618),
    item("TABLE III:", 747, 599), item("MACM 316", 810, 487),
    item("UPPER DIVISION ELECTIVES (6 units)", 653, 453),
    item("COMPUTING SCIENCE CO-OP EDUCATION", 338, 268)
  ]]
  const planner = parsePlanner(pages)
  assert.equal(planner.catalog, "Spring 2025")
  assert.deepEqual(planner.columns.map((c) => c.name), ["Artificial Intelligence", "Computing Systems", "Information Systems", "Theoretical Computing Science"])
  assert.deepEqual(planner.columns[0].codes, ["CMPT 310", "CMPT 410"])
  assert.deepEqual(planner.requiredBreadth, ["CMPT 300", "CMPT 307"])
  assert.deepEqual(planner.lowerDivision, { required: ["CMPT 120", "MACM 101"], choices: [["MATH 150", "MATH 151"]] })
  assert.deepEqual(planner.writing, ["CMPT 376W"])
  assert.deepEqual(planner.tableThree, ["MACM 316"])
  assert.deepEqual(planner.tags, { "MACM 101": ["B-Sci"] })
})

test("planner parser rejects other PDFs", () => {
  assert.throws(() => parsePlanner([[{ str: "Unofficial Transcript", x: 0, y: 0 }]]), PlannerError)
})
