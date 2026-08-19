import * as db from "./db.js";
import { TEMPLATES } from "./templates.js";
import { unzipSync } from "../vendor/fflate/browser.js";

export class ProjectCreationError extends Error {}

export async function createFromTemplate(name, templateKey) {
  const template = TEMPLATES[templateKey];
  if (!template) throw new ProjectCreationError(`Unknown template “${templateKey}”.`);
  const project = await db.createProject(name.trim() || "Untitled");
  await db.putFile(project.id, "main.tex", template, false);
  return project;
}

// `webkitdirectory` file inputs give every file a `webkitRelativePath` like
// "MyProject/main.tex" — strip the top-level folder name off since that
// becomes the project's own name instead of living inside it as a path
// segment.
export async function importFileList(name, fileList) {
  const project = await db.createProject(name.trim() || "Imported Project");
  for (const file of fileList) {
    const relPath = file.webkitRelativePath || file.name;
    const path = relPath.includes("/") ? relPath.split("/").slice(1).join("/") : relPath;
    if (!path) continue;
    await writeBrowserFile(project.id, path, file);
  }
  return project;
}

export async function importZip(name, arrayBuffer) {
  let unzipped;
  try {
    unzipped = unzipSync(new Uint8Array(arrayBuffer));
  } catch (e) {
    throw new ProjectCreationError(`Couldn't read that zip file: ${e}`);
  }
  const paths = Object.keys(unzipped).filter((p) => !p.endsWith("/"));
  if (paths.length === 0) throw new ProjectCreationError("That zip file is empty.");

  // If everything lives under one shared top-level folder, unwrap it —
  // same collision-avoidance idea as the native apps' zip import.
  const topLevels = new Set(paths.map((p) => p.split("/")[0]));
  const stripPrefix = topLevels.size === 1 ? [...topLevels][0] + "/" : "";

  const project = await db.createProject(name.trim() || "Imported Project");
  for (const path of paths) {
    const relPath = stripPrefix && path.startsWith(stripPrefix) ? path.slice(stripPrefix.length) : path;
    if (!relPath) continue;
    const bytes = unzipped[path];
    const isBinary = !isLikelyText(bytes);
    const content = isBinary ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new TextDecoder().decode(bytes);
    await db.putFile(project.id, relPath, content, isBinary);
  }
  return project;
}

// GitHub's zipball endpoint (not `git clone` — a browser extension has no
// git protocol access) needs `codeload.github.com` in host_permissions to
// bypass its restrictive CORS policy; see manifest.*.json.
export async function importFromGithub(url) {
  const match = url.trim().match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!match) throw new ProjectCreationError("Enter a GitHub repo URL, e.g. https://github.com/user/paper-template");
  const [, owner, repo] = match;

  let ref = "HEAD";
  const repoInfoResp = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (repoInfoResp.ok) {
    const info = await repoInfoResp.json();
    ref = info.default_branch || "HEAD";
  }

  const zipResp = await fetch(`https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${ref}`);
  if (!zipResp.ok) {
    throw new ProjectCreationError(`Couldn't download that repo (HTTP ${zipResp.status}). Is it public?`);
  }
  const buffer = await zipResp.arrayBuffer();
  return importZip(repo, buffer);
}

async function writeBrowserFile(projectId, path, file) {
  const isBinary = !isLikelyTextName(file.name);
  if (isBinary) {
    const buffer = await file.arrayBuffer();
    await db.putFile(projectId, path, buffer, true);
  } else {
    const text = await file.text();
    await db.putFile(projectId, path, text, false);
  }
}

const TEXT_EXTENSIONS = new Set([".tex", ".bib", ".cls", ".sty", ".bst", ".txt", ".md", ".cfg"]);

function isLikelyTextName(name) {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return true;
  return TEXT_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

function isLikelyText(bytes) {
  // Cheap heuristic: a NUL byte in the first 512 bytes almost never appears
  // in real LaTeX/text sources, but is common in binary formats.
  const sample = bytes.subarray(0, 512);
  return !sample.includes(0);
}
