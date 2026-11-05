// Build do iService para a Vercel.
// 1) Copia public/ -> dist/
// 2) Gera dist/js/config.js a partir das variáveis de ambiente
// 3) Carimba uma versão única em cada referência de JS/CSS (cache busting automático)
//
// Resultado: HTML sempre revalida (vem fresco) e os arquivos JS/CSS ganham uma URL
// nova a cada deploy, então o navegador do cliente nunca reaproveita versão velha.
import { cp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(raiz, 'public');
const OUT = join(raiz, 'dist');

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!URL || !ANON) {
  console.error('\nFaltam variáveis de ambiente:');
  if (!URL) console.error('  - SUPABASE_URL');
  if (!ANON) console.error('  - SUPABASE_ANON_KEY');
  console.error('\nNa Vercel: Settings -> Environment Variables.\n');
  process.exit(1);
}

// Versão do build: o SHA do commit na Vercel, ou o horário como alternativa.
const versao = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 8) || String(Date.now());

await rm(OUT, { recursive: true, force: true });
await cp(SRC, OUT, { recursive: true });

// config.js com as credenciais (chave anon é pública; protegida pelo RLS)
await writeFile(
  join(OUT, 'js', 'config.js'),
  `// Gerado no build — não editar.\nexport const SUPABASE_URL = ${JSON.stringify(URL)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(ANON)};\n`,
  'utf8'
);

async function* arquivos(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* arquivos(p);
    else yield p;
  }
}

let carimbados = 0;
for await (const f of arquivos(OUT)) {
  if (!/\.(html|js)$/.test(f)) continue;
  let t = await readFile(f, 'utf8');
  const antes = t;
  // Referências em HTML: src/href para js/ e css/
  t = t.replace(/(src|href)="((?:js|css)\/[^"?]+\.(?:js|css))"/g, (_m, a, p) => `${a}="${p}?v=${versao}"`);
  // Imports relativos dentro dos módulos JS
  t = t.replace(/from '(\.\/[^']+\.js)'/g, (_m, p) => `from '${p}?v=${versao}'`);
  if (t !== antes) { await writeFile(f, t); carimbados++; }
}

console.log(`Build pronto em dist/ — versão ${versao} (${carimbados} arquivos carimbados).`);
