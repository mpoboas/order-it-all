/// <reference path="../../pb_data/types.d.ts" />
//
// Migração PocketBase — pagar pelo Revolut/MB WAY ao acertar contas.
// Copiar para `pb_migrations/` no servidor (nome a começar por timestamp, ex.:
// `1759000000_payment_methods.js`) e reiniciar.
//
// ⚠️ Best-effort, mesma ressalva do `1_ledger.js`.
//
// - `users.revtag` (texto) — revtag do Revolut, sem "@", para o link
//   `revolut.me/{revtag}?amount=…` (ver `src/lib/paymentLinks.ts`). O
//   `mbway_phone` já existe desde o `1_ledger.js`.
// - `expenses.method` (select `mbway` | `revolut` | `other`) — como foi feito
//   um pagamento (`kind = 'payment'`); vazio nas despesas.
//
// Idempotente: na BD de dev os dois campos foram criados à mão no admin antes
// desta migração existir — se já lá estiverem, não mexe neles.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    if (!users.fields.getByName('revtag')) {
      users.fields.add(
        new Field({
          name: 'revtag',
          type: 'text',
          required: false,
          max: 40,
        }),
      );
      app.save(users);
    }

    const expenses = app.findCollectionByNameOrId('expenses');
    if (!expenses.fields.getByName('method')) {
      expenses.fields.add(
        new Field({
          name: 'method',
          type: 'select',
          required: false,
          maxSelect: 1,
          values: ['mbway', 'revolut', 'other'],
        }),
      );
      app.save(expenses);
    }
  },
  (app) => {
    // Rollback — pela ordem inversa.
    try {
      const expenses = app.findCollectionByNameOrId('expenses');
      expenses.fields.removeByName('method');
      app.save(expenses);
    } catch (_) { /* já não existe */ }

    try {
      const users = app.findCollectionByNameOrId('users');
      users.fields.removeByName('revtag');
      app.save(users);
    } catch (_) { /* já não existe */ }
  },
);
