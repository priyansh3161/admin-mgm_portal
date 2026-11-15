function clearSecurityNoticeFlag() {
  try { sessionStorage.removeItem('mgm-security-notice-signout'); }
  catch { /* session storage may be disabled */ }
}

document.querySelector('a[href="./login.html"]')?.addEventListener('click', clearSecurityNoticeFlag);
window.setTimeout(clearSecurityNoticeFlag, 5000);
