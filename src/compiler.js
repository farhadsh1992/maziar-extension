import * as db from "./db.js";
import { getSettings } from "./settings.js";

export class CompileError extends Error {}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function fileToBase64(file) {
  if (file.isBinary) {
    return bytesToBase64(new Uint8Array(file.content));
  }
  return bytesToBase64(new TextEncoder().encode(file.content));
}

/**
 * Compiles a project via the local FastAPI compile server (backend/main.py)
 * — the extension itself has no way to run latexmk. Returns
 * { success, log, pdfBlobUrl } or { success: false, log, error }.
 */
export async function compileProject(projectId, mainFile = "main.tex") {
  const settings = await getSettings();
  const files = await db.listFiles(projectId);
  if (files.length === 0) {
    throw new CompileError("This project has no files yet.");
  }
  const payload = {
    main: mainFile,
    engine: settings.engine,
    files: files.map((f) => ({ path: f.path, content_base64: fileToBase64(f) })),
  };

  let response;
  try {
    response = await fetch(`${settings.compileServerUrl.replace(/\/$/, "")}/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new CompileError(
      `Couldn't reach the compile server at ${settings.compileServerUrl}. ` +
      `Is it running? (${e.message})`
    );
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new CompileError(detail.detail || `Compile server returned HTTP ${response.status}.`);
  }

  const result = await response.json();
  if (!result.success) {
    return { success: false, log: result.log || "", error: result.error || "Compilation failed." };
  }

  const pdfBytes = base64ToBytes(result.pdf_base64);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  return { success: true, log: result.log || "", pdfBlobUrl: URL.createObjectURL(blob) };
}

export async function checkServerHealth() {
  const settings = await getSettings();
  try {
    const response = await fetch(`${settings.compileServerUrl.replace(/\/$/, "")}/health`);
    if (!response.ok) return { reachable: false };
    const data = await response.json();
    return { reachable: true, latexmk: !!data.latexmk };
  } catch {
    return { reachable: false };
  }
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
