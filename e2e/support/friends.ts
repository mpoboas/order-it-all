import { readFileSync, existsSync } from 'node:fs';
import { devices, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Um "amigo" de teste: um contexto de browser só dele (o seu telemóvel), com
 * uma conta `e2e-…@e2e.test` (fácil de encontrar e apagar no PB de dev).
 */
export interface Friend {
  name: string;
  email: string;
  password: string;
  context: BrowserContext;
  page: Page;
  /** id no PocketBase — conhecido depois de entrar. */
  id: string;
}

/** Identificador desta corrida: separa contas e grupos de corridas diferentes. */
export const RUN = Date.now().toString(36);

const PHONES = {
  iphone: devices['iPhone 13'],
  pixel: devices['Pixel 7'],
  small: { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } },
} as const;
export type Phone = keyof typeof PHONES;

export async function newFriend(browser: Browser, name: string, phone: Phone): Promise<Friend> {
  // Só o ecrã/toque/UA do telemóvel — o motor é sempre Chromium (o WebKit do
  // Playwright não é o Safari do iPhone, e o browser é escolhido no arranque).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { defaultBrowserType, ...device } = PHONES[phone];
  const context = await browser.newContext({ ...device, locale: 'pt-PT', timezoneId: 'Europe/Lisbon' });
  // O "Partilhar" do sistema não existe aqui: guarda o que se partilhou para o
  // teste ler (é assim que o convite "chega" aos outros).
  await context.addInitScript(() => {
    const w = window as unknown as { __shared: { title?: string; text?: string; url?: string }[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: { title?: string; text?: string; url?: string }) => {
        w.__shared.push(data);
      },
    });
  });
  const page = await context.newPage();
  // Um aviso que a app pediu e o servidor recusou é um bug — fica no relatório.
  page.on('response', async (res) => {
    if (!res.url().includes('/api/notifications/event')) return;
    if (res.ok()) return;
    const body = await res.text().catch(() => '');
    console.log(`[${name}] notify ${res.request().postData()} → ${res.status()} ${body.slice(0, 200)}`);
  });
  page.on('requestfailed', (req) => {
    if (req.url().includes('/api/notifications/event')) console.log(`[${name}] notify FALHOU ${req.postData()} ${req.failure()?.errorText}`);
  });
  // O convite para ativar notificações/instalar aparece sozinho (com atraso)
  // por cima do que se estiver a fazer — como uma pessoa, adia-o e segue.
  const later = page.getByRole('button', { name: 'Talvez mais tarde' });
  await page.addLocatorHandler(later, async () => {
    await later.click();
    await expect(later).toBeHidden();
  });
  const slug = name
    .normalize('NFD')
    .replace(/[^\w]/g, '')
    .toLowerCase();
  return { name, email: `e2e-${RUN}-${slug}@e2e.test`, password: `e2e-${RUN}-pass`, context, page, id: '' };
}

/** id do utilizador com sessão (o `pb.authStore` guarda-o no localStorage). */
async function readUserId(page: Page): Promise<string> {
  const raw = await page.evaluate(() => localStorage.getItem('pocketbase_auth'));
  const id = raw ? (JSON.parse(raw) as { record?: { id?: string } }).record?.id : undefined;
  if (!id) throw new Error('Sem sessão no browser');
  return id;
}

/**
 * Registo completo por email: criar conta → nome → MB WAY/Revtag (ou "mais
 * tarde") → onboarding. Começa em `startUrl` (a página inicial, ou um link de
 * convite) e termina onde a app levar a seguir.
 */
export async function signUp(
  f: Friend,
  opts: { startUrl?: string; payments?: { revtag?: string; mbway?: string } } = {},
) {
  const { page } = f;
  await page.goto(opts.startUrl ?? '/');
  if (!opts.startUrl) await page.getByRole('button', { name: 'Vamos lá' }).click();
  else await page.getByRole('button', { name: /criar conta/i }).click();

  await expect(page).toHaveURL(/\/auth\/register/);
  await expectFitsWithoutScroll(page, page.getByRole('button', { name: 'Criar conta' }));
  await page.getByLabel('Email').fill(f.email);
  await page.getByLabel('Password', { exact: true }).fill(f.password);
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page).toHaveURL(/\/auth\/profile-setup/);
  f.id = await readUserId(page);
  await expectFitsWithoutScroll(page, page.getByRole('button', { name: 'Continuar' }));
  await page.getByLabel('Nome').fill(f.name);
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page).toHaveURL(/\/auth\/payment-setup/);
  await expectFitsWithoutScroll(page, page.getByRole('button', { name: 'Fazer isto mais tarde' }));
  if (opts.payments) {
    if (opts.payments.revtag) await page.getByLabel('Revolut').fill(opts.payments.revtag);
    if (opts.payments.mbway) await page.getByLabel('MB WAY').fill(opts.payments.mbway);
    await page.getByRole('button', { name: 'Guardar e continuar' }).click();
  } else {
    await page.getByRole('button', { name: 'Fazer isto mais tarde' }).click();
  }

  await finishOnboarding(page);
}

/** Passa o carrossel de boas-vindas (Começar → Continuar → … → Concluir). */
export async function finishOnboarding(page: Page) {
  await expect(page).toHaveURL(/\/onboarding/);
  for (let i = 0; i < 6 && /\/onboarding/.test(page.url()); i++) {
    const button = page.getByRole('button', { name: /^(Começar|Continuar|Concluir)/ }).last();
    await expectFitsWithoutScroll(page, button);
    await button.click();
    await page.waitForTimeout(400);
  }
  await expect(page).not.toHaveURL(/\/onboarding/);
}

/** Entrar com email e password (a partir do ecrã em que estiver). */
export async function logIn(f: Friend) {
  const { page } = f;
  await expect(page).toHaveURL(/\/auth\/login/);
  await expectFitsWithoutScroll(page, page.getByRole('button', { name: 'Entrar', exact: true }));
  await page.getByLabel('Email').fill(f.email);
  await page.getByLabel('Password', { exact: true }).fill(f.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
  f.id = await readUserId(page);
}

/** O elemento cabe no ecrã sem fazer scroll (regra dos ecrãs de entrada). */
export async function expectFitsWithoutScroll(page: Page, locator: ReturnType<Page['locator']>) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const height = page.viewportSize()?.height ?? 0;
  expect(box, 'elemento sem posição').not.toBeNull();
  expect(box!.y + box!.height, `"${await locator.textContent()}" fica abaixo do ecrã`).toBeLessThanOrEqual(height);
}

// ---- Notificações capturadas pelo servidor (.e2e/notifications.jsonl) ----

export interface CapturedNotification {
  at: string;
  userId: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  quiet?: boolean;
  icon?: string;
}

const LOG = '.e2e/notifications.jsonl';

export function capturedNotifications(): CapturedNotification[] {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CapturedNotification);
}

/** Notificações que `f` recebeu desde `since` (ISO). */
export function inbox(f: Friend, since = ''): CapturedNotification[] {
  return capturedNotifications().filter((n) => n.userId === f.id && n.at >= since);
}

/**
 * Espera até `f` ter recebido uma notificação que satisfaz `match` (o envio
 * é assíncrono: a app grava, depois chama a API).
 */
export async function expectNotification(
  f: Friend,
  since: string,
  match: (n: CapturedNotification) => boolean,
  description: string,
): Promise<CapturedNotification> {
  let found: CapturedNotification | undefined;
  await expect
    .poll(() => (found = inbox(f, since).find(match)), {
      message: `${f.name} devia ter recebido: ${description}. Recebeu: ${JSON.stringify(inbox(f, since).map((n) => `${n.title} — ${n.body}`))}`,
      timeout: 20_000,
    })
    .toBeTruthy();
  return found!;
}

export const now = () => new Date().toISOString();
