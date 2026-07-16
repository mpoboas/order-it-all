import type { Split, SplitItem, SplitItemMode } from "@/lib/types";

const EPS = 0.01;

export const SPLIT_ITEM_MODE_LABELS: Record<SplitItemMode, string> = {
  equal: "Igual",
  unequal: "Desigual",
  percentage: "Por percentagem",
  shares: "Por quantidade",
};

export function getSplitItemMode(item: SplitItem): SplitItemMode {
  return item.split_mode ?? "equal";
}

export function getActiveParticipants(item: SplitItem): string[] {
  const mode = getSplitItemMode(item);
  if (mode === "equal") {
    return [...item.participants];
  }

  const allocs = item.allocations ?? {};
  const fromAlloc = Object.entries(allocs)
    .filter(([, value]) => value > 0)
    .map(([name]) => name);

  if (fromAlloc.length > 0) {
    return fromAlloc;
  }

  return [...item.participants];
}

export function computeParticipantAmount(
  item: SplitItem,
  participant: string,
): number {
  const price = item.price;
  if (price <= 0) return 0;

  const participants = getActiveParticipants(item);
  if (!participants.includes(participant)) return 0;

  const mode = getSplitItemMode(item);
  const allocs = item.allocations ?? {};

  switch (mode) {
    case "equal":
      return price / participants.length;
    case "unequal":
      return allocs[participant] ?? 0;
    case "percentage": {
      const pct = allocs[participant] ?? 0;
      return (price * pct) / 100;
    }
    case "shares": {
      const totalShares = participants.reduce(
        (sum, name) => sum + (allocs[name] ?? 0),
        0,
      );
      if (totalShares <= 0) return 0;
      return (price * (allocs[participant] ?? 0)) / totalShares;
    }
    default:
      return 0;
  }
}

export interface AllocationSummary {
  mode: SplitItemMode;
  assigned: number;
  remaining: number;
  total: number;
  isValid: boolean;
  unit: "eur" | "percent" | "shares" | "none";
}

export function computeAllocationSummary(item: SplitItem): AllocationSummary {
  const mode = getSplitItemMode(item);
  const price = Math.round(item.price * 100) / 100;
  const participants = getActiveParticipants(item);
  const allocs = item.allocations ?? {};

  if (participants.length === 0) {
    return {
      mode,
      assigned: 0,
      remaining: mode === "percentage" ? 100 : price,
      total: mode === "percentage" ? 100 : price,
      isValid: false,
      unit: mode === "percentage" ? "percent" : "eur",
    };
  }

  if (mode === "equal") {
    return {
      mode,
      assigned: price,
      remaining: 0,
      total: price,
      isValid: true,
      unit: "none",
    };
  }

  if (mode === "unequal") {
    const assigned =
      Math.round(
        participants.reduce((sum, name) => sum + (allocs[name] ?? 0), 0) * 100,
      ) / 100;
    const remaining = Math.round((price - assigned) * 100) / 100;
    return {
      mode,
      assigned,
      remaining,
      total: price,
      isValid: Math.abs(remaining) < EPS,
      unit: "eur",
    };
  }

  if (mode === "percentage") {
    const assigned =
      Math.round(
        participants.reduce((sum, name) => sum + (allocs[name] ?? 0), 0) * 100,
      ) / 100;
    const remaining = Math.round((100 - assigned) * 100) / 100;
    return {
      mode,
      assigned,
      remaining,
      total: 100,
      isValid: Math.abs(remaining) < EPS,
      unit: "percent",
    };
  }

  const assigned = participants.reduce(
    (sum, name) => sum + (allocs[name] ?? 0),
    0,
  );
  return {
    mode,
    assigned,
    remaining: 0,
    total: assigned,
    isValid: assigned > 0,
    unit: "shares",
  };
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildEqualAllocations(
  participants: string[],
  price: number,
): Record<string, number> {
  if (participants.length === 0) return {};
  const share = roundMoney(price / participants.length);
  const allocs: Record<string, number> = {};
  let assigned = 0;
  participants.forEach((name, index) => {
    if (index === participants.length - 1) {
      allocs[name] = roundMoney(price - assigned);
    } else {
      allocs[name] = share;
      assigned += share;
    }
  });
  return allocs;
}

export function buildEqualPercentages(
  participants: string[],
): Record<string, number> {
  if (participants.length === 0) return {};
  const share = roundPercent(100 / participants.length);
  const allocs: Record<string, number> = {};
  let assigned = 0;
  participants.forEach((name, index) => {
    if (index === participants.length - 1) {
      allocs[name] = roundPercent(100 - assigned);
    } else {
      allocs[name] = share;
      assigned += share;
    }
  });
  return allocs;
}

export function buildUnitShares(
  participants: string[],
): Record<string, number> {
  const allocs: Record<string, number> = {};
  participants.forEach((name) => {
    allocs[name] = 1;
  });
  return allocs;
}

export function migrateItemToMode(
  item: SplitItem,
  newMode: SplitItemMode,
  allParticipants: string[],
): SplitItem {
  const currentMode = getSplitItemMode(item);
  if (currentMode === newMode) {
    return normalizeSplitItem(item, allParticipants);
  }

  const participants =
    getActiveParticipants(item).length > 0
      ? getActiveParticipants(item)
      : [...item.participants];

  const price = item.price;
  const next: SplitItem = {
    ...item,
    split_mode: newMode,
    participants,
    allocations: { ...(item.allocations ?? {}) },
  };

  if (newMode === "equal") {
    return {
      ...next,
      split_mode: "equal",
      allocations: undefined,
    };
  }

  if (newMode === "unequal") {
    const amounts = buildEqualAllocations(participants, price);
    const allocations: Record<string, number> = {};
    for (const name of allParticipants) {
      allocations[name] = amounts[name] ?? 0;
    }
    return {
      ...next,
      allocations,
      participants: Object.entries(allocations)
        .filter(([, value]) => value > 0)
        .map(([name]) => name),
    };
  }

  if (newMode === "percentage") {
    const pcts = buildEqualPercentages(participants);
    const allocations: Record<string, number> = {};
    for (const name of allParticipants) {
      allocations[name] = pcts[name] ?? 0;
    }
    return {
      ...next,
      allocations,
      participants: Object.entries(allocations)
        .filter(([, value]) => value > 0)
        .map(([name]) => name),
    };
  }

  const shares = buildUnitShares(participants);
  const allocations: Record<string, number> = {};
  for (const name of allParticipants) {
    allocations[name] = shares[name] ?? 0;
  }
  return {
    ...next,
    allocations,
    participants: Object.entries(allocations)
      .filter(([, value]) => value > 0)
      .map(([name]) => name),
  };
}

export function normalizeSplitItem(
  item: SplitItem,
  allParticipants: string[],
): SplitItem {
  const mode = getSplitItemMode(item);
  const participants = getActiveParticipants(item).filter((name) =>
    allParticipants.includes(name),
  );

  if (mode === "equal") {
    return {
      ...item,
      split_mode: "equal",
      participants,
      allocations: undefined,
    };
  }

  const allocs: Record<string, number> = {};
  for (const name of allParticipants) {
    allocs[name] = item.allocations?.[name] ?? 0;
  }

  return {
    ...item,
    split_mode: mode,
    participants,
    allocations: allocs,
  };
}

export function renameParticipantInItem(
  item: SplitItem,
  oldName: string,
  newName: string,
): SplitItem {
  const participants = item.participants.map((name) =>
    name === oldName ? newName : name,
  );

  if (!item.allocations) {
    return { ...item, participants };
  }

  const allocations = { ...item.allocations };
  if (allocations[oldName] !== undefined) {
    allocations[newName] = allocations[oldName];
    delete allocations[oldName];
  }

  return { ...item, participants, allocations };
}

export function removeParticipantFromItem(
  item: SplitItem,
  name: string,
): SplitItem {
  const participants = item.participants.filter((p) => p !== name);
  if (!item.allocations) {
    return { ...item, participants };
  }

  const allocations = { ...item.allocations };
  delete allocations[name];
  return { ...item, participants, allocations };
}

export function getItemModeShortLabel(item: SplitItem): string {
  return SPLIT_ITEM_MODE_LABELS[getSplitItemMode(item)];
}

export function getAveragePerPersonLabel(item: SplitItem): string | null {
  const participants = getActiveParticipants(item);
  if (participants.length === 0) return null;

  const mode = getSplitItemMode(item);
  if (mode === "equal") {
    return null;
  }

  return getItemModeShortLabel(item);
}

export const MEMBER_ALLOCATION_MODES: SplitItemMode[] = [
  "equal",
  "shares",
  "unequal",
];

export function memberSheetDefaultMode(item: SplitItem): SplitItemMode {
  const mode = getSplitItemMode(item);
  if (mode === "percentage") return "shares";
  if (MEMBER_ALLOCATION_MODES.includes(mode)) return mode;
  return "shares";
}

/**
 * Which modes members are allowed to pick for this split. An empty/unset
 * `allowed_modes` means no restriction has been configured — default to
 * every member-facing mode rather than locking members out entirely.
 */
export function getAllowedMemberModes(
  split: Pick<Split, "allowed_modes">,
): SplitItemMode[] {
  return split.allowed_modes && split.allowed_modes.length > 0
    ? split.allowed_modes
    : MEMBER_ALLOCATION_MODES;
}

export function mergeMemberItemAllocation(
  item: SplitItem,
  allParticipants: string[],
  myName: string,
  draftMode: SplitItemMode,
  options: {
    equalParticipating?: boolean;
    myValue?: number;
    /** Full per-participant values (unequal/shares). When set, overrides myValue. */
    allocations?: Record<string, number>;
    /** Full desired participant list ("equal" mode). When set, overrides equalParticipating. */
    participants?: string[];
  },
): SplitItem {
  if (draftMode === "equal") {
    let participants: string[];
    if (options.participants) {
      const known = new Set(allParticipants);
      participants = options.participants.filter((name) => known.has(name));
    } else {
      const participating = options.equalParticipating ?? false;
      participants = [...item.participants];
      if (participating && !participants.includes(myName)) {
        participants.push(myName);
      } else if (!participating) {
        participants = participants.filter((name) => name !== myName);
      }
    }
    return {
      ...item,
      split_mode: "equal",
      participants,
      allocations: undefined,
    };
  }

  const base =
    getSplitItemMode(item) === draftMode
      ? normalizeSplitItem(item, allParticipants)
      : migrateItemToMode(item, draftMode, allParticipants);

  const allocations = { ...(base.allocations ?? {}) };
  if (options.allocations) {
    for (const name of allParticipants) {
      const value = options.allocations[name];
      allocations[name] = Number.isFinite(value) && value > 0 ? value : 0;
    }
  } else {
    allocations[myName] = options.myValue ?? 0;
  }

  const participants = allParticipants.filter(
    (name) => (allocations[name] ?? 0) > 0,
  );

  return {
    ...base,
    split_mode: draftMode,
    allocations,
    participants,
  };
}

export function canMemberSaveAllocation(
  mode: SplitItemMode,
  options: {
    equalParticipating?: boolean;
    myValue?: number;
    locked?: boolean;
    wasParticipating?: boolean;
    /** The participant's previously saved value — required to detect edits while locked. */
    originalValue?: number;
    /** For "unequal": whether the allocations sum up to the item price. */
    totalIsValid?: boolean;
    /** For "equal": whether the submitted participant list differs from the saved one. */
    participantsChanged?: boolean;
  },
): boolean {
  if (mode === "equal") {
    // A locked item is frozen entirely — nobody can be added or removed,
    // not just the caller.
    if (options.locked && options.participantsChanged) {
      return false;
    }
    if (
      options.locked &&
      options.wasParticipating &&
      !options.equalParticipating
    ) {
      return false;
    }
    return true;
  }
  if (mode === "unequal" || mode === "shares") {
    const my = options.myValue ?? 0;
    // Can't zero yourself out of an item that's locked to you.
    if (options.locked && options.wasParticipating && my <= 0) {
      return false;
    }
    // A locked item is frozen entirely — not just against leaving.
    if (
      options.locked &&
      options.wasParticipating &&
      options.originalValue !== undefined &&
      Math.abs(my - options.originalValue) >= EPS
    ) {
      return false;
    }
    // Exact amounts must reconcile to the item price before they can be saved.
    if (mode === "unequal" && options.totalIsValid === false) {
      return false;
    }
    return my >= 0;
  }
  return false;
}

/**
 * Given raw per-participant inputs and a set of "pinned" names (values the
 * user has explicitly fixed), evenly redistributes the remaining item price
 * across the unpinned, active participants. Participants with no value and
 * no pin are left untouched (they're not part of the split).
 */
export function computePinnedUnequalAmounts(
  price: number,
  allParticipants: string[],
  rawValues: Record<string, number>,
  pinnedNames: ReadonlySet<string>,
): Record<string, number> {
  const result: Record<string, number> = {};

  if (pinnedNames.size === 0) {
    for (const name of allParticipants) {
      result[name] = rawValues[name] ?? 0;
    }
    return result;
  }

  let pinnedSum = 0;
  for (const name of pinnedNames) {
    const value = rawValues[name] ?? 0;
    result[name] = value;
    pinnedSum += value;
  }

  const unpinnedActive = allParticipants.filter(
    (name) => !pinnedNames.has(name) && (rawValues[name] ?? 0) > 0,
  );
  const remaining = roundMoney(price - pinnedSum);

  if (unpinnedActive.length > 0) {
    const share = roundMoney(remaining / unpinnedActive.length);
    let assigned = 0;
    unpinnedActive.forEach((name, index) => {
      if (index === unpinnedActive.length - 1) {
        result[name] = roundMoney(remaining - assigned);
      } else {
        result[name] = share;
        assigned += share;
      }
    });
  }

  for (const name of allParticipants) {
    if (result[name] === undefined) {
      result[name] = 0;
    }
  }

  return result;
}
