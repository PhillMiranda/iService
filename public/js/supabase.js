import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// O schema padrão das consultas é "iservice" (a nossa convenção de schema por sistema).
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'iservice' },
  auth: { persistSession: true, autoRefreshToken: true },
});
