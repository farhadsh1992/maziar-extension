// IndexedDB wrapper — extension pages have no filesystem access, so every
// project and file lives here instead. Two stores: "projects" (id, name,
// createdAt, updatedAt) and "files" (compound key [projectId, path], with
// content as either a UTF-8 string or an ArrayBuffer for binary assets).
const DB_NAME = "maziar";
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("files")) {
        const store = db.createObjectStore("files", { keyPath: ["projectId", "path"] });
        store.createIndex("byProject", "projectId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeNames, mode) {
  return openDB().then((db) => db.transaction(storeNames, mode));
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function newId() {
  return crypto.randomUUID();
}

// -- projects ---------------------------------------------------------------

export async function listProjects() {
  const t = await tx(["projects"], "readonly");
  const all = await requestToPromise(t.objectStore("projects").getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createProject(name) {
  const project = { id: newId(), name, createdAt: Date.now(), updatedAt: Date.now() };
  const t = await tx(["projects"], "readwrite");
  t.objectStore("projects").put(project);
  await requestToPromise(t.objectStore("projects").get(project.id));
  return project;
}

export async function touchProject(id) {
  const t = await tx(["projects"], "readwrite");
  const store = t.objectStore("projects");
  const project = await requestToPromise(store.get(id));
  if (!project) return;
  project.updatedAt = Date.now();
  store.put(project);
}

export async function deleteProject(id) {
  const t = await tx(["projects", "files"], "readwrite");
  t.objectStore("projects").delete(id);
  const filesStore = t.objectStore("files");
  const index = filesStore.index("byProject");
  const range = IDBKeyRange.only(id);
  const cursorReq = index.openCursor(range);
  await new Promise((resolve, reject) => {
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        filesStore.delete(cursor.primaryKey);
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

// -- files --------------------------------------------------------------------

export async function listFiles(projectId) {
  const t = await tx(["files"], "readonly");
  const index = t.objectStore("files").index("byProject");
  const all = await requestToPromise(index.getAll(IDBKeyRange.only(projectId)));
  return all.sort((a, b) => a.path.localeCompare(b.path));
}

export async function getFile(projectId, path) {
  const t = await tx(["files"], "readonly");
  return requestToPromise(t.objectStore("files").get([projectId, path]));
}

export async function putFile(projectId, path, content, isBinary = false) {
  const t = await tx(["files"], "readwrite");
  t.objectStore("files").put({ projectId, path, content, isBinary, updatedAt: Date.now() });
}

export async function deleteFile(projectId, path) {
  const t = await tx(["files"], "readwrite");
  t.objectStore("files").delete([projectId, path]);
}

export async function renameFile(projectId, oldPath, newPath) {
  const file = await getFile(projectId, oldPath);
  if (!file) return;
  await putFile(projectId, newPath, file.content, file.isBinary);
  await deleteFile(projectId, oldPath);
}
