// Pure regex evaluator. No browser/Thunderbird APIs — safe to unit-test with node --test.

export const FIELDS = ["subject", "from", "recipients", "body"];
export const OPERATORS = ["matches", "not_matches"];
export const JOINS = ["all", "any"];

/**
 * Compile a single condition's regex. Returns null if invalid.
 * @param {{pattern: string, flags: string}} cond
 * @returns {RegExp | null}
 */
export function compileCondition(cond) {
  try {
    return new RegExp(cond.pattern, cond.flags || "");
  } catch {
    return null;
  }
}

/**
 * Compile every regex in a rule once. Invalid regexes are recorded as null,
 * and the rule is flagged invalid so callers can decide to skip it.
 * @param {Rule} rule
 * @returns {CompiledRule}
 */
export function compileRule(rule) {
  const compiled = rule.conditions.map(compileCondition);
  return {
    rule,
    compiled,
    invalid: compiled.some((r) => r === null),
  };
}

/**
 * Pick the string value of a field from a MessageView.
 * Recipients concatenate to/cc/bcc.
 * @param {MessageView} msg
 * @param {"subject"|"from"|"recipients"|"body"} field
 * @returns {string}
 */
export function extractField(msg, field) {
  switch (field) {
    case "subject":
      return msg.subject ?? "";
    case "from":
      return msg.from ?? "";
    case "recipients":
      return [msg.to ?? [], msg.cc ?? [], msg.bcc ?? []].flat().join(", ");
    case "body":
      return msg.body ?? "";
    default:
      return "";
  }
}

/**
 * Evaluate a compiled rule against a message view.
 * A condition on `body` when msg.body is undefined (not yet loaded) is
 * treated as "cannot evaluate" and therefore does not match — the whole
 * rule is skipped in that case rather than producing a misleading result.
 * Invalid rules never match.
 * @param {CompiledRule} compiled
 * @param {MessageView} msg
 * @returns {boolean}
 */
export function ruleMatches(compiled, msg) {
  if (compiled.invalid) return false;

  const join = compiled.rule.conditionsJoin === "any" ? "any" : "all";
  const results = [];

  for (let i = 0; i < compiled.rule.conditions.length; i++) {
    const cond = compiled.rule.conditions[i];
    const re = compiled.compiled[i];

    if (cond.field === "body" && msg.body === undefined) return false;

    const value = extractField(msg, cond.field);
    const hit = re.test(value);
    results.push(cond.operator === "not_matches" ? !hit : hit);
  }

  return join === "any" ? results.some(Boolean) : results.every(Boolean);
}

/**
 * True if any enabled condition in any enabled rule reads the body.
 * Used by the listener to decide whether to fetch bodies up-front.
 * @param {Rule[]} rules
 * @returns {boolean}
 */
export function needsBody(rules) {
  return rules.some(
    (r) => r.enabled && r.conditions.some((c) => c.field === "body"),
  );
}

/**
 * True if the rule applies to the given accountId.
 * ["*"] or empty means all accounts.
 * @param {Rule} rule
 * @param {string} accountId
 */
export function ruleAppliesToAccount(rule, accountId) {
  const ids = rule.accountIds;
  if (!ids || ids.length === 0) return true;
  if (ids.includes("*")) return true;
  return ids.includes(accountId);
}

/**
 * @typedef {Object} Condition
 * @property {"subject"|"from"|"recipients"|"body"} field
 * @property {"matches"|"not_matches"} operator
 * @property {string} pattern
 * @property {string} flags
 */

/**
 * @typedef {Object} Action
 * @property {"move"|"tag"|"markRead"|"star"|"archive"|"delete"} type
 * @property {string} [folderId]
 * @property {string} [tagKey]
 */

/**
 * @typedef {Object} Rule
 * @property {string} id
 * @property {string} name
 * @property {boolean} enabled
 * @property {string[]} accountIds
 * @property {"all"|"any"} conditionsJoin
 * @property {Condition[]} conditions
 * @property {Action[]} actions
 * @property {boolean} stopProcessing
 */

/**
 * @typedef {Object} CompiledRule
 * @property {Rule} rule
 * @property {(RegExp|null)[]} compiled
 * @property {boolean} invalid
 */

/**
 * @typedef {Object} MessageView
 * @property {string} [subject]
 * @property {string} [from]
 * @property {string[]} [to]
 * @property {string[]} [cc]
 * @property {string[]} [bcc]
 * @property {string} [body]
 */
