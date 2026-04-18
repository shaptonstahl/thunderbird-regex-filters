import { test } from "node:test";
import assert from "node:assert/strict";

import {
  compileCondition,
  compileRule,
  extractField,
  needsBody,
  ruleAppliesToAccount,
  ruleMatches,
} from "../background/engine.js";

function mkRule(overrides = {}) {
  return {
    id: "r1",
    name: "test",
    enabled: true,
    accountIds: ["*"],
    conditionsJoin: "all",
    conditions: [],
    actions: [],
    stopProcessing: false,
    ...overrides,
  };
}

function mkMsg(overrides = {}) {
  return {
    subject: "Subject line",
    from: "Alice <alice@example.com>",
    to: ["bob@example.com"],
    cc: [],
    bcc: [],
    body: "hello world",
    ...overrides,
  };
}

test("compileCondition returns null for invalid regex", () => {
  assert.equal(compileCondition({ pattern: "[unclosed", flags: "" }), null);
});

test("compileCondition returns RegExp for valid pattern+flags", () => {
  const re = compileCondition({ pattern: "foo", flags: "i" });
  assert.ok(re instanceof RegExp);
  assert.equal(re.flags, "i");
});

test("extractField joins recipients from to/cc/bcc", () => {
  const msg = mkMsg({
    to: ["a@x"],
    cc: ["b@x"],
    bcc: ["c@x"],
  });
  assert.equal(extractField(msg, "recipients"), "a@x, b@x, c@x");
});

test("ruleMatches — subject regex matches", () => {
  const rule = mkRule({
    conditions: [
      { field: "subject", operator: "matches", pattern: "^Subject", flags: "" },
    ],
  });
  assert.equal(ruleMatches(compileRule(rule), mkMsg()), true);
});

test("ruleMatches — case sensitive by default", () => {
  const rule = mkRule({
    conditions: [
      { field: "subject", operator: "matches", pattern: "^subject", flags: "" },
    ],
  });
  assert.equal(ruleMatches(compileRule(rule), mkMsg()), false);
});

test("ruleMatches — case insensitive with 'i' flag", () => {
  const rule = mkRule({
    conditions: [
      { field: "subject", operator: "matches", pattern: "^subject", flags: "i" },
    ],
  });
  assert.equal(ruleMatches(compileRule(rule), mkMsg()), true);
});

test("ruleMatches — not_matches inverts", () => {
  const rule = mkRule({
    conditions: [
      { field: "subject", operator: "not_matches", pattern: "nope", flags: "" },
    ],
  });
  assert.equal(ruleMatches(compileRule(rule), mkMsg()), true);
});

test("ruleMatches — AND join requires every condition", () => {
  const rule = mkRule({
    conditionsJoin: "all",
    conditions: [
      { field: "subject", operator: "matches", pattern: "Subject", flags: "" },
      { field: "from", operator: "matches", pattern: "nope", flags: "" },
    ],
  });
  assert.equal(ruleMatches(compileRule(rule), mkMsg()), false);
});

test("ruleMatches — OR join needs one condition", () => {
  const rule = mkRule({
    conditionsJoin: "any",
    conditions: [
      { field: "subject", operator: "matches", pattern: "Subject", flags: "" },
      { field: "from", operator: "matches", pattern: "nope", flags: "" },
    ],
  });
  assert.equal(ruleMatches(compileRule(rule), mkMsg()), true);
});

test("ruleMatches — recipients regex matches concatenated to/cc/bcc", () => {
  const rule = mkRule({
    conditions: [
      {
        field: "recipients",
        operator: "matches",
        pattern: "b@x",
        flags: "",
      },
    ],
  });
  const msg = mkMsg({ to: ["a@x"], cc: ["b@x"], bcc: [] });
  assert.equal(ruleMatches(compileRule(rule), msg), true);
});

test("ruleMatches — body condition skipped (rule false) when body undefined", () => {
  const rule = mkRule({
    conditions: [
      { field: "body", operator: "matches", pattern: "hello", flags: "" },
    ],
  });
  const msg = mkMsg({ body: undefined });
  assert.equal(ruleMatches(compileRule(rule), msg), false);
});

test("ruleMatches — invalid regex rule never matches", () => {
  const rule = mkRule({
    conditions: [
      { field: "subject", operator: "matches", pattern: "[unclosed", flags: "" },
    ],
  });
  const compiled = compileRule(rule);
  assert.equal(compiled.invalid, true);
  assert.equal(ruleMatches(compiled, mkMsg()), false);
});

test("needsBody — true only when an enabled rule has a body condition", () => {
  assert.equal(
    needsBody([
      mkRule({ enabled: true, conditions: [{ field: "subject", operator: "matches", pattern: "x", flags: "" }] }),
    ]),
    false,
  );
  assert.equal(
    needsBody([
      mkRule({ enabled: false, conditions: [{ field: "body", operator: "matches", pattern: "x", flags: "" }] }),
    ]),
    false,
  );
  assert.equal(
    needsBody([
      mkRule({ enabled: true, conditions: [{ field: "body", operator: "matches", pattern: "x", flags: "" }] }),
    ]),
    true,
  );
});

test("ruleAppliesToAccount — '*' matches any account", () => {
  assert.equal(ruleAppliesToAccount(mkRule({ accountIds: ["*"] }), "acct-42"), true);
});

test("ruleAppliesToAccount — specific id list", () => {
  assert.equal(
    ruleAppliesToAccount(mkRule({ accountIds: ["acct-1"] }), "acct-2"),
    false,
  );
  assert.equal(
    ruleAppliesToAccount(mkRule({ accountIds: ["acct-1", "acct-2"] }), "acct-2"),
    true,
  );
});

test("ruleAppliesToAccount — empty list matches all (treated as unrestricted)", () => {
  assert.equal(ruleAppliesToAccount(mkRule({ accountIds: [] }), "acct-1"), true);
});
