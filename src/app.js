import * as db from "./db.js";
import * as projects from "./projects.js";
import { compileProject } from "./compiler.js";
import { getSettings, setSetting } from "./settings.js";
import { TEMPLATE_LABELS } from "./templates.js";

const root = document.getElementById("app-root");
const topBarActions = document.getElementById("top-bar-actions");

let state = { view: "list" }; // or { view: "editor", projectId, currentFile }

// -- small modal helpers (in-page, not window.prompt/confirm — extension
// pages/popups render those inconsistently, and an in-page modal matches
// the rest of the UI) -----------------------------------------------------

function promptModal(title, defaultValue = "") {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <h2>${title}</h2>
        <div class="field"><input id="prompt-input" value="${defaultValue.replace(/"/g, "&quot;")}"></div>
        <div class="modal-actions">
          <button class="btn" id="prompt-cancel">Cancel</button>
          <button class="btn btn-primary" id="prompt-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const input = backdrop.querySelector("#prompt-input");
    input.focus();
    input.select();
    const finish = (value) => {
      backdrop.remove();
      resolve(value);
    };
    backdrop.querySelector("#prompt-cancel").onclick = () => finish(null);
    backdrop.querySelector("#prompt-ok").onclick = () => finish(input.value.trim() || null);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") finish(input.value.trim() || null);
      if (ev.key === "Escape") finish(null);
    });
  });
}

function confirmModal(message) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <h2>Are you sure?</h2>
        <p>${message}</p>
        <div class="modal-actions">
          <button class="btn" id="confirm-cancel">Cancel</button>
          <button class="btn btn-danger" id="confirm-ok">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const finish = (value) => {
      backdrop.remove();
      resolve(value);
    };
    backdrop.querySelector("#confirm-cancel").onclick = () => finish(false);
    backdrop.querySelector("#confirm-ok").onclick = () => finish(true);
  });
}

// -- routing ------------------------------------------------------------------

function showList() {
  state = { view: "list" };
  render();
}

async function openProject(projectId) {
  await db.touchProject(projectId);
  const files = await db.listFiles(projectId);
  const mainFile = files.find((f) => f.path === "main.tex") || files.find((f) => f.path.endsWith(".tex"));
  state = { view: "editor", projectId, currentFile: mainFile ? mainFile.path : null, pdfBlobUrl: null, log: "", logVisible: false };
  render();
}

async function render() {
  topBarActions.innerHTML = "";
  root.innerHTML = "";
  if (state.view === "list") {
    await renderProjectList();
  } else {
    await renderEditor();
  }
}

// -- project list view --------------------------------------------------------

async function renderProjectList() {
  const view = document.createElement("div");
  view.id = "project-list-view";

  const title = document.createElement("h1");
  title.textContent = "Projects";
  view.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "subtitle";
  subtitle.textContent = "A LaTeX editor, right in your browser.";
  view.appendChild(subtitle);

  const errorBanner = document.createElement("div");
  errorBanner.className = "error-banner";
  errorBanner.style.display = "none";
  view.appendChild(errorBanner);
  function showError(message) {
    errorBanner.textContent = message;
    errorBanner.style.display = "block";
  }

  const actions = document.createElement("div");
  actions.className = "new-project-actions";

  for (const [key, label] of Object.entries(TEMPLATE_LABELS)) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = `New ${label}`;
    btn.onclick = async () => {
      const name = await promptModal(`Name for the new ${label} project:`, `${label} Project`);
      if (!name) return;
      try {
        const project = await projects.createFromTemplate(name, key);
        openProject(project.id);
      } catch (e) {
        showError(e.message);
      }
    };
    actions.appendChild(btn);
  }

  const importFolderBtn = document.createElement("button");
  importFolderBtn.className = "btn";
  importFolderBtn.textContent = "Import Folder…";
  const folderInput = document.createElement("input");
  folderInput.type = "file";
  folderInput.webkitdirectory = true;
  folderInput.multiple = true;
  folderInput.style.display = "none";
  folderInput.onchange = async () => {
    if (folderInput.files.length === 0) return;
    const topName = (folderInput.files[0].webkitRelativePath || "").split("/")[0] || "Imported Project";
    try {
      const project = await projects.importFileList(topName, folderInput.files);
      openProject(project.id);
    } catch (e) {
      showError(e.message);
    }
  };
  importFolderBtn.onclick = () => folderInput.click();
  actions.appendChild(importFolderBtn);
  actions.appendChild(folderInput);

  const importZipBtn = document.createElement("button");
  importZipBtn.className = "btn";
  importZipBtn.textContent = "Import Zip…";
  const zipInput = document.createElement("input");
  zipInput.type = "file";
  zipInput.accept = ".zip";
  zipInput.style.display = "none";
  zipInput.onchange = async () => {
    const file = zipInput.files[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const project = await projects.importZip(file.name.replace(/\.zip$/i, ""), buffer);
      openProject(project.id);
    } catch (e) {
      showError(e.message);
    }
  };
  importZipBtn.onclick = () => zipInput.click();
  actions.appendChild(importZipBtn);
  actions.appendChild(zipInput);

  const importGithubBtn = document.createElement("button");
  importGithubBtn.className = "btn";
  importGithubBtn.textContent = "Import from GitHub…";
  importGithubBtn.onclick = async () => {
    const url = await promptModal("Public GitHub repo URL:", "https://github.com/user/paper-template");
    if (!url) return;
    try {
      const project = await projects.importFromGithub(url);
      openProject(project.id);
    } catch (e) {
      showError(e.message);
    }
  };
  actions.appendChild(importGithubBtn);

  view.appendChild(actions);

  const list = await db.listProjects();
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No projects yet — start one above.";
    view.appendChild(empty);
  } else {
    const grid = document.createElement("div");
    grid.className = "project-grid";
    for (const project of list) {
      grid.appendChild(buildProjectRow(project));
    }
    view.appendChild(grid);
  }

  root.appendChild(view);

  const settingsBtn = document.createElement("button");
  settingsBtn.className = "btn";
  settingsBtn.textContent = "Settings";
  settingsBtn.onclick = openSettingsModal;
  topBarActions.appendChild(settingsBtn);
}

function buildProjectRow(project) {
  const row = document.createElement("div");
  row.className = "project-row";
  row.onclick = () => openProject(project.id);

  const left = document.createElement("div");
  const name = document.createElement("div");
  name.className = "project-name";
  name.textContent = project.name;
  const meta = document.createElement("div");
  meta.className = "project-meta";
  meta.textContent = `Updated ${new Date(project.updatedAt).toLocaleString()}`;
  left.appendChild(name);
  left.appendChild(meta);

  const rowActions = document.createElement("div");
  rowActions.className = "row-actions";
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.onclick = async (ev) => {
    ev.stopPropagation();
    if (!(await confirmModal(`Delete “${project.name}”? This can't be undone.`))) return;
    await db.deleteProject(project.id);
    render();
  };
  rowActions.appendChild(deleteBtn);

  row.appendChild(left);
  row.appendChild(rowActions);
  return row;
}

// -- editor view ---------------------------------------------------------------

let cmEditor = null;

async function renderEditor() {
  const project = (await db.listProjects()).find((p) => p.id === state.projectId);
  if (!project) {
    showList();
    return;
  }

  const view = document.createElement("div");
  view.id = "editor-view";

  const toolbar = document.createElement("div");
  toolbar.className = "editor-toolbar";

  const backBtn = document.createElement("button");
  backBtn.className = "btn";
  backBtn.textContent = "← Projects";
  backBtn.onclick = showList;
  toolbar.appendChild(backBtn);

  const titleEl = document.createElement("span");
  titleEl.className = "project-title";
  titleEl.textContent = project.name;
  toolbar.appendChild(titleEl);

  toolbar.appendChild(spacer());

  const newFileBtn = document.createElement("button");
  newFileBtn.className = "btn";
  newFileBtn.textContent = "New File";
  newFileBtn.onclick = async () => {
    const path = await promptModal("New file path (e.g. sections/intro.tex):");
    if (!path) return;
    if (await db.getFile(project.id, path)) {
      alert("A file with that path already exists.");
      return;
    }
    await db.putFile(project.id, path, "", false);
    state.currentFile = path;
    render();
  };
  toolbar.appendChild(newFileBtn);

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn";
  saveBtn.textContent = "Save";
  saveBtn.onclick = () => saveCurrentFile(project.id);
  toolbar.appendChild(saveBtn);

  const logToggleBtn = document.createElement("button");
  logToggleBtn.className = "btn";
  logToggleBtn.textContent = "Log";
  logToggleBtn.onclick = () => {
    state.logVisible = !state.logVisible;
    logEl.classList.toggle("visible", state.logVisible);
  };
  toolbar.appendChild(logToggleBtn);

  const compileBtn = document.createElement("button");
  compileBtn.className = "btn btn-primary";
  compileBtn.textContent = "Compile";
  compileBtn.onclick = () => runCompile(project.id, compileBtn);
  toolbar.appendChild(compileBtn);

  view.appendChild(toolbar);

  const panes = document.createElement("div");
  panes.className = "editor-panes";

  const fileTree = document.createElement("div");
  fileTree.id = "file-tree";
  panes.appendChild(fileTree);

  const editorPane = document.createElement("div");
  editorPane.id = "editor-pane";
  const editorHost = document.createElement("div");
  editorHost.style.flex = "1";
  editorHost.style.minHeight = "0";
  editorPane.appendChild(editorHost);
  panes.appendChild(editorPane);

  const pdfPane = document.createElement("div");
  pdfPane.id = "pdf-pane";
  pdfPane.innerHTML = state.pdfBlobUrl
    ? `<iframe src="${state.pdfBlobUrl}"></iframe>`
    : `<div id="pdf-empty">No PDF yet — click Compile.</div>`;
  panes.appendChild(pdfPane);

  view.appendChild(panes);

  const logEl = document.createElement("div");
  logEl.id = "compile-log";
  logEl.textContent = state.log || "";
  if (state.logVisible) logEl.classList.add("visible");
  view.appendChild(logEl);

  root.appendChild(view);

  await renderFileTree(fileTree, project.id);
  await loadFileIntoEditor(editorHost, project.id);
}

function spacer() {
  const s = document.createElement("div");
  s.className = "spacer";
  return s;
}

async function renderFileTree(container, projectId) {
  container.innerHTML = "";
  const files = await db.listFiles(projectId);
  for (const file of files) {
    const item = document.createElement("div");
    item.className = "file-tree-item" + (file.path === state.currentFile ? " active" : "");
    item.textContent = file.path;
    item.title = file.path;
    item.onclick = async () => {
      state.currentFile = file.path;
      render();
    };
    container.appendChild(item);
  }
}

async function loadFileIntoEditor(host, projectId) {
  if (cmEditor) {
    cmEditor.toTextArea?.();
    cmEditor = null;
  }
  host.innerHTML = "";

  if (!state.currentFile) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No file selected. Create one with “New File”.";
    host.appendChild(empty);
    return;
  }

  const file = await db.getFile(projectId, state.currentFile);
  const textarea = document.createElement("textarea");
  host.appendChild(textarea);

  if (file && file.isBinary) {
    textarea.value = "(binary file — editing not supported here)";
    textarea.disabled = true;
    return;
  }

  cmEditor = window.CodeMirror.fromTextArea(textarea, {
    mode: "stex",
    lineNumbers: true,
    theme: "eclipse",
    lineWrapping: true,
    value: file ? file.content : "",
  });
  cmEditor.setValue(file ? file.content : "");

  let saveTimer = null;
  cmEditor.on("keydown", (cm, ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "s") {
      ev.preventDefault();
      saveCurrentFile(projectId);
    }
  });
  cmEditor.on("change", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveCurrentFile(projectId, /* silent */ true), 800);
  });
}

async function saveCurrentFile(projectId, silent = false) {
  if (!cmEditor || !state.currentFile) return;
  await db.putFile(projectId, state.currentFile, cmEditor.getValue(), false);
  await db.touchProject(projectId);
  if (!silent) flashToolbar("Saved");
}

function flashToolbar(message) {
  const el = document.querySelector(".editor-toolbar .project-title");
  if (!el) return;
  const original = el.textContent;
  el.textContent = `${original} — ${message}`;
  setTimeout(() => {
    if (el.isConnected) el.textContent = original;
  }, 1200);
}

async function runCompile(projectId, button) {
  button.disabled = true;
  button.textContent = "Compiling…";
  const logEl = document.getElementById("compile-log");
  try {
    const mainFile = (await db.listFiles(projectId)).find((f) => f.path === "main.tex")
      ? "main.tex"
      : state.currentFile || "main.tex";
    const result = await compileProject(projectId, mainFile);
    state.log = result.log;
    state.logVisible = !result.success;
    if (logEl) {
      logEl.textContent = state.log;
      logEl.classList.toggle("visible", state.logVisible);
    }
    if (result.success) {
      state.pdfBlobUrl = result.pdfBlobUrl;
      const pdfPane = document.getElementById("pdf-pane");
      if (pdfPane) pdfPane.innerHTML = `<iframe src="${result.pdfBlobUrl}"></iframe>`;
    } else {
      alert(`Compile failed: ${result.error || "see log"}`);
    }
  } catch (e) {
    alert(e.message);
    if (logEl) {
      logEl.textContent = e.message;
      logEl.classList.add("visible");
    }
  } finally {
    button.disabled = false;
    button.textContent = "Compile";
  }
}

// -- settings modal --------------------------------------------------------

async function openSettingsModal() {
  const settings = await getSettings();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h2>Settings</h2>
      <div class="field">
        <label>Compile server URL</label>
        <input id="settings-url" value="${settings.compileServerUrl}">
      </div>
      <div class="field">
        <label>Engine</label>
        <select id="settings-engine">
          <option value="pdflatex">pdfLaTeX</option>
          <option value="xelatex">XeLaTeX</option>
          <option value="lualatex">LuaLaTeX</option>
        </select>
      </div>
      <p style="font-size:12px;color:var(--text-dim)">
        The extension can't run LaTeX itself — it calls a small local server
        that runs latexmk for real. See the README for how to start it
        (<code>uv run uvicorn main:app --port 8477</code> from
        <code>backend/</code>).
      </p>
      <div class="modal-actions">
        <button class="btn" id="settings-cancel">Cancel</button>
        <button class="btn btn-primary" id="settings-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#settings-engine").value = settings.engine;
  backdrop.querySelector("#settings-cancel").onclick = () => backdrop.remove();
  backdrop.querySelector("#settings-save").onclick = async () => {
    await setSetting("compileServerUrl", backdrop.querySelector("#settings-url").value.trim());
    await setSetting("engine", backdrop.querySelector("#settings-engine").value);
    backdrop.remove();
  };
}

render();
