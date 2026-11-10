import { test } from "node:test"
import assert from "node:assert/strict"
import { parseTranscript } from "../js/transcript.js"
import { itemsToLines } from "../js/pdf-lines.js"

const SAMPLE = `2024 Fall
Course               Description                     Repeated   Units         Units        Grade      Grade    Class      Class
CMPT 225             Data Structures/Programming               3.00        3.00     B+          9.99      B-         116
PHIL 105             Critical Thinking                         3.00        3.00     F           0.00      B-         264
Term Totals:                                                  12.00          12.00                42.99

2026 Spring
CMPT 426             Practicum I                               0.00        3.00     P            0.00      -           63

2026 Fall
CMPT 201             Systems Programming                       4.00        0.00                  0.00      -          147`

test("reads completed, pass and in-progress rows with their terms", () => {
  const { entries } = parseTranscript(SAMPLE)
  assert.deepEqual(entries.map((e) => e.code), ["CMPT 225", "CMPT 426", "CMPT 201"])
  assert.deepEqual([entries[0].season, entries[0].year, entries[0].status, entries[0].grade, entries[0].units], ["Fall", 2024, "completed", "B+", 3])
  assert.equal(entries[0].title, "Data Structures/Programming")
  assert.equal(entries[1].units, 0)
  assert.deepEqual([entries[2].year, entries[2].status, entries[2].grade, entries[2].units], [2026, "in_progress", null, 4])
})

test("skips failed and withdrawn courses", () => {
  assert.deepEqual(parseTranscript(SAMPLE).skipped.map((e) => e.code), ["PHIL 105"])
})

test("falls back to loose rows", () => {
  const { entries } = parseTranscript("Fall 2022\nCOMP 1010 Intro to Programming 3 A-\nCOMP 1020 Data Structures 3\n")
  assert.deepEqual(entries.map((e) => e.code), ["COMP 1010", "COMP 1020"])
  assert.deepEqual(entries.map((e) => e.status), ["completed", "in_progress"])
  assert.equal(entries[0].title, "Intro to Programming")
})

test("rebuilds PDF rows and drops rotated watermark text", () => {
  const items = [
    { str: "3.00", x: 300, y: 700, width: 20, size: 10 },
    { str: "CMPT 310", x: 30, y: 700.5, width: 45, size: 10 },
    { str: "Intro AI", x: 120, y: 699.8, width: 40, size: 10 },
    { str: "U", x: 250, y: 700, width: 30, size: 60, rotated: true },
    { str: "2025 Fall", x: 30, y: 720, width: 50, size: 10 }
  ]
  assert.deepEqual(itemsToLines(items), ["2025 Fall", "CMPT 310   Intro AI   3.00"])
})
