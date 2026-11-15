// Keep this config inside the admin folder so the staff console also works
// when the hosting provider deploys `admin/` as the site root.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const SUPABASE_URL = 'https://ixaxvcinbbbqriylqcvi.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4YXh2Y2luYmJicXJpeWxxY3ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MTI1OTgsImV4cCI6MjEwNzM4ODU5OH0._u3etS_EvChQfFYF3YIeXriB2AM1h7sxCw28FDjZTas';

let staffClient;

export function createStaffClient() {
  if (staffClient) return staffClient;
  staffClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'mgm-academic-staff-auth'
    }
  });
  return staffClient;
}
