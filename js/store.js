// Saves everything in this browser's localStorage. Backups move data between devices.

const KEY = "gradplan:v2"

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "null")
    if (data && data.profile && data.plan) return data
  } catch {
    // Unreadable data starts fresh; a backup can be restored from Settings.
  }
  return null
}

export function save(db) {
  if (db) localStorage.setItem(KEY, JSON.stringify(db))
  else localStorage.removeItem(KEY)
}

export function fromBackup(text) {
  const data = JSON.parse(text)
  if (!data || !data.profile || !data.plan || !data.planner) throw new Error("That file is not a gradplan backup.")
  return data
}

export function getPreference(name, fallback) {
  try {
    const value = localStorage.getItem(`gradplan:${name}`)
    return value == null ? fallback : JSON.parse(value)
  } catch {
    return fallback
  }
}

export function setPreference(name, value) {
  try {
    localStorage.setItem(`gradplan:${name}`, JSON.stringify(value))
  } catch {
    // Preferences are optional.
  }
}
