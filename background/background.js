import { compileRule, needsBody, ruleAppliesToAccount, ruleMatches } from "./engine.js";
import { loadState, subscribe } from "./storage.js";

let compiledRules = [];
let bodiesNeeded = false;

async function refreshRules() {
  const state = await loadState();
  compiledRules = state.rules.filter((r) => r.enabled).map(compileRule);
  bodiesNeeded = needsBody(state.rules);
  const invalid = compiledRules.filter((c) => c.invalid).length;
  console.info(
    `[regex-filters] loaded ${compiledRules.length} enabled rule(s), ${invalid} with invalid regex, bodiesNeeded=${bodiesNeeded}`,
  );
}

function collectTextFromPart(part, buf) {
  if (!part) return;
  const type = (part.contentType || "").toLowerCase();
  if ((type.startsWith("text/plain") || type.startsWith("text/html")) && typeof part.body === "string") {
    buf.push(part.body);
  }
  if (Array.isArray(part.parts)) {
    for (const child of part.parts) collectTextFromPart(child, buf);
  }
}

async function getBodyText(messageId) {
  try {
    const full = await messenger.messages.getFull(messageId);
    const buf = [];
    collectTextFromPart(full, buf);
    return buf.join("\n");
  } catch (err) {
    console.warn(`[regex-filters] could not load body for message ${messageId}:`, err);
    return undefined;
  }
}

function buildMessageView(header, body) {
  return {
    subject: header.subject ?? "",
    from: header.author ?? "",
    to: header.recipients ?? [],
    cc: header.ccList ?? [],
    bcc: header.bccList ?? [],
    body,
  };
}

async function runActions(messageId, actions) {
  for (const action of actions) {
    try {
      switch (action.type) {
        case "move":
          if (action.folderId) {
            await messenger.messages.move([messageId], action.folderId);
          }
          break;
        case "archive":
          await messenger.messages.archive([messageId]);
          break;
        case "delete":
          await messenger.messages.delete([messageId], false);
          break;
        case "markRead":
          await messenger.messages.update(messageId, { read: true });
          break;
        case "star":
          await messenger.messages.update(messageId, { flagged: true });
          break;
        case "tag":
          if (action.tagKey) {
            const header = await messenger.messages.get(messageId);
            const existing = header.tags ?? [];
            if (!existing.includes(action.tagKey)) {
              await messenger.messages.update(messageId, {
                tags: [...existing, action.tagKey],
              });
            }
          }
          break;
        default:
          console.warn(`[regex-filters] unknown action type: ${action.type}`);
      }
    } catch (err) {
      console.error(`[regex-filters] action ${action.type} failed on ${messageId}:`, err);
    }
  }
}

async function processMessage(folder, header) {
  const accountId = folder.accountId;
  const applicable = compiledRules.filter((c) =>
    ruleAppliesToAccount(c.rule, accountId),
  );
  if (applicable.length === 0) return;

  const bodyWanted = applicable.some((c) =>
    c.rule.conditions.some((cond) => cond.field === "body"),
  );
  const body = bodyWanted ? await getBodyText(header.id) : undefined;
  const view = buildMessageView(header, body);

  for (const compiled of applicable) {
    if (ruleMatches(compiled, view)) {
      await runActions(header.id, compiled.rule.actions);
      if (compiled.rule.stopProcessing) break;
    }
  }
}

async function onNewMailReceived(folder, messageList) {
  if (compiledRules.length === 0) return;
  for (const header of messageList.messages ?? []) {
    await processMessage(folder, header);
  }
}

async function init() {
  await refreshRules();
  subscribe(() => {
    refreshRules().catch((err) =>
      console.error("[regex-filters] rule reload failed:", err),
    );
  });
  messenger.messages.onNewMailReceived.addListener(onNewMailReceived);
  console.info("[regex-filters] background initialised");
}

init().catch((err) => console.error("[regex-filters] init failed:", err));
