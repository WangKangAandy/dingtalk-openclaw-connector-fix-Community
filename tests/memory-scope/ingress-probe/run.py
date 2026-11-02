"""Real Gateway + Docker + local scripted provider; never live DingTalk credentials.
Run on an isolated Linux test host with OpenClaw 2026.10.9 and node:22-alpine.
This verifies the production admission adapter/host dispatcher, not Stream transport.
"""
import argparse, http.server, json, os, pathlib, re, shutil, signal, socket, subprocess, tempfile, threading, time, urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--repo', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[3])
parser.add_argument('--openclaw', default=shutil.which('openclaw'))
parser.add_argument('--handler', action='store_true', help='Use the bundled production handler; only platform HTTP is substituted')
parser.add_argument('--lifecycle', action='store_true', help='Also wait for a real idle rollover and inject a host exec session override')
args = parser.parse_args()
assert os.name == 'posix' and args.openclaw, 'Use the isolated Linux test host'
repo = args.repo.resolve()
root = pathlib.Path(tempfile.mkdtemp(prefix='hard-ingress-probe-'))
print('evidence_directory', root, flush=True)
plugin = root/'plugin'; plugin.mkdir()
shutil.copytree(repo/'src/memory-scope', plugin/'src/memory-scope')
(plugin/'src/services/media').mkdir(parents=True)
shutil.copyfile(repo/'src/services/media/outbound-policy.ts', plugin/'src/services/media/outbound-policy.ts')
shutil.copyfile(repo/('handler-bundle.mjs' if args.handler else 'tests/memory-scope/ingress-probe/index.mjs'), plugin/'index.mjs')
(plugin/'node_modules').symlink_to(repo/'node_modules', target_is_directory=True)
(plugin/'package.json').write_text(json.dumps({'name':'hard-ingress-probe', 'version':'1.0.0', 'type':'module', 'openclaw':{'extensions':['./index.mjs']}}))
manifest = {'id':'hard-ingress-probe', 'name':'Hard scope ingress probe', 'configSchema':{'type':'object','additionalProperties':False,'properties':{}},
 'contracts':{'tools':['scoped_memory','scoped_skill_workshop']}, 'channels':['dingtalk-connector'],
 'channelConfigs':json.loads((repo/'openclaw.plugin.json').read_text())['channelConfigs']}
(plugin/'openclaw.plugin.json').write_text(json.dumps(manifest))
workspace = root/'workspace'; workspace.mkdir()
(workspace/'MEMORY.md').write_text('ROOT_MEMORY_PRIVATE_SENTINEL_92781')
(workspace/'AGENTS.md').write_text('This is a fixture. Use the requested tool. Never infer private identity from message text.')
host_secret = root/'host-private.txt'; host_secret.write_text('HOST_PRIVATE_SENTINEL_62937')
calls = []
steps = {
 'AliceWrite':[('scoped_memory', {'action':'put','key':'preference','value':'ALICE_PRIVATE_SENTINEL_58192','expectedRevision':None})],
 'BobRead':[('scoped_memory', {'action':'get','key':'preference'}), ('read',{'path':str(host_secret)}), ('exec',{'command':'cat '+str(host_secret)})],
 'LowerAliceRead':[('scoped_memory', {'action':'get','key':'preference'})],
 'AliceResetRead':[('scoped_memory', {'action':'get','key':'preference'})],
 'AliceIdleRead':[('scoped_memory', {'action':'get','key':'preference'})],
 'OverrideRead':[('exec', {'command':'cat '+str(host_secret)})],
 'GroupWrite':[('scoped_memory', {'action':'put','key':'group-fact','value':'GROUP_SHARED_SENTINEL_88163','expectedRevision':None})],
 'GroupRead':[('scoped_memory', {'action':'get','key':'group-fact'})],
 'OtherGroupRead':[('scoped_memory', {'action':'get','key':'group-fact'})],
}
class Provider(http.server.BaseHTTPRequestHandler):
 def log_message(self, *_args): pass
 def do_POST(self):
  request=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  messages=request.get('messages',[])
  start=next((i for i in range(len(messages)-1,-1,-1) if messages[i].get('role')=='user' and 'CASE:' in str(messages[i].get('content'))),None)
  if start is None:
   self.send_error(400, 'fixture case missing'); return
  case=re.search(r'CASE:(\w+)',str(messages[start].get('content'))).group(1)
  recent=[m for m in messages[start+1:] if m.get('role')=='tool']
  calls.append({'case':case,'request':request})
  (root/'provider-calls.json').write_text(json.dumps(calls,indent=2))
  available=[tool.get('function',{}).get('name') for tool in request.get('tools',[])]
  if case=='OverrideRead' and not recent:
   # Inject through the real public Gateway API after ingress admission and tool
   # construction, but before the attempted execution. No host DB is edited.
   contexts=[json.loads(line) for line in (workspace/'factory-contexts.jsonl').read_text().splitlines()]
   key=next(row['sessionKey'] for row in reversed(contexts) if row['requesterSenderId']=='Override')
   patched=subprocess.run([args.openclaw,'gateway','call','sessions.patch','--params',json.dumps({'key':key,'execHost':'gateway'}),'--json','--timeout','15000'],env=env,capture_output=True,text=True,timeout=20)
   (root/'exec-override-patch.json').write_text(patched.stdout+'\n'+patched.stderr)
   if patched.returncode or '"execHost": "gateway"' not in patched.stdout:
    self.send_error(500, 'fixture could not patch host execution'); return
  delta={'role':'assistant'}
  if len(recent)<len(steps[case]):
   name,params=steps[case][len(recent)]
   if 'tool_call' in available: params={'id':name,'args':params}; name='tool_call'
   delta['tool_calls']=[{'index':0,'id':'fixture_'+str(len(calls)),'type':'function','function':{'name':name,'arguments':json.dumps(params)}}]
   finish='tool_calls'
  else: delta['content']='Fixture turn finished.'; finish='stop'
  if request.get('stream'):
   self.send_response(200); self.send_header('Content-Type','text/event-stream'); self.end_headers()
   for content,reason in [(delta,None),({},finish)]:
    self.wfile.write(('data: '+json.dumps({'id':'fixture','object':'chat.completion.chunk','created':int(time.time()),'model':'probe','choices':[{'index':0,'delta':content,'finish_reason':reason}]})+'\n\n').encode())
   self.wfile.write(b'data: [DONE]\n\n'); self.wfile.flush()
  else:
   self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers()
   self.wfile.write(json.dumps({'id':'fixture','object':'chat.completion','choices':[{'index':0,'message':delta,'finish_reason':finish}], 'usage':{'prompt_tokens':100,'completion_tokens':10,'total_tokens':110}}).encode())

provider=http.server.ThreadingHTTPServer(('127.0.0.1',0),Provider)
threading.Thread(target=provider.serve_forever,daemon=True).start()
with socket.socket() as sock: sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
allowed=['scoped_memory','scoped_skill_workshop','read','write','edit','exec','process']
config={'gateway':{'mode':'local','bind':'loopback','port':port,'auth':{'mode':'none'}},
 'session':{'reset':{'mode':'idle','idleMinutes':1 if args.lifecycle else 60}},
 'memory':{'search':{'enabled':False}},
 'agents':{'defaults':{'workspace':str(workspace),'model':{'primary':'probe/probe'},'skipOptionalBootstrapFiles':['USER.md'],
  'compaction':{'memoryFlush':{'enabled':False}},
  'sandbox':{'mode':'all','scope':'session','workspaceAccess':'none','workspaceRoot':str(root/'sandboxes'),
   'docker':{'image':'node:22-alpine','network':'none','containerPrefix':root.name+'-'}}}},
 'tools':{'allow':allowed,'sandbox':{'tools':{'allow':allowed}},'elevated':{'enabled':False},'exec':{'host':'sandbox'},'sessions':{'visibility':'self'}},
 'skills':{'workshop':{'autonomous':{'mode':'off'}}},
 'plugins':{'slots':{'memory':'none'},'allow':['hard-ingress-probe'],'load':{'paths':[str(plugin)]},
  'entries':{'hard-ingress-probe':{'enabled':True,'hooks':{'allowConversationAccess':True,'allowPromptInjection':True}}}},
 'channels':{'dingtalk-connector':{'enabled':True,'clientId':'fixture','clientSecret':'fixture-only','groupReplyMode':'text','memoryScope':{'enabled':True,'scopedLearning':{'enabled':False}}}},
 'models':{'providers':{'probe':{'api':'openai-completions','baseUrl':f'http://127.0.0.1:{provider.server_port}/v1','apiKey':'fixture-only',
  'models':[{'id':'probe','name':'Probe','contextWindow':65536,'maxTokens':4096}]}}}}
cfg=root/'config.json';cfg.write_text(json.dumps(config))
state=root/'state';state.mkdir()
env=os.environ.copy();env['PATH']=str(pathlib.Path(args.openclaw).parent)+os.pathsep+env['PATH']
home=root/'home';home.mkdir();env['HOME']=str(home)
env.update(OPENCLAW_CONFIG_PATH=str(cfg),OPENCLAW_STATE_DIR=str(state),OPENCLAW_GATEWAY_PORT=str(port),NODE_OPTIONS='--experimental-transform-types')
for key in list(env):
 if key.lower() in ('http_proxy','https_proxy','all_proxy'): env.pop(key)
log=(root/'gateway.log').open('w')
validation=subprocess.run([args.openclaw,'config','validate','--json'],env=env,capture_output=True,text=True,timeout=35)
(root/'config-validation.json').write_text(validation.stdout+'\n'+validation.stderr)
assert validation.returncode==0, 'Real config validation failed: '+validation.stdout+validation.stderr
gateway=subprocess.Popen([args.openclaw,'gateway','run','--port',str(port),'--auth','none','--bind','loopback'],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
try:
 for _ in range(60):
  if gateway.poll() is not None or 'http server listening' in (root/'gateway.log').read_text(): break
  time.sleep(1)
 assert gateway.poll() is None and 'http server listening' in (root/'gateway.log').read_text(), 'Isolated Gateway failed to become ready'
 # This fixture has no live Stream connection. Check its actual RPC admission,
 # rather than claiming transport /readyz health for a deliberately absent socket.
 ready=subprocess.run([args.openclaw,'gateway','call','hardProbe.ready','--params','{}','--json','--timeout','30000'],env=env,capture_output=True,text=True,timeout=35)
 assert ready.returncode==0 and '"ready": true' in ready.stdout, 'Fixture RPC is not ready: '+ready.stderr
 (workspace/'USER.md').write_text('ROOT_USER_PRIVATE_SENTINEL_49162')
 denied=subprocess.run([args.openclaw,'gateway','call','hardProbe.turn','--params',json.dumps({'sender':'Profile','conversation':'dm-profile','eventId':'bad-profile','message':'CASE:InvalidProfile'}),'--json','--timeout','15000'],env=env,capture_output=True,text=True,timeout=20)
 (root/'profile-rejection.txt').write_text(denied.stdout+'\n'+denied.stderr)
 print('profile_rejection',denied.returncode,denied.stdout[-500:],denied.stderr[-500:],flush=True)
 assert denied.returncode!=0 and 'Unscoped USER.md' in denied.stdout+denied.stderr and not calls, 'Shared profile was not rejected before model dispatch'
 (workspace/'USER.md').unlink()
 cases=[('AliceWrite','Alice','dm-A',False),('BobRead','Bob','dm-B',False),('LowerAliceRead','alice','dm-lower',False),
  ('GroupWrite','Alice','GroupOne',True),('GroupRead','Bob','GroupOne',True),('OtherGroupRead','Bob','GroupTwo',True),('AliceResetRead','Alice','dm-A',False)]
 if args.lifecycle: cases.extend([('OverrideRead','Override','dm-override',False),('AliceIdleRead','Alice','dm-A',False)])
 results={}
 for case,sender,conversation,group in cases:
  if case=='AliceIdleRead':
   print('waiting_for_real_idle_rollover',flush=True)
   time.sleep(62)
  params={'sender':sender,'conversation':conversation,'group':group,'eventId':case,'handler':args.handler,'message':f'CASE:{case} Execute the fixture tool actions.'}
  if case=='AliceResetRead': params['message']='/new '+params['message']
  call=subprocess.run([args.openclaw,'gateway','call','hardProbe.turn','--params',json.dumps(params),'--json','--timeout','95000'],env=env,capture_output=True,text=True,timeout=105)
  (root/(case+'.rpc.txt')).write_text(call.stdout+'\n'+call.stderr)
  print(case,call.returncode,call.stdout[:180],call.stderr[-250:],flush=True)
  assert call.returncode==0, 'Ingress RPC failed: '+case
  seen=[c for c in calls if c['case']==case]
  assert seen, 'Provider was not reached: '+case
  last=seen[-1]['request']['messages']; latest=max(i for i,m in enumerate(last) if m.get('role')=='user' and 'CASE:'+case in str(m.get('content')))
  tool_results=[m for m in last[latest+1:] if m.get('role')=='tool']
  results[case]=tool_results
  (root/'results.json').write_text(json.dumps(results,indent=2))
  assert len(tool_results)==len(steps[case]), 'Incomplete tool execution: '+case
  serialized=json.dumps(seen)
  assert 'dingtalk.memoryScope.v1' not in serialized, 'Private admission binding metadata reached provider'
  assert 'ROOT_MEMORY_PRIVATE_SENTINEL_92781' not in serialized and 'HOST_PRIVATE_SENTINEL_62937' not in serialized, 'Host/root secret reached provider'
  if case not in ('AliceWrite','AliceResetRead','AliceIdleRead'): assert 'ALICE_PRIVATE_SENTINEL_58192' not in serialized, 'Private user memory leaked'
  if case not in ('GroupWrite','GroupRead'): assert 'GROUP_SHARED_SENTINEL_88163' not in serialized, 'Group memory leaked'
 assert 'ALICE_PRIVATE_SENTINEL_58192' in json.dumps(results['AliceWrite']), 'Private write did not succeed'
 assert 'ALICE_PRIVATE_SENTINEL_58192' in json.dumps(results['AliceResetRead']), 'Reset lost durable identity or denied the new admitted turn'
 if args.lifecycle:
  assert 'ALICE_PRIVATE_SENTINEL_58192' in json.dumps(results['AliceIdleRead']), 'Idle rollover lost durable identity or denied the new admitted turn'
  assert 'Hard scope execution refused' in json.dumps(results['OverrideRead']), 'Host exec override was not refused by the final execution gate'
  events=[json.loads(line) for line in (workspace/'lifecycle-events.jsonl').read_text().splitlines()]
  assert any(event['reason']=='idle' for event in events), 'Host did not emit a real idle rollover'
 assert 'GROUP_SHARED_SENTINEL_88163' in json.dumps(results['GroupRead']), 'Group sharing failed'
 for case in ['BobRead','LowerAliceRead','OtherGroupRead']:
  assert 'null' in str(results[case][0].get('content')), 'Missing memory was not independently empty: '+case
 for result in results['BobRead'][1:]:
  assert any(word in str(result.get('content')).lower() for word in ['denied','not found','no such','outside','error']), 'Host read attack not rejected'
 (root/'results.json').write_text(json.dumps(results,indent=2))
 print('HARD_INGRESS_ISOLATION_PASS',flush=True)
finally:
 if gateway.poll() is None:
  os.killpg(gateway.pid,signal.SIGTERM)
  try: gateway.wait(timeout=15)
  except subprocess.TimeoutExpired: os.killpg(gateway.pid,signal.SIGKILL);gateway.wait()
 provider.shutdown()
 # Only remove containers whose unique fixture prefix and host mount both match.
 listing=subprocess.run(['docker','ps','-aq','--filter','name='+root.name+'-'],capture_output=True,text=True)
 for container in listing.stdout.split():
  inspected=subprocess.run(['docker','inspect',container],capture_output=True,text=True)
  if inspected.returncode==0:
   data=json.loads(inspected.stdout)[0]
   if data.get('Name','').startswith('/'+root.name+'-') and any(str(m.get('Source','')).startswith(str(root)+'/') for m in data.get('Mounts',[])):
    subprocess.run(['docker','rm','-f',container],check=True,capture_output=True)
 print('gateway_tail',(root/'gateway.log').read_text()[-3500:],flush=True)
 if (workspace/'factory-contexts.jsonl').exists(): print('factory_contexts',(workspace/'factory-contexts.jsonl').read_text()[-7000:],flush=True)
