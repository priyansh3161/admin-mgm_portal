import { installDeveloperToolsGuard } from './devtools-guard.js';

function signOutForSecurityNotice() {
  try { sessionStorage.setItem('mgm-security-notice-signout', '1'); } catch { /* continue to notice */ }
  try { localStorage.removeItem('mgm-portal-auth'); } catch { /* continue to notice */ }
  try { sessionStorage.removeItem('mgm-portal-auth'); } catch { /* continue to notice */ }
}

installDeveloperToolsGuard(signOutForSecurityNotice);
