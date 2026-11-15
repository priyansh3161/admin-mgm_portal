// supabase-config.js
// Supabase dashboard -> Project Settings -> API se dono values copy karo.
// anon key public hoti hai (frontend me rakhna safe hai) -- security RLS se aati hai, key chhupane se nahi.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const SUPABASE_URL = 'https://ixaxvcinbbbqriylqcvi.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4YXh2Y2luYmJicXJpeWxxY3ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MTI1OTgsImV4cCI6MjEwNzM4ODU5OH0._u3etS_EvChQfFYF3YIeXriB2AM1h7sxCw28FDjZTas';

const REMEMBER_DEVICE_KEY = 'mgm-portal-remember-device';
function shouldRememberDevice() {
  try {
    const choice = localStorage.getItem(REMEMBER_DEVICE_KEY);
    if (choice !== null) return choice !== 'false';
  } catch { /* try this tab's storage next */ }
  try { return sessionStorage.getItem(REMEMBER_DEVICE_KEY) !== 'false'; }
  catch { return true; }
}

// Supabase keeps sessions in localStorage by default. Route its standard
// storage interface to sessionStorage when the user unchecks Remember device.
const authStorage = {
  getItem(key) {
    try { return shouldRememberDevice() ? localStorage.getItem(key) : sessionStorage.getItem(key); }
    catch { return null; }
  },
  setItem(key, value) {
    if (shouldRememberDevice()) {
      localStorage.setItem(key, value);
      try { sessionStorage.removeItem(key); } catch { /* no session storage */ }
    } else {
      sessionStorage.setItem(key, value);
      try { localStorage.removeItem(key); } catch { /* no local storage */ }
    }
  },
  removeItem(key) {
    try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ }
    try { sessionStorage.removeItem(key); } catch { /* storage may be unavailable */ }
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,        // custom storage selects local or per-tab session storage
    autoRefreshToken: true,      // access token expire hone se pehle khud renew
    detectSessionInUrl: true,    // email-confirm / reset links ke liye
    storageKey: 'mgm-portal-auth',
    storage: authStorage
  }
});

// Staff console keeps its browser session separate from the student portal.
export function createStaffClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'mgm-academic-staff-auth'
    }
  });
}
