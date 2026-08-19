// Falls back to localStorage when there's no `chrome`/`browser` extension
// API — lets app.html be sanity-checked as a plain served page (e.g. during
// development) without needing to be loaded as an installed extension.
const extensionApi = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);

const DEFAULTS = {
  compileServerUrl: "http://127.0.0.1:8477",
  engine: "pdflatex",
};

const LOCAL_STORAGE_KEY = "maziar.settings";

function readLocalStorageFallback() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export async function getSettings() {
  if (extensionApi?.storage?.local) {
    const stored = await extensionApi.storage.local.get(DEFAULTS);
    return { ...DEFAULTS, ...stored };
  }
  return { ...DEFAULTS, ...readLocalStorageFallback() };
}

export async function setSetting(key, value) {
  if (extensionApi?.storage?.local) {
    await extensionApi.storage.local.set({ [key]: value });
    return;
  }
  const current = readLocalStorageFallback();
  current[key] = value;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
}
