/// <reference path="../../pb_data/types.d.ts" />
//
// Migração PocketBase — histórico curto das notificações enviadas.
//
// `notification_log`, uma linha por `key`:
// - rajadas (`key` = pessoa|grupo|tipo): quantos avisos seguidos, soma dos
//   valores, quem os fez. Se chega outro igual poucos minutos depois, a app
//   envia a versão agrupada ("Ana adicionou 3 despesas") com a mesma tag —
//   no telemóvel substitui o anterior em vez de empilhar;
// - eventos já tratados (`key` = "event|…") — a mesma alteração nunca avisa
//   duas vezes, mesmo que a app chame duas vezes;
// - o lembrete mensal de dívidas (`key` = "debt-reminders|AAAA-MM").
//
// Regras a `null`: só o servidor da app (superuser) lê e escreve.
// Copiar para `pb_migrations/` no servidor (nome a começar por timestamp) e
// reiniciar. Idempotente.

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('notification_log');
      return;
    } catch (_) {
      /* cria */
    }

    app.save(
      new Collection({
        name: 'notification_log',
        type: 'base',
        fields: [
          { name: 'key', type: 'text', required: true, max: 200 },
          { name: 'count', type: 'number', required: false, onlyInt: true },
          { name: 'amount_cents', type: 'number', required: false, onlyInt: true },
          { name: 'actors', type: 'json', required: false, maxSize: 2000 },
          { name: 'subjects', type: 'json', required: false, maxSize: 4000 },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_notification_log_key ON notification_log (key)',
          'CREATE INDEX idx_notification_log_updated ON notification_log (updated)',
        ],
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
      }),
    );
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('notification_log'));
    } catch (_) {
      /* já não existe */
    }
  },
);
