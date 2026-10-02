import { expect, test } from '@playwright/test';
import { addExpense, createGroup, readBalances, shareInvite, sheetTitled } from './support/group';
import {
  RUN,
  expectNotification,
  inbox,
  logIn,
  newFriend,
  now,
  signUp,
  type Friend,
} from './support/friends';

/**
 * Um grupo de amigos a começar a usar a app — do registo ao acerto de contas,
 * cada um no seu telemóvel, a mexer ao mesmo tempo, e a confirmar as
 * notificações que cada um recebe (capturadas no servidor).
 *
 * - Miguel (iPhone): cria a conta, cria o grupo, manda o convite e faz as compras.
 * - Ricardo (Pixel): já tinha conta, mas não tinha sessão — entra pelo convite.
 * - Hélder (iPhone SE, 320×568): não tinha conta — regista-se pelo convite.
 * - Ana (Pixel): já tinha conta e sessão aberta — o convite é só "Entrar no grupo".
 */
test('amigos: grupo, convite, viagem, despesas e notificações', async ({ browser }) => {
  const miguel = await newFriend(browser, 'Miguel', 'iphone');
  const ricardo = await newFriend(browser, 'Ricardo', 'pixel');
  const helder = await newFriend(browser, 'Hélder', 'small');
  const ana = await newFriend(browser, 'Ana', 'pixel');
  const everyone = [miguel, ricardo, helder, ana];
  const groupName = `E2E Férias ${RUN}`;
  const tripName = 'Primeiras compras';
  let inviteUrl = '';
  let groupUrl = '';

  await test.step('Ricardo e Ana já tinham conta (Ricardo saiu da sessão)', async () => {
    await Promise.all([
      signUp(ricardo, { payments: { revtag: `ricardo${RUN}` } }),
      signUp(ana, { payments: { mbway: '912345678' } }),
    ]);
    await ricardo.context.clearCookies();
    await ricardo.page.evaluate(() => localStorage.clear());
  });

  await test.step('Miguel cria conta e o grupo', async () => {
    await signUp(miguel, { payments: { revtag: `miguel${RUN}`, mbway: '913000000' } });
    groupUrl = await createGroup(miguel, groupName);
  });

  await test.step('Miguel manda o convite', async () => {
    inviteUrl = await shareInvite(miguel, groupUrl);
  });

  await test.step('Os amigos entram pelo convite, ao mesmo tempo', async () => {
    const since = now();
    await Promise.all([
      (async () => {
        await ricardo.page.goto(inviteUrl);
        await ricardo.page.getByRole('button', { name: /^Entrar$|Já tenho conta|Iniciar sessão/ }).first().click();
        await logIn(ricardo);
      })(),
      signUp(helder, { startUrl: inviteUrl }),
      (async () => {
        await ana.page.goto(inviteUrl);
        await ana.page.getByRole('button', { name: /Entrar no grupo|Juntar/i }).click();
      })(),
    ]);
    for (const f of [ricardo, helder, ana]) await expect(f.page).toHaveURL(/\/groups\/\w+/, { timeout: 30_000 });

    // Miguel sabe que entraram (os avisos juntam-se num só, que vai sendo substituído).
    await expectNotification(
      miguel,
      since,
      (n) => [ricardo, helder, ana].every((f) => n.body.includes(f.name)),
      'um aviso com os três nomes',
    );
  });

  let tripUrl = '';
  await test.step('Miguel cria a viagem e os outros são avisados', async () => {
    const since = now();
    const { page } = miguel;
    await page.goto(groupUrl);
    await page.getByRole('tab', { name: 'Viagens' }).click();
    await page.getByRole('button', { name: /^Nova Viagem/ }).last().click();
    await page.getByPlaceholder('ex. Compras de Verão').fill(tripName);
    await page.getByRole('button', { name: 'Criar Viagem' }).click();
    await expect(page.getByRole('button', { name: new RegExp(`${tripName} Aberta`) })).toBeVisible();

    for (const f of [ricardo, helder, ana]) {
      const n = await expectNotification(f, since, (n) => n.body.includes(`${tripName} está aberta`), 'viagem aberta');
      tripUrl = n.url;
    }
    expect(inbox(miguel, since).filter((n) => n.body.includes('está aberta')), 'quem cria não é avisado').toHaveLength(0);
  });

  await test.step('Cada um faz o seu pedido, ao mesmo tempo (a partir da notificação)', async () => {
    await Promise.all([
      placeOrder(ricardo, tripUrl, 'Monster', 2),
      placeOrder(helder, tripUrl, 'Pão de forma', 1),
      placeOrder(ana, tripUrl, 'Bananas', 3),
    ]);
  });

  await test.step('Miguel vai às compras: fecha a viagem, marca preços e termina', async () => {
    const since = now();
    const { page } = miguel;
    await page.goto(groupUrl);
    await page.getByRole('tab', { name: 'Viagens' }).click();
    await page.getByRole('button', { name: new RegExp(`${tripName} Aberta`) }).click();
    await expect(page).toHaveURL(/\/admin\/trips\//);
    for (const item of ['Monster', 'Pão de forma', 'Bananas']) await expect(page.getByText(item).first()).toBeVisible();

    await page.getByRole('button', { name: 'Começar Compras' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Fechar', exact: true }).click();

    for (const [item, price] of [
      ['Monster', '1,50'],
      ['Pão de forma', '2,10'],
      ['Bananas', '0,40'],
    ] as const) {
      await page.getByText(item, { exact: true }).first().click();
      const sheet = page.getByRole('dialog');
      await sheet.getByPlaceholder('0,00').fill(price);
      await sheet.getByRole('button', { name: 'Comprado' }).click();
      await sheet.getByRole('button', { name: 'Guardar' }).click();
      await expect(sheet).toBeHidden();
      // Ficou mesmo gravado (uma vez perdeu-se, com gravações seguidas).
      await expect(page.getByText(item, { exact: true }).locator('xpath=ancestor::div[.//text()[contains(., "Comprado")]][1]')).toBeVisible();
    }

    await page.getByRole('button', { name: 'Terminar Viagem' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Terminar viagem' }).click();
    for (const f of [ricardo, helder, ana]) {
      await expectNotification(f, since, (n) => n.tag.startsWith('trip:') && /fechad|termin|comprad/i.test(n.body), 'viagem terminada');
    }
  });

  await test.step('Miguel lança a despesa da viagem', async () => {
    const since = now();
    const { page } = miguel;
    await page.goto(groupUrl);
    await page.getByRole('tab', { name: 'Viagens' }).click();
    // As viagens fechadas estão escondidas por omissão.
    await page.getByRole('button', { name: /Mostrar 1 viagem fechada/ }).click();
    await page.getByRole('button', { name: `Ações da viagem ${tripName}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Lançar despesa' }).click();
    const sheet = sheetTitled(page, /Lançar despesa/);
    await sheet.getByRole('button', { name: /Miguel/ }).first().click();
    await page.getByRole('button', { name: 'Criar despesa' }).click();
    await expect(page.getByRole('button', { name: 'Criar despesa' })).toBeHidden();

    // 2×1,50 + 2,10 + 3×0,40 — cada um paga o que pediu.
    await expectNotification(ricardo, since, (n) => n.body.includes('A tua parte: 3,00'), 'a sua parte (Monster)');
    await expectNotification(helder, since, (n) => n.body.includes('A tua parte: 2,10'), 'a sua parte (pão)');
    await expectNotification(ana, since, (n) => n.body.includes('A tua parte: 1,20'), 'a sua parte (bananas)');
  });

  await test.step('Despesas ao mesmo tempo: jantar, gasolina, e bilhetes só para dois', async () => {
    const since = now();
    await Promise.all([
      addExpense(ana, groupUrl, { description: 'Jantar', amount: '80' }),
      addExpense(ricardo, groupUrl, { description: 'Gasolina', amount: '40' }),
      addExpense(helder, groupUrl, { description: 'Bilhetes', amount: '30', only: ['Hélder', 'Ana'] }),
    ]);

    // Avisos de despesas seguidas juntam-se num só ("N despesas novas"), que
    // substitui o anterior. A despesa da viagem (lançada há instantes) conta.
    // Ninguém recebe a sua própria despesa, nem uma em que não entra (Bilhetes).
    await expectLatestExpenseNotice(miguel, since, 2); // jantar, gasolina
    await expectLatestExpenseNotice(ricardo, since, 2); // viagem, jantar
    await expectLatestExpenseNotice(helder, since, 3); // viagem, jantar, gasolina
    await expectLatestExpenseNotice(ana, since, 3); // viagem, gasolina, bilhetes
  });

  await test.step('Toda a gente vê os saldos certos', async () => {
    // Pagou − a sua parte: Ana 80 − 46,20; Ricardo 40 − 33; Miguel 6,30 − 30; Hélder 30 − 47,10.
    const expected = { Ana: 'a receber 33,80 €', Ricardo: 'a receber 7,00 €', Miguel: 'a pagar 23,70 €', Hélder: 'a pagar 17,10 €' };
    for (const seen of await Promise.all(everyone.map((f) => readBalances(f, groupUrl)))) expect(seen).toEqual(expected);
  });

  await test.step('Miguel comenta o jantar da Ana', async () => {
    const since = now();
    const { page } = miguel;
    await page.goto(groupUrl);
    await page.getByText('Jantar', { exact: true }).first().click();
    await page.getByPlaceholder('Adiciona um comentário…').fill('Estava top 🍝');
    await page.getByRole('button', { name: 'Enviar comentário' }).click();
    await expectNotification(ana, since, (n) => n.body.includes('Estava top'), 'o comentário');
  });

  await test.step('Hélder acerta contas com o Miguel', async () => {
    const since = now();
    const { page } = helder;
    await page.goto(groupUrl);
    await page.getByRole('button', { name: 'Acertar contas' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: /Miguel/ }).first().click();
    // O Miguel tem Revtag: o botão de pagar abre o Revolut com o valor e a nota.
    const revolut = sheet.getByRole('radio', { name: /Revolut/ });
    await revolut.click();
    const href = await page.getByRole('link', { name: /Pagar .* a Miguel/ }).getAttribute('href');
    expect(href).toContain(`miguel${RUN}`.toLowerCase());
    expect(decodeURIComponent(href ?? '')).toContain(`Saldar dívida de "${groupName}"`);
    // Paga "por fora" (dinheiro) — o Revolut é outro site, fica fora do teste.
    await sheet.getByRole('radio', { name: /Outro/ }).click();
    await page.getByRole('button', { name: /Pagar .* a Miguel/ }).click();
    await expect(sheet).toBeHidden();
    await expectNotification(miguel, since, (n) => n.body.includes('Hélder'), 'o pagamento do Hélder');
  });

  await test.step('Saldos certos para todos depois do pagamento', async () => {
    const expected = { Ana: 'a receber 33,80 €', Ricardo: 'a receber 7,00 €', Miguel: 'a pagar 25,80 €', Hélder: 'a pagar 15,00 €' };
    for (const seen of await Promise.all(everyone.map((f) => readBalances(f, groupUrl)))) expect(seen).toEqual(expected);
  });

  for (const f of everyone) await f.context.close();
});

/** A última notificação de "despesa nova" de `f` diz que são `count` despesas. */
async function expectLatestExpenseNotice(f: Friend, since: string, count: number) {
  await expect
    .poll(() => inbox(f, since).filter((n) => n.tag.endsWith('|expense.created')).at(-1)?.body ?? '', {
      message: `${f.name}: último aviso de despesas devia contar ${count}`,
      timeout: 20_000,
    })
    .toContain(`${count} despesas novas`);
}

/** Abre a viagem pelo link da notificação e pede um produto só para si. */
async function placeOrder(f: Friend, tripUrl: string, product: string, quantity: number) {
  const { page } = f;
  await page.goto(tripUrl);
  await page.getByRole('button', { name: 'Fazer Pedido' }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Eu', exact: true }).click();
  await sheet.getByPlaceholder('ex. Leite, Bananas…').fill(product);
  for (let i = 1; i < quantity; i++) await sheet.getByRole('button', { name: 'Mais', exact: true }).click();
  await sheet.getByRole('button', { name: 'Marca original' }).click();
  await sheet.getByRole('button', { name: 'Fazer Pedido', exact: true }).click();
  await expect(page.getByRole('heading', { name: product })).toBeVisible();
}
