let guardInstalled = false;

export function installDeveloperToolsGuard(signOutForSecurityNotice) {
  try {
    if (window !== window.top && window.top.__mgmDeveloperToolsGuardInstalled) return;
  } catch { /* continue with a local guard in a cross-origin embedding */ }
  if (guardInstalled) return;
  guardInstalled = true;
  if (window === window.top) window.__mgmDeveloperToolsGuardInstalled = true;

  let redirectStarted = false;
  const guardedDocuments = new WeakSet();

  function isDeveloperToolsShortcut(event) {
    const key = String(event.key || '').toLowerCase();
    const code = String(event.code || '').toLowerCase();
    const mac = /mac|iphone|ipad/i.test(navigator.platform || '');
    const modifier = mac ? event.metaKey && event.altKey : event.ctrlKey && event.shiftKey;
    return key === 'f12' || code === 'f12'
      || (modifier && (['i', 'j', 'c'].includes(key) || ['keyi', 'keyj', 'keyc'].includes(code)))
      || (!mac && event.ctrlKey && event.shiftKey && (key === 'k' || code === 'keyk'));
  }

  async function redirectForDeveloperTools() {
    if (redirectStarted) return;
    redirectStarted = true;

    try {
      await Promise.race([
        signOutForSecurityNotice(),
        new Promise((resolve) => window.setTimeout(resolve, 700))
      ]);
    } catch (error) {
      console.warn('Security notice sign-out did not complete:', error?.message || error);
    }

    const noticeUrl = new URL('developer-mode.html', import.meta.url).href;
    try { window.top.location.replace(noticeUrl); }
    catch { window.location.replace(noticeUrl); }
  }

  function handleDeveloperToolsShortcut(event) {
    if (!isDeveloperToolsShortcut(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void redirectForDeveloperTools();
  }

  function guardWindow(targetWindow) {
    if (!targetWindow) return;
    try {
      // Reattach after same-origin iframe navigation. A new page gets a new
      // Document even though the browsing context's WindowProxy is reused.
      const targetDocument = targetWindow.document;
      if (!targetDocument || guardedDocuments.has(targetDocument)) return;
      targetWindow.addEventListener('keydown', handleDeveloperToolsShortcut, true);
      guardedDocuments.add(targetDocument);
    } catch { /* Ignore cross-origin frames. */ }
  }

  guardWindow(window);
  document.querySelectorAll('iframe').forEach((frame) => {
    frame.addEventListener('load', () => guardWindow(frame.contentWindow));
    guardWindow(frame.contentWindow);
  });
  window.addEventListener('load', (event) => {
    if (event.target instanceof HTMLIFrameElement) guardWindow(event.target.contentWindow);
  }, true);
}
