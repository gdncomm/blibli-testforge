# TestForge — How to Use It

> **Superseded (D-199):** this guide describes the removed browser UI. Use the TestForge Mac app; its welcome tour and tips cover every feature, and the README maps each old tab to its new place.

> **Read this first.** This guide describes the **v3 guided workflow, which is under design review**
> ([`workflow-plan.md`](workflow-plan.md)). Parts that already work today are marked ✅; parts that
> are designed but **not built yet** are marked 🚧. If a screen in this guide doesn't match what you
> see, it is probably 🚧 — check the [status legend](#12-status-legend) at the end.

---

## 1. What this is

The TestForge is a web page on your own Mac that lets you test the Blibli iOS app on a simulator
with Claude doing the clicking. You pick **which code** to test, the TestForge builds it, Claude
follows your test cases on the simulator using **TestForgeDriver**, and you review and sign off the
results.

Every result is tied to exactly the code it tested:

```
📁 Repo → 🌿 Branch → 🔖 Commit → 🔨 Build → 📱 Simulator → ▶ Run → ✅/❌ Verdict + 📸 evidence
```

If any link in that chain is out of date (for example, someone pushed new code after your build),
the TestForge tells you and stops you from running until it's fixed. That's how you know a PASS
really means "this branch works".

You never need the terminal. Every problem shows what happened, why, and a button to fix it.

---

## 2. Before you start (once per Mac)

Tick each item. Ask a developer to help the first time if any is ✗.

| You need | How to check | If missing |
|---|---|---|
| **Xcode** | Open Xcode from Applications | Install from the App Store |
| **A simulator** | Xcode → Window → Devices and Simulators → Simulators | Add an iPhone simulator there |
| **Node.js 22+** | Ask a developer, or the TestForge tells you on first start | `brew install node` (developer) |
| **Claude, logged in** | Run Claude Code once and sign in | Install Claude Code; sign in with your company account |
| **test-flow-recorder plugin** | In Claude Code, `/plugin` shows *test-flow-recorder* | Ask the team for the install command |
| **Atlassian connected in Claude** | claude.ai → Settings → Connectors → Atlassian shows *Connected* | Click *Connect* and sign in (needed to read Confluence test cases) |
| **VPN** | Company VPN connected | Connect before building (dependency downloads need it) |

**Start the TestForge:** double-click **`TestForge server.app`** (in `tools/test-forge-server/` of the repo).
A small window tells you what is ready, then your browser opens `http://127.0.0.1:4545`. ✅

Keep the browser tab open while you work. The page reconnects on its own if the TestForge restarts.

---

## 3. Home — where you start 🚧

The TestForge opens on **Home**:

- **What do you want to do?** — three big buttons: **Run test cases**, **Describe a check** (in your
  own words) and **Replay a macro**. The first two open the Test Cases tab with the right mode
  chosen.
- **Running now** — shown while something runs, with **Watch**.
- **Needs you** — everything waiting on you: results to review, Claude asking for permission, a macro
  replay that needs a repair. Each has one button that takes you there.
- **Recent runs** — what ran, on which code, the result and whether it has been reviewed. Click a row
  to open it.
- **Macros** — every saved macro with its kind, steps, how many steps find their element by ID
  (⚠ = some rely on visible text) and the last result, with **▶ Replay**.

## 3a. Your first test run 🚧

*(Question 1 is built ✅ — it is the first panel on the Test Cases tab. Questions 2–3 and the single
▶ Run button are still 🚧: below Question 1 you see the older Documents / Cases panels. Try the full
design in the clickable prototype.)*

Open the **Test Cases** tab. It says **"Test your app on the simulator"** and asks three questions.
Answer them top to bottom, then press the big **▶ Run** button. That's all you do — everything else
happens by itself.

### Question 1 — What code do you want to test? ✅

Pick one of the two tabs:

- **A branch on GitHub** (usual for QA): choose the **Project** (e.g. *BlibliIOSApp*) and type the
  **Branch** name (e.g. `release/v14.9.0`) to search. Under it you see the branch's latest commit, so
  you know you picked the right one. Branches that exist only on GitHub work too.
- **A local repository (git working copy)** (usual for developers, before pushing): pick your
  **Local repository** — any folder that contains a `.git` working copy; not listed? choose *Another
  local repository…* and paste its path. It shows what will be tested, e.g. *"2 commits not pushed ·
  4 uncommitted files — included"*. The TestForge copies a snapshot of it when you press Run; it only
  *reads* your repository, so keep coding. Reports from a local repository say **LOCAL CHANGES**,
  because nobody else can get that exact code.

**In today's build ✅** the panel is called **1 · What code?**:

1. Click **A GitHub branch** or **A local repository (git working copy)**.
2. **Repository** — the repositories found under `~/Projects` (two folders deep; set
   `TEST_FORGE_PROJECT_ROOTS` for other places). *Another local repository…* is 🚧.
3. GitHub branch: type in **Branch** and pick from the list (each line shows the commit, its title
   and how old it is). The list comes from your repository's last fetch; **↻ Check GitHub** asks
   GitHub directly (VPN needed) and adds branches you don't have yet. A branch only on your Mac says
   so — use *A local repository* for it.
4. Press **Prepare release/v14.9.0** (or **Take a snapshot of my working copy**). A short list shows
   each step — *Get the code*, *Swift packages*, *CocoaPods* — and skips what is already done. The
   first GitHub copy of BlibliIOSApp takes about a minute; a repeat takes seconds.
5. Done looks like: **✓ Ready: release/v14.9.0 @ 1a2b3c4** with the commit title, author and the
   number of changed files. A local snapshot reads like `28f5c17+9650` and carries a **LOCAL
   CHANGES** chip. If you edit code afterwards, a yellow note says the results are for the earlier
   snapshot, with **Snapshot my latest code**.

*(In the design, Prepare happens automatically when you press ▶ Run; until the Run button exists,
you press Prepare yourself. ▶ Run does not use the QA copy yet — that comes with the Build step.)*

🛡️ Either way, your own project folder, Xcode and simulator are never touched. Tests run in a
separate copy of the code on a separate **QA simulator**.

### Question 2 — Which tests?

1. Paste the link to your test-case page in Confluence (or pick a file) and press **Read test cases**.
   Claude reads the page; it never writes to it.
2. You see *"✓ 96 test cases found"* and a list. Tick the tests to run — or use **Select all**,
   **Only last failures**, or search.
3. If the TestForge can't tell which column of your table is which, a yellow box asks you (e.g.
   *"Which column holds the steps?"*). Answer once; it remembers that page.

### Question 3 — Run

1. Choose how much Claude may do on its own:
   - **Ask me before anything unusual** (recommended): Claude taps and reads the app freely and
     asks you before anything else.
   - **Don't ask — run unattended**: for long runs of tests you've run before.
2. **More options** (you rarely need these): fake API responses (*mocks*, see §8), build settings,
   and *"Don't build — test the app already on the QA simulator"* (needs a reason; the report then
   says **UNVERIFIED BUILD**).
3. Press **▶ Run 8 tests on develop**. The button says exactly what will happen. If it's grey, the
   text next to it tells you what's missing.

### Or: describe it in your own words (and save it as a macro) 🚧

In question 2, switch to **Describe it in your own words** when there's no test case for what you want:

1. Pick the kind: **Check a flow**, **Verify a bug fix** or **Record a routine** (something you
   repeat, like *log in with the test account*). For a bug fix, type the ticket (e.g. `IOS-47031`) and
   press **Load Jira**: only **Bug** tickets are accepted — anything else (an Improvement, a Story) is
   refused with an explanation. The loaded ticket fills in what to check; edit it if you like.
2. Write what Claude should do or check, in plain words — e.g. *"Open Flash Sale, tap the Tomorrow
   tab and make sure the app doesn't freeze and the product list shows."*
3. Optional **Start from**: a saved routine to run first (e.g. *Login as test user*).
4. Press **▶ Check it on develop**. The same automatic list runs; at the end Claude drives the app and
   you watch each step being recorded.

The result shows Claude's verdict and screenshots — **Agree** or **Change the verdict** (with a
reason) — and every step Claude took. Each step is marked **by ID** (finds its element by its
accessibility ID — reliable) or **by text ⚠** (finds it by visible text — can break when copy or
language changes; ask a developer to add an ID).

**Save as macro…** gives the steps a name and kind, and every element a permanent ID. It shows a
**map** of the macro: steps grouped by screen, each with a small phone showing which element it uses
(blue = tap/read, green = check, amber = found by text — fragile). Check the map and tick *"I've
checked the map — these steps do what I asked"* to save. The macro is saved **in the repository next
to the UI tests** (never in the app). Every saved macro has a **Map** button on Home. Saved macros appear under
**Macros** on the right with **▶ Replay**: the steps run again directly, **without Claude**, in a few
seconds. If the app has changed and a step can't find its element, the replay stops and offers **Ask
Claude to repair**; Claude suggests a new way to find it, you **approve**, and every macro using that
element is fixed at once.

### What happens after you press Run

The questions fold into one line (*"Testing develop @ a1b2c3d · 8 tests"*), and a list ticks off by
itself:

| Line | What the TestForge does | How long |
|---|---|---|
| **Get the code** (or **Copy your folder**) | Downloads the latest code of the branch into its own copy; installs libraries only if they changed | first time 5–15 min, then seconds |
| **Build the app** | Compiles the app and the test runner | ~10 min; skipped if this exact code was already built |
| **Get the QA simulator ready** | Creates the QA simulator (first time), starts it, installs the build | 1–3 min |
| **Final checks** | Code, build and simulator match; Claude and the test tools are connected; disk space; nobody else is using the simulator | seconds |
| **Run 8 tests** | Claude runs each test, one at a time | ~1–2 min per test |

Lines that are already done from last time show **"Already up to date"** / **"Already built"** and
are skipped, so a second run starts in about a minute.

**It only stops when something needs you.** The line turns yellow or red and says what happened in
plain words, with one button to fix it — for example *"Can't reach GitHub — connect the VPN"* →
**Retry**, *"Not enough disk space"* → **Free 22 GB and continue**, or *"The app didn't build"* →
**Copy log** for a developer. If the simulator is busy with another run, it waits and continues by
itself.

**While tests run** you see which test is running and the step Claude is on. To watch the app
itself, use **Show Simulator window** on the right and keep it next to your browser. Buttons:
**Pause after this test**, **Skip this test**, **Talk to Claude**, and **Stop** at the top. If Claude
needs permission, a yellow card asks **Allow / Always allow / Don't allow** — see §7. If the app
crashes, that test is marked **BLOCKED** (*couldn't finish*) with the crash log.

You can leave the page; it keeps going, and the tab shows a number when something needs you.

### Then: review the results

When the tests finish, the **Results — your review** card appears. Claude's verdicts are
suggestions: open each test, look at the screenshots, and **Agree**, **Change the verdict** (with a
reason) or **Run it again** — see §4 and §5.

---

## 4. Reading results

| Verdict | Means | What you do |
|---|---|---|
| **PASS** | The app did what the test case expects | Glance at the evidence, **Agree** |
| **FAIL** | The app did something different | Open it, compare *expected* vs *observed*. Real bug → **Agree** and report it. Claude got it wrong → **Change the verdict** to PASS with a reason |
| **BLOCKED** | The case couldn't run (crash, missing data, harness problem) | Fix the cause (the card says what), then **Re-run** |
| **EVIDENCE_ONLY** | Claude collected evidence but the case needs a human judgement (e.g. "looks good") | Look at the screenshots, **Change the verdict** to PASS or FAIL |
| **UNDECIDED** | Claude couldn't decide | Same as EVIDENCE_ONLY |
| **FLAKY** 🚧 | Failed, then passed on re-run | Treat as a warning; tell a developer — flaky tests hide real bugs |

**Evidence** is everything Claude used to decide: screenshots, a screen recording, the network calls
the app made, which mocks were on, and Claude's short explanation.

---

## 5. Validating and reporting ✅

- **Every** case needs your decision before the run counts as *Validated*:
  - **Agree** — you agree with the verdict.
  - **Change the verdict** — you change it to PASS or FAIL. Anyone may override, but a valid reason is
    required and shows in the report.
  - **Run it again** — you want it run again.
- **Re-run the ones that didn't pass** re-runs all failures once. A case that passes the second time becomes **FLAKY**.
- **Report** creates a summary with the exact code, build, simulator and test doc used, the
  per-case verdicts with your sign-off, and links to the evidence. You can:
  - **Export** it as a file, or
  - **Publish** it to your personal Confluence page (`2437316839`).

  It is **never** written to the team's test-case page.
- **Compare** two runs to see what changed between, say, yesterday's `develop` and today's.

---

## 6. Running again ✅ — the driver does it, Claude only when something breaks

The first time a case runs, Claude does it (it reads the steps and works the app). When it
passes, the same Claude session **saves it as a macro** in the repo, linked to the case. The
TestForge replays that macro once on the driver, and keeps it only if that replay passes.

From then on the case is **replayed by the driver**: no Claude, no credits, usually under 30 s.
Anyone who pulls the branch gets the macro, the elements it uses and the mock responses it needs
(`BlibliMobile_XCUITest/TestForgeMacros/mocks/`).

When a replay fails, Claude looks at it before you do:

| Claude says | What happens |
|---|---|
| 🩺 **App bug** | The FAIL stands, with Claude's one-line reason. This is what the test is for. |
| 🔧 **Macro broken** (an id or label changed, a new sheet in the way) | Claude fixes the macro or element, and the driver replays it at once. The case shows "macro repaired" and the files changed. Review them before committing. |
| 🌐 **Environment** (backend, network, simulator, login) | The case is BLOCKED, with the reason. |

Cases run one after another **in the same app session**. The app is relaunched only when it has to
be: it isn't on Home, or a case changes something the app reads at start.

**One macro, many names:** a macro lives in one place. Another module reuses it with a small
reference file (`<name>.ref.json` → the macro's id) instead of a copy. The Macros tab warns about
copies.

---

## 7. Talking to Claude during a run ✅

Every case runs as a **Claude session**. Open it from the run view, the **Queue** tab or the
**Sessions** tab to watch the conversation.

- **Approval card** — Claude wants to do something that needs permission. You can:
  - **Approve** — once.
  - **Always allow** — for this project from now on.
  - **Deny** — optionally say why; Claude reads your reason.
- **Question card** — Claude asks you something (e.g. "which account should I log in with?"). Pick
  an option or type your own answer.
- **Type a message** at any time — e.g. "the login screen changed, the button is now called *Masuk*".
  If Claude is busy, your message is delivered as soon as it finishes its current step.
- **Interrupt** stops what Claude is doing right now. **Close** ends the session.
- **Ask Claude about this screen** (Device panel) starts a new chat with the current simulator screen
  attached — handy when you see something odd.

**When to use Autonomous:** for long, unattended runs of cases you've run before. Some actions are
always refused no matter what you approve — for example, Claude can never edit or comment on the
team's production test-case page.

---

## 8. Mocks — making an API misbehave on purpose ✅ / 🚧

Some test cases need the app to receive an empty list, an error, or a slow answer. The **Mocking**
tab (✅ today) lets you:

1. Paste an API address and an example response.
2. Get ready-made variants: *loaded*, *empty*, *500 error*, *slow*, *timeout*.
3. Switch between them **live** — the running app picks up the change immediately.

In the v3 flow, step ② lets you attach a saved set of mocks to a case or a whole run, so they switch
on automatically. 🚧

---

## 9. When something goes wrong

| You see | It means | Do this |
|---|---|---|
| "Can't reach GitHub — VPN?" | No network or VPN to GitHub | Connect VPN, click **Retry** |
| "This branch no longer exists on GitHub" | Someone deleted or renamed it | Pick another branch |
| "QA copy damaged" / disk full | The TestForge's own copy broke or the disk is full | **Rebuild QA copy** or **Free disk space** — only the TestForge's own folder is touched |
| "Installing dependencies failed" | A package download failed | Check VPN, **Retry**; still failing → **Copy log** to a developer |
| "Build failed" + an error line | The code doesn't compile on this branch | **Copy log** to a developer — that's a bug in the branch, not in your setup |
| "⚠ Rebuild needed" | New commits since your build | **Rebuild** |
| "No simulator" | None is running | **Boot** |
| Harness "stopped" / "wedged" | The test runner isn't running | **Ensure** / **Restart** in the Device step |
| "Claude is not logged in" / "plugin missing" | Claude setup on this Mac | Follow the **How to fix** link |
| "Couldn't read Confluence page" | Atlassian not connected in Claude, or no access | Connect Atlassian in claude.ai; check you can open the page in the browser |
| Wrong columns in the preview | The page uses unusual column names | Fix the column dropdowns in the preview |
| Case **BLOCKED** — app crashed | The app crashed during the case | Open the crash log; **Relaunch & continue**; report the crash |
| "Device busy — … is using it" | Another run or chat is using the simulator | Wait, or open **Queue** to see / cancel it |
| Red bar "Dashboard server is not responding" | The TestForge stopped | Double-click **TestForge server.app** again |

---

## 10. Safety — what the TestForge will never do

- **Never touch your project.** All testing happens in its own QA copy in `~/.test-forge` — your
  project folder, branches, unsaved work, Xcode build cache and your own simulator are never changed.
- **Never commit, push or rebase** anything in git.
- **Never edit or comment on the team's production test-case page** in Confluence — this is enforced,
  not just a setting.
- **Never start a build on its own** — builds only happen when you click.
- **Never send your passwords or tokens anywhere** — it uses your own logged-in Claude and GitHub.

---

## 11. Glossary and FAQ

| Word | Meaning |
|---|---|
| **Setup** | Everything a run needs: repo, branch, simulator, test doc, (mocks). Can be saved. |
| **Repo** | A project's code (e.g. BlibliIOSApp). |
| **Branch** | A line of work in the repo (e.g. `develop`, `release/v14.9.0`). |
| **Commit** | One exact version of the code, shown as a short code like `a1b2c3d`. |
| **QA copy** | The TestForge's own separate copy of a repo, in `~/.test-forge`. Tests always run there. |
| **QA simulator** | The TestForge's own simulator, so your own simulator's app is never replaced. |
| **Prepare** | Get the QA copy onto the chosen branch and install what it needs. |
| **Build** | Turn the code into an app the simulator can run. |
| **Harness** | The test runner on the simulator that carries out Claude's taps and swipes. |
| **TestForgeDriver** | The set of tools Claude uses to see and control the app on the simulator. |
| **Check** | The readiness checklist before a run. |
| **Verdict** | Claude's result for a case (PASS, FAIL, BLOCKED, EVIDENCE_ONLY, UNDECIDED). |
| **Validate** | Your sign-off on each verdict (Agree / Change the verdict / Run it again). |
| **Mock** | A fake API answer you control, to test empty, error or slow cases. |
| **Session** | A conversation with Claude; every case run is one. |
| **Queue** | The waiting line of tasks; simulator tasks run one at a time. |

**FAQ**

- **Does it cost money?** Each ▶ Run uses Claude, so yes, a little — the Home tab shows the total
  spend. ⚡ Replay of a recorded case and all the Mocking / Driver buttons are free.
- **Can I keep coding while a test runs?** Yes. Tests use the TestForge's own QA copy and QA
  simulator; your project and your simulator aren't touched.
- **Where does the QA copy live, and how big is it?** In `~/.test-forge` (a few GB per repo with
  dependencies and build files). **Free disk space** removes copies unused for 14 days.
- **Can it test on several simulators at once?** Not yet — the TestForge is being stabilised on one
  simulator first.
- **Can two people share one TestForge?** No — it runs on your Mac and only you can open it.
- **Why did my run wait before starting?** Something else was using the simulator; the **Queue** tab
  shows what.
- **Claude marked a case FAIL but it's fine.** Use **Change the verdict** → PASS, with a reason. The report shows
  your override.
- **How do I know what code a report tested?** Every report starts with the exact repo, branch,
  commit, build and simulator.

---

## 12. Status legend

| Mark | Meaning |
|---|---|
| ✅ | Works in today's build |
| 🚧 | Designed (see [`workflow-plan.md`](workflow-plan.md)) but **not built yet** — being built phase by phase |

**Available today ✅:**

- Sessions (chat, approvals, questions)
- Queue (device and general lanes)
- Projects (open Claude in any repo, or in Terminal)
- Mocking tab
- Driver Console with harness Build / Ensure
- Loading test cases from Confluence or a file
- ▶ Run and ⚡ Replay per case
- **QA simulator** panel: which simulator, whether the driver runner is connected, who is using it,
  **Show Simulator window**, "Ask Claude about this screen" (no live mirror — pin the Simulator window
  next to your browser, D-033)
- **Question 1 — What code?**: GitHub branch or local repository, prepared into a separate QA copy
- Macro replay without Claude (server side only — `POST /api/macros/v2/<id>/replay`; the Macros
  screen is 🚧)
- Home overview
- **Run selected** as one run (✅ P4): cases with a recorded macro replay it, the rest go to Claude;
  the **Run** panel shows each case, the current step and the simulator screen, with **⏸ Pause**
  (finish this case, then wait), **▶ Continue**, **⏭ Skip case** and **Cancel run**. If the app crashes,
  the case is **BLOCKED** with the crash report and the run waits for **↻ Relaunch & continue**
- **Results — your review** (✅ P5): open a case (▸) for its screenshots, steps, mocked responses and
  summary; **✓ Accept**, **✎ Override** (PASS/FAIL + why) or **↻ Needs re-run**; **↻ Re-run failed**
  (a fail that now passes shows **FLAKY**); **⬇ Export report** (Markdown) and **📝 Publish to
  Confluence** (a new page under your personal page — Claude asks you first)

**Designed, not built 🚧:**

- Questions 2–3 and the single ▶ Run button with the automatic progress list
- Running tests on the QA copy, and the separate QA simulator
- Build-to-commit linkage and "Rebuild needed"
- The readiness checklist
- Column-mapping preview
- Mocks attached to cases
- Saved setups and "Run again"
