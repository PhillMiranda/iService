// Gera public/js/config.js a partir das variáveis de ambiente no build da Vercel.
// Rodado pelo "buildCommand" do vercel.json. Em desenvolvimento local, você pode
// rodar `node scripts/gerar-config.mjs` depois de exportar as duas variáveis.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error('\nFalta configurar as variáveis de ambiente:');
  if (!URL) console.error('  - SUPABASE_URL');
  if (!ANON) console.error('  - SUPABASE_ANON_KEY');
  console.error('\nNa Vercel: Settings -> Environment Variables. Localmente: exporte antes de rodar.\n');
  process.exit(1);
}

const conteudo = `// GERADO AUTOMATICAMENTE por scripts/gerar-config.mjs — não edite à mão.
export const SUPABASE_URL = ${JSON.stringify(URL)};
export const SUPABASE_ANON_KEY = ${JSON.stringify(ANON)};
`;

await writeFile(join(raiz, 'public', 'js', 'config.js'), conteudo, 'utf8');
console.log('public/js/config.js gerado com sucesso.');
