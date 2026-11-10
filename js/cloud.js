// Sign-in and cross-device sync through Supabase. When config.js is empty this
// module stays inert and gradplan runs entirely in the browser.

// config.js is gitignored, so a fresh clone may not have it.
const { SUPABASE_URL = "", SUPABASE_ANON_KEY = "" } = await import("./config.js").catch(() => ({}))

const TABLE = "plans"
const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm"

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

let client = null
let pushTimer = null
const listeners = []

async function getClient() {
  if (!configured) return null
  if (!client) {
    const { createClient } = await import(SDK)
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.auth.onAuthStateChange((_event, session) => listeners.forEach((cb) => cb(session?.user ?? null)))
  }
  return client
}

async function currentUser(c) {
  const { data } = await c.auth.getUser()
  return data?.user ?? null
}

export function onUser(cb) { listeners.push(cb) }

export async function init() {
  const c = await getClient()
  if (!c) return null
  const { data } = await c.auth.getSession()
  return data.session?.user ?? null
}

// Returns the session, or null when the account still needs email confirmation.
export async function signUp(email, password) {
  const c = await getClient()
  const { data, error } = await c.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  return data.session
}

export async function signIn(email, password) {
  const c = await getClient()
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signOut() {
  const c = await getClient()
  if (c) await c.auth.signOut()
}

export async function pull() {
  const c = await getClient()
  if (!c) return null
  const user = await currentUser(c)
  if (!user) return null
  const { data, error } = await c.from(TABLE).select("data").eq("user_id", user.id).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.data ?? null
}

// Debounced so a flurry of edits becomes one write.
export function push(db) {
  if (!configured || !db) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(async () => {
    const c = await getClient()
    const user = await currentUser(c)
    if (!user) return
    await c.from(TABLE).upsert({ user_id: user.id, data: db, updated_at: new Date().toISOString() })
  }, 1200)
}
