"""Real pinned-main Gateway + replacement package; deterministic provider, synthetic channel.
This proves fork/authority/storage plumbing, not natural-language model quality.
"""
from pathlib import Path
import subprocess,os,json,http.server,threading,socket,time,shutil,traceback,sys,tempfile,argparse
sys.stdout.reconfigure(encoding='utf-8')
parser=argparse.ArgumentParser();parser.add_argument('--sandbox',choices=['off','none','knowledge'],default='off');args=parser.parse_args()
repo=Path(__file__).resolve().parents[3];host=repo/'node_modules/openclaw';node=shutil.which('node')
assert node and (host/'openclaw.mjs').exists();cli=[node,str(host/'openclaw.mjs')]
root=Path(tempfile.mkdtemp(prefix='scoped-workshop-gateway-'));print(str(root),flush=True)
workspace=root/'workspace';workspace.mkdir();state=root/'state';state.mkdir();home=root/'home';home.mkdir()
subprocess.run([node,str(repo/'tests/memory-scope/ingress-probe/build.mjs'),str(root/'handler-bundle.mjs')],check=True)
plugin=root/'connector';plugin.mkdir();replacement=root/'workshop';replacement.mkdir()
shutil.copy2(root/'handler-bundle.mjs',plugin/'index.mjs')
shutil.copy2(repo/'plugins/scoped-workshop/dist/index.mjs',replacement/'index.mjs')
shutil.copy2(repo/'plugins/scoped-workshop/openclaw.plugin.json',replacement/'openclaw.plugin.json')
(plugin/'package.json').write_text(json.dumps({'name':'@dingtalk-real-ai/dingtalk-connector','version':'0.8.20-fix26','type':'module','exports':{'./scope-api':'./index.mjs'},'openclaw':{'extensions':['./index.mjs']}}))
(plugin/'openclaw.plugin.json').write_text(json.dumps({'id':'hard-ingress-probe','name':'Synthetic admitted DingTalk','configSchema':{'type':'object','properties':{},'additionalProperties':False},'contracts':{'tools':['scoped_memory']},'channels':['dingtalk-connector'],'channelConfigs':json.loads((repo/'openclaw.plugin.json').read_text(encoding='utf-8'))['channelConfigs']}))
(replacement/'package.json').write_text(json.dumps({'name':'@dingtalk-real-ai/scoped-workshop','version':'0.1.0','type':'module','openclaw':{'extensions':['./index.mjs']}}))
def junction(link,target):
 if os.name=='nt':subprocess.run(['powershell','-NoProfile','-Command',f"New-Item -ItemType Junction -Path '{link}' -Target '{target}' | Out-Null"],check=True,capture_output=True)
 else:link.symlink_to(target,target_is_directory=True)
junction(plugin/'node_modules',repo/'node_modules')
mods=replacement/'node_modules';mods.mkdir();(mods/'@dingtalk-real-ai').mkdir()
junction(mods/'@dingtalk-real-ai/dingtalk-connector',plugin)
for name,target in [('openclaw',host),('zod',repo/'node_modules/zod'),('yaml',repo/'node_modules/yaml')]:junction(mods/name,target)
calls=[];completed=set()
skill='---\nname: native-proof\ndescription: Check repeated deterministic results\n---\nRead the expected result and compare it before reporting success.'
class Provider(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  request=json.loads(self.rfile.read(int(self.headers['Content-Length'])));messages=request.get('messages',[])
  userCases=[]
  for i,m in enumerate(messages):
   if m.get('role')!='user':continue
   for c in ['AutoAlice','NoLearnBob','InspectBob','GroupAlice','GroupBob','OtherGroup']:
    if 'CASE:'+c in str(m.get('content')):userCases.append((i,c))
  if not userCases:self.send_error(400,'missing case');return
  start,case=userCases[-1]
  reviewStarts=[i for i,m in enumerate(messages) if 'Background skill review.' in str(m.get('content'))]
  review=bool(reviewStarts)
  recent=[m for m in messages[(reviewStarts[-1]+1 if review else start+1):] if m.get('role')=='tool'];count=len(recent)
  calls.append({'case':case,'review':review,'request':request});(root/'provider-calls.json').write_text(json.dumps(calls))
  tools=[t.get('function',{}).get('name') for t in request.get('tools',[])]
  if review:
   skillName='group-proof' if case=='GroupAlice' else 'native-proof'
   reviewSkill=skill.replace('native-proof',skillName)
   plan=[] if case=='NoLearnBob' else [('skill_workshop',{'action':'list'}),('skill_workshop',{'action':'create','name':skillName,'content':reviewSkill})]
  elif case in ['InspectBob','GroupBob','OtherGroup']:
   skillName='group-proof' if case in ['GroupBob','OtherGroup'] else 'native-proof'
   plan=[('skill_workshop',{'action':'list'}),('skill_workshop',{'action':'view','name':skillName})]
  else:plan=[('scoped_memory',{'action':'get','key':'verification'})]*10
  delta={'role':'assistant'}
  if count<len(plan):
   name,args=plan[count]
   if 'dispatch_action' in tools:args={'id':name,'args':args};name='dispatch_action'
   elif 'tool_call' in tools:args={'id':name,'args':args};name='tool_call'
   delta['tool_calls']=[{'index':0,'id':'proof_'+str(len(calls)),'type':'function','function':{'name':name,'arguments':json.dumps(args)}}];reason='tool_calls'
  else:
   delta['content']='NO_REPLY' if review else 'Fixture completed.';reason='stop'
   if review:completed.add(case)
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  for body,end in [(delta,None),({},reason)]:self.wfile.write(('data: '+json.dumps({'id':'proof','object':'chat.completion.chunk','created':int(time.time()),'model':'probe','choices':[{'index':0,'delta':body,'finish_reason':end}]})+'\n\n').encode())
  self.wfile.write(b'data: [DONE]\n\n');self.wfile.flush()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Provider);threading.Thread(target=server.serve_forever,daemon=True).start()
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
hooks={'allowConversationAccess':True,'allowPromptModification':True}
cfg={'meta':{'migrations':{'skillWorkshopPlugin':True}},'gateway':{'mode':'local','controlUi':{'enabled':False},'bind':'loopback','port':port,'auth':{'mode':'none'}},'hooks':{'internal':{'entries':{'session-memory':{'enabled':False}}}},
 'agents':{'defaults':{'workspace':str(workspace),'model':{'primary':'probe/probe'},'compaction':{'memoryFlush':{'enabled':False}},'sandbox':{'mode':'off' if args.sandbox=='off' else 'all','scope':'session','workspaceAccess':'none','docker':{'image':'node:22-alpine','network':'none',**({'binds':[str(workspace/'knowledge')+':/knowledge:ro']} if args.sandbox=='knowledge' else {})}}},'entries':{'main':{}}},
 'tools':{'allow':['scoped_memory','skill_workshop'],'sandbox':{'tools':{'allow':['scoped_memory','skill_workshop']}},'sessions':{'visibility':'self'}},
 'plugins':{'allow':['hard-ingress-probe','dingtalk-scoped-workshop'],'slots':{'memory':'none'},'load':{'paths':[str(plugin),str(replacement)]},'entries':{
  'hard-ingress-probe':{'enabled':True,'hooks':hooks},'skill-workshop':{'enabled':False},'dingtalk-scoped-workshop':{'enabled':True,'hooks':hooks,'config':{'autonomous':{'mode':'auto'}}}}},
 'channels':{'dingtalk-connector':{'enabled':True,'clientId':'fixture','clientSecret':'fixture-only','memoryScope':{'enabled':True}}},
 'models':{'providers':{'probe':{'api':'openai-completions','baseUrl':f'http://127.0.0.1:{server.server_port}/v1','apiKey':'fixture-only','models':[{'id':'probe','name':'Probe','contextWindow':65536,'maxTokens':4096}]}}}}
knowledge=workspace/'knowledge';knowledge.mkdir();(knowledge/'public.txt').write_text('PUBLIC_TEST_ONLY')
config=root/'config.json';config.write_text(json.dumps(cfg));env={**os.environ,'HOME':str(home),'OPENCLAW_HOME':str(home),'OPENCLAW_CONFIG_PATH':str(config),'OPENCLAW_STATE_DIR':str(state),'OPENCLAW_GATEWAY_PORT':str(port)}
for key in list(env):
 if key.lower() in ['http_proxy','https_proxy','all_proxy']:env.pop(key)
gateway=None
try:
 p=subprocess.run(cli+['config','validate','--json'],env=env,capture_output=True,text=True,encoding='utf-8',timeout=90);(root/'config-validation.log').write_text(p.stdout+p.stderr,encoding='utf-8');assert p.returncode==0,'config validation failed'
 log=(root/'gateway.log').open('w',encoding='utf-8');gateway=subprocess.Popen(cli+['gateway','run','--port',str(port),'--auth','none','--bind','loopback'],env=env,stdout=log,stderr=subprocess.STDOUT)
 (root/'gateway-pid.json').write_text(json.dumps({'pid':gateway.pid,'port':port}))
 for _ in range(300):
  if gateway.poll() is not None:raise RuntimeError('Gateway exited')
  if any(marker in (root/'gateway.log').read_text(errors='replace') for marker in ['http server listening','listening on','[gateway] listening','Gateway listening']):break
  time.sleep(1)
 else:raise RuntimeError('Gateway start timeout')
 for case,sender,conversation,group in [('AutoAlice','Alice','dm-Alice',False),('NoLearnBob','Bob','dm-Bob',False),('InspectBob','Bob','dm-Bob',False),('GroupAlice','Alice','group-one',True),('GroupBob','Bob','group-one',True),('OtherGroup','Bob','group-two',True)]:
  params={'sender':sender,'conversation':conversation,'group':group,'eventId':case,'handler':True,'message':'CASE:'+case+' '+('Do not learn or save a skill from this task.' if case=='NoLearnBob' else 'Verify the reusable procedure.')}
  p=subprocess.run(cli+['gateway','call','hardProbe.turn','--params',json.dumps(params),'--json','--timeout','95000'],env=env,capture_output=True,text=True,encoding='utf-8',timeout=110);(root/(case+'.rpc.log')).write_text(p.stdout+p.stderr,encoding='utf-8');assert p.returncode==0,case+' foreground failed'
  if case in ['AutoAlice','NoLearnBob','GroupAlice']:
   for _ in range(120):
    if case in completed:break
    time.sleep(1)
   assert case in completed,case+' native review did not complete'
 files=list((state/'plugin-state/dingtalk-connector/scopes-v1/workshop').glob('*/native-proof/head.json'))
 assert len(files)==1,'Private saved scope missing'
 groupFiles=list((state/'plugin-state/dingtalk-connector/scopes-v1/workshop').glob('*/group-proof/head.json'))
 assert len(groupFiles)==1,'Group saved scope missing or duplicated'
 assert json.loads(files[0].read_text())['lastMutation']['actorId']=='Alice','Private skill actor was not the requester'
 assert json.loads(groupFiles[0].read_text())['lastMutation']['actorId']=='Alice','Group skill actor was not the initiating sender'
 for case,visible in [('InspectBob',False),('GroupBob',True),('OtherGroup',False)]:
  rows=[c for c in calls if c['case']==case];assert len(rows)>=3,case+' did not invoke both Workshop reads'
  result=[m for m in rows[-1]['request']['messages'] if m.get('role')=='tool' and 'skill_workshop' in str(m.get('content'))]
  assert len(result)>=2,case+' Workshop results missing'
  found=any('Check repeated deterministic results' in str(m.get('content')) for m in result)
  assert found==visible,case+' visibility mismatch'
 (root/'result.json').write_text(json.dumps({'passed':True,'nativeForks':[c['case'] for c in calls if c['review']],'savedPrivateScopes':len(files),'savedGroupScopes':len(groupFiles),'sandbox':args.sandbox}));print('NATIVE_FORK_SCOPE_PROOF_PASS')
except BaseException as e:
 (root/'result.json').write_text(json.dumps({'passed':False,'error':str(e)}));traceback.print_exc()
finally:
 if gateway and gateway.poll() is None:
  gateway.terminate()
  try:gateway.wait(timeout=15)
  except subprocess.TimeoutExpired:gateway.kill();gateway.wait()
 server.shutdown()
