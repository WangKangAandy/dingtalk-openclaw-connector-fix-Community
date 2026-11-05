"""Production admission -> real Gateway/Docker -> automatic scoped review.
Uses the ingress fixture's transport registration and RPC, never live DingTalk.
The local provider is deterministic: this proves plumbing/isolation, not model quality.
"""
import argparse, hashlib, http.server, json, os, pathlib, re, shutil, signal, socket, subprocess, tempfile, threading, time

parser=argparse.ArgumentParser()
parser.add_argument('--repo',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[3])
parser.add_argument('--openclaw',default=shutil.which('openclaw'))
parser.add_argument('--sandbox',choices=['off','none','ro','rw','knowledge'],default='none')
parser.add_argument('--setup',action='store_true',help='Enable scopes through the real setup CLI and Gateway reload before exercising ingress')
parser.add_argument('--handler',action='store_true',help='Use the production handler bundle from ingress-probe/build.mjs; platform HTTP remains local')
args=parser.parse_args()
assert os.name=='posix' and args.openclaw, 'Use the isolated Linux test host'
repo=args.repo.resolve(); root=pathlib.Path(tempfile.mkdtemp(prefix='learning-ingress-probe-'))
print('evidence_directory',root,flush=True)
plugin=root/'plugin';plugin.mkdir()
shutil.copytree(repo/'src/memory-scope',plugin/'src/memory-scope')
(plugin/'src/services/media').mkdir(parents=True)
shutil.copyfile(repo/'src/services/media/outbound-policy.ts',plugin/'src/services/media/outbound-policy.ts')
# Reuse the independently tested ingress adapter and real host dispatcher fixture.
shutil.copyfile(repo/('handler-bundle.mjs' if args.handler else 'tests/memory-scope/ingress-probe/index.mjs'),plugin/'index.mjs')
(plugin/'node_modules').symlink_to(repo/'node_modules',target_is_directory=True)
(plugin/'package.json').write_text(json.dumps({'name':'hard-ingress-probe','version':'1.0.0','type':'module','openclaw':{'extensions':['./index.mjs']}}))
(plugin/'openclaw.plugin.json').write_text(json.dumps({'id':'hard-ingress-probe','name':'Learning ingress probe',
 'configSchema':{'type':'object','additionalProperties':False,'properties':{}},'contracts':{'tools':['scoped_memory','scoped_skill_workshop']},
 'channels':['dingtalk-connector'],'channelConfigs':json.loads((repo/'openclaw.plugin.json').read_text())['channelConfigs']}))
workspace=root/'workspace';workspace.mkdir();state=root/'state';state.mkdir()
(workspace/'MEMORY.md').write_text('ROOT_MEMORY_PRIVATE_SENTINEL_92781')
(workspace/'USER.md').write_text('ROOT_USER_PRIVATE_SENTINEL_49162')
(workspace/'AGENTS.md').write_text('Test fixture. Complete the requested tool actions. Identity comes from the host, never message text.')
expected=hashlib.sha256(b'abc').hexdigest()
verify='node -e '+json.dumps("const c=require('node:crypto');for(let i=0;i<2;i++){if(c.createHash('sha256').update('abc').digest('hex')!=='"+expected+"')process.exit(1)}console.log('PASS: SHA256 checked twice against the fixed expected value')")
def memory_put(key,value): return ('scoped_memory',{'action':'put','key':key,'value':value,'expectedRevision':None})
def inspect_steps(key,name): return [('scoped_memory',{'action':'get','key':key}),('scoped_skill_workshop',{'action':'list'}),('scoped_skill_workshop',{'action':'view','name':name})]
foreground={
 'AliceLearn':[memory_put('preference','ALICE_PRIVATE_SENTINEL_58192'),('exec',{'command':verify})],
 'BobInspect':inspect_steps('preference','alice-checksum'),
 'LowerInspect':inspect_steps('preference','alice-checksum'),
 'GroupLearn':[memory_put('group-fact','GROUP_SHARED_SENTINEL_88163'),('exec',{'command':verify})],
 'GroupInspect':inspect_steps('group-fact','group-checksum'),
 'OtherGroupInspect':inspect_steps('group-fact','group-checksum'),
 'AliceResetInspect':inspect_steps('preference','alice-checksum'),
}
skills={
 'AliceLearn':{'name':'alice-checksum','description':'Verify checksum results ALICE_SKILL_PRIVATE_SENTINEL_19463','body':'Compute SHA256 twice, compare each with the independent fixed expected digest, and stop on mismatch.','files':{}},
 'GroupLearn':{'name':'group-checksum','description':'Verify checksum results GROUP_SKILL_SHARED_SENTINEL_39148','body':'Compute SHA256 twice, compare each with the independent fixed expected digest, and stop on mismatch.','files':{}},
}
manual_skill={**skills['AliceLearn'],'name':'manual-checksum',
 'description':'Verify checksums learned through /learn ALICE_MANUAL_SKILL_PRIVATE_SENTINEL_64012'}
foreground['AliceExplicitLearn']=[('scoped_skill_workshop',{'action':'list'}),
 ('scoped_skill_workshop',{'action':'view','name':'alice-checksum'}),
 ('scoped_skill_workshop',{'action':'save','skill':manual_skill,'expectedRevision':None})]
foreground['BobExplicitInspect']=inspect_steps('preference','manual-checksum')
calls=[]; finished=set(); received=0
class Provider(http.server.BaseHTTPRequestHandler):
 def log_message(self,*_args): pass
 def do_POST(self):
  global received
  received+=1
  request=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  messages=request.get('messages',[])
  review=any('Extract at most one reusable procedure' in str(m.get('content')) for m in messages)
  start=next((i for i in range(len(messages)-1,-1,-1) if messages[i].get('role')=='user' and 'CASE:' in str(messages[i].get('content'))),None)
  if start is None: self.send_error(400,'case missing');return
  case=re.findall(r'CASE:(\w+)',str(messages[start].get('content')))[-1]
  recent=[m for m in messages[start+1:] if m.get('role')=='tool']
  plan=[('scoped_skill_workshop',{'action':'list'})] if review else foreground[case]
  if review and case in skills: plan=plan+[('scoped_skill_workshop',{'action':'save','skill':skills[case],'expectedRevision':None})]
  calls.append({'case':case,'review':review,'request':request})
  (root/'provider-calls.json').write_text(json.dumps(calls,indent=2))
  available=[t.get('function',{}).get('name') for t in request.get('tools',[])]
  delta={'role':'assistant'}
  if len(recent)<len(plan):
   name,params=plan[len(recent)]
   if 'tool_call' in available: params={'id':name,'args':params};name='tool_call'
   delta['tool_calls']=[{'index':0,'id':'fixture_'+str(len(calls)),'type':'function','function':{'name':name,'arguments':json.dumps(params)}}]
   reason='tool_calls'
  else:
   delta['content']='Verified fixture work is complete.';reason='stop'
   if review: finished.add(case)
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  for content,stop in [(delta,None),({},reason)]:
   self.wfile.write(('data: '+json.dumps({'id':'fixture','object':'chat.completion.chunk','created':int(time.time()),'model':'probe','choices':[{'index':0,'delta':content,'finish_reason':stop}]})+'\n\n').encode())
  self.wfile.write(b'data: [DONE]\n\n');self.wfile.flush()

provider=http.server.ThreadingHTTPServer(('127.0.0.1',0),Provider)
threading.Thread(target=provider.serve_forever,daemon=True).start()
with socket.socket() as sock: sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
allowed=['scoped_memory','scoped_skill_workshop','read','write','edit','exec','process']
cfg={'hooks':{'internal':{'entries':{'session-memory':{'enabled':False}}}},'gateway':{'mode':'local','bind':'loopback','port':port,'auth':{'mode':'none'}},'memory':{'search':{'enabled':False}},
 'agents':{'defaults':{'workspace':str(workspace),'model':{'primary':'probe/probe'},'skipOptionalBootstrapFiles':['USER.md'],
  'compaction':{'memoryFlush':{'enabled':False}},'sandbox':{'mode':'all','scope':'session','workspaceAccess':'none',
   'workspaceRoot':str(root/'sandboxes'),'docker':{'image':'node:22-alpine','network':'none','containerPrefix':root.name+'-'}}}},
 'tools':{'deny':['skill_workshop'],'allow':allowed,'sandbox':{'tools':{'allow':allowed}},'elevated':{'enabled':False},'exec':{'host':'sandbox'},'sessions':{'visibility':'self'}},
 'skills':{'workshop':{'autonomous':{'mode':'off'}}},
 'plugins':{'slots':{'memory':'none'},'allow':['hard-ingress-probe'],'load':{'paths':[str(plugin)]},
  'entries':{'hard-ingress-probe':{'enabled':True,'hooks':{'allowConversationAccess':True,'allowPromptInjection':True}}}},
 'channels':{'dingtalk-connector':{'enabled':True,'clientId':'fixture','clientSecret':'fixture-only','memoryScope':{'enabled':True,
  'scopedLearning':{'enabled':True,'mode':'auto','reviewAfterIterations':1,'reviewIdleMs':1000}}}},
 'models':{'providers':{'probe':{'api':'openai-completions','baseUrl':f'http://127.0.0.1:{provider.server_port}/v1','apiKey':'fixture-only',
  'models':[{'id':'probe','name':'Probe','contextWindow':65536,'maxTokens':4096}]}}}}
# Exercise operator-owned host choices without changing scoped authorization.
cfg['skills']['workshop']['autonomous']['mode']='auto'
cfg['tools'].pop('deny',None)
cfg['agents']['entries']={'main':{'tools':{'deny':['skill_workshop']}}}
if args.sandbox=='off':
 cfg['agents']['defaults']['sandbox']['mode']='off';cfg['tools']['exec']['host']='gateway'
else:
 cfg['agents']['defaults']['sandbox']['workspaceAccess']='none' if args.sandbox=='knowledge' else args.sandbox
knowledge=workspace/'knowledge';knowledge.mkdir();(knowledge/'public.txt').write_text('PUBLIC_KNOWLEDGE_SENTINEL')
if args.sandbox=='knowledge':
 cfg['agents']['defaults']['sandbox']['docker']['binds']=[str(knowledge)+':/knowledge:ro']
 foreground['AliceLearn'].append(('exec',{'command':'cat /knowledge/public.txt; if echo changed > /knowledge/public.txt; then exit 9; fi; echo TASK_WRITE_OK > /workspace/probe-output.txt; cat /workspace/probe-output.txt'}))
if args.setup:
 # The test transport owns the real connector id, but never opens a Stream socket.
 manifest=json.loads((plugin/'openclaw.plugin.json').read_text());manifest['id']='dingtalk-connector'
 (plugin/'openclaw.plugin.json').write_text(json.dumps(manifest))
 cfg['plugins']['allow']=['dingtalk-connector']
 cfg['plugins']['entries']={'dingtalk-connector':{'enabled':True}}
 cfg['channels']['dingtalk-connector']['memoryScope']={'enabled':False,'scopedLearning':{'reviewAfterIterations':1,'reviewIdleMs':1000}}
 cfg['agents']['entries']['main']['tools']['deny']=[]
config=root/'config.json';config.write_text(json.dumps(cfg))
env=os.environ.copy();env['PATH']=str(pathlib.Path(args.openclaw).parent)+os.pathsep+env['PATH']
home=root/'home';home.mkdir();env['HOME']=str(home)
env.update(OPENCLAW_CONFIG_PATH=str(config),OPENCLAW_STATE_DIR=str(state),OPENCLAW_GATEWAY_PORT=str(port),NODE_OPTIONS='--experimental-transform-types')
for key in list(env):
 if key.lower() in ('http_proxy','https_proxy','all_proxy'):env.pop(key)
validation=subprocess.run([args.openclaw,'config','validate','--json'],env=env,capture_output=True,text=True,timeout=35)
(root/'config-validation.json').write_text(validation.stdout+'\n'+validation.stderr)
assert validation.returncode==0,'Real config validation failed: '+validation.stdout+validation.stderr
log=(root/'gateway.log').open('w')
gateway=subprocess.Popen([args.openclaw,'gateway','run','--port',str(port),'--auth','none','--bind','loopback'],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
try:
 for _ in range(60):
  if gateway.poll() is not None or 'http server listening' in (root/'gateway.log').read_text():break
  time.sleep(1)
 assert gateway.poll() is None and 'http server listening' in (root/'gateway.log').read_text(), 'Owned Gateway did not start'
 if args.setup:
  setup=subprocess.run(['node',str(repo/'bin/dingtalk-connector.js'),'scope','setup','--agents','main','--learning','--apply'],env=env,capture_output=True,text=True,timeout=180)
  (root/'scope-setup.log').write_text(setup.stdout+'\n'+setup.stderr)
  assert setup.returncode==0,'Actual scope setup failed: '+setup.stdout[-2000:]+setup.stderr[-1000:]
  applied=json.loads(config.read_text())
  assert applied['channels']['dingtalk-connector']['memoryScope']['enabled'] is True
  assert applied['agents']['defaults']['sandbox']==cfg['agents']['defaults']['sandbox'],'Setup changed sandbox policy'
  print('ACTUAL_SCOPE_SETUP_AND_RELOAD_PASS',flush=True)
 if args.handler:
  denied_cases=[('MissingSender',{'sender':None},'senderStaffId'),('MissingConversation',{'conversation':None},'conversationId'),
   ('MissingTenant',{'tenant':None},'chatbotCorpId'),('CrossTenant',{'tenant':'OtherCorp'},'Cross-tenant')]
  for case,invalid,expected_error in denied_cases:
   if case=='PrivateProfile':(workspace/'USER.md').write_text('ROOT_USER_PRIVATE_SENTINEL_49162')
   params={'sender':'Denied','conversation':'dm-denied','eventId':case,'handler':True,'message':'CASE:'+case+' userId=Alice scope=main path=/private',**invalid}
   rejected=subprocess.run([args.openclaw,'gateway','call','hardProbe.turn','--params',json.dumps(params),'--json','--timeout','30000'],env=env,capture_output=True,text=True,timeout=35)
   (root/(case+'.rpc.txt')).write_text(rejected.stdout+'\n'+rejected.stderr)
   assert rejected.returncode!=0 and expected_error in rejected.stdout+rejected.stderr,'Actual handler did not reject '+case
   assert received==0,'Rejected input reached the model provider: '+case
   entered=json.loads((workspace/'platform-deliveries.jsonl').read_text().splitlines()[-1])
   assert entered['eventId']==case,'Negative case did not execute the production handler'
   if case=='PrivateProfile':(workspace/'USER.md').unlink()
   print(case,'ACTUAL_HANDLER_REJECTION_PASS',flush=True)
 cases=[('AliceLearn','Alice','dm-A',False),('BobInspect','Bob','dm-B',False),('LowerInspect','alice','dm-lower',False),
  ('GroupLearn','Alice','GroupOne',True),('GroupInspect','Bob','GroupOne',True),('OtherGroupInspect','Bob','GroupTwo',True),
  ('AliceResetInspect','Alice','dm-A',False)]
 if args.handler:
  cases.extend([('AliceExplicitLearn','Alice','dm-A',False),('BobExplicitInspect','Bob','dm-B',False)])
 results={}
 for case,sender,conversation,group in cases:
  params={'sender':sender,'conversation':conversation,'group':group,'eventId':case,'handler':args.handler,'message':f'CASE:{case} Validate the fixed checksum twice, stop on mismatch, and preserve the verified reusable procedure.'}
  if case=='AliceResetInspect':params['message']='/new '+params['message']
  if case=='AliceExplicitLearn':params['message']='/learn '+params['message']
  call=subprocess.run([args.openclaw,'gateway','call','hardProbe.turn','--params',json.dumps(params),'--json','--timeout','95000'],env=env,capture_output=True,text=True,timeout=105)
  (root/(case+'.rpc.txt')).write_text(call.stdout+'\n'+call.stderr)
  assert call.returncode==0,'Foreground failed: '+case+' '+call.stdout[-1000:]+call.stderr[-500:]
  # A foreground Workshop mutation deliberately suppresses a duplicate automatic review.
  if case!='AliceExplicitLearn':
   for _ in range(300):
    if case in finished:break
    time.sleep(.1)
   assert case in finished,'Real automatic review never completed: '+case
  time.sleep(.2)
  seen=[c for c in calls if c['case']==case]
  serialized=json.dumps(seen)
  assert 'ROOT_MEMORY_PRIVATE_SENTINEL_92781' not in serialized,'Root memory leaked into foreground or review'
  assert 'ROOT_USER_PRIVATE_SENTINEL_49162' not in serialized,'Unscoped USER profile leaked into foreground or review'
  if case not in ('AliceLearn','AliceResetInspect','AliceExplicitLearn'):
   assert 'ALICE_PRIVATE_SENTINEL_58192' not in serialized and 'ALICE_SKILL_PRIVATE_SENTINEL_19463' not in serialized,'Other user data leaked: '+case
   assert 'ALICE_MANUAL_SKILL_PRIVATE_SENTINEL_64012' not in serialized,'Explicitly learned private skill leaked: '+case
  if case not in ('GroupLearn','GroupInspect'):
   assert 'GROUP_SHARED_SENTINEL_88163' not in serialized and 'GROUP_SKILL_SHARED_SENTINEL_39148' not in serialized,'Other group data leaked: '+case
  results[case]={}
  for phase in ([False] if case=='AliceExplicitLearn' else [False,True]):
   last=[c for c in seen if c['review']==phase][-1]['request']['messages']
   begin=max(i for i,m in enumerate(last) if m.get('role')=='user' and 'CASE:'+case in str(m.get('content')))
   results[case]['review' if phase else 'foreground']=[m for m in last[begin+1:] if m.get('role')=='tool']
  if case in skills:
   assert 'PASS: SHA256 checked twice' in json.dumps(results[case]['foreground']),'Sandbox verification failed'
   assert 'revision' in str(results[case]['review'][-1].get('content')),'Background save failed'
   if args.sandbox=='knowledge' and case=='AliceLearn':
    assert 'PUBLIC_KNOWLEDGE_SENTINEL' in json.dumps(results[case]['foreground']) and 'TASK_WRITE_OK' in json.dumps(results[case]['foreground'])
    assert (knowledge/'public.txt').read_text()=='PUBLIC_KNOWLEDGE_SENTINEL','Read-only bind was modified'
  elif case=='AliceExplicitLearn':
   assert any('钉钉当前会话范围的显式自学习请求' in str(m.get('content')) for c in seen if not c['review'] for m in c['request']['messages']),'Literal /learn did not reach the scoped command translation'
   assert 'ALICE_SKILL_PRIVATE_SENTINEL_19463' in json.dumps(results[case]['foreground']),'Explicit learning could not view the authorized procedure'
   saved=str(results[case]['foreground'][-1].get('content'))
   assert 'revision' in saved and 'manual-checksum' in saved,'Explicit scoped tool save failed'
  elif case=='AliceResetInspect':
   assert 'ALICE_PRIVATE_SENTINEL_58192' in json.dumps(results[case]['foreground']) and 'ALICE_SKILL_PRIVATE_SENTINEL_19463' in json.dumps(results[case]['foreground']),'Reset did not retain authorized durable memory and procedures'
  elif case!='GroupInspect':
   assert 'null' in str(results[case]['foreground'][0].get('content')),'Foreign memory visible'
   assert 'null' in str(results[case]['foreground'][2].get('content')),'Foreign skill visible'
  else:
   assert 'GROUP_SHARED_SENTINEL_88163' in json.dumps(results[case]['foreground']) and 'GROUP_SKILL_SHARED_SENTINEL_39148' in json.dumps(results[case]['foreground']),'Same-group reuse failed'
  (root/'results.json').write_text(json.dumps(results,indent=2))
  if args.handler:
   deliveries=json.loads((workspace/'platform-deliveries.jsonl').read_text().splitlines()[-1])
   assert deliveries['eventId']==case and deliveries['deliveries'],'Production handler did not attempt platform delivery'
  print(case,'EXPLICIT_LEARN_SAVE_PASS' if case=='AliceExplicitLearn' else 'FOREGROUND_AND_REVIEW_PASS',flush=True)
 stored=list((state/'plugin-state/dingtalk-connector/scopes-v1/workshop').glob('*/**/skill.json'))
 assert len(stored)==(3 if args.handler else 2),'Unexpected learned procedure count in private storage'
 hooks=[json.loads(line) for line in (workspace/'run-hook-contexts.jsonl').read_text().splitlines()]
 assert hooks, 'Missing real runtime observations'
 # Stock host sandbox facts may be false; scoped authorization must not depend on that flag.
 assert sum(row.get('channel')=='dingtalk-connector' for row in hooks)>=len(cases),'Missing foreground final-gate observations'
 assert not any(c['case']=='AliceExplicitLearn' and c['review'] for c in calls),'Manual save triggered a redundant automatic review'
 assert sum(row.get('channel')!='dingtalk-connector' for row in hooks)>=len(cases)-(1 if args.handler else 0),'Missing detached review final-gate observations'
 print('LEARNING_INGRESS_ISOLATION_PASS',flush=True)
finally:
 if gateway.poll() is None:
  os.killpg(gateway.pid,signal.SIGTERM)
  try:gateway.wait(timeout=15)
  except subprocess.TimeoutExpired:os.killpg(gateway.pid,signal.SIGKILL);gateway.wait()
 provider.shutdown()
 for container in subprocess.run(['docker','ps','-aq','--filter','name='+root.name+'-'],capture_output=True,text=True).stdout.split():
  inspected=subprocess.run(['docker','inspect',container],capture_output=True,text=True)
  if inspected.returncode==0:
   entry=json.loads(inspected.stdout)[0]
   if entry.get('Name','').startswith('/'+root.name+'-') and any(str(m.get('Source','')).startswith(str(root)+'/') for m in entry.get('Mounts',[])):
    subprocess.run(['docker','rm','-f',container],check=True,capture_output=True)
 print('gateway_tail',(root/'gateway.log').read_text()[-5000:],flush=True)
