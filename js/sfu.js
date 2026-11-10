// SFU Computing Science major rules, built from a graduation planner.
// Rules follow the reverse side of the planner: breadth, depth, the BSc or BA
// credential, upper division writing and electives, WQB and unit totals.

import * as CC from "./course-code.js"

// Course lists from the Fall 2023 planner, read with sfu-planner.js, corrected for
// CMPT 201 replacing CMPT 300 (see withCurrentRules).
export const FALL_2023 = {
  "catalog": "Fall 2023",
  "source": "built-in",
  "lowerDivision": {
    "required": [
      "CMPT 105W",
      "CMPT 120",
      "CMPT 125",
      "CMPT 201",
      "CMPT 210",
      "CMPT 225",
      "CMPT 276",
      "CMPT 295",
      "MACM 101",
      "MATH 152",
      "STAT 271"
    ],
    "choices": [
      [
        "MATH 150",
        "MATH 151"
      ],
      [
        "MATH 232",
        "MATH 240"
      ]
    ]
  },
  "writing": [
    "CMPT 376W"
  ],
  "columns": [
    {
      "name": "Artificial Intelligence",
      "codes": [
        "CMPT 310",
        "CMPT 340",
        "CMPT 410",
        "CMPT 411",
        "CMPT 413",
        "CMPT 417",
        "CMPT 419",
        "CMPT 420"
      ]
    },
    {
      "name": "Visual and Interactive Computing",
      "codes": [
        "CMPT 361",
        "CMPT 363",
        "CMPT 365",
        "CMPT 412",
        "CMPT 461",
        "CMPT 464",
        "CMPT 466",
        "CMPT 467",
        "CMPT 469"
      ]
    },
    {
      "name": "Computing Systems",
      "codes": [
        "CMPT 300",
        "CMPT 305",
        "CMPT 371",
        "CMPT 379",
        "CMPT 403",
        "CMPT 431",
        "CMPT 433",
        "CMPT 450",
        "CMPT 471",
        "CMPT 479",
        "CMPT 499"
      ]
    },
    {
      "name": "Information Systems",
      "codes": [
        "CMPT 353",
        "CMPT 354",
        "CMPT 362",
        "CMPT 372",
        "CMPT 441",
        "CMPT 454",
        "CMPT 456",
        "CMPT 459",
        "CMPT 474"
      ]
    },
    {
      "name": "Programming Languages and Software",
      "codes": [
        "CMPT 373",
        "CMPT 383",
        "CMPT 384",
        "CMPT 473",
        "CMPT 475",
        "CMPT 477",
        "CMPT 489"
      ]
    },
    {
      "name": "Theoretical Computing Science",
      "codes": [
        "CMPT 307",
        "CMPT 308",
        "CMPT 404",
        "CMPT 405",
        "CMPT 406",
        "CMPT 407",
        "CMPT 409",
        "CMPT 476",
        "MACM 300"
      ]
    }
  ],
  "requiredBreadth": [
    "CMPT 307"
  ],
  "tableThree": [
    "MACM 401",
    "MATH 340",
    "MACM 442",
    "MATH 343",
    "MATH 308",
    "MACM 316"
  ],
  "tags": {
    "MACM 101": [
      "B-Sci"
    ]
  }
}

// SFU courses worth more than the usual 3 units.
export const COURSE_UNITS = { "CMPT 201": 4, "CMPT 295": 4, "MATH 150": 4, "MATH 154": 4, "MATH 157": 3 }

// Subjects taught in the Faculty of Arts and Social Sciences, for the BA. Check the SFU calendar for changes.
export const FASS_SUBJECTS = [
  "ARCH", "ASC", "CHIN", "COGS", "CRIM", "ECON", "ENGL", "FASS", "FNLG", "FREN", "GA", "GERM", "GERO",
  "GSWS", "HIST", "HS", "HUM", "INDG", "IS", "ITAL", "JAPN", "LANG", "LAS", "LBST", "LING", "PHIL",
  "POL", "PSYC", "SA", "SPAN", "WL"
]

export const CREDENTIALS = {
  BSc: "Bachelor of Science",
  BA: "Bachelor of Arts"
}

export const WQB_TAGS = ["B-Sci", "B-Soc", "B-Hum"]

export const concentrationsOf = (profile) =>
  profile.concentrations?.length ? profile.concentrations : profile.concentration ? [profile.concentration] : []

// Progress rows on the plan page, in order. Each requirement belongs to one group.
export function groupsFor(profile) {
  const groups = [
    { key: "lower", label: "Lower division" },
    { key: "breadth", label: "Breadth" },
    { key: "depth", label: "Depth" }
  ]
  concentrationsOf(profile).forEach((name, i) => groups.push({ key: `concentration-${i}`, label: `${name} concentration` }))
  groups.push({ key: "credential", label: `${profile.credential} credential` })
  if (profile.credential === "BA") groups.push({ key: "fass", label: "Arts and Social Sciences units" })
  groups.push(
    { key: "writing", label: "Upper division writing" },
    { key: "electives", label: "Upper division electives" },
    { key: "wqb", label: "WQB breadth" },
    { key: "upper", label: "Upper division units" },
    { key: "total", label: "Total units" }
  )
  return groups
}

// CMPT 300 is no longer offered. CMPT 201 replaced it as a lower division requirement,
// so CMPT 307 is the only required breadth course. Older planner PDFs still list CMPT 300.
export function withCurrentRules(planner) {
  if (!planner.requiredBreadth.includes("CMPT 300")) return planner
  return {
    ...planner,
    requiredBreadth: planner.requiredBreadth.filter((code) => code !== "CMPT 300"),
    lowerDivision: { ...planner.lowerDivision, required: [...new Set([...planner.lowerDivision.required, "CMPT 201"])] }
  }
}

const NUMBER_WORDS = ["None", "One", "Two", "Three", "Four", "Five"]

export function buildProgram(sourcePlanner, profile) {
  const planner = withCurrentRules(sourcePlanner)
  const sets = {}
  for (const column of planner.columns) sets[column.name] = column.codes
  sets["Table III"] = planner.tableThree
  const tableOne = planner.columns.map((c) => c.name)

  const requirements = []
  const add = (req) => requirements.push({ pool: null, optional: false, level_rule: {}, notes: "", match: {}, ...req, position: requirements.length + 1 })
  const major = "major"

  add({ id: "ld-core", group: "lower", category: "Lower division", name: "Required courses", kind: "all", match: { courses: planner.lowerDivision.required } })
  planner.lowerDivision.choices.forEach((codes, index) => {
    add({ id: `ld-choice-${index + 1}`, group: "lower", category: "Lower division", name: codes.join(" or "), kind: "count", amount: 1, match: { courses: codes } })
  })

  if (planner.writing.length) {
    add({ id: "writing", group: "writing", category: "Writing", name: planner.writing.join(", "), kind: "all", pool: major, match: { courses: planner.writing } })
  }

  add({ id: "breadth-required", group: "breadth", category: "Breadth", name: `Required: ${planner.requiredBreadth.join(" and ")}`, kind: "all", pool: major, match: { courses: planner.requiredBreadth } })
  const otherColumns = planner.columns.filter((c) => !c.codes.some((code) => planner.requiredBreadth.includes(code))).map((c) => c.name)
  const moreBreadth = 5 - planner.requiredBreadth.length
  add({
    id: "breadth-columns", group: "breadth", category: "Breadth", name: `${NUMBER_WORDS[moreBreadth]} more, each from a different column`,
    kind: "distinct_sets", amount: moreBreadth, pool: major, match: { sets: otherColumns },
    notes: `Columns: ${otherColumns.join(", ")}.`
  })

  add({
    id: "depth", group: "depth", category: "Depth", name: "Four 400-level courses from Table I",
    kind: "count", amount: 4, pool: major, match: { sets: tableOne, min_level: 400 },
    notes: "These are in addition to the five breadth courses."
  })

  if (profile.credential === "BA") {
    const cmptSet = "Tables I and III, CMPT courses"
    sets[cmptSet] = [...new Set([...tableOne, "Table III"].flatMap((name) => sets[name]).filter((code) => code.startsWith("CMPT ")))]
    add({ id: "ba-extra", group: "credential", category: "BA credential", name: "One more CMPT course from Tables I or III", kind: "count", amount: 1, pool: major, match: { sets: [cmptSet] } })
    add({ id: "ba-cmpt-units", group: "credential", category: "BA credential", name: "30 upper division CMPT units", kind: "units", amount: 30, detailOnly: true, match: { patterns: ["CMPT 3XX", "CMPT 4XX"] } })
    add({
      id: "ba-fass", group: "fass", category: "BA credential", name: "15 units from Arts and Social Sciences", kind: "units", amount: 15,
      match: { patterns: FASS_SUBJECTS }, notes: "Courses offered by the Faculty of Arts and Social Sciences."
    })
    add({
      id: "ba-fass-upper", group: "fass", category: "BA credential", name: "6 of them at the upper division", kind: "units", amount: 6, detailOnly: true,
      match: { patterns: FASS_SUBJECTS.flatMap((s) => [`${s} 3XX`, `${s} 4XX`]) }
    })
  } else {
    add({ id: "bsc-316", group: "credential", category: "BSc credential", name: "MACM 316", kind: "all", pool: major, match: { courses: ["MACM 316"] } })
    add({
      id: "bsc-extra", group: "credential", category: "BSc credential", name: "Two more from Tables I or III",
      kind: "count", amount: 2, pool: major, match: { sets: [...tableOne, "Table III"] },
      notes: "CMPT 318, 415, 416, 496, 497 and 498 can count with permission of the School. Open the course and set Count toward once approved."
    })
  }

  add({
    id: "ud-electives", group: "electives", category: "Upper division electives", name: "6 units of any 300 or 400 level course",
    kind: "units", amount: 6, pool: major, match: { patterns: ["ANY 3XX", "ANY 4XX"] }
  })

  for (const tag of WQB_TAGS) {
    add({
      id: `wqb-${tag.toLowerCase()}`, group: "wqb", category: "WQB breadth", name: tag, kind: "units", amount: 6, pool: "wqb",
      match: { tags: [tag] }, notes: "Mark a course with its designation from the SFU calendar to count it here."
    })
  }

  concentrationsOf(profile).forEach((name, i) => {
    if (!sets[name]) return
    add({
      id: `concentration-${i}`, group: `concentration-${i}`, category: "Concentration", name: `Four ${name} courses, two at the 400 level`,
      kind: "count", amount: 4, match: { sets: [name] }, level_rule: { level: 400, count: 2 },
      notes: "Concentration courses also count toward breadth and depth."
    })
  })

  add({ id: "units-upper", group: "upper", category: "Units", name: "45 upper division units", kind: "units", amount: 45, match: { patterns: ["ANY 3XX", "ANY 4XX"] }, notes: "At least two thirds must be completed at SFU." })
  add({
    id: "units-cs-upper", group: "upper", category: "Units", name: "39 of them in CMPT, MACM or MATH", kind: "units", amount: 39, detailOnly: true,
    match: { patterns: ["CMPT 3XX", "CMPT 4XX", "MACM 3XX", "MACM 4XX", "MATH 3XX", "MATH 4XX"] }
  })
  add({ id: "units-total", group: "total", category: "Units", name: "120 units", kind: "units", amount: 120, match: { patterns: ["ANY"] } })

  return {
    requirements,
    courseSets: sets,
    courseUnits: COURSE_UNITS,
    courseTags: planner.tags || {},
    defaultUnits: 3,
    groups: groupsFor(profile)
  }
}

export function unitsFor(program, code) {
  return program.courseUnits[CC.normalize(code)] ?? program.defaultUnits
}

export function tagsFor(program, code) {
  return [...(program.courseTags[CC.normalize(code)] || [])]
}

export function knownCodes(sourcePlanner) {
  const planner = withCurrentRules(sourcePlanner)
  const codes = [
    ...planner.lowerDivision.required,
    ...planner.lowerDivision.choices.flat(),
    ...planner.writing,
    ...planner.columns.flatMap((c) => c.codes),
    ...planner.tableThree
  ]
  return [...new Set(codes)].sort()
}
