import { createClient } from '@supabase/supabase-js';
import { runtimeConfig } from './runtimeConfig';

if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'SUPABASE_URL / SUPABASE_ANON_KEY non configurés (window.__APP_CONFIG__ ou VITE_SUPABASE_*).',
  );
}

export const supabase = createClient(
  runtimeConfig.supabaseUrl,
  runtimeConfig.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
