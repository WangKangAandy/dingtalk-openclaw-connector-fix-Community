import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { ScopedReviewRunner } from "./src/memory-scope/scoped-workshop/runner.ts"
import { WorkshopStore } from "./src/memory-scope/scoped-workshop/storage.ts"
import { admitScope, SCOPE_OPERATIONS } from "./src/memory-scope/authority.ts"

export default function register(api) {
  const runner = new ScopedReviewRunner(api)
  api.registerTool({contextVersion:2, create:ctx => runner.tool(ctx)}, {name:"scoped_skill_workshop"})
  api.registerGatewayMethod("scopedProbe.run", async ({ params, respond }) => {
    const workspace = api.config.agents.defaults.workspace
    const source = {agentId:"main",sessionId:randomUUID(),sessionKey:"agent:main:dingtalk-connector:direct:alice",workspaceDir:workspace,provider:"probe",model:"probe"}
    const grant = admitScope({ tenantId:"fixture-tenant",accountId:"fixture-account",agentId:"main",senderId:"alice",chatType:"direct",
      sessionKey:source.sessionKey,sessionId:source.sessionId,operations:SCOPE_OPERATIONS,assertCurrent(){} })
    const store = new WorkshopStore(workspace,grant)
    let stamp = store.stamp()
    const changes=[]
    const abort = new AbortController()
    try {
      await runner.run({task:{key:"fixture",source,store,messages:[],config:{enabled:true,mode:"auto",reviewAfterIterations:1,reviewIdleMs:1000},assertCurrent(){}},
        signal:abort.signal,
        prompt:"Fixture verification tool returned PASS twice. Learn a reusable procedure for comparing and verifying checksum results.",
        assertCurrent(){ abort.signal.throwIfAborted(); if(stamp!==store.stamp()) throw new Error("stale store") },
        onMutation(name){ changes.push(name); stamp=store.stamp() },
      })
      respond(true,{changes,skills:store.list().map(s=>s.name)})
    } catch(e){respond(false,{error:e.message,changes})}
  })
  api.registerGatewayMethod("scopedProbe.lease", async ({ params, respond }) => {
    const sessions = api.runtime.agent.session
    const key = params.key
    const storePath = sessions.resolveStorePath(api.config.session?.store,{agentId:"main"})
    const before = sessions.getSessionEntry({storePath,sessionKey:key,agentId:"main",readConsistency:"latest"})
    try {
      const interrupted = await sessions.runWithWorkAdmission({storePath,sessionKey:key}, async signal => {
        fs.writeFileSync(path.join(api.config.agents.defaults.workspace,"lease-ready.json"),JSON.stringify({key,sessionId:before?.sessionId}))
        return await new Promise(resolve => {
          const timer=setTimeout(()=>resolve(false),20000)
          const abort=()=>{clearTimeout(timer);resolve(true)}
          signal.addEventListener("abort",abort,{once:true})
          if(signal.aborted) abort()
        })
      })
      const after = sessions.getSessionEntry({storePath,sessionKey:key,agentId:"main",readConsistency:"latest"})
      respond(true,{interrupted,before:before&&{sessionId:before.sessionId,lifecycleRevision:before.lifecycleRevision,keys:Object.keys(before)},
        after:after&&{sessionId:after.sessionId,lifecycleRevision:after.lifecycleRevision}})
    } catch(e){ respond(false,{error:e.message}) }
  })
  api.registerGatewayMethod("scopedProbe.sessionRead", ({params,respond}) => {
    const sessions=api.runtime.agent.session
    const entry=sessions.getSessionEntry({agentId:"main",sessionKey:params.key,readConsistency:"latest",
      storePath:sessions.resolveStorePath(api.config.session?.store,{agentId:"main"})})
    respond(true,{entry:entry&&{sessionId:entry.sessionId,lifecycleRevision:entry.lifecycleRevision,keys:Object.keys(entry)}})
  })
}

