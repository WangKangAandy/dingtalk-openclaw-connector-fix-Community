import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TurnStore } from '../../src/turn-state/store.ts';
import { inspectTurns } from '../../src/turn-state/inspect.ts';
import { registerTurnInspection } from '../../src/turn-state/gateway.ts';
let dir: string, file: string, store: TurnStore;
const identity = { accountId: 'account', botId: 'bot', conversationId: 'chat', messageId: 'message', senderId: 'sender' };
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(),'turn-inspect-'));file = path.join(dir,'turns.sqlite');store = new TurnStore(file); });
afterEach(() => { store.close();fs.rmSync(dir,{recursive:true,force:true});vi.unstubAllEnvs(); });
it('reads committed WAL receipts without modifying the main database or manufacturing success', () => {
  const {key} = store.claim(identity);store.execution(key,'running');
  const attempt=store.beginDelivery(key,'text');store.delivery(key,attempt,'unknown');store.finish(key);
  const hash = () => createHash('sha256').update(fs.readFileSync(file)).digest('hex');const before=hash();
  const inspected=inspectTurns({key},file);
  expect(inspected.records[0]).toMatchObject({execution:'unknown',delivery:'unknown',reviewRequired:true,lifecycle:'closed'});
  expect(inspected.records[0]).not.toHaveProperty('owner');expect(hash()).toBe(before);
  expect(JSON.stringify(inspected)).not.toContain('sender');
});
it('does not create storage or claim that an open record is definitely dead', () => {
  const missing=path.join(dir,'missing.sqlite');expect(inspectTurns({},missing)).toMatchObject({available:false,records:[]});expect(fs.existsSync(missing)).toBe(false);
  store.claim(identity);
  expect(inspectTurns({reviewOnly:true},file).records[0]).toMatchObject({lifecycle:'open_or_interrupted',reviewRequired:true});
});
it('paginates stable timestamp ties without losing or repeating receipts', () => {
  const keys=[];
  for(let i=0;i<5;i++)keys.push(store.claim({...identity,messageId:String(i)}).key);
  const seen:string[]=[];let before:string|undefined;
  do { const page=inspectTurns({limit:2,before},file);seen.push(...page.records.map(r=>r.key));before=page.nextCursor??undefined; } while(before);
  expect(new Set(seen).size).toBe(5);expect(seen.sort()).toEqual(keys.sort());
});
it('rejects unbounded, malformed and path-selection requests', () => {
  for(const query of [{limit:0},{limit:101},{key:'../secrets'},{before:'bad'},{reviewOnly:'true'},{file:'/private'}]) {
    expect(()=>inspectTurns(query as any,file)).toThrow();
  }
});
it('registers the operator query with explicit admin scope and never a replay method', async () => {
  const registry=vi.fn();registerTurnInspection({registerGatewayMethod:registry} as any);
  expect(registry).toHaveBeenCalledOnce();
  const [name,handler,options]=registry.mock.calls[0];
  expect(name).toBe('dingtalk-connector.turns.inspect');expect(options).toEqual({scope:'operator.admin',profileAccess:'independent'});
  vi.stubEnv('OPENCLAW_STATE_DIR',dir);const respond=vi.fn();await handler({params:{file:'/secret'},respond});
  expect(respond).toHaveBeenCalledWith(false,{error:expect.any(String)});
  expect(JSON.stringify(respond.mock.calls)).not.toContain('/secret');
});
