/// <reference path="../../pb_data/types.d.ts" />
//
// Migração PocketBase — username em `users` (Fase 8b do plano "Splitwise
// killer": adicionar amigos por username, não só por email). Copiar para
// `pb_migrations/` no servidor (nome a começar por timestamp) e reiniciar.
//
// ⚠️ Best-effort, mesma ressalva do `1_ledger.js`.
//
// IMPORTANTE — ordem de aplicação (ver `scripts/apply-usernames-schema.mjs`,
// que é como isto foi realmente aplicado ao servidor, via API de admin em
// vez de ficheiro de migração):
//   1. Acrescentar o campo `username` SEM índice único ainda — utilizadores
//      antigos ficam todos com `username = ""`, e um índice único rejeitaria
//      isso de imediato (SQLite trata "" como valor igual, não como NULL).
//   2. Correr `scripts/backfill-usernames.mjs --apply` — gera um username
//      único para cada utilizador que ainda não tem.
//   3. Só depois acrescentar o índice único (2ª parte desta migração/script).

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.fields.add(
      new Field({
        name: 'username',
        type: 'text',
        required: false,
        min: 0,
        max: 20,
      }),
    );
    app.save(users);
    // O índice único só é acrescentado depois do backfill (ver nota acima) —
    // corre `node scripts/apply-usernames-schema.mjs --apply` outra vez
    // depois do backfill para o adicionar.
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('users');
      users.fields.removeByName('username');
      app.save(users);
    } catch (_) { /* já não existe */ }
  },
);
