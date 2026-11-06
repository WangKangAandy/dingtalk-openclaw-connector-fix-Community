import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {TurnStore} from '../../src/turn-state/store.ts';
import {inspectTurns} from '../../src/turn-state/inspect.ts';

const identity={accountId:'fixture-account',botId:'fixture-bot',conversationId:'fixture-chat',senderId:'fixture-sender',messageId:'fixture-message'};
if(process.argv[2]==='--child') {
  const file=process.argv[3];
  assert.equal(path.basename(file),'turns.sqlite');
  assert.ok(path.basename(path.dirname(file)).startsWith('turn-platform-'));
  const store=new TurnStore(file);
  assert.equal(store.claim(identity).claimed,false);
  store.close();console.log('duplicate-blocked');process.exit(0);
}

test('native SQLite receipt admission works across processes and preserves uncertain delivery',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'turn-platform-'));
  const file=path.join(root,'turns.sqlite');
  const store=new TurnStore(file);
  try {
    const first=store.claim(identity);store.execution(first.key,'running');
    const child=spawnSync(process.execPath,['--experimental-transform-types',fileURLToPath(import.meta.url),'--child',file],{encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/duplicate-blocked/);
    const sequence=store.beginDelivery(first.key,'text');store.delivery(first.key,sequence,'unknown');store.finish(first.key,true);
    const result=inspectTurns({key:first.key},file);
    assert.equal(result.records[0].reviewRequired,true);assert.equal(result.records[0].delivery,'unknown');
    assert.equal('owner' in result.records[0],false);assert.equal(JSON.stringify(result).includes('fixture-sender'),false);
    assert.throws(()=>store.beginDelivery(first.key,'text'));
    const other=store.claim({...identity,botId:'other-bot'});assert.equal(other.claimed,true);
    store.execution(other.key,'settled');store.finish(other.key);
    assert.equal(inspectTurns({reviewOnly:true},file).records.length,1);
    if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600);
    const link=path.join(root,'linked.sqlite');
    try {fs.symlinkSync(file,link);assert.throws(()=>new TurnStore(link));}
    catch(error){if(process.platform!=='win32'||error.code!=='EPERM')throw error;t.diagnostic('Windows symlink privilege unavailable; Linux proof covers rejection');}
    t.diagnostic(`${process.platform} ${process.version}: cross-process dedupe, uncertainty, isolation and readonly inspection passed`);
  } finally {
    store.close();
    assert.equal(path.dirname(fs.realpathSync(root)),fs.realpathSync(os.tmpdir()));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
