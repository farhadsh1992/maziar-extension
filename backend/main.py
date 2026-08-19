"""Local LaTeX compile server for the Maziar browser extension.

Browser extensions can't shell out to `latexmk`/`pdflatex` themselves — no
OS process access from a page or service worker. This is the missing piece:
a small FastAPI server, meant to run on the user's own machine (or wherever
they choose to host it), that does real compilation and hands back the PDF.
The extension's Settings page points at this server's URL (defaults to
http://127.0.0.1:8477).

Not a hosted service — nothing here is designed for multi-tenant/public
deployment. If you do expose this beyond localhost, put your own auth and
rate limiting in front of it: anyone who can reach /compile can run
latexmk on this machine.
"""
from __future__ import annotations

import asyncio
import base64
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Maziar Compile Server")

# Extension pages run under chrome-extension://<id> / moz-extension://<id>
# origins, not a normal http(s) origin — CORS has to allow those explicitly
# rather than a fixed list, since the id varies per install/browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ENGINES = {
    "pdflatex": "-pdf",
    "xelatex": "-xelatex",
    "lualatex": "-lualatex",
}
COMPILE_TIMEOUT_SECONDS = 60


class CompileFile(BaseModel):
    path: str
    content_base64: str


class CompileRequest(BaseModel):
    files: list[CompileFile]
    main: str = "main.tex"
    engine: str = "pdflatex"


class CompileResponse(BaseModel):
    success: bool
    log: str
    pdf_base64: str | None = None
    error: str | None = None


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "latexmk": shutil.which("latexmk") is not None,
    }


@app.post("/compile", response_model=CompileResponse)
async def compile_latex(request: CompileRequest) -> CompileResponse:
    if shutil.which("latexmk") is None:
        raise HTTPException(
            status_code=503,
            detail="latexmk isn't installed on this machine. Install TeX Live/TinyTeX first.",
        )
    if request.engine not in ENGINES:
        raise HTTPException(status_code=400, detail=f"Unknown engine “{request.engine}”.")

    with tempfile.TemporaryDirectory(prefix="maziar-compile-") as tmp:
        tmp_path = Path(tmp)
        for f in request.files:
            # Reject anything trying to escape the temp dir (e.g. "../../etc/passwd")
            # — every file must resolve to somewhere strictly inside it.
            dest = (tmp_path / f.path).resolve()
            if not str(dest).startswith(str(tmp_path.resolve()) + "/"):
                raise HTTPException(status_code=400, detail=f"Invalid file path: {f.path}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            try:
                dest.write_bytes(base64.b64decode(f.content_base64))
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Bad file content for {f.path}: {e}") from e

        main_path = tmp_path / request.main
        if not main_path.is_file():
            raise HTTPException(status_code=400, detail=f"Main file “{request.main}” wasn't in the upload.")

        args = [
            "latexmk", ENGINES[request.engine],
            "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape",
            request.main,
        ]
        try:
            proc = await asyncio.create_subprocess_exec(
                *args, cwd=tmp_path,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=COMPILE_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            proc.kill()
            return CompileResponse(success=False, log="", error=f"Compilation timed out after {COMPILE_TIMEOUT_SECONDS}s.")

        log = stdout.decode("utf-8", errors="replace")
        pdf_path = main_path.with_suffix(".pdf")
        if proc.returncode == 0 and pdf_path.is_file():
            pdf_b64 = base64.b64encode(pdf_path.read_bytes()).decode("ascii")
            return CompileResponse(success=True, log=log, pdf_base64=pdf_b64)
        return CompileResponse(success=False, log=log, error="Compilation failed. See the log.")
