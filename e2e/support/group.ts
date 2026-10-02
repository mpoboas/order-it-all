import { expect, type Page } from '@playwright/test';
import type { Friend } from './friends';

/** Cria um grupo a partir do Início e entra nele; devolve o caminho do grupo. */
export async function createGroup(f: Friend, name: string): Promise<string> {
  const { page } = f;
  await expect(page).toHaveURL(/\/groups/);
  await page.getByRole('button', { name: /Criar Grupo/i }).first().click();
  await page.getByPlaceholder(/Família, Amigos/).fill(name);
  await page.getByRole('button', { name: 'Criar Grupo', exact: true }).last().click();
  // Depois de criar, a app fica no Início — é preciso abrir o grupo.
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/groups\/\w+/);
  return new URL(page.url()).pathname;
}

/** "Convidar pessoas" → Partilhar; devolve o link que foi partilhado. */
export async function shareInvite(f: Friend, groupUrl: string): Promise<string> {
  const { page } = f;
  await page.goto(groupUrl);
  // Um grupo acabado de criar não sugere convidar ninguém: está nas definições.
  await page.getByRole('button', { name: 'Definições do grupo' }).click();
  await page.getByRole('button', { name: 'Convidar pessoas' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Partilhar/i }).first().click();
  const shared = await page.evaluate(() => (window as unknown as { __shared: { text?: string }[] }).__shared);
  const url = shared.at(-1)?.text?.match(/https?:\/\/\S+\/invite\/\S+/)?.[0] ?? '';
  expect(url, 'link de convite partilhado').toMatch(/\/invite\//);
  await page.goto(groupUrl);
  return url;
}

/** Uma sheet aberta, pelo título (as sheets não têm nome acessível próprio). */
export function sheetTitled(page: Page, title: string | RegExp) {
  return page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: title }) });
}

/** Nova despesa paga por quem a cria; `only` restringe a divisão a essas pessoas. */
export async function addExpense(f: Friend, groupUrl: string, e: { description: string; amount: string; only?: string[] }) {
  const { page } = f;
  await page.goto(groupUrl);
  await page.getByRole('button', { name: 'Despesa', exact: true }).click();
  const sheet = sheetTitled(page, 'Nova despesa');
  await sheet.getByPlaceholder('Descrição (ex. Jantar)').fill(e.description);
  await sheet.getByLabel('Total da despesa').fill(e.amount);
  if (e.only) {
    await sheet.getByRole('button', { name: 'igualmente' }).click();
    const split = sheetTitled(page, 'Como dividir');
    await split.getByRole('button', { name: 'Ninguém' }).click();
    for (const name of e.only) await split.getByRole('button', { name: `Incluir ${name} na divisão` }).click();
    await split.getByRole('button', { name: 'Confirmar' }).click();
  }
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(e.description, { exact: true }).first()).toBeVisible();
}

/** Os saldos do grupo como `f` os vê ("Saldos"): nome → "a receber/a pagar X €". */
export async function readBalances(f: Friend, groupUrl: string): Promise<Record<string, string>> {
  const { page } = f;
  await page.goto(groupUrl);
  await page.getByRole('button', { name: 'Saldos', exact: true }).click();
  const sheet = sheetTitled(page, 'Saldos');
  const rows = sheet.getByRole('button', { name: / a (receber|pagar) / });
  await expect(rows).toHaveCount(4);
  const balances: Record<string, string> = {};
  // O nome acessível de cada linha é "Ana a receber 33,80 €".
  for (const row of await rows.all()) {
    const [, name, value] = (await row.ariaSnapshot()).match(/button "(.+?) (a (?:receber|pagar) [^"]+)"/) ?? [];
    if (name) balances[name] = value;
  }
  await sheet.getByRole('button', { name: 'Fechar' }).click();
  return balances;
}

