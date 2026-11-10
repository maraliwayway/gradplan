import * as CC from "./course-code.js"
import { fmt, progressText } from "./audit.js"
import { fileToPages, fileToText } from "./pdf-text.js"
import { parsePlanner } from "./sfu-planner.js"
import { FALL_2023, CREDENTIALS, WQB_TAGS, buildProgram, knownCodes, concentrationsOf } from "./sfu.js"
import { SEASON_ORDER, STATUSES, termLabel, termKey, buildTerms, makeCourse, importTranscript, boardFor } from "./plan.js"
import * as store from "./store.js"
import * as cloud from "./cloud.js"
import { newId } from "./util.js"

/* ---------- Rendering helpers ---------- */

class Raw {
  constructor(text) { this.text = text }
  toString() { return this.text }
}
const raw = (text) => new Raw(text)
const esc = (text) => String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch])
const val = (v) => (v == null || v === false ? "" : v instanceof Raw ? v.text : Array.isArray(v) ? v.map(val).join("") : esc(v))
const html = (strings, ...values) => raw(strings.reduce((out, s, i) => out + s + (i < values.length ? val(values[i]) : ""), ""))
const plural = (n, word) => (n === 1 ? `1 ${word}` : `${n} ${word}s`)
const selected = (a, b) => (a === b ? raw(" selected") : "")
const checked = (on) => (on ? raw(" checked") : "")

const MAJOR = "Computing Science"
const STATE_LABELS = { done: "Done", in_progress: "In progress", planned: "Planned", open: "Still needed" }

/* ---------- State ---------- */

let db = store.load()
let toast = null
let user = null
let authMode = "signin"
let editingCourseId = null
let lastRoute = null
const expanded = new Set(store.getPreference("expanded", []))
const app = document.getElementById("app")

const programFor = () => buildProgram(db.planner, db.profile)

function persist(message, type = "notice") {
  store.save(db)
  cloud.push(db)
  if (message) toast = { message, type }
  render()
}

function go(path, message, type = "notice") {
  if (message) toast = { message, type }
  if (location.hash === `#${path}`) render()
  else location.hash = path
}

function showErrors(form, errors) {
  const box = form.querySelector(".form-errors")
  if (!box) return alert(errors.join("\n"))
  box.hidden = false
  box.innerHTML = html`<ul>${errors.map((e) => html`<li>${e}</li>`)}</ul>`.text
  box.scrollIntoView({ block: "nearest", behavior: "smooth" })
}

function busy(button, label) {
  const original = button.textContent
  button.disabled = true
  button.textContent = label
  return () => {
    button.disabled = false
    button.textContent = original
  }
}

function download(filename, text) {
  const link = document.createElement("a")
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }))
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

// The SFU term running today: Spring is January to April, Summer May to August, Fall September to December.
function currentTermKey() {
  const now = new Date()
  const month = now.getMonth()
  return now.getFullYear() * 10 + (month < 4 ? 1 : month < 8 ? 2 : 3)
}

// An internship term holds at most one course.
function internshipFull(termId, exceptId) {
  const term = db.plan.terms.find((t) => t.id === termId)
  return !!term?.internship && db.plan.courses.some((c) => c.termId === termId && c.id !== exceptId)
}

async function readPlanner(file) {
  if (!file || !file.size) return null
  return parsePlanner(await fileToPages(file))
}

/* ---------- Shared pieces ---------- */

function layout(content, section) {
  const link = (href, label, key) => html`<a href="${href}" class="${section === key ? "is-current" : ""}">${label}</a>`
  return html`
    <header class="topbar">
      <a href="#/" class="wordmark">gradplan</a>
      <div class="topbar-right">
        ${db ? html`<nav class="topnav" aria-label="Main">
          ${link("#/", "Plan", "plan")}
          ${link("#/transcript", "Transcript", "transcript")}
          ${link("#/settings", "Settings", "settings")}
        </nav>` : ""}
        ${cloud.configured ? html`<div class="account">
          ${user
            ? html`<span class="account-email" title="${user.email}">${user.email}</span><button type="button" class="text-button" data-action="signOut">Sign out</button>`
            : html`<a href="#/account" class="button button-secondary button-small">Sign in</a>`}
        </div>` : ""}
      </div>
    </header>
    <main class="page">${content}</main>
    ${toast ? html`<p class="toast toast-${toast.type}" role="status">${toast.message}</p>` : ""}`
}

function concentrationChoices(planner, current) {
  const chosen = Array.isArray(current) ? current : current ? [current] : []
  return html`
    <div class="checks checks-stacked" data-concentrations>
      ${planner.columns.map((c) => html`
        <label class="check"><input type="checkbox" name="concentration" value="${c.name}"${checked(chosen.includes(c.name))}> ${c.name}</label>`)}
    </div>
    <p class="hint" data-concentration-warning${chosen.length < 2 ? raw(" hidden") : ""}>Most students do one concentration. Each one you add needs four more courses, two at the 400 level.</p>`
}

function credentialChoices(current) {
  const notes = {
    BSc: "MACM 316 plus two more courses from Tables I or III.",
    BA: "One more CMPT course from Tables I or III, plus 15 units in Arts and Social Sciences."
  }
  return html`
    <div class="choices" role="radiogroup" aria-label="Credential">
      ${Object.entries(CREDENTIALS).map(([key, name]) => html`
        <label class="choice">
          <input type="radio" name="credential" value="${key}"${checked(current === key)}>
          <span class="choice-box"><strong>${key}, ${name}</strong><span>${notes[key]}</span></span>
        </label>`)}
    </div>`
}

/* ---------- Setup ---------- */

function setupView() {
  const year = new Date().getFullYear()
  return html`
    <div class="setup">
      <section class="setup-intro">
        <h1 class="display">Plan your SFU CompSci degree.</h1>
        <p class="lede">Add your transcript, pick your concentration, and see what's left before you graduate.</p>
      </section>

      <form class="panel setup-form" data-form="setup">
        <div class="form-errors" role="alert" hidden></div>

        <section class="step">
          <span class="step-number">1</span>
          <div class="step-body">
            <h2>Your program</h2>
            <div class="field">
              <label for="s-major">Major</label>
              <select id="s-major" name="major"><option>${MAJOR}</option></select>
            </div>
            <fieldset class="field">
              <legend class="label">Degree</legend>
              ${credentialChoices("BSc")}
            </fieldset>
            <fieldset class="field">
              <legend class="label">Concentration you are planning</legend>
              ${concentrationChoices(FALL_2023, [])}
              <p class="hint">Four courses from one Table I column, at least two at the 400 level. You can change this later.</p>
            </fieldset>
          </div>
        </section>

        <section class="step">
          <span class="step-number">2</span>
          <div class="step-body">
            <h2>Degree planner</h2>
            <p class="hint">Use the planner for the term you were admitted. The Fall 2023 planner is built in. For another year, download the Computing Science major planner PDF from sfu.ca/computing and add it here.</p>
            <div class="choices">
              <label class="choice">
                <input type="radio" name="plannerSource" value="builtin" checked>
                <span class="choice-box"><strong>Fall 2023 planner</strong><span>Built in.</span></span>
              </label>
              <label class="choice">
                <input type="radio" name="plannerSource" value="upload">
                <span class="choice-box"><strong>Upload my planner</strong><span>An SFU Computing Science major planner PDF.</span></span>
              </label>
            </div>
            <div class="field">
              <label for="s-planner">Planner PDF</label>
              <input type="file" id="s-planner" name="planner" accept=".pdf">
            </div>
          </div>
        </section>

        <section class="step">
          <span class="step-number">3</span>
          <div class="step-body">
            <h2>When you started</h2>
            <div class="field-row">
              <div class="field">
                <label for="s-season">First term</label>
                <select id="s-season" name="season">${Object.keys(SEASON_ORDER).map((s) => html`<option${selected(s, "Fall")}>${s}</option>`)}</select>
              </div>
              <div class="field">
                <label for="s-year">Year</label>
                <input type="number" id="s-year" name="year" min="2000" max="2100" value="${year}" required>
              </div>
              <div class="field">
                <label for="s-years">Years to plan</label>
                <input type="number" id="s-years" name="years" min="1" max="10" value="5" required>
              </div>
            </div>
            <label class="check"><input type="checkbox" name="summers" checked> Include summer terms</label>
          </div>
        </section>

        <section class="step">
          <span class="step-number">4</span>
          <div class="step-body">
            <h2>Unofficial transcript</h2>
            <p class="hint">Optional. Download your unofficial transcript from goSFU as a PDF. Your completed and current courses are placed in their terms.</p>
            <div class="field">
              <label for="s-transcript">Transcript PDF</label>
              <input type="file" id="s-transcript" name="transcript" accept=".pdf,.txt">
            </div>
          </div>
        </section>

        <div class="form-actions"><button class="button">Build my plan</button></div>
      </form>
    </div>`
}

/* ---------- Plan ---------- */

function cardView(course, board) {
  const counts = board.countsToward(course)
  const scheduled = board.terms.some((t) => t.id === course.termId)
  return html`
    <article class="card card-${course.status}" draggable="true" data-action="editCourse" data-id="${course.id}"
             data-course-id="${course.id}" data-requirements="${board.report.requirementIdsFor(course.id).join(" ")}">
      <div class="card-top">
        <button type="button" class="card-code" data-action="editCourse" data-id="${course.id}" aria-label="Edit ${course.code}">${course.code}</button>
        <span class="card-units">${fmt(course.units)} units</span>
      </div>
      ${course.title ? html`<p class="card-title">${course.title}</p>` : ""}
      <div class="card-meta">
        <span class="card-status">${course.grade || STATUSES[course.status]}</span>
        <span class="card-counts">${counts.length ? counts.join(", ") : scheduled ? "Elective" : ""}</span>
      </div>
    </article>`
}

function addCourseForm(termId, label) {
  return html`
    <form class="add-course" data-form="addCourse" data-term="${termId || ""}">
      <input type="text" name="code" placeholder="Add a course" list="course-codes" required autocomplete="off" aria-label="Course code for ${label}">
      <button class="button button-small">Add</button>
    </form>`
}

function termView(term, board) {
  const courses = board.coursesIn(term.id)
  const now = termKey(term) === currentTermKey()
  const intern = !!term.internship
  const full = intern && courses.length >= 1
  const showToggle = intern || courses.length <= 1
  const showRemove = courses.length === 0
  return html`
    <section class="term${now ? " term-current" : ""}${intern ? " term-internship" : ""}" data-term-zone="${term.id}" aria-label="${termLabel(term)}">
      <header class="term-head">
        <h3>${termLabel(term)}${intern ? html`<span class="term-tag">Co-op</span>` : ""}</h3>
        <span class="term-units">${fmt(board.unitsIn(term.id))} units</span>
      </header>
      ${intern ? html`<p class="term-note">Internship or co-op work term. You can take at most one course.</p>` : ""}
      <div class="cards">${courses.map((c) => cardView(c, board))}</div>
      ${full ? "" : addCourseForm(term.id, termLabel(term))}
      ${showToggle || showRemove ? html`
        <div class="term-controls">
          ${showToggle ? html`<button type="button" class="text-button" data-action="toggleInternship" data-id="${term.id}">${intern ? "Make a study term" : "Make an internship term"}</button>` : ""}
          ${showRemove ? html`<button type="button" class="text-button" data-action="removeTerm" data-id="${term.id}">Remove term</button>` : ""}
        </div>` : ""}
    </section>`
}

function requirementDetail(result) {
  const req = result.requirement
  return html`
    <div class="req req-${result.state}" data-requirement-id="${req.id}">
      <div class="req-head">
        <span class="req-name">${req.name}</span>
        <span class="req-state">${result.state === "done" ? progressText(result) : `${STATE_LABELS[result.state]}, ${progressText(result)}`}</span>
      </div>
      ${result.chosen.length && !(result.unitBased && !req.pool) ? html`
        <div class="codes">${result.chosen.map((c) => html`<span class="code code-${c.status}">${c.code}</span>`)}</div>` : ""}
      ${result.remainingText ? html`<p class="req-left">${result.remainingText}</p>` : ""}
      ${result.options.length ? html`
        <div class="codes">
          <span class="options-label">Add to Not scheduled:</span>
          ${result.options.map((code) => html`<button type="button" class="add-code" data-action="addOption" data-code="${code}">${code}</button>`)}
        </div>` : ""}
      ${req.notes && result.state === "open" ? html`<p class="req-note">${req.notes}</p>` : ""}
    </div>`
}

// One line under a progress bar: the first thing still needed, and how many more items are open.
function firstNeed(group) {
  const open = group.results.filter((r) => r.state === "open")
  if (!open.length) return null
  const first = open[0]
  const named = group.key === "wqb" ? `${first.requirement.name}: ${first.remainingText}` : first.remainingText
  return open.length > 1 ? `${named}. ${open.length} items open.` : named
}

function rowView(group) {
  const isOpen = expanded.has(group.key)
  const ids = group.results.map((r) => r.requirement.id).join(" ")
  const counted = group.unitBased ? `${fmt(group.counted)} of ${fmt(group.target)} units` : `${fmt(group.counted)} of ${fmt(group.target)}`
  const width = (status) => (group.target > 0 ? (group.filled[status] / group.target) * 100 : 0)
  const note = group.state === "done" ? "Done" : group.state === "open" ? firstNeed(group) : group.state === "planned" ? "Covered by your plan" : "Covered once current courses finish"
  return html`
    <section class="row row-${group.state}" data-req-ids="${ids}">
      <button type="button" class="row-toggle" data-action="toggleRow" data-key="${group.key}" aria-expanded="${isOpen}">
        <span class="row-name">${group.label}</span>
        <span class="row-count"><strong>${counted}</strong></span>
        <span class="bar" aria-hidden="true">
          ${["completed", "in_progress", "planned"].map((s) => (width(s) > 0 ? html`<span class="bar-${s}" style="width:${width(s).toFixed(2)}%"></span>` : ""))}
        </span>
        <span class="row-note">${note}</span>
      </button>
      ${isOpen ? html`<div class="row-detail">${group.results.map(requirementDetail)}</div>` : ""}
    </section>`
}

function courseDialog(course, program) {
  const terms = [...db.plan.terms].sort((a, b) => termKey(a) - termKey(b))
  const termOption = (t) => {
    const full = t.internship && db.plan.courses.some((c) => c.termId === t.id && c.id !== course.id)
    const label = `${termLabel(t)}${t.internship ? " (co-op)" : ""}`
    return html`<option value="${t.id}"${selected(t.id, course.termId)}${full ? raw(" disabled") : ""}>${label}${full ? " (full)" : ""}</option>`
  }
  const otherTags = (course.tags || []).filter((t) => !WQB_TAGS.includes(t))
  return html`
    <dialog class="modal" id="course-dialog" aria-labelledby="dialog-title">
      <div class="modal-body">
        <header class="modal-head">
          <h2 id="dialog-title">${course.code}</h2>
          <button type="button" class="text-button" data-action="closeDialog">Close</button>
        </header>
        <form class="form" data-form="saveCourse" data-id="${course.id}">
          <div class="form-errors" role="alert" hidden></div>
          <div class="field-row">
            <div class="field"><label for="c-code">Course code</label><input type="text" id="c-code" name="code" required list="course-codes" value="${course.code}"></div>
            <div class="field field-small"><label for="c-units">Units</label><input type="number" id="c-units" name="units" step="0.5" min="0" value="${course.units}"></div>
          </div>
          <div class="field"><label for="c-title">Title</label><input type="text" id="c-title" name="title" value="${course.title}"></div>
          <div class="field-row">
            <div class="field">
              <label for="c-term">Term</label>
              <select id="c-term" name="term"><option value="">Not scheduled</option>${terms.map(termOption)}</select>
            </div>
            <div class="field">
              <label for="c-status">Status</label>
              <select id="c-status" name="status">${Object.entries(STATUSES).map(([v, l]) => html`<option value="${v}"${selected(v, course.status)}>${l}</option>`)}</select>
            </div>
            <div class="field field-small"><label for="c-grade">Grade</label><input type="text" id="c-grade" name="grade" value="${course.grade}"></div>
          </div>
          <fieldset class="field">
            <legend class="label">WQB designations</legend>
            <div class="checks">${WQB_TAGS.map((tag) => html`<label class="check"><input type="checkbox" name="wqb" value="${tag}"${checked((course.tags || []).includes(tag))}> ${tag}</label>`)}</div>
            <p class="hint">Check the course in the SFU calendar. A course counts toward one breadth area only.</p>
            <input type="hidden" name="otherTags" value="${otherTags.join(",")}">
          </fieldset>
          <div class="field">
            <label for="c-pin">Count toward</label>
            <select id="c-pin" name="pin"><option value="">Decide automatically</option>${program.requirements.map((r) => html`<option value="${r.id}"${selected(r.id, course.pinnedRequirementId)}>${r.category}: ${r.name}</option>`)}</select>
            <p class="hint">Only change this when the School approved a substitution.</p>
          </div>
          <div class="form-actions">
            <button class="button">Save course</button>
            <button type="button" class="button button-danger" data-action="deleteCourse" data-id="${course.id}">Remove course</button>
          </div>
        </form>
      </div>
    </dialog>`
}

function planView() {
  const program = programFor()
  const board = boardFor(db.plan, program)
  const { profile, planner } = db
  const showPast = store.getPreference("showPast", false)
  const t = board.totals
  const editing = editingCourseId && db.plan.courses.find((c) => c.id === editingCourseId)
  const status = board.finishTerm
    ? `Your plan meets every requirement by ${termLabel(board.finishTerm)}.`
    : `${plural(board.openCount, "requirement")} still need courses in your plan.`

  return html`
    <section class="summary">
      <div>
        <p class="summary-program">${profile.major}, ${profile.credential} <span>${concentrationsOf(profile).length ? `${concentrationsOf(profile).join(" and ")} concentration, ` : ""}${planner.catalog} planner</span></p>
        <p class="big-number display">${fmt(t.completed)}<small>of ${fmt(board.targetUnits)} units completed</small></p>
      </div>
      <div class="summary-actions">
        <a class="button button-secondary" href="#/transcript">Update transcript</a>
      </div>
      <div class="runway">
        <div class="slots" role="img" aria-label="${fmt(t.completed)} units completed, ${fmt(t.in_progress)} in progress, ${fmt(t.planned)} planned, out of ${fmt(board.targetUnits)}">
          ${board.runwayCells.map((s) => html`<span class="slot slot-${s}"></span>`)}
        </div>
        <div class="legend">
          <span class="key key-completed"><strong>${fmt(t.completed)}</strong> completed</span>
          <span class="key key-in_progress"><strong>${fmt(t.in_progress)}</strong> in progress</span>
          <span class="key key-planned"><strong>${fmt(t.planned)}</strong> planned</span>
          <span class="key"><strong>${fmt(board.unitsLeft)}</strong> not planned yet</span>
        </div>
      </div>
      <p class="status-line${board.finishTerm ? " is-complete" : ""}">${status}</p>
    </section>

    <div class="workspace">
      <aside class="progress" aria-label="Requirements">
        <header class="section-head">
          <h2>Requirements</h2>
          <button type="button" class="text-button" data-action="toggleAllRows">${expanded.size ? "Collapse all" : "Expand all"}</button>
        </header>
        <div class="rows">${board.groups.map(rowView)}</div>
      </aside>

      <section class="terms-area" aria-label="Terms">
        <header class="section-head">
          <h2>Terms</h2>
          ${board.pastTerms.length ? html`<button type="button" class="text-button" data-action="togglePast" aria-expanded="${showPast}">${showPast ? "Hide finished terms" : `Show ${plural(board.pastTerms.length, "finished term")}`}</button>` : ""}
        </header>
        ${showPast && board.pastTerms.length ? html`<div class="term-grid">${board.pastTerms.map((term) => termView(term, board))}</div>` : ""}
        <div class="term-grid">
          ${board.upcomingTerms.map((term) => termView(term, board))}
          <form class="term term-new" data-form="addTerm">
            <h3>Add a term</h3>
            <div class="term-new-fields">
              <select name="season" aria-label="Season">${Object.keys(SEASON_ORDER).map((s) => html`<option${selected(s, "Fall")}>${s}</option>`)}</select>
              <input type="number" name="year" min="2000" max="2100" value="${board.terms.at(-1)?.year ?? new Date().getFullYear()}" aria-label="Year">
            </div>
            <label class="check"><input type="checkbox" name="internship"> Internship or co-op term</label>
            <button class="button button-secondary button-small">Add term</button>
          </form>
        </div>
        <section class="tray" data-term-zone="" aria-label="Not scheduled">
          <header class="term-head">
            <h3>Not scheduled</h3>
            <span class="term-units">${plural(board.backlog.length, "course")}</span>
          </header>
          <p class="hint">Drag a course here when you could not get a seat. It stops counting until you put it back in a term.</p>
          <div class="cards">${board.backlog.map((c) => cardView(c, board))}</div>
          ${addCourseForm("", "Not scheduled")}
        </section>
      </section>
    </div>
    <datalist id="course-codes">${knownCodes(planner).map((c) => html`<option value="${c}"></option>`)}</datalist>
    ${editing ? courseDialog(editing, program) : ""}`
}

/* ---------- Transcript and settings ---------- */

function transcriptView() {
  return html`
    <header class="page-head"><h1 class="display">Update your transcript</h1></header>
    <form class="panel panel-body narrow" data-form="importTranscript">
      <div class="form-errors" role="alert" hidden></div>
      <p>Download your unofficial transcript from goSFU and add it here each term. Courses are placed in their terms, missing terms are added, and courses already in your plan are updated instead of duplicated.</p>
      <div class="field"><label for="t-file">Transcript PDF</label><input type="file" id="t-file" name="file" accept=".pdf,.txt"></div>
      <div class="field">
        <label for="t-text">Or paste the transcript text</label>
        <textarea id="t-text" name="text" rows="8" placeholder="2025 Fall&#10;CMPT 310   Intro Artificial Intelligence   3.00   3.00   A-   11.01"></textarea>
      </div>
      <div class="form-actions">
        <button class="button">Import courses</button>
        <a class="button button-secondary" href="#/">Back to plan</a>
      </div>
    </form>`
}

function accountView() {
  const signup = authMode === "signup"
  const tab = (mode, label) => html`<button type="button" class="auth-tab${authMode === mode ? " is-current" : ""}" data-action="authMode" data-mode="${mode}" aria-pressed="${authMode === mode}">${label}</button>`
  return html`
    <header class="page-head"><h1 class="display">${signup ? "Create account" : "Sign in"}</h1></header>
    <form class="panel panel-body narrow" data-form="account">
      <div class="auth-tabs">${tab("signin", "Sign in")}${tab("signup", "Create account")}</div>
      <div class="form-errors" role="alert" hidden></div>
      <p>Open the same plan on your phone and your laptop. It syncs automatically while you are signed in.</p>
      <div class="field"><label for="a-email">Email</label><input type="email" id="a-email" name="email" autocomplete="email" required></div>
      <div class="field"><label for="a-password">Password</label><input type="password" id="a-password" name="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="6" required></div>
      <input type="hidden" name="mode" value="${authMode}">
      <div class="form-actions"><button class="button">${signup ? "Create account" : "Sign in"}</button></div>
    </form>`
}

function settingsView() {
  const { profile, planner } = db
  return html`
    <header class="page-head"><h1 class="display">Settings</h1></header>
    <div class="stack narrow">
      <form class="panel panel-body" data-form="saveProfile">
        <div class="form-errors" role="alert" hidden></div>
        <h2>Program</h2>
        <fieldset class="field"><legend class="label">Degree</legend>${credentialChoices(profile.credential)}</fieldset>
        <fieldset class="field">
          <legend class="label">Concentration</legend>
          ${concentrationChoices(planner, concentrationsOf(profile))}
        </fieldset>
        <div class="field">
          <label for="p-planner">Replace the degree planner</label>
          <input type="file" id="p-planner" name="planner" accept=".pdf">
          <p class="hint">Now using the ${planner.catalog} planner${planner.source === "upload" ? ", from your upload" : ""}. Leave this empty to keep it.</p>
        </div>
        <div class="form-actions"><button class="button">Save program</button></div>
      </form>

      <section class="panel panel-body">
        <h2>Backup</h2>
        <p>Your plan lives in this browser. Download a backup to keep a copy or to open your plan on another device.</p>
        <div class="form-actions"><button type="button" class="button button-secondary" data-action="downloadBackup">Download backup</button></div>
        <form class="form" data-form="restoreBackup">
          <div class="form-errors" role="alert" hidden></div>
          <div class="field"><label for="b-file">Restore from a backup</label><input type="file" id="b-file" name="file" accept=".json,application/json" required></div>
          <div class="form-actions"><button class="button button-secondary">Restore backup</button></div>
        </form>
      </section>

      <section class="panel panel-body danger">
        <h2>Start over</h2>
        <p>Deletes your plan from this browser and returns to setup.</p>
        <div class="form-actions"><button type="button" class="button button-danger" data-action="startOver">Delete my plan</button></div>
      </section>
    </div>`
}

/* ---------- Router ---------- */

function route() {
  const path = location.hash.replace(/^#/, "") || "/"
  if (path === "/account" && cloud.configured && !user) return [accountView(), "account"]
  if (!db) return [setupView(), "setup"]
  if (path === "/transcript") return [transcriptView(), "transcript"]
  if (path === "/settings") return [settingsView(), "settings"]
  return [planView(), "plan"]
}

function render() {
  const routeKey = db ? location.hash || "#/" : "setup"
  const [content, section] = route()
  app.innerHTML = layout(content, section).text
  document.title = section === "plan" ? "gradplan" : `${section.charAt(0).toUpperCase()}${section.slice(1)} | gradplan`

  if (toast) {
    const current = toast
    toast = null
    setTimeout(() => {
      const el = document.querySelector(".toast")
      if (el && el.textContent === current.message) el.remove()
    }, 4000)
  }
  if (routeKey !== lastRoute) {
    window.scrollTo(0, 0)
    editingCourseId = null
    lastRoute = routeKey
  }

  const dialog = document.getElementById("course-dialog")
  if (dialog) {
    dialog.addEventListener("close", () => {
      editingCourseId = null
      dialog.remove()
    })
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close() })
    dialog.showModal()
  }
}

/* ---------- Actions ---------- */

const actions = {
  toggleRow(el) {
    const key = el.dataset.key
    if (expanded.has(key)) expanded.delete(key)
    else expanded.add(key)
    store.setPreference("expanded", [...expanded])
    render()
  },
  toggleAllRows() {
    if (expanded.size) expanded.clear()
    else programFor().groups.forEach((g) => expanded.add(g.key))
    store.setPreference("expanded", [...expanded])
    render()
  },
  togglePast() {
    store.setPreference("showPast", !store.getPreference("showPast", false))
    render()
  },
  editCourse(el) {
    editingCourseId = el.dataset.id
    render()
  },
  closeDialog() {
    document.getElementById("course-dialog")?.close()
  },
  deleteCourse(el) {
    const course = db.plan.courses.find((c) => c.id === el.dataset.id)
    if (!confirm(`Remove ${course.code} from your plan?`)) return
    db.plan.courses = db.plan.courses.filter((c) => c.id !== course.id)
    editingCourseId = null
    persist(`Removed ${course.code}.`)
  },
  addOption(el) {
    db.plan.courses.push(makeCourse(programFor(), { code: el.dataset.code }))
    persist(`Added ${el.dataset.code} to Not scheduled. Drag it into a term.`)
  },
  removeTerm(el) {
    const term = db.plan.terms.find((t) => t.id === el.dataset.id)
    db.plan.terms = db.plan.terms.filter((t) => t.id !== term.id)
    persist(`Removed ${termLabel(term)}.`)
  },
  toggleInternship(el) {
    const term = db.plan.terms.find((t) => t.id === el.dataset.id)
    term.internship = !term.internship
    persist(term.internship ? `${termLabel(term)} is now an internship term.` : `${termLabel(term)} is a study term again.`)
  },
  downloadBackup() {
    download(`gradplan-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 2))
  },
  startOver() {
    if (!confirm("Delete your plan from this browser? Download a backup first if you want to keep it.")) return
    db = null
    store.save(null)
    go("/", "Your plan was deleted.")
  },
  async signOut() {
    await cloud.signOut()
    user = null
    go("/", "Signed out. Your plan stays on this device.")
  },
  authMode(el) {
    authMode = el.dataset.mode
    render()
  }
}

/* ---------- Forms ---------- */

const text = (data, name) => String(data.get(name) ?? "").trim()

const forms = {
  async setup(form, data) {
    const year = parseInt(data.get("year"), 10)
    if (!(year >= 2000 && year <= 2100)) return showErrors(form, ["Enter the year you started, for example 2023."])
    const done = busy(form.querySelector(".form-actions .button"), "Building your plan")
    try {
      let planner = FALL_2023
      if (data.get("plannerSource") === "upload") {
        planner = await readPlanner(data.get("planner"))
        if (!planner) {
          done()
          return showErrors(form, ["Choose your planner PDF, or use the built-in Fall 2023 planner."])
        }
      }
      const names = new Set(planner.columns.map((c) => c.name))
      const concentrations = data.getAll("concentration").filter((n) => names.has(n))
      const next = {
        profile: {
          major: MAJOR,
          credential: data.get("credential") === "BA" ? "BA" : "BSc",
          concentrations,
          startSeason: data.get("season"),
          startYear: year
        },
        planner,
        plan: {
          terms: buildTerms({ startSeason: data.get("season"), startYear: year, years: parseInt(data.get("years"), 10) || 5, summers: data.get("summers") === "on" }),
          courses: []
        }
      }
      let message = "Your plan is ready. Add future courses to each term."
      const transcript = data.get("transcript")
      if (transcript && transcript.size) {
        const result = importTranscript(next.plan, buildProgram(next.planner, next.profile), await fileToText(transcript))
        message = result.created
          ? `Your plan is ready with ${plural(result.created, "course")} from your transcript.`
          : "Your plan is ready. No courses were found in the transcript, so add them from the Transcript page."
      }
      db = next
      store.save(db)
      cloud.push(db)
      lastRoute = null
      go("/", message)
    } catch (error) {
      done()
      showErrors(form, [error.message])
    }
  },

  async saveProfile(form, data) {
    const done = busy(form.querySelector(".form-actions .button"), "Saving")
    try {
      const planner = (await readPlanner(data.get("planner"))) || db.planner
      const names = new Set(planner.columns.map((c) => c.name))
      db.planner = planner
      db.profile.credential = data.get("credential") === "BA" ? "BA" : "BSc"
      db.profile.concentrations = data.getAll("concentration").filter((n) => names.has(n))
      delete db.profile.concentration
      const ids = new Set(buildProgram(db.planner, db.profile).requirements.map((r) => r.id))
      db.plan.courses.forEach((c) => { if (c.pinnedRequirementId && !ids.has(c.pinnedRequirementId)) c.pinnedRequirementId = null })
      store.save(db)
      cloud.push(db)
      go("/", "Saved your program.")
    } catch (error) {
      done()
      showErrors(form, [error.message])
    }
  },

  addCourse(form, data) {
    const code = CC.normalize(data.get("code"))
    if (!CC.isValid(code)) {
      toast = { message: `${code || "That"} is not a course code. Use the form CMPT 310.`, type: "alert" }
      return render()
    }
    const termId = form.dataset.term || null
    if (internshipFull(termId)) {
      toast = { message: "That internship term already has a course.", type: "alert" }
      return render()
    }
    db.plan.courses.push(makeCourse(programFor(), { code, termId }))
    persist(`Added ${code}.`)
  },

  addTerm(form, data) {
    const season = data.get("season")
    const year = parseInt(data.get("year"), 10)
    if (!(year >= 2000 && year <= 2100)) {
      toast = { message: "Enter a year between 2000 and 2100.", type: "alert" }
      return render()
    }
    if (db.plan.terms.some((t) => t.season === season && t.year === year)) {
      toast = { message: `${season} ${year} is already in your plan.`, type: "alert" }
      return render()
    }
    const internship = data.get("internship") === "on"
    db.plan.terms.push({ id: newId(), season, year, internship })
    persist(internship ? `Added ${season} ${year} as an internship term.` : `Added ${season} ${year}.`)
  },

  saveCourse(form, data) {
    const course = db.plan.courses.find((c) => c.id === form.dataset.id)
    const code = CC.normalize(data.get("code"))
    if (!CC.isValid(code)) return showErrors(form, ["Course code should look like CMPT 310."])
    if (internshipFull(data.get("term") || null, course.id)) return showErrors(form, ["That internship term already has a course. An internship term holds at most one."])
    const other = String(data.get("otherTags") || "").split(",").filter(Boolean)
    Object.assign(course, {
      code,
      title: text(data, "title"),
      units: Math.max(Number(data.get("units")) || 0, 0),
      termId: data.get("term") || null,
      status: data.get("status"),
      grade: text(data, "grade").toUpperCase(),
      tags: [...new Set([...data.getAll("wqb"), ...other])],
      pinnedRequirementId: data.get("pin") || null
    })
    editingCourseId = null
    persist(`Saved ${code}.`)
  },

  async importTranscript(form, data) {
    const done = busy(form.querySelector(".form-actions .button"), "Reading transcript")
    try {
      const file = data.get("file")
      const content = file && file.size ? await fileToText(file) : text(data, "text")
      const result = importTranscript(db.plan, programFor(), content)
      if (!result.created && !result.updated) {
        done()
        return showErrors(form, ["No courses were found. Check that this is your SFU unofficial transcript, or paste its text instead."])
      }
      store.save(db)
      cloud.push(db)
      let message = `Added ${result.created} and updated ${result.updated} courses.`
      if (result.skipped.length) message += ` Left out ${result.skipped.join(", ")}, which earned no credit.`
      go("/", message)
    } catch (error) {
      done()
      showErrors(form, [`The transcript could not be read: ${error.message}`])
    }
  },

  async account(form, data) {
    const email = text(data, "email")
    const password = String(data.get("password") || "")
    const mode = data.get("mode") === "signup" ? "signup" : "signin"
    const done = busy(form.querySelector(".form-actions .button"), mode === "signup" ? "Creating account" : "Signing in")
    try {
      if (mode === "signup") {
        const session = await cloud.signUp(email, password)
        if (!session) {
          done()
          return showErrors(form, ["Account created. Switch to Sign in to continue."])
        }
      } else {
        await cloud.signIn(email, password)
      }
      // The auth-state listener pulls the saved plan and re-renders.
    } catch (error) {
      done()
      const message = /invalid login credentials/i.test(error.message) ? "Wrong email or password." : error.message
      showErrors(form, [message])
    }
  },

  async restoreBackup(form, data) {
    try {
      db = store.fromBackup(await data.get("file").text())
      store.save(db)
      cloud.push(db)
      go("/", "Restored your backup.")
    } catch (error) {
      showErrors(form, [error.message])
    }
  }
}

/* ---------- Events ---------- */

document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]")
  if (!el || !actions[el.dataset.action]) return
  event.preventDefault()
  actions[el.dataset.action](el)
})

document.addEventListener("submit", (event) => {
  const form = event.target.closest("form[data-form]")
  if (!form || !forms[form.dataset.form]) return
  event.preventDefault()
  forms[form.dataset.form](form, new FormData(form))
})

document.addEventListener("change", (event) => {
  if (event.target.id === "s-planner" && event.target.files.length) {
    document.querySelector('input[name="plannerSource"][value="upload"]').checked = true
  }
  if (event.target.name === "concentration") {
    const group = event.target.closest("[data-concentrations]")
    const warning = group?.parentElement.querySelector("[data-concentration-warning]")
    if (warning) warning.hidden = group.querySelectorAll("input:checked").length < 2
  }
})

// Drag courses between terms.
let dragged = null
const clearZones = () => document.querySelectorAll(".is-over").forEach((z) => z.classList.remove("is-over"))

document.addEventListener("dragstart", (event) => {
  const card = event.target.closest?.("[data-course-id]")
  if (!card) return
  dragged = card.dataset.courseId
  event.dataTransfer.effectAllowed = "move"
  event.dataTransfer.setData("text/plain", dragged)
  requestAnimationFrame(() => card.classList.add("is-dragging"))
})

document.addEventListener("dragover", (event) => {
  const zone = event.target.closest?.("[data-term-zone]")
  if (!zone || !dragged) return
  event.preventDefault()
  if (!zone.classList.contains("is-over")) {
    clearZones()
    zone.classList.add("is-over")
  }
})

document.addEventListener("drop", (event) => {
  const zone = event.target.closest?.("[data-term-zone]")
  if (!zone || !dragged) return
  event.preventDefault()
  const course = db.plan.courses.find((c) => c.id === dragged)
  dragged = null
  clearZones()
  if (!course) return
  const termId = zone.dataset.termZone || null
  if (course.termId === termId) return render()
  if (internshipFull(termId, course.id)) {
    const target = db.plan.terms.find((t) => t.id === termId)
    toast = { message: `${termLabel(target)} is an internship term and already has a course.`, type: "alert" }
    return render()
  }
  course.termId = termId
  const term = db.plan.terms.find((t) => t.id === termId)
  persist(term ? `Moved ${course.code} to ${termLabel(term)}.` : `Moved ${course.code} to Not scheduled.`)
})

document.addEventListener("dragend", () => {
  dragged = null
  clearZones()
  document.querySelectorAll(".is-dragging").forEach((c) => c.classList.remove("is-dragging"))
})

// Hovering a course shows the requirements it counts toward, and the reverse.
let hoverTarget = null
function highlight(event) {
  const card = event.target.closest?.("[data-requirements]")
  const row = card ? null : event.target.closest?.("[data-req-ids]")
  const target = card || row
  if (target === hoverTarget) return
  hoverTarget = target
  document.querySelectorAll(".is-linked, .is-active").forEach((el) => el.classList.remove("is-linked", "is-active"))
  if (!target) return
  target.classList.add("is-active")
  if (card) {
    const ids = card.dataset.requirements.split(" ").filter(Boolean)
    document.querySelectorAll("[data-req-ids]").forEach((r) => {
      if (r.dataset.reqIds.split(" ").some((id) => ids.includes(id))) r.classList.add("is-linked")
    })
    ids.forEach((id) => document.querySelector(`[data-requirement-id="${CSS.escape(id)}"]`)?.classList.add("is-linked"))
  } else {
    const ids = row.dataset.reqIds.split(" ")
    document.querySelectorAll("[data-requirements]").forEach((c) => {
      if (c.dataset.requirements.split(" ").some((id) => ids.includes(id))) c.classList.add("is-linked")
    })
  }
}
document.addEventListener("mouseover", highlight)
document.addEventListener("focusin", highlight)

// When a user signs in, their saved plan follows them to this device.
async function syncOnUser(nextUser) {
  user = nextUser
  if (user) {
    try {
      const remote = await cloud.pull()
      if (remote && remote.profile && remote.plan) {
        db = remote
        store.save(db)
      } else if (db) {
        cloud.push(db)
      }
    } catch (error) {
      toast = { message: `Could not sync your plan: ${error.message}`, type: "alert" }
    }
    if (location.hash === "#/account") return go("/", "Signed in.")
  }
  render()
}

if (cloud.configured) {
  cloud.onUser(syncOnUser)
  cloud.init().then((u) => u && syncOnUser(u))
}

window.addEventListener("hashchange", render)
window.addEventListener("storage", (event) => {
  if (event.key === "gradplan:v2") {
    db = store.load()
    render()
  }
})

render()
