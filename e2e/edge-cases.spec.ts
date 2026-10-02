import { expect, test } from '@playwright/test';
import { addExpense, createGroup, shareInvite, sheetTitled } from './support/group';
import { RUN, expectNotification, logIn, newFriend, now, signUp } from './support/friends';

/**
 * Os casos que apanham pessoas reais: acertar contas sem dívidas, editar a
 * mesma despesa ao mesmo tempo, editar e apagar (e os avisos de cada um), e
 * voltar a entrar num telemóvel pequeno.
 *
 * - Rita (iPhone SE, 320×568): cria o grupo.
 * - Tiago (Pixel): regista-se pelo convite.
 */
test('casos-limite: sem dívidas, edição em simultâneo, editar e apagar', async ({ browser }) => {
  const rita = await newFriend(browser, 'Rita', 'small');
  const tiago = await newFriend(browser, 'Tiago', 'pixel');
  let groupUrl = '';

  await test.step('Rita cria o grupo e o Tiago entra pelo convite', async () => {
    await signUp(rita);
    groupUrl = await createGroup(rita, `E2E Casa ${RUN}`);
    const invite = await shareInvite(rita, groupUrl);
    await signUp(tiago, { startUrl: invite });
    await expect(tiago.page).toHaveURL(/\/groups\/\w+/, { timeout: 30_000 });
  });

  await test.step('Sem dívidas, "Acertar contas" vai direto a "Quem está a pagar?"', async () => {
    const { page } = tiago;
    await page.goto(groupUrl);
    await page.getByRole('button', { name: 'Acertar contas' }).click();
    await expect(sheetTitled(page, 'Quem está a pagar?')).toBeVisible();
    await sheetTitled(page, 'Quem está a pagar?').getByRole('button', { name: 'Fechar' }).click();
  });

  let expenseUrl = '';
  await test.step('Rita lança o supermercado; o Tiago é avisado da parte dele', async () => {
    const since = now();
    await addExpense(rita, groupUrl, { description: 'Supermercado', amount: '50' });
    const n = await expectNotification(tiago, since, (n) => n.body.includes('Supermercado'), 'a despesa nova');
    expect(n.body).toMatch(/A tua parte: 25,00\s€/);
    expenseUrl = n.url;
  });

  await test.step('Os dois editam a mesma despesa ao mesmo tempo', async () => {
    // Os dois abrem o editor…
    for (const f of [rita, tiago]) {
      await f.page.goto(expenseUrl);
      await f.page.getByRole('button', { name: 'Editar despesa' }).click();
      await expect(sheetTitled(f.page, 'Editar despesa')).toBeVisible();
    }
    // …a Rita grava primeiro (afinal foram 60 €)…
    const since = now();
    const ritaSheet = sheetTitled(rita.page, 'Editar despesa');
    await ritaSheet.getByLabel('Total da despesa').fill('60');
    await ritaSheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(ritaSheet).toBeHidden();
    await expectNotification(tiago, since, (n) => n.body.includes('Supermercado') && n.body.includes('30,00'), 'a edição da Rita');

    // …e o Tiago, que ainda tinha o editor aberto, é avisado antes de a apagar sem querer.
    const tiagoSheet = sheetTitled(tiago.page, 'Editar despesa');
    // O aviso aparece no próprio formulário mal a Rita grava (tempo real)…
    await expect(tiagoSheet.getByText('Rita alterou esta despesa enquanto editavas.')).toBeVisible();
    await tiagoSheet.getByPlaceholder('Descrição (ex. Jantar)').fill('Supermercado + talho');
    await tiagoSheet.getByRole('button', { name: 'Guardar' }).click();
    // …e gravar por cima sem querer não acontece: pergunta primeiro.
    const conflict = tiago.page.getByRole('alertdialog');
    await expect(conflict).toContainText('alterada por outra pessoa');
    await conflict.getByRole('button', { name: 'Carregar a versão atual' }).click();
    await expect(tiagoSheet.getByLabel('Total da despesa')).toHaveValue(/60/);
    await tiagoSheet.getByRole('button', { name: 'Fechar' }).click();
  });

  await test.step('O Tiago apaga a despesa e a Rita é avisada', async () => {
    const since = now();
    const { page } = tiago;
    await page.goto(expenseUrl);
    await page.getByRole('button', { name: 'Eliminar despesa' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
    await expect(page).not.toHaveURL(expenseUrl);
    await expectNotification(rita, since, (n) => n.body.includes('Supermercado'), 'a despesa apagada');
  });

  await test.step('A Rita sai e volta a entrar no telemóvel pequeno', async () => {
    const { page } = rita;
    await rita.context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto('/auth/login');
    await logIn(rita);
    await expect(page).toHaveURL(/\/groups/);
  });

  for (const f of [rita, tiago]) await f.context.close();
});
