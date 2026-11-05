import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=2';

// A biblioteca é carregada localmente (js/vendor/supabase.umd.js), sem CDN externo,
// para o app não depender de rede de terceiros em tempo de execução.
const { createClient } = window.supabase;

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'iservice' },
  auth: { persistSession: true, autoRefreshToken: true },
});
