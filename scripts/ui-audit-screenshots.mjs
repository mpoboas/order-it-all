#!/usr/bin/env node
/**
 * Auditoria visual (Fase 15) — percorre os ecrãs principais da app com o
 * Playwright (WebKit, viewport de iPhone) e guarda um screenshot de cada um
 * em `ui-audit-screenshots/`, para revisão de design fora do código.
 *
 * Autenticação: em vez de fazer login (não temos a password do utilizador
 * de teste), reaproveita a sessão do PocketBase já ativa noutro browser —
 * lê-se o valor de `localStorage['pocketbase_auth']` para um ficheiro fora
 * do repo e passa-se o caminho aqui. Sem essa var, os ecrãs abrem como
 * visitante (login).
 *
 * Uso: UI_AUDIT_AUTH_FILE=/caminho/auth.txt UI_AUDIT_BASE_URL=http://localhost:3000 \
 *      [UI_AUDIT_OUT_DIR=/outra/pasta] node scripts/ui-audit-screenshots.mjs
 *
 * Os ids de grupo/despesa abaixo são específicos dos dados de dev deste
 * utilizador — ajusta-os se os grupos de teste mudarem.
 */

import { webkit } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `UI_AUDIT_OUT_DIR` permite guardar um "depois" sem apagar o "antes".
const OUT_DIR = process.env.UI_AUDIT_OUT_DIR
  ? path.resolve(process.env.UI_AUDIT_OUT_DIR)
  : path.resolve(__dirname, '..', 'ui-audit-screenshots');
mkdirSync(OUT_DIR, { recursive: true });

const BASE_URL = process.env.UI_AUDIT_BASE_URL || 'http://localhost:3000';
const AUTH_FILE = process.env.UI_AUDIT_AUTH_FILE;
const authValue = AUTH_FILE ? readFileSync(AUTH_FILE, 'utf8').trim() : null;

// Dados de teste conhecidos neste ambiente de dev (ver memória da sessão).
const GROUP_CHINA = 'rne9gy3i1v3288s';
const GROUP_CASA_FERIAS = 'ki5c64l2ebor7d3';
const GROUP_ITEMIZED = 'p83lr5hdi8gnhj6';
const EXPENSE_NORMAL = '28ufkc4a2fw019e';
const EXPENSE_ITEMIZED = '05p7njtp8ezj82n';
const FRIEND_ID = '3y4076u3651xoi7'; // Habeli

let shotIndex = 0;
async function shot(page, name) {
  shotIndex += 1;
  const file = path.join(OUT_DIR, `${String(shotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`✓ ${path.basename(file)}`);
}

/** Espera qualquer skeleton/spinner desaparecer, um marcador de "pronto" e
 *  um pequeno assentamento (molas do Sheet, transições). */
async function waitReady(page, readyLocator, timeout = 10000) {
  await page.waitForSelector('.animate-pulse', { state: 'detached', timeout: 4000 }).catch(() => {});
  await page.waitForSelector('.animate-spin', { state: 'detached', timeout: 4000 }).catch(() => {});
  if (readyLocator) await page.waitForSelector(readyLocator, { timeout });
  await page.waitForTimeout(400);
}

async function main() {
  const browserWK = await webkit.launch();
  const context = await browserWK.newContext({
    viewport: { width: 393, height: 852 }, // iPhone 16/17
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    colorScheme: 'light',
  });

  if (authValue) {
    await context.addInitScript((value) => {
      try {
        window.localStorage.setItem('pocketbase_auth', value);
      } catch {
        /* ignore */
      }
    }, authValue);
  }

  const page = await context.newPage();

  // 1. Início — Grupos
  await page.goto(`${BASE_URL}/groups`);
  await waitReady(page, 'text=No total');
  await shot(page, 'inicio-grupos');

  // 2. Início — Amigos
  await page.getByRole('tab', { name: 'Amigos', exact: true }).click();
  await waitReady(page, null);
  await shot(page, 'inicio-amigos');

  // 3. Grupo — Despesas
  await page.goto(`${BASE_URL}/groups/${GROUP_CHINA}/expenses`);
  await waitReady(page, 'text=Despesas');
  await shot(page, 'grupo-despesas');

  // 3b. Fundo da lista — a última linha tem de ficar livre da FAB e da barra.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  await shot(page, 'grupo-despesas-fundo');

  // 4. Grupo — Viagens/Admin
  await page.goto(`${BASE_URL}/groups/${GROUP_CHINA}/admin`);
  await waitReady(page, null);
  await shot(page, 'grupo-viagens-admin');

  // 5. Definições do grupo — Membros
  await page.goto(`${BASE_URL}/groups/${GROUP_CHINA}/settings`);
  await waitReady(page, 'text=Membros');
  await shot(page, 'definicoes-membros');

  // 6. Detalhe de despesa normal
  await page.goto(`${BASE_URL}/groups/${GROUP_CASA_FERIAS}/expenses/${EXPENSE_NORMAL}`);
  await waitReady(page, 'text=Detalhes');
  await shot(page, 'despesa-detalhe');

  // 7. Página de itens de despesa
  await page.goto(`${BASE_URL}/groups/${GROUP_ITEMIZED}/expenses/${EXPENSE_ITEMIZED}/items`);
  await waitReady(page, null);
  await shot(page, 'despesa-itens');

  // 8. Formulário de criar despesa (sheet aberta)
  await page.goto(`${BASE_URL}/groups/${GROUP_CHINA}/expenses`);
  await waitReady(page, 'text=Despesas');
  await page.getByRole('button', { name: 'Despesa', exact: true }).click();
  await waitReady(page, 'text=Nova despesa');
  await shot(page, 'form-despesa-criar');

  // 9. Seleção de pagadores (sub-sheet dentro do formulário)
  const pagoPor = page.locator('p', { hasText: 'Pago por' }).locator('button').first();
  await pagoPor.click();
  await waitReady(page, null);
  await shot(page, 'selecao-pagadores');
  await page.keyboard.press('Escape');
  await waitReady(page, null);

  // 10. Modo de divisão (outra sub-sheet do mesmo formulário)
  const dividido = page.locator('p', { hasText: 'Pago por' }).locator('button').last();
  await dividido.click();
  await waitReady(page, null);
  await shot(page, 'modo-divisao');
  await page.keyboard.press('Escape');
  await waitReady(page, null);
  await page.keyboard.press('Escape'); // fecha a sheet de criar despesa

  // 11. Saldos do grupo
  await page.goto(`${BASE_URL}/groups/${GROUP_CHINA}/expenses`);
  await waitReady(page, 'text=Saldos');
  await page.getByRole('button', { name: 'Saldos', exact: true }).click();
  await waitReady(page, null);
  await shot(page, 'saldos-sheet');
  await page.keyboard.press('Escape');

  // 12. Perfil de um amigo (com histórico)
  await page.goto(`${BASE_URL}/people/${FRIEND_ID}`);
  await waitReady(page, null);
  await shot(page, 'perfil-amigo');

  // 13. Atividade (feed global)
  await page.goto(`${BASE_URL}/activity`);
  await waitReady(page, null);
  await shot(page, 'atividade');

  // 14. Perfil próprio
  await page.goto(`${BASE_URL}/profile`);
  await waitReady(page, null);
  await shot(page, 'perfil-proprio');

  await browserWK.close();
  console.log(`\n${shotIndex} screenshots guardados em ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
