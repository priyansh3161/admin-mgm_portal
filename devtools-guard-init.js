import { createStaffClient } from './supabase-config.js';
import { installDeveloperToolsGuard } from '../devtools-guard.js';

const staffClient = createStaffClient();
installDeveloperToolsGuard(async () => {
  const { error } = await staffClient.auth.signOut({ scope: 'local' });
  if (error) {
    try { localStorage.removeItem('mgm-academic-staff-auth'); } catch { /* storage may be disabled */ }
    try { sessionStorage.removeItem('mgm-academic-staff-auth'); } catch { /* storage may be disabled */ }
    throw error;
  }
});
