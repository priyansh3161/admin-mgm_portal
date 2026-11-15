function clearSecurityNoticeFlag() {
  try { sessionStorage.removeItem('mgm-security-notice-signout'); }
  catch { /* session storage may be disabled */ }
}

document.querySelector('a[href="./index.html"]')?.addEventListener('click', clearSecurityNoticeFlag);
window.setTimeout(clearSecurityNoticeFlag, 5000);
