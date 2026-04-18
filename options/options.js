import { compileCondition } from "../background/engine.js";
import { loadState, newRule, saveState } from "../background/storage.js";

const state = { rules: [], accounts: [], folders: [], tags: [] };

const rulesList = document.getElementById("rules-list");
const ruleTemplate = document.getElementById("rule-template");
const conditionTemplate = document.getElementById("condition-template");
const actionTemplate = document.getElementById("action-template");

document.getElementById("add-rule").addEventListener("click", () => {
  state.rules.push(newRule());
  persistAndRender();
});
document.getElementById("export").addEventListener("click", onExport);
document.getElementById("import").addEventListener("click", () => {
  document.getElementById("import-file").click();
});
document.getElementById("import-file").addEventListener("change", onImport);

init().catch((err) => console.error("[regex-filters options]", err));

async function init() {
  const [stored, accounts, tags] = await Promise.all([
    loadState(),
    safeCall(() => messenger.accounts.list(true)),
    safeCall(() => messenger.messages.tags.list()),
  ]);
  state.rules = stored.rules;
  state.accounts = accounts ?? [];
  state.tags = tags ?? [];
  state.folders = flattenFolders(state.accounts);
  render();
}

async function safeCall(fn) {
  try {
    return await fn();
  } catch (err) {
    console.warn("[regex-filters options] API call failed:", err);
    return null;
  }
}

function flattenFolders(accounts) {
  const out = [];
  function walk(folders, accountName) {
    for (const f of folders ?? []) {
      out.push({
        id: f.id,
        label: `${accountName} — ${f.path}`,
      });
      walk(f.subFolders, accountName);
    }
  }
  for (const acct of accounts) walk(acct.folders, acct.name);
  return out;
}

async function persistAndRender() {
  await saveState({ rules: state.rules });
  render();
}

function render() {
  rulesList.replaceChildren();
  state.rules.forEach((rule, idx) => rulesList.append(buildRuleNode(rule, idx)));
}

function buildRuleNode(rule, idx) {
  const node = ruleTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.id = rule.id;

  const enabled = node.querySelector(".rule-enabled");
  enabled.checked = rule.enabled;
  enabled.addEventListener("change", () => {
    rule.enabled = enabled.checked;
    persistAndRender();
  });

  const nameLabel = node.querySelector(".rule-name");
  nameLabel.textContent = rule.name || "(untitled)";

  const nameInput = node.querySelector(".rule-name-input");
  nameInput.value = rule.name;
  nameInput.addEventListener("change", () => {
    rule.name = nameInput.value.trim() || "New rule";
    persistAndRender();
  });

  node.querySelector("[data-op='up']").addEventListener("click", () => move(idx, -1));
  node.querySelector("[data-op='down']").addEventListener("click", () => move(idx, 1));
  node.querySelector("[data-op='duplicate']").addEventListener("click", () => {
    const clone = structuredClone(rule);
    clone.id = crypto.randomUUID();
    clone.name = `${rule.name} (copy)`;
    state.rules.splice(idx + 1, 0, clone);
    persistAndRender();
  });
  node.querySelector("[data-op='delete']").addEventListener("click", () => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    state.rules.splice(idx, 1);
    persistAndRender();
  });

  buildAccountsPicker(node, rule);

  const join = node.querySelector(".rule-join");
  join.value = rule.conditionsJoin;
  join.addEventListener("change", () => {
    rule.conditionsJoin = join.value;
    persistAndRender();
  });

  const condsList = node.querySelector(".conditions-list");
  rule.conditions.forEach((c, ci) =>
    condsList.append(buildConditionNode(rule, c, ci)),
  );
  node.querySelector(".add-condition").addEventListener("click", () => {
    rule.conditions.push({
      field: "subject",
      operator: "matches",
      pattern: "",
      flags: "",
    });
    persistAndRender();
  });

  const actsList = node.querySelector(".actions-list");
  rule.actions.forEach((a, ai) =>
    actsList.append(buildActionNode(rule, a, ai)),
  );
  node.querySelector(".add-action").addEventListener("click", () => {
    rule.actions.push({ type: "markRead" });
    persistAndRender();
  });

  const stop = node.querySelector(".rule-stop");
  stop.checked = !!rule.stopProcessing;
  stop.addEventListener("change", () => {
    rule.stopProcessing = stop.checked;
    persistAndRender();
  });

  return node;
}

function buildAccountsPicker(ruleNode, rule) {
  const allBox = ruleNode.querySelector(".account-all");
  const list = ruleNode.querySelector(".account-list");
  const applyAll = rule.accountIds.includes("*") || rule.accountIds.length === 0;
  allBox.checked = applyAll;

  list.replaceChildren();
  for (const acct of state.accounts) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = acct.id;
    cb.checked = !applyAll && rule.accountIds.includes(acct.id);
    cb.disabled = applyAll;
    cb.addEventListener("change", () => {
      if (cb.checked) rule.accountIds = [...new Set([...rule.accountIds, acct.id])];
      else rule.accountIds = rule.accountIds.filter((x) => x !== acct.id);
      persistAndRender();
    });
    label.append(cb, document.createTextNode(` ${acct.name}`));
    list.append(label);
  }

  allBox.addEventListener("change", () => {
    rule.accountIds = allBox.checked ? ["*"] : [];
    persistAndRender();
  });
}

function buildConditionNode(rule, cond, index) {
  const node = conditionTemplate.content.firstElementChild.cloneNode(true);
  const field = node.querySelector(".cond-field");
  const op = node.querySelector(".cond-operator");
  const pattern = node.querySelector(".cond-pattern");
  const flags = node.querySelector(".cond-flags");
  const status = node.querySelector(".cond-status");

  field.value = cond.field;
  op.value = cond.operator;
  pattern.value = cond.pattern;
  flags.value = cond.flags;

  const validate = () => {
    const compiled = compileCondition({ pattern: pattern.value, flags: flags.value });
    if (pattern.value === "") {
      status.textContent = "";
      status.className = "cond-status";
      status.title = "";
      return;
    }
    if (compiled) {
      status.textContent = "✓";
      status.className = "cond-status ok";
      status.title = "Valid regular expression";
    } else {
      status.textContent = "✗";
      status.className = "cond-status err";
      status.title = "Invalid regular expression";
    }
  };
  validate();

  const commit = () => {
    cond.field = field.value;
    cond.operator = op.value;
    cond.pattern = pattern.value;
    cond.flags = flags.value;
    validate();
    saveState({ rules: state.rules }).catch((err) =>
      console.error("[regex-filters options] save failed:", err),
    );
  };

  field.addEventListener("change", commit);
  op.addEventListener("change", commit);
  pattern.addEventListener("input", () => {
    cond.pattern = pattern.value;
    validate();
  });
  pattern.addEventListener("change", commit);
  flags.addEventListener("input", () => {
    cond.flags = flags.value;
    validate();
  });
  flags.addEventListener("change", commit);

  node.querySelector(".cond-remove").addEventListener("click", () => {
    rule.conditions.splice(index, 1);
    if (rule.conditions.length === 0) {
      rule.conditions.push({
        field: "subject",
        operator: "matches",
        pattern: "",
        flags: "",
      });
    }
    persistAndRender();
  });

  return node;
}

function buildActionNode(rule, action, index) {
  const node = actionTemplate.content.firstElementChild.cloneNode(true);
  const type = node.querySelector(".action-type");
  const folderSel = node.querySelector(".action-folder");
  const tagSel = node.querySelector(".action-tag");

  fillFolderSelect(folderSel);
  fillTagSelect(tagSel);

  type.value = action.type;
  folderSel.value = action.folderId ?? "";
  tagSel.value = action.tagKey ?? "";
  syncActionSubEditors(action.type, folderSel, tagSel);

  type.addEventListener("change", () => {
    action.type = type.value;
    if (type.value !== "move") delete action.folderId;
    if (type.value !== "tag") delete action.tagKey;
    syncActionSubEditors(action.type, folderSel, tagSel);
    persistAndRender();
  });
  folderSel.addEventListener("change", () => {
    action.folderId = folderSel.value;
    persistAndRender();
  });
  tagSel.addEventListener("change", () => {
    action.tagKey = tagSel.value;
    persistAndRender();
  });
  node.querySelector(".action-remove").addEventListener("click", () => {
    rule.actions.splice(index, 1);
    persistAndRender();
  });
  return node;
}

function syncActionSubEditors(type, folderSel, tagSel) {
  folderSel.hidden = type !== "move";
  tagSel.hidden = type !== "tag";
}

function fillFolderSelect(sel) {
  sel.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "— choose folder —";
  sel.append(empty);
  for (const f of state.folders) {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.label;
    sel.append(opt);
  }
}

function fillTagSelect(sel) {
  sel.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "— choose tag —";
  sel.append(empty);
  for (const t of state.tags) {
    const opt = document.createElement("option");
    opt.value = t.key;
    opt.textContent = t.tag;
    sel.append(opt);
  }
}

function move(idx, delta) {
  const target = idx + delta;
  if (target < 0 || target >= state.rules.length) return;
  const [item] = state.rules.splice(idx, 1);
  state.rules.splice(target, 0, item);
  persistAndRender();
}

function onExport() {
  const blob = new Blob(
    [JSON.stringify({ schemaVersion: 1, rules: state.rules }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "regex-filters.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function onImport(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.rules)) throw new Error("missing rules array");
    if (!confirm(`Replace your ${state.rules.length} rule(s) with ${parsed.rules.length} imported rule(s)?`)) {
      return;
    }
    state.rules = parsed.rules.map((r) => newRule(r));
    await persistAndRender();
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  } finally {
    ev.target.value = "";
  }
}
