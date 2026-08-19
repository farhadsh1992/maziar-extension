// Cross-browser: Firefox exposes the promise-based `browser` global; Chrome's
// `chrome` API is also promise-based for the calls used here (MV3).
const api = typeof browser !== "undefined" ? browser : chrome;

api.action.onClicked.addListener(async () => {
  const appUrl = api.runtime.getURL("app.html");
  const tabs = await api.tabs.query({ url: appUrl });
  if (tabs.length > 0) {
    await api.tabs.update(tabs[0].id, { active: true });
    await api.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await api.tabs.create({ url: appUrl });
  }
});
