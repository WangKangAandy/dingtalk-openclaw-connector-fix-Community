// Offline source-level probes. No bot, model, service, or real credentials used.
// Args: fork checkout, official checkout, TypeScript module, output JSON.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const [fork, official, typescriptPath, output] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const ts = require(typescriptPath);
const moduleAt = (root, name) => import(pathToFileURL(path.resolve(root, name)).href);
const forkStore = await moduleAt(fork, 'src/utils/quote-body-store.ts');
const forkQuote = await moduleAt(fork, 'src/utils/quote-message.ts');
const forkFormat = await moduleAt(fork, 'src/card-exec-preview/format.ts');
const { MessageContextStore } = await moduleAt(official, 'src/messages/context-store.ts');
const temporary = mkdtempSync(path.join(tmpdir(), 'connector-channel-probe-'));
const observations = [];
try {
  const store = new forkStore.QuoteBodyStore(path.join(temporary, 'quotes.json'));
  forkStore.setQuoteBodyStoreForTest(store);
  // Cache data came from conversation A. Conversation B supplies only a title.
  store.remember({ msgId: 'message-a', title: 'Shared title' }, 'Shared title\nSynthetic conversation A private detail');
  const quoted = { isReplyMsg: true, repliedMsg: { msgType: 'text', content: { text: 'Shared title' } } };
  const leaked = forkQuote.extractQuotedMsgText(quoted, 3, { conversationId: 'conversation-b' });
  assert.ok(leaked.includes('Synthetic conversation A private detail'));
  const modern = new MessageContextStore();
  modern.rememberMessageContext({ accountId: 'bot', conversationId: 'conversation-a' }, { id: 'message-a', direction: 'outbound', text: 'Synthetic conversation A private detail' });
  const denied = modern.resolveQuotedMessageContext({ accountId: 'bot', conversationId: 'conversation-b' }, { text: { isReplyMsg: true, repliedMsg: { msgId: 'message-a' } } });
  assert.equal(denied.status, 'missing');
  observations.push({ case: 'cross-conversation quote recovery', fork: 'recovers unrelated cached text by title', official: 'rejects foreign-scope exact ID', evidence: { forkText: leaked, officialStatus: denied.status } });

  // Importing the entire handler would load host/network dependencies. Evaluate
  // its actual AST-extracted pure functions, unchanged, and label the scope.
  function extractionProbe(root) {
    const source = readFileSync(path.join(root, 'src/core/message-handler.ts'), 'utf8');
    const ast = ts.createSourceFile('message-handler.ts', source, ts.ScriptTarget.Latest, true);
    const names = new Set(['resolveContent', 'extractQuotedMsgText', 'extractRichTextMediaAttachments', 'extractRepliedMsgMediaAttachments', 'extractMessageContent']);
    const selected = ast.statements.filter(n => ts.isFunctionDeclaration(n) && n.name && names.has(n.name.text)).map(n => n.getText(ast)).join('\n');
    const code = ts.transpileModule(selected, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const sandbox = { exports: {}, extractQuotedMsgText: forkQuote.extractQuotedMsgText };
    vm.runInNewContext(code, sandbox, { timeout: 1000 });
    const fixture = { msgtype: 'chatRecord', content: { chatRecord: JSON.stringify([
      { msgType: 'text', senderNick: 'Synthetic Alice', content: { text: 'First forwarded statement' } },
      { msgType: 'text', senderNick: 'Synthetic Bob', content: { text: 'Second forwarded statement' } },
    ]) } };
    return sandbox.exports.extractMessageContent(fixture);
  }
  const forkForward = extractionProbe(fork);
  const officialForward = extractionProbe(official);
  assert.equal(forkForward.text, '[chatRecord消息]');
  assert.equal(officialForward.text, '[chatRecord消息]');
  observations.push({ case: 'merged forward callback', scope: 'actual pure extractor functions only, not full handler or live transport', fork: forkForward.text, official: officialForward.text, lostStatements: 2 });

  const synthetic = 'curl -H "Authorization: Bearer SYNTHETIC-NOT-A-SECRET" https://example.invalid';
  const display = forkFormat.formatCommandOutputLine({ title: synthetic, phase: 'start' });
  assert.ok(display.includes('SYNTHETIC-NOT-A-SECRET'));
  assert.equal(forkFormat.formatToolStartLine({ name: 'read', phase: 'end' }), null);
  observations.push({ case: 'opt-in process preview', commandArgumentsDisplayedVerbatim: true, completionPhaseIgnoredByStartFormatter: true, note: 'This applies only when process preview is enabled. Fixture is not a real secret.' });
  writeFileSync(output, JSON.stringify({ node: process.version, scope: 'offline unit/source probes; no live end-to-end verification', observations }, null, 2) + '\n');
  console.log(JSON.stringify(observations, null, 2));
} finally {
  forkStore.setQuoteBodyStoreForTest(null);
  const resolved = path.resolve(temporary);
  assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(resolved).startsWith('connector-channel-probe-'));
  rmSync(resolved, { recursive: true, force: true });
}
