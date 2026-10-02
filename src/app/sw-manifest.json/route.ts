import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

// Lista dos estáticos do build (`/_next/static/…`) para o service worker
// pré-guardar TODOS ao instalar. Só "o que passa pelo SW" não chega: há chunks
// carregados sob demanda que o browser serve da sua cache em memória sem
// passar pelo SW — sem rede, esse chunk faltava e a app rebentava.
export const dynamic = 'force-dynamic';

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)])),
  );
  return nested.flat();
}

export async function GET() {
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.json({ buildId: 'dev', assets: [] });
  }
  const staticDir = path.join(process.cwd(), '.next', 'static');
  let assets: string[] = [];
  try {
    assets = (await listFiles(staticDir))
      .filter((f) => !f.endsWith('.map'))
      .map((f) => '/_next/static/' + path.relative(staticDir, f).split(path.sep).join('/'));
  } catch {
    assets = [];
  }
  // O id real deste build (o `next start` reavalia o next.config e teria outro).
  const buildId = await readFile(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').then((t) => t.trim(), () => null);
  return NextResponse.json(
    { buildId, assets },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
