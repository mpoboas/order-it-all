// Handlers dos hooks registados em `main.pb.js` — adaptam os eventos do
// PocketBase (records, `e.app`) à lógica pura de `ledger_invariants.js`.
//
// Pedidos de superuser (scripts de migração/importação, rotas de servidor
// como `/api/groups/invite`) passam sem validação: as invariantes protegem
// contra clientes, não contra o admin.

const inv = require(`${__hooks}/ledger_invariants.js`);

function rethrow(err) {
  if (err instanceof inv.InvariantError) throw new BadRequestError(err.message);
  throw err;
}

function readJson(record, field) {
  const raw = record.getString(field);
  if (!raw || raw === 'null') return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new BadRequestError(`"${field}" não é JSON válido.`);
  }
}

function snapshot(record) {
  return {
    group_id: record.getString('group_id'),
    kind: record.getString('kind'),
    amount: record.getFloat('amount'),
    split_mode: record.getString('split_mode'),
    payers: readJson(record, 'payers'),
    shares: readJson(record, 'shares'),
    participants: record.getStringSlice('participants'),
  };
}

/** Campos que, quando mudam, obrigam a revalidar. Soft-delete, recibo,
 *  `split_id`, notas, descrição… não mexem no dinheiro nem no grupo. */
const WATCHED = ['amount', 'split_mode', 'kind', 'group_id', 'payers', 'shares', 'participants'];

function makeLookup(app) {
  const isGroupMember = (groupId, userId) => {
    try {
      return app.findRecordById('groups', groupId).getStringSlice('members').indexOf(userId) !== -1;
    } catch (_) {
      return false;
    }
  };
  return {
    isGroupMember,
    isGroupParty(groupId, partyId) {
      if (isGroupMember(groupId, partyId)) return true;
      try {
        return app.findRecordById('placeholders', partyId).getString('group_id') === groupId;
      } catch (_) {
        return false;
      }
    },
    areFriends(a, b) {
      try {
        app.findFirstRecordByFilter(
          'friendships',
          "status = 'accepted' && ((user_a = {:a} && user_b = {:b}) || (user_a = {:b} && user_b = {:a}))",
          { a, b },
        );
        return true;
      } catch (_) {
        return false;
      }
    },
    haveDirectHistory(a, b) {
      try {
        app.findFirstRecordByFilter(
          'expenses',
          "group_id = '' && deleted_at = '' && participants.id ?= {:a} && participants.id ?= {:b}",
          { a, b },
        );
        return true;
      } catch (_) {
        return false;
      }
    },
  };
}

function expense(e, isCreate) {
  if (e.hasSuperuserAuth()) return e.next();

  let prev = null;
  if (!isCreate) {
    const original = e.record.original();
    const changed = WATCHED.some((f) => original.getString(f) !== e.record.getString(f));
    if (!changed) return e.next();
    prev = snapshot(original);
  }

  const next = snapshot(e.record);
  const previousParties = prev
    ? [].concat(prev.payers || [], prev.shares || []).map((l) => l && l.party).filter(Boolean)
    : [];

  try {
    inv.validateExpense(
      next,
      {
        authId: e.auth ? e.auth.id : '',
        isCreate,
        groupChanged: !!prev && prev.group_id !== next.group_id,
        previousParties,
      },
      makeLookup(e.app),
    );
  } catch (err) {
    rethrow(err);
  }
  return e.next();
}

function groupOfTrip(app, tripId) {
  try {
    return app.findRecordById('trips', tripId).getString('group_id');
  } catch (_) {
    return '';
  }
}

function groupOfOrder(app, orderId) {
  try {
    return groupOfTrip(app, app.findRecordById('orders', orderId).getString('trip_id'));
  } catch (_) {
    return '';
  }
}

function itemMove(e) {
  if (e.hasSuperuserAuth()) return e.next();
  const before = e.record.original().getString('order_id');
  const after = e.record.getString('order_id');
  if (before !== after) {
    try {
      inv.checkSameGroup(groupOfOrder(e.app, before), groupOfOrder(e.app, after), 'o item');
    } catch (err) {
      rethrow(err);
    }
  }
  return e.next();
}

function orderMove(e) {
  if (e.hasSuperuserAuth()) return e.next();
  const before = e.record.original().getString('trip_id');
  const after = e.record.getString('trip_id');
  if (before !== after) {
    try {
      inv.checkSameGroup(groupOfTrip(e.app, before), groupOfTrip(e.app, after), 'a encomenda');
    } catch (err) {
      rethrow(err);
    }
  }
  return e.next();
}

module.exports = { expense, itemMove, orderMove };
