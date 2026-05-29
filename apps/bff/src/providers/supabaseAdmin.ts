import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

/**
 * Client Supabase avec la clé `service_role` — bypass RLS.
 * À utiliser UNIQUEMENT côté serveur après vérification du JWT utilisateur.
 * Chaque requête doit explicitement scope sur user_id.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
