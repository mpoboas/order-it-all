/// <reference path="../../pb_data/types.d.ts" />
//
// Migração PocketBase — email de "Recuperar password" a apontar para a app.
// Copiar para `pb_migrations/` no servidor (nome a começar por timestamp, ex.:
// `1759100000_password_reset_email.js`) e reiniciar.
//
// O template por omissão do PocketBase manda para a página do painel de admin
// (`{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}`), em inglês. Aqui passa
// a apontar para o ecrã da app (`/auth/reset-password?token=…`, que chama
// `confirmPasswordReset` e entra logo a seguir), em pt-PT.
//
// URL da app: variável de ambiente `ORDERIT_APP_URL` do servidor do
// PocketBase, lida NO MOMENTO da migração; sem ela, o domínio de produção.
// Na BD de dev, para testar em localhost, basta trocar o domínio do link do
// email por `http://localhost:3000` (o token é o mesmo).
//
// Pré-requisito: SMTP configurado (Settings → Mail settings) — sem isso o
// PocketBase não envia email nenhum (o pedido responde 204 na mesma).

const DEFAULT_APP_URL = 'https://orderit.povoas.top';

migrate(
  (app) => {
    const appUrl = ($os.getenv('ORDERIT_APP_URL') || DEFAULT_APP_URL).replace(/\/+$/, '');
    const link = `${appUrl}/auth/reset-password?token={TOKEN}`;

    const users = app.findCollectionByNameOrId('users');
    unmarshal(
      {
        resetPasswordTemplate: {
          subject: 'Recuperar a tua password do {APP_NAME}',
          body:
            '<p>Olá,</p>' +
            '<p>Pediste para recuperar a password da tua conta. Toca no botão para escolher uma nova:</p>' +
            '<p><a class="btn" href="' + link + '" target="_blank" rel="noopener">Escolher nova password</a></p>' +
            '<p><i>Se não foste tu, ignora este email — a tua password continua a mesma.</i></p>' +
            '<p>Obrigado,<br/>{APP_NAME}</p>',
        },
      },
      users,
    );
    app.save(users);
  },
  (app) => {
    // Rollback — volta ao template por omissão do PocketBase.
    const users = app.findCollectionByNameOrId('users');
    unmarshal(
      {
        resetPasswordTemplate: {
          subject: 'Reset your {APP_NAME} password',
          body:
            '<p>Hello,</p>' +
            '<p>Click on the button below to reset your password.</p>' +
            '<p><a class="btn" href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}" target="_blank" rel="noopener">Reset password</a></p>' +
            "<p><i>If you didn't ask to reset your password, you can ignore this email.</i></p>" +
            '<p>Thanks,<br/>{APP_NAME} team</p>',
        },
      },
      users,
    );
    app.save(users);
  },
);
