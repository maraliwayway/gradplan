// Normalizes, finds and matches course codes such as "CMPT 310" or "COMP 1010".

export const ANCHORED = /^[A-Z]{2,5} \d{3,4}[A-Z]?$/
const SCAN = /\b([A-Z]{2,5})[ -]?(\d{3,4}[A-Z]?)\b((?:\s*(?:\/|,|\bOR\b)\s*\d{3,4}[A-Z]?\b)*)/g
export const STOP_SUBJECTS = new Set(["OR", "AND", "FALL", "SPRING", "SUMMER", "WINTER", "AUTUMN", "PAGE", "ANY", "THE", "FOR", "YEAR", "TERM", "UNITS", "ID"])

export function normalize(raw) {
  const text = String(raw ?? "").toUpperCase().trim()
  const match = text.match(/^([A-Z]{2,5})\s*-?\s*(\d{3,4})([A-Z]?)$/)
  return match ? `${match[1]} ${match[2]}${match[3]}` : text.replace(/\s+/g, " ")
}

export function isValid(raw) {
  return ANCHORED.test(normalize(raw))
}

// Returns [subject, digits, suffix] or null.
export function parts(raw) {
  const match = normalize(raw).match(/^([A-Z]{2,5}) (\d{3,4})([A-Z]?)$/)
  return match ? [match[1], match[2], match[3]] : null
}

export function number(raw) {
  const found = parts(raw)
  return found ? parseInt(found[1], 10) : 0
}

// "CMPT 105" and "CMPT 105W" count as the same course when one side has no suffix.
export function same(left, right) {
  const a = normalize(left)
  const b = normalize(right)
  if (a === b) return true
  const pa = parts(a)
  const pb = parts(b)
  if (!pa || !pb) return false
  return pa[0] === pb[0] && pa[1] === pb[1] && (pa[2] === "" || pb[2] === "")
}

// Finds course codes in text. Understands "MATH 150 OR 151" and "MATH 154/157".
// Documents are read as written so words like "min 120" are not taken as codes.
// Pass { upcase: true } for text a person typed.
export function scan(text, { upcase = false } = {}) {
  const source = upcase ? String(text ?? "").toUpperCase() : String(text ?? "")
  const found = []
  for (const match of source.matchAll(SCAN)) {
    const [, subject, num, rest] = match
    if (STOP_SUBJECTS.has(subject)) continue
    found.push(`${subject} ${num}`)
    for (const extra of (rest || "").matchAll(/\d{3,4}[A-Z]?/g)) found.push(`${subject} ${extra[0]}`)
  }
  return [...new Set(found)]
}

// Patterns: "ANY" (every course), "ANY 3XX", "CMPT" (every CMPT course), "CMPT 4XX".
export function matchesPattern(rawCode, rawPattern) {
  const pattern = String(rawPattern ?? "").toUpperCase().trim().replace(/\s+/g, " ")
  if (pattern === "ANY") return true
  const code = parts(rawCode)
  if (!code) return false
  const [subject, digitsRaw] = pattern.split(" ")
  if (subject !== "ANY" && subject !== code[0]) return false
  if (!digitsRaw) return true
  const digits = (digitsRaw.match(/^[\dX]+/) || [""])[0]
  if (digits.length !== code[1].length) return false
  return [...digits].every((want, i) => want === "X" || want === code[1][i])
}
