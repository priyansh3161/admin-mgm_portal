// Runs under the site's same-origin script-src policy and remains available
// even when an E-Library module import fails.
const contributeOverlay = document.getElementById('modalOverlay');
document.getElementById('contributeBtn')?.addEventListener('click', () => contributeOverlay?.classList.add('open'));
document.getElementById('modalClose')?.addEventListener('click', () => contributeOverlay?.classList.remove('open'));
contributeOverlay?.addEventListener('click', (event) => {
  if (event.target === contributeOverlay) contributeOverlay.classList.remove('open');
});
function showELibraryStartupError(error) {
  const grid = document.getElementById('resGrid');
  if (!grid || !grid.textContent.includes('Loading resources')) return;
  grid.textContent = `E-Library could not start: ${String(error?.message || error || 'Please reload the page.')}`;
}
window.addEventListener('error', (event) => showELibraryStartupError(event.message));
window.addEventListener('unhandledrejection', (event) => showELibraryStartupError(event.reason));