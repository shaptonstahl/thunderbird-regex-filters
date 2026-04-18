export const CURRENT_SCHEMA_VERSION = 1;

const DEFAULT_STATE = Object.freeze({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  rules: [],
});

export async function loadState() {
  const raw = await browser.storage.local.get(["schemaVersion", "rules"]);
  if (!raw || typeof raw.schemaVersion !== "number") {
    return structuredClone(DEFAULT_STATE);
  }
  return migrate(raw);
}

export async function saveState(state) {
  const toSave = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rules: Array.isArray(state.rules) ? state.rules : [],
  };
  await browser.storage.local.set(toSave);
}

function migrate(state) {
  let s = { ...state };
  // Future: if (s.schemaVersion < 2) s = migrateV1toV2(s);
  s.schemaVersion = CURRENT_SCHEMA_VERSION;
  s.rules = Array.isArray(s.rules) ? s.rules : [];
  return s;
}

export function newRule(partial = {}) {
  return {
    id: crypto.randomUUID(),
    name: partial.name ?? "New rule",
    enabled: partial.enabled ?? true,
    accountIds: partial.accountIds ?? ["*"],
    conditionsJoin: partial.conditionsJoin ?? "all",
    conditions: partial.conditions ?? [
      { field: "subject", operator: "matches", pattern: "", flags: "" },
    ],
    actions: partial.actions ?? [],
    stopProcessing: partial.stopProcessing ?? false,
  };
}

export function subscribe(callback) {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!("rules" in changes) && !("schemaVersion" in changes)) return;
    callback();
  });
}
