# Third-party licenses

Maziar's own code is MIT (see `LICENSE`). Two vendored libraries ship inside
`vendor/`, each under its own permissive license:

- **CodeMirror 5** (`vendor/codemirror/`) — MIT. https://codemirror.net/5/
  Used for the source editor (`mode/stex` gives LaTeX syntax highlighting).
- **fflate** (`vendor/fflate/`) — MIT. https://github.com/101arrowz/fflate
  Used to unzip `.zip` imports and GitHub repo downloads client-side.

Both vendored copies include their original `LICENSE` file unmodified.

## Note on the LaTeX compile engine

An earlier version of this project bundled [SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX)'s
WebAssembly pdfTeX engine to compile fully client-side, no server required.
That engine depends on fetching its base format/package files from a
SwiftLaTeX-hosted server at compile time — and that server is down (verified
against both a local copy and SwiftLaTeX's own official demo site, which
fails identically). The project's last release was 2022 and its
infrastructure appears abandoned, so this isn't fixable from here. The
extension instead calls a small local FastAPI server (`backend/`) that runs
real `latexmk` — see the main README for setup. Nothing from SwiftLaTeX is
bundled or used.
