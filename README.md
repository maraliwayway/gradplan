# gradplan

A graduation planner for the SFU Computing Science major. Pick BSc or BA and your concentrations, add your unofficial transcript, and gradplan shows a progress bar for every requirement: lower division, breadth, depth, your concentrations, the credential, writing, electives, WQB and unit totals. Drag courses between terms and every bar updates. Mark a term as an internship or co-op work term, which holds at most one course.

It runs entirely in the browser. PDFs are read on your device and never uploaded. Your plan is saved in your browser, and you can optionally sign in to sync it between your phone and laptop.

## Tech stack

- **Vanilla JavaScript** (ES modules), no framework and no build step
- **HTML and CSS**, with a single hand-written stylesheet that works down to phone width
- **[pdf.js](https://mozilla.github.io/pdf.js/)** from a CDN, loaded only when you open a PDF, to read planners and transcripts on-device
- **localStorage** for saving your plan, with JSON backup and restore
- **[Supabase](https://supabase.com/)** (optional) for email sign-in and cross-device sync; off until you add keys
- **Node.js test runner** (`node --test`) for the unit tests
- **GitHub Actions** for CI

## Run it on your computer

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly does not work because browsers block modules from files.

## Using it

1. **Setup.** Choose BSc or BA, the concentration you are planning, and your degree planner. The Fall 2023 planner is built in. For another catalog year, download the Computing Science major planner PDF from sfu.ca/computing and upload it. gradplan reads Table I, Table III, the lower division courses and upper division writing from it.
2. **Transcript.** Add your unofficial transcript PDF from goSFU. Completed and current courses go into their terms. Import a newer transcript each term from the Transcript page and courses update instead of duplicating.
3. **Plan.** Add courses to future terms. If you do not get a seat, drag the course to Not scheduled. Open a requirement row to see what counts toward it and add a suggested course in one click.
4. **WQB.** Open a course and tick its B-Sci, B-Soc or B-Hum designation from the SFU calendar. MACM 101 is marked B-Sci for you.
5. **Substitutions.** If the School approves a course for a requirement, open the course and set Count toward.

Change your credential, concentrations or planner any time in Settings. Download a backup there to keep a copy or move your plan to another device.

## Sign in and sync (optional)

By default gradplan is fully local and nothing is uploaded. To let people sign in and open the same plan on their phone and laptop, connect a free [Supabase](https://supabase.com/) project:

1. Create a project at supabase.com.
2. In the SQL Editor, run the queries in [`supabase.sql`](supabase.sql). They create a `plans` table and restrict every row to its owner.
3. For instant sign-in during testing, turn off email confirmation under Authentication, then Providers, then Email. Leave it on if you want confirmed emails.
4. For local use, copy `js/config.example.js` to `js/config.js` and fill in your project URL and publishable key from Settings, then API. `js/config.js` is gitignored.
5. For the deployed site, add the same two values as repository secrets named `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The deploy workflow writes them into the site.

A **Sign in** button appears once the keys are set. Signed-in changes save to your browser and to Supabase; signing in on another device loads that plan. The anon key is a public, browser-safe key, and row-level security keeps each plan private to its owner.

## Rules gradplan checks

These are the requirements for students admitted in Fall 2023 or later, from the SFU Computing Science major planner. The Fall 2023 planner still lists CMPT 300, which is no longer offered. CMPT 201 replaced it as a lower division course, so gradplan uses the current rules below, including for uploaded planners that still list CMPT 300.

| Requirement | Rule |
| --- | --- |
| Lower division | Every required course, including CMPT 201, plus one course from each "or" choice |
| Breadth | CMPT 307, plus four courses from four other Table I columns |
| Depth | Four 400-level Table I courses, in addition to breadth |
| Concentration | Four courses from one Table I column, at least two at the 400 level. These can also count for breadth and depth |
| BSc | MACM 316 plus two more courses from Tables I or III |
| BA | One more CMPT course from Tables I or III, 30 upper division CMPT units, and 15 units in Arts and Social Sciences with 6 at the upper division |
| Writing | CMPT 376W |
| Upper division electives | 6 units of any 300 or 400 level course |
| WQB | 6 units each of B-Sci, B-Soc and B-Hum. MACM 101 counts for 3 of the B-Sci units and for lower division |
| Units | 120 total, 45 upper division, 39 of those in CMPT, MACM or MATH |

Breadth, depth, the credential courses, writing and electives never share a course. The list of Arts and Social Sciences subjects is in `js/sfu.js`; check it against the SFU calendar. This tool is a guide. Confirm your plan with an FAS advisor.

## Tests

Needs Node.js 20 or newer. No packages to install.

```
npm test
```

## Code

Plain JavaScript modules, no build step, no framework. pdf.js loads from a CDN only when you choose a PDF.

| File | What it does |
| --- | --- |
| `js/sfu.js` | Built-in Fall 2023 planner and the SFU rules for BSc and BA |
| `js/sfu-planner.js` | Reads an SFU planner PDF by the position of its text |
| `js/audit.js` | Matches courses to requirements without double counting |
| `js/transcript.js` | Reads courses and terms from transcript text |
| `js/plan.js` | Terms, transcript import, and the progress numbers |
| `js/pdf-lines.js`, `js/pdf-text.js` | Turn a PDF into text |
| `js/course-code.js` | Finds and compares course codes |
| `js/store.js` | Saving in the browser and backups |
| `js/app.js` | Screens, forms, drag and drop |
