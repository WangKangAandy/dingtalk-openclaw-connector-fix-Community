# Real public OpenClaw runtime + local deterministic provider. No production config or model.
# Linux/WSL: python3 tests/memory-scope/host-probe/run.py --openclaw /path/to/openclaw
import argparse, json, os, pathlib, subprocess, time, threading, http.server, shutil, tempfile, socket
parser=argparse.ArgumentParser()
parser.add_argument('--repo',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[3])
parser.add_argument('--openclaw',default=shutil.which('openclaw'))
args=parser.parse_args()
if os.name!='posix': parser.error('Run the real Gateway fixture in Linux/WSL')
if not args.openclaw: parser.error('Specify the installed, supported OpenClaw executable')
repo=args.repo.resolve()
cli=str(pathlib.Path(args.openclaw).absolute())
root=pathlib.Path(tempfile.mkdtemp(prefix='scoped-host-probe-'))
print('evidence_directory',root,flush=True)
plugin=root/'plugin'; plugin.mkdir()
shutil.copytree(repo/'src/memory-scope',plugin/'src/memory-scope')
shutil.copyfile(repo/'tests/memory-scope/host-probe/index.mjs',plugin/'index.mjs')
(plugin/'node_modules').symlink_to(repo/'node_modules',target_is_directory=True)
(plugin/'package.json').write_text(json.dumps({'name':'scoped-review-probe','version':'1.0.0','type':'module','openclaw':{'extensions':['./index.mjs']}}))
(plugin/'openclaw.plugin.json').write_text(json.dumps({'id':'scoped-review-probe','name':'Isolated review probe','configSchema':{'type':'object','additionalProperties':False,'properties':{}},'contracts':{'tools':['scoped_skill_workshop']},'channels':['dingtalk-connector'],'channelConfigs':json.loads((repo/'openclaw.plugin.json').read_text())['channelConfigs']}))
workspace=root/'workspace'; workspace.mkdir()
with socket.socket() as sock:
 sock.bind(('127.0.0.1',0)); gateway_port=sock.getsockname()[1]
calls=[]
observed=[]
attacks=[
 ('write',{'path':str(workspace/'forbidden-write.txt'),'content':'unauthorized'}),
 ('exec',{'command':'printf unauthorized > '+str(workspace/'forbidden-exec.txt')}),
 ('skill_workshop',{'action':'list'}),
 ('memory_search',{'query':'private secrets'}),
 ('scoped_skill_workshop',{'action':'list','scope':'someone-else'}),
]
draft={'name':'verify-checksum','description':'Verify a repeated checksum result','body':'Calculate the fixture checksum, compare the expected checksum, repeat the check, and stop on any mismatch.','files':{}}
class Provider(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_POST(self):
  request=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  msgs=request.get('messages',[])
  review=any('Extract at most one reusable procedure' in str(m.get('content')) for m in msgs)
  tools=[t.get('function',{}).get('name') for t in request.get('tools',[])]
  calls.append({'review':review,'tools':tools,'messageCount':len(msgs),'path':self.path})
  (root/'provider-calls.json').write_text(json.dumps(calls,indent=2))
  recent=[m for m in msgs if m.get('role')=='tool']
  if recent:
   observed[:]=recent
   (root/'attack-results.json').write_text(json.dumps(observed,indent=2))
  text='Fixture verified successfully.'; name=None; args={}
  if review:
   if len(recent)<len(attacks): name,args=attacks[len(recent)]
   elif len(recent)==len(attacks): name='scoped_skill_workshop';args={'action':'list'}
   elif len(recent)==len(attacks)+1: name='scoped_skill_workshop';args={'action':'save','skill':draft,'expectedRevision':None}
   else: text='Learned one verified procedure.'
  elif not recent: name='probe_verify'
  if name and 'tool_call' in tools: args={'id':name,'args':args}; name='tool_call'
  delta={'role':'assistant'}
  if name: delta['tool_calls']=[{'index':0,'id':'call_'+str(len(calls)),'type':'function','function':{'name':name,'arguments':json.dumps(args)}}]
  else: delta['content']=text
  if request.get('stream'):
   self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
   for d,finish in [(delta,None),({},'tool_calls' if name else 'stop')]:
    frame={'id':'chatcmpl-probe','object':'chat.completion.chunk','created':int(time.time()),'model':'probe','choices':[{'index':0,'delta':d,'finish_reason':finish}]}
    self.wfile.write(('data: '+json.dumps(frame)+'\n\n').encode())
   self.wfile.write(b'data: [DONE]\n\n'); self.wfile.flush()
  else:
   body={'id':'chatcmpl-probe','object':'chat.completion','choices':[{'index':0,'message':delta,'finish_reason':'tool_calls' if name else 'stop'}],'usage':{'prompt_tokens':100,'completion_tokens':20,'total_tokens':120}}
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(body).encode())
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Provider)
threading.Thread(target=server.serve_forever,daemon=True).start()
state=root/('state-'+str(int(time.time())));state.mkdir()
cfg={'gateway':{'mode':'local','bind':'loopback','port':gateway_port,'auth':{'mode':'none'}},
 'agents':{'defaults':{'workspace':str(workspace),'model':{'primary':'probe/probe'}}},
 'plugins':{'allow':['scoped-review-probe'],'load':{'paths':[str(plugin)]},'entries':{'scoped-review-probe':{'enabled':True,'hooks':{'allowConversationAccess':True,'allowPromptInjection':True}}}},
 'models':{'providers':{'probe':{'api':'openai-completions','baseUrl':'http://127.0.0.1:'+str(server.server_port)+'/v1','apiKey':'local-test-fixture','models':[{'id':'probe','name':'Probe','contextWindow':65536,'maxTokens':4096}]}}},
 'channels':{'dingtalk-connector':{'enabled':True,'memoryScope':{'scopedLearning':{'enabled':True,'reviewAfterIterations':1,'reviewIdleMs':1000}}}},'skills':{'workshop':{'autonomous':{'mode':'off'}}}}
cfgpath=root/'probe-config.json';cfgpath.write_text(json.dumps(cfg))
env=os.environ.copy();env['PATH']=str(pathlib.Path(cli).parent)+os.pathsep+env['PATH'];env['OPENCLAW_CONFIG_PATH']=str(cfgpath);env['OPENCLAW_STATE_DIR']=str(state);env['OPENCLAW_GATEWAY_PORT']=str(gateway_port);env['NODE_OPTIONS']='--experimental-transform-types'
log=(root/'gateway.log').open('w')
gateway=subprocess.Popen([cli,'gateway','run','--port',str(gateway_port),'--auth','none','--bind','loopback'],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
try:
 for _ in range(60):
  time.sleep(1)
  if gateway.poll() is not None: break
  if 'http server listening' in (root/'gateway.log').read_text(): break
 print('startup',gateway.poll(),flush=True)
 assert gateway.poll() is None and 'http server listening' in (root/'gateway.log').read_text(), 'Owned isolated gateway failed to start; do not call another process on the same port'
 call=subprocess.run([cli,'gateway','call','scopedProbe.run','--params','{}','--json','--timeout','65000'],env=env,capture_output=True,text=True,timeout=80)
 (root/'rpc-output.txt').write_text(call.stdout+'\n'+call.stderr)
 print('rpc_exit',call.returncode,flush=True)
 print('provider_calls',json.dumps(calls),flush=True)
 print('skill_count',len(list(workspace.glob('workshop/**/skill.json'))),flush=True)
 print('rpc_tail',(call.stdout+'\n'+call.stderr)[-2000:],flush=True)
 print('observed_tool_results',len(observed),flush=True)
 assert call.returncode==0, 'Runner RPC failed'
 assert len(observed)==len(attacks)+2, 'Fixture did not execute every attack and legitimate call'
 for item in observed[:len(attacks)]:
  assert any(word in str(item.get('content','')).lower() for word in ['not found','denied','not allowed','unknown','unrecognized','invalid','error']), 'Attack not rejected: '+str(item)
 assert not (workspace/'forbidden-write.txt').exists() and not (workspace/'forbidden-exec.txt').exists(), 'Forbidden side effect'
 assert len(list(workspace.glob('workshop/**/skill.json')))==1, 'Expected exactly one legitimate skill'
 print('ISOLATED_RUNNER_ATTACKS_PASS',flush=True)
 for mutation in ['reset','delete']:
  ready=workspace/'lease-ready.json'
  ready.unlink(missing_ok=True)
  key='agent:main:scoped-lease-probe:'+mutation
  seed=subprocess.run([cli,'agent','--session-key',key,'--message','Lease fixture: answer OK.','--json','--timeout','30'],env=env,capture_output=True,text=True,timeout=40)
  assert seed.returncode==0, 'Session setup failed: '+seed.stdout[-1000:]+seed.stderr[-1000:]
  active=subprocess.Popen([cli,'gateway','call','scopedProbe.lease','--params',json.dumps({'key':key}),'--json','--timeout','65000'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  for _ in range(200):
   if ready.exists() or active.poll() is not None: break
   time.sleep(.1)
  assert ready.exists(), 'Lease did not start: '+str(active.communicate(timeout=5))
  key=json.loads(ready.read_text())['key']
  change=subprocess.run([cli,'gateway','call','sessions.'+mutation,'--params',json.dumps({'key':key}),'--json','--timeout','30000'],env=env,capture_output=True,text=True,timeout=40)
  out,err=active.communicate(timeout=30)
  print('lease_'+mutation,json.dumps({'change_exit':change.returncode,'change':change.stdout[-1500:],'change_error':change.stderr[-1000:],'lease_exit':active.returncode,'lease':out,'lease_error':err}),flush=True)
  assert change.returncode==0 and active.returncode==0, 'Host lifecycle operation failed'
  result=json.loads(out[out.index('{'):])
  assert result['interrupted'] is True, 'Work admission did not interrupt on '+mutation
  read=subprocess.run([cli,'gateway','call','scopedProbe.sessionRead','--params',json.dumps({'key':key}),'--json','--timeout','10000'],env=env,capture_output=True,text=True,timeout=15)
  print('post_'+mutation+'_read',read.stdout,read.stderr,flush=True)
 print('HOST_WORK_ADMISSION_RESET_DELETE_PASS',flush=True)
finally:
 import signal
 if gateway.poll() is None:
  os.killpg(gateway.pid,signal.SIGTERM)
  try: gateway.wait(timeout=15)
  except subprocess.TimeoutExpired: os.killpg(gateway.pid,signal.SIGKILL);gateway.wait()
 server.shutdown()
 print('gateway_tail',(root/'gateway.log').read_text()[-2500:],flush=True)

