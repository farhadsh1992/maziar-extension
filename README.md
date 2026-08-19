<p align="center">
  <img src="icons/icon128.png" alt="Maziar logo" width="96">
</p>

# Maziar (Browser Extension)

A real in-browser rewrite of [Maziar](https://github.com/farhadsh1992/maziar-macos) — projects,
a LaTeX source editor, and a PDF preview, running as a Chrome/Firefox extension (Manifest V3).
Click the toolbar icon to open it in its own tab. No build step, no bundler — every dependency
is a small vendored file loaded directly.

**Status: Phase 1.** Project management, the editor, and real LaTeX compilation all work and are
verified end-to-end (see "How this was verified" below). Not yet ported: AI settings/chat,
Conferences/Journals tracking, the Papers/rebuttal workflow, poster/slide generation, the
code-page generator — same phased approach as the [Linux rewrite](https://github.com/farhadsh1992/maziar-linux).

## Why this needs a small local server

A browser extension has no OS process access — it cannot shell out to `pdflatex`/`latexmk` the
way the native Mac/Linux apps do. The obvious extension-only alternative is a WebAssembly LaTeX
engine (fully client-side, no server), and that's what this project set out to use — bundling
[SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX)'s WASM pdfTeX build. It doesn't work: that
engine fetches its base format/package files from a SwiftLaTeX-hosted server at compile time, and
that server is down. This was verified two ways, not assumed — a local copy of the engine failed
with `I can't find the format file`, and so did SwiftLaTeX's own official live demo site, clicking
its own "Compile" button, with the identical error. The project's last release was 2022; its
infrastructure appears abandoned. See `THIRD_PARTY_LICENSES.md` for the full note.

So instead: `backend/` is a small FastAPI server (`uv run uvicorn main:app --port 8477`) that runs
real `latexmk` on your own machine and hands the PDF back over HTTP. The extension's Settings
panel points at it (`http://127.0.0.1:8477` by default). This is genuinely simpler than the WASM
path would have been, and it's real — not a stub.

## Features (this phase)

- **Project list** (`src/app.js`, `src/projects.js`) — new project from one of the same five
  LaTeX templates as the Mac/Linux apps (`src/templates.js`, copied verbatim — plain `.tex`, fully
  portable), importing a folder (via a `webkitdirectory` file input — works without any special
  filesystem API), importing a `.zip` (unpacked client-side with `fflate`), or importing a public
  GitHub repo (via GitHub's zipball endpoint — a real `git clone` isn't possible from a browser
  extension, so this is `codeload.github.com/<owner>/<repo>/zip/...`, declared in
  `host_permissions` since that endpoint doesn't send permissive CORS headers on its own).
- **Editor** — CodeMirror 5 with LaTeX syntax highlighting (`vendor/codemirror/mode/stex`), a file
  tree, autosave (800ms after you stop typing, plus Ctrl/Cmd+S), and a PDF preview rendered by the
  browser's own built-in PDF viewer (a `blob:` URL in an `<iframe>` — no PDF.js needed).
- **Storage** (`src/db.js`) — every project and file lives in IndexedDB (`unlimitedStorage`
  permission requested so this isn't capped at the ~10MB `chrome.storage` quota). Settings
  (compile server URL, engine) live in `chrome.storage.local` (`src/settings.js`), with a
  `localStorage` fallback so the app can be sanity-checked as a plain served page outside an
  installed extension too.
- **Compile server** (`backend/main.py`) — `POST /compile` takes a project's files (base64) and an
  engine (pdflatex/xelatex/lualatex), runs `latexmk -no-shell-escape` in an isolated temp
  directory with a 60s timeout, and returns the PDF or the log. Rejects any file path that tries
  to escape the temp directory. Not built for multi-tenant/public hosting — see the warning in
  `backend/main.py` if you ever expose it beyond localhost.

## What's not here yet

The AI provider client and settings, the AI Assistant chat, Conferences/Journals tracking with
AI-driven lookups, the Papers hub (reviewer comments, rebuttal drafting, Accept/Reject), poster/
slide `.pptx` generation, and the GitHub code-page generator are still Swift-only (or GTK-only on
Linux). These get ported in later phases, each verified as it's built, rather than all at once.

## Running it

1. Start the compile server:
   ```bash
   cd backend
   uv run uvicorn main:app --port 8477
   ```
   (Needs `latexmk` on `PATH` — TeX Live, MacTeX, or TinyTeX; same requirement as the native apps.)
2. Stage a loadable build: `./build.sh` (writes `dist-chrome/` and `dist-firefox/`).
3. **Chrome**: `chrome://extensions` → enable Developer mode → "Load unpacked" → select `dist-chrome/`.
4. **Firefox**: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → select
   `dist-firefox/manifest.json`. (Firefox drops temporary add-ons on restart — for something more
   permanent you'd sign it via [addons.mozilla.org](https://addons.mozilla.org).)
5. Click the toolbar icon to open Maziar in a new tab.

## How this was verified

Every piece was actually run, not just written:

- **Backend**: started for real and hit with `curl` — a real `.tex` template compiled to a real
  42KB PDF (`%PDF-1.7` header verified), a broken `.tex` file correctly came back
  `success: false` with a log, a path-traversal attempt (`../../evil.tex`) was correctly rejected,
  and CORS headers were confirmed present for a `chrome-extension://` origin.
- **Frontend**: served locally and driven in a real browser — created a project from the Article
  template, confirmed CodeMirror rendered with LaTeX syntax highlighting, edited the source and
  confirmed the edit landed in IndexedDB, clicked Compile and confirmed the request actually hit
  the backend (network tab) and the response was a genuine PDF (fetched the resulting `blob:` URL
  and checked its bytes directly — real `%PDF-1.7` header, byte count matching the backend's
  response), and confirmed the compile log rendered in the log panel.
- One real bug was caught and fixed this way: the original `window.prompt()`/`window.confirm()`
  calls for "new project name" etc. are unreliable in automated/embedded browser contexts (and
  arguably worse UX generally) — replaced with proper in-page modals (`promptModal`/`confirmModal`
  in `src/app.js`), which is also what made this testable in the first place.
- Not yet exercised: the actual Chrome/Firefox extension-loading flow itself (`chrome://extensions`
  → Load Unpacked), since driving that UI wasn't available in this environment. Every piece it
  would exercise (manifest correctness, `app.html` loading its scripts, IndexedDB, `fetch` to the
  backend) was verified independently as a plain served page instead.

## Project layout

```
manifest.chrome.json / manifest.firefox.json   MV3 manifests (build.sh picks one per target)
background.js                                   Opens/focuses the app tab on toolbar click
app.html / app.css                               The whole UI lives in one page
src/
  app.js            Rendering + routing (project list <-> editor), no framework
  db.js             IndexedDB wrapper (projects, files)
  projects.js       Project creation: template / folder / zip / GitHub import
  compiler.js       Talks to the backend's /compile endpoint
  settings.js       Compile server URL + engine, chrome.storage.local (localStorage fallback)
  templates.js      The 5 LaTeX starter templates
vendor/
  codemirror/       CodeMirror 5 (MIT) — editor + LaTeX (stex) syntax mode
  fflate/           fflate (MIT) — client-side zip decompression
backend/
  main.py           FastAPI compile server (POST /compile, GET /health)
```
