// Scripted CLI fixture: every agent operation goes through the real host MCP bridge.
// Native filesystem use is limited to its generated transport config and proof output.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
// Any execution is a failure for the current host, whose CLI bridge has no
// sandbox filesystem context. Keep the real MCP calls to expose regressions.
fs.writeFileSync(path.join(process.env.FIXTURE_ROOT, 'cli-bridge-started.json'), 'true')
const configPath = process.argv[process.argv.indexOf('--mcp-config') + 1]
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
assert.deepEqual(Object.keys(config.mcpServers), ['openclaw'])
const server = config.mcpServers.openclaw
const headers = Object.fromEntries(Object.entries(server.headers ?? {}).map(([k,v]) => [k,String(v).replace(/\$\{([^}]+)\}/g, (_,name) => process.env[name] ?? '')]))
let nextId = 0
async function rpc(method, params, notify = false) {
  const response = await fetch(server.url, { method: 'POST', headers: { ...headers,
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', ...(notify ? {} : {id: ++nextId}), method, params }), signal: AbortSignal.timeout(20000) })
  const session = response.headers.get('mcp-session-id')
  if (session) headers['Mcp-Session-Id'] = session
  const body = await response.text()
  if (!response.ok) throw Error(`MCP ${method} failed HTTP ${response.status}: ${body.slice(0,400)}`)
  if (!body) return null
  const lines = body.startsWith('data:') || body.includes('\ndata:')
    ? body.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim()) : [body]
  const parsed = lines.filter(Boolean).map(x=>JSON.parse(x)).find(x=>x.id===nextId) ?? JSON.parse(lines.at(-1))
  if (parsed.error) throw Error(`MCP ${method}: ${JSON.stringify(parsed.error)}`)
  return parsed.result
}
const proof = { cap: JSON.parse(process.env.FIXTURE_TOOL_CAP), results: [] }
try {
  assert.deepEqual(proof.cap.native, [])
  await rpc('initialize', { protocolVersion:'2025-03-26', capabilities:{}, clientInfo:{name:'scope-cli-proof',version:'1'} })
  await rpc('notifications/initialized', {}, true)
  const list = await rpc('tools/list', {})
  proof.tools = list.tools.map(x=>x.name)
  async function tool(name,args) {
    const wrapped=proof.tools.includes('tool_call')
    const result=await rpc('tools/call', wrapped?{name:'tool_call',arguments:{id:name,args}}:{name,arguments:args})
    proof.results.push({name,result})
    return result
  }
  await tool('scoped_memory',{action:'put',key:'bridge',value:'BRIDGE_PRIVATE_45291',expectedRevision:null})
  await tool('scoped_memory',{action:'get',key:'bridge'})
  await tool('write',{path:'bridge-proof.txt',content:'SANDBOX_BRIDGE_68214'})
  await tool('read',{path:'bridge-proof.txt'})
  await tool('read',{path:path.join(process.env.FIXTURE_ROOT,'host-private.txt')})
  await tool('exec',{command:'cat '+path.join(process.env.FIXTURE_ROOT,'host-private.txt')})
  console.log(JSON.stringify(proof))
} catch(error) {
  proof.error=String(error)
  console.error(String(error))
  process.exitCode=1
} finally {
  fs.writeFileSync(path.join(process.env.FIXTURE_ROOT,'cli-bridge-proof.json'),JSON.stringify(proof,null,2))
}
