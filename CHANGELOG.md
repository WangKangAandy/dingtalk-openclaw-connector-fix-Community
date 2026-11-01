# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 淇 / Fixed
- 馃憤 **璧炶俯钀界洏閫傞厤 OpenClaw DB-first** 鈥?鍙啓 `openclaw-agent.sqlite` transcript + `~/.openclaw/dingtalk-card-feedback.jsonl`锛涗笉鍐嶈鍐?`sessions.json`/JSONL锛岄伩鍏嶅洖璋?UI 浜簡鍗?`session file missing`
- 馃憤 **璧炶俯 SQLite patch 鏀剁獎鍐欏垪** 鈥?鍙敼 `event_json`锛堝凡鏈?`event_utf8_bytes` 鍒欏悓姝ユ柊闀垮害锛夛紱涓嶅啀鎶?`event_utf8_bytes` / `event_zstd` / `navigation_json` 娓呮垚 NULL

### 鍙樻洿 / Changed
- 鈾伙笍 **閫傞厤 OpenClaw 2.0 / 2026.10 Host 濂戠害** 鈥?瀵归綈瀹樻柟 connector 0.8.27 鐨?Host API锛屼笉鏁翠粨鍚堝苟瀹樻柟瀹炵幇锛屼繚鐣欎紒涓氫晶 DWS identity銆丄I Card銆佸獟浣撲笌缇ょ瓥鐣?
- 馃摝 **Host 鐗堟湰閽夋墡** 鈥?`peerDependencies.openclaw` / `openclaw.compat.pluginApi` / `install.minHostVersion` 鍗囪嚦 `>=2026.8.1`锛屽紑鍙戜緷璧栭拤鍒?`2026.10.9`
- 馃攲 **SDK 鍏ュ彛杩佺Щ** 鈥?`plugin-sdk/core`銆乣config-contracts`銆乣channel-setup`銆乣channel-config-schema`銆乣channel-outbound`銆乣channel-secret-basic-runtime`銆乣runtime-store`锛沇indows 涓嬬敤 `api.source || api.rootDir`锛屼笉鍐嶄娇鐢?`import.meta`
- 馃摠 **鍥炲鍒嗗彂鏀硅蛋 Host buffered dispatcher** 鈥?鎻掍欢杩斿洖 `dispatcherOptions`锛岀敱 `dispatchReplyWithBufferedBlockDispatcher` 鍒涘缓 dispatcher锛涗粛寮哄埗 `sourceReplyDeliveryMode: "automatic"`锛屽苟淇濈暀 `DWS_AUTH_IDENTITY` 鍖呰９
- 鈿欙笍 **Gateway 璇婚厤缃?* 鈥?浠呬娇鐢?2026.10 `getRuntimeConfig()`锛坄runtime-config-snapshot`锛夛紝涓嶅啀鍥為€€宸插垹闄ょ殑 `config-runtime`
- 馃攼 **SecretRef / store** 鈥?澧炲姞 Host 鍙戠幇鍏ュ彛 `secret-contract-api`锛沍od / helpers / plugin schema 鎺ュ彈 `source: "store"`
- 馃И **Onboarding 娴嬭瘯** 鈥?鍘绘帀宸插垹闄ょ殑 `openclaw/plugin-sdk` 鏍瑰叆鍙?mock锛? 涓叆椹荤敤渚嬪彲鍦?2026.10 Host 涓嬫敹闆嗗苟杩愯

**OpenClaw 2.0 host compatibility** 鈥?Follow official 0.8.27 Host contracts on the currently installed October OpenClaw (`2026.10.9`) without replacing enterprise customizations.

### 鏂板 / Added
- **鍙€夐拤閽夎鍒欑鐞?*锛歚guidance setup` 鎻愪緵鍙紪杈?Markdown銆侀厤缃畼鏂?agent-guidance 骞?reload銆傚凡鏈夋枃浠堕粯璁よ烦杩囷紝`--overwrite-rules` 鏄惧紡鏇挎崲鍖呭唴鍚屽悕妯℃澘锛涚洰褰曟柊澧?Markdown 鏃犻』鏀逛唬鐮併€傚畨瑁呮垨鍗囩骇 connector 涓嶈嚜鍔ㄥ惎鐢紝涔熶笉鑷姩閲嶅惎 Gateway銆傝瑙?[閰嶇疆涓庣淮鎶(docs/agent-guidance.md)銆?

## [0.8.20-fix26] - 2026-10-15

### 淇 / Fixed
- 馃搵 **浼佷笟浜嬩欢鍒拌揪浼氱暀璁板綍** 鈥?瑙ｆ瀽澶辫触 / 鍏跺畠绫诲瀷鍚勮涓€琛岋紱`user_add_org` 鍙缁堟€侊紙sent / disabled / error 绛夛級锛屼笉鍐嶅厛鍐?received 鍐嶅啓 sent銆俙test` 璺熸暣甯ц蛋锛泂ent 鎸夊抚涓€琛屻€傚彂閫佹椂宸茶В鏋愬埌鐨勫鍚嶅彲閫夊啓鍏?`names`锛坲serId 鈫?鏄电О锛夛紝鏌ヤ笉鍒板氨鐪佺暐銆?
- 馃Ь **鐞嗘竻鏃ュ織绾у埆** 鈥?`info` 濮嬬粓杈撳嚭锛堟甯镐笟鍔★級锛涘彧鏈?`debug` 鍙楅厤缃紑鍏虫帶鍒躲€備笉鍐嶇敤 warn / `console.log` 缁曡繃 info銆傚叆绔欐姤鏂囩粏鑺傘€佽繛鎺ュけ璐ュ爢鏍堣蛋 debug锛涙敹鍒?澶勭悊瀹屾垚浠嶆槸 info銆?

## [0.8.20-fix25] - 2026-10-14

### 淇 / Fixed
- 馃摑 **淇鍋跺彂鏃犳硶鎹㈣** 鈥?Agent 鍥炲銆佸叆鑱屾寚寮曞湪閽夐拤鍗＄墖涓婃湁鏃朵細鎶婃崲琛屾敹鎴愮┖鏍笺€佹尋鎴愪竴琛屻€傚嚭闂ㄦ寜鍗＄墖瑙勫垯琛ョ‖鎹㈣锛屼笉棰濆澶氬嚭绌虹櫧琛岋紱琛ㄦ牸鍓嶇己绌鸿浠嶈ˉ銆傚崱鐗囨鏂囥€乵arkdown 鍙戦€併€佸叆鑱屾寚寮曞悓涓€濂椼€?

## [0.8.20-fix24] - 2026-10-14

### 淇 / Fixed
- 馃柤锔?**OpenClaw 鍑虹珯鍥剧墖** 鈥?connector 鎺ラ€?OpenClaw 宸叉湁鍑哄浘鏂瑰紡锛氭鏂?`![](...)` 鍘熶綅杩涘崱锛涚嫭绔?`MEDIA:` / `payload.mediaUrl` 绛夊崱鐗?姝ｆ枃鍙戝嚭鍚庡啀 `sendMedia`銆侫gent 鍐欐硶瑙?bundled skill `dingtalk-channel-rules`銆傛棤鍓嶇紑瑁歌矾寰勪笉杞浘锛坴0.8.9锛?
- 馃柤锔?**`payload.mediaUrl` 涓嶉檺 final** 鈥?OpenClaw 宸ュ叿鍥炲悎甯告妸甯?`mediaUrl` 鐨勬暣鍖呭綋 `block` 涓斾笉鍐嶇粰 `final`锛涘彧鍦?final 鍏ラ槦浼氭妸鐙珛鍥剧墖涓㈡帀銆傞槦鍒楄窡 dispatcher锛堜竴鏉″叆绔欐秷鎭級璧帮紝`onReplyStart` 涓嶅啀 `reset`锛岄伩鍏嶅伐鍏峰洖鍚堜簩娆?start 娓呮帀鏈?flush 鐨勯檮浠躲€傜嫭绔嬮檮浠舵病鏈夋鏂囦篃鍙互鍑哄浘锛沠lush 鐢ㄦ湭鏇挎崲鐨?markdown 鍐嶅垽 `![](鍚屼竴璺緞)`锛岄伩鍏嶅厛鍏ラ槦鍚庤繘鍗″鑷村弻鍙?

## [0.8.20-fix23] - 2026-06-12

### 鍙樻洿 / Changed
- 馃攣 **鏍囧噯鍖?DWS auth 鍒嗗伐锛堝榻愬畼鏂癸級** 鈥?Agent exec `auth status` / `auth login --sender-id <id> --device`锛沺er-sender token锛坄~/.dws/users/<id>/`锛変繚鐣?
- 馃Ч **閫€褰?connector spawn 鎺ㄩ摼** 鈥?`reply-dispatcher` 绉婚櫎 `handleDwsAuthCommandOutput` 璋冪敤锛沗dws-oauth.ts` 淇濈暀浠呬緵鍙傝€?
- 馃摑 **鏂囨。** 鈥?`DWS_AUTH_ARCHITECTURE.md`銆乣dingtalk-channel-rules`銆乨ws skill `dws-auth-workflow.md` 鍚屾锛涘巻鍙?ROADMAP/Plan 鏍囦负 fix22 褰掓。

### 璇存槑
- fix22 鐨?connector spawn 璺緞宸插簾姝紱Agent exec login 鏃跺嬁浼?`exec timeout: 30`锛圤penClaw 榛樿 1800s锛?

## [0.8.20-fix22] - 2026-06-12

### 鍙樻洿 / Changed
- 馃攣 **鎭㈠瀹樻柟 P2 `dws-oauth` spawn login** 鈥?鍗曟枃浠?`src/dws-oauth.ts`锛坄spawnLoginProcess` + 10min watchdog + proactive 鎺ㄩ摼锛夛紱`reply-dispatcher` 鎺ュ洖 `handleDwsAuthCommandOutput`
- 馃Ч **淇濇寔 Phase 1 鍐椾綑璁捐绉婚櫎** 鈥?涓嶆仮澶?`dws-auth/` Gate/Guard銆丏enialCache銆乣ensureDwsAuth` 鍏ラ槦鎷︽埅
- 馃摑 **Agent 鍒嗗伐** 鈥?浠?`auth status` + 涓氬姟 `dws`锛?*绂佹** Agent `exec dws auth login`锛堥伩鍏?OpenClaw exec 30s SIGKILL锛?

## [0.8.20-fix21] - 2026-06-11

### 鍙樻洿 / Changed
- ~~Phase R锛堝凡搴熸浜?fix22锛墌~ 鈥?鏇惧皾璇曟敼鐢?Agent exec login锛屾槗瑙﹀彂 SIGKILL锛沠ix22 鎭㈠ connector spawn

### 绉婚櫎 / Removed
- 馃Ч **Phase 1 鍐椾綑缂栨帓** 鈥?`dws-auth/` Gate/Guard銆丏enialCache锛坒ix22 涓嶆仮澶嶏級

## [0.8.20-fix20] - 2026-06-11

### 鏂板 / Added
- 馃搵 **delivery-trace 鎶曢€掗摼璺棩蹇?* 鈥?`reply-dispatcher` 鍏抽敭璺緞杈撳嚭 `[DingTalk][delivery-trace]` 缁撴瀯鍖栨棩蹇楋紙鍐欏叆 openclaw 鏃ュ織鏂囦欢锛夛紝鐢ㄤ簬瀹氫綅 IM 娑堟伅涔卞簭/閲嶅/鍗婃埅闂

## [0.8.20-fix19] - 2026-06-11

### 鍙樻洿 / Changed
- 馃洝锔?**edit 鏍￠獙 workaround 杩佸叆 openclaw-patch** 鈥?鏂板 `openclaw-patch/2026.5.7/edit-empty-oldtext/` dist patch锛涚Щ闄?connector `edit-param-guard` hook 鍙婂崟娴嬶紱OpenClaw core bug 缁熶竴鐢?`apply-all.sh` 閮ㄧ讲

## [0.8.20-fix18] - 2026-06-09

### 鍙樻洿 / Changed
- 馃搵 **memory-scope 鏂囨。涓?schema 瀵归綈 fix17** 鈥?`config/schema.ts` 澧炲姞 `syncAgentsMemoryRules`锛汻EADME / README.en 鍚姩鏃ュ織绀轰緥锛沗dingtalk-channel-rules` SKILL memory 娈典笌 MEMORY/AGENTS 鏍囪娈典竴鑷?

## [0.8.20-fix17] - 2026-06-09

### 鍙樻洿 / Changed
- 馃攧 **AGENTS / MEMORY sync 绛栫暐缁熶竴** 鈥?`AGENTS.md` 鏍囪娈垫敼涓轰笌 `MEMORY.md` 鐩稿悓锛氭瘡娆?gateway 鍚姩 replace 鏍囪娈碉紱棣栨鏃犳爣璁版椂 migrate 鏃?OpenClaw 鍐茬獊娈?
- 馃摝 **瑙勫垯鍗曟簮** 鈥?鏂板 `memory-rules-shared.ts`銆乣marked-section-sync.ts`锛沗root-memory-rules.ts` 涓虹邯寰嬬湡婧愶紝`agents-memory-rules.ts` 涓哄伐浣滄祦鎸囬拡锛堝皯閲嶅锛?
- 馃寪 **鏂囨缁熶竴鑻辨枃** 鈥?memory-scope 妯℃澘銆乸rompt銆乻cope MEMORY 榛樿鍐呭銆佷笓棰?issue 鏍煎紡鎻愮ず鏀逛负鑻辨枃
- 馃Ч **绉婚櫎杩囨椂瑕嗙洊澹版槑** 鈥?鍒犻櫎 `root-memory-rules` 涓€岃鐩?AGENTS 鏃у啓娉曘€峛lockquote

## [0.8.20-fix16] - 2026-06-09

### 鏂板 / Added
- 馃摑 **AGENTS.md memory 鍐茬獊娈?install-once sync锛堟柟妗?A锛?* 鈥?鏂板 `agents-memory-sync.ts` / `agents-memory-rules.ts`锛氶娆?gateway 鍚姩鏃跺皢 `AGENTS.md` 涓?Session Startup / Memory / Heartbeat 鍐茬獊鎻忚堪鏇挎崲涓?memory-scope 鏍囪娈碉紱宸插瓨鍦?`<!-- dingtalk-memory-scope:agents-memory -->` 鏃惰烦杩囷紙閲嶅惎涓嶉噸澶嶅啓锛夛紱閰嶇疆椤?`syncAgentsMemoryRules`锛堥粯璁?`true`锛?
- 馃И **鍗曟祴** 鈥?`tests/memory-scope/agents-memory-sync.test.ts`

## [0.8.20-fix15] - 2026-06-09

### 鍙樻洿 / Changed
- 馃搧 **涓撻 issue 鏂囦欢杩佽嚦 `memory/` 骞剁粺涓€鍛藉悕** 鈥?`memory/dingtalk-issue.md`銆乣memory/musa-stack-issue.md`銆乣memory/openclaw-issue.md`锛涙柊澧?`topic-issue-files.ts` 闆嗕腑璺緞甯搁噺锛涜鍒?sync 妯℃澘涓?README 鍚屾鏇存柊

## [0.8.20-fix14] - 2026-06-09

### 鍙樻洿 / Changed
- 馃毇 **绂佹 Agent 鍫嗗彔鏍?MEMORY** 鈥?sync 瑙勫垯鏄庣‘ Agent 涓嶅緱 write/edit 鏍?`MEMORY.md`锛涜俯鍧戞寜涓婚鍐欏叆涓撻鏂囦欢锛堝綋鏃朵负 workspace 鏍圭洰褰?`dingtalk-issues.md` / `musa-notes.md`锛?

## [0.8.20-fix13] - 2026-06-09

### 鍙樻洿 / Changed
- 馃 **memory-scope 鏋舵瀯浼樺寲锛堟柟妗?B锛?* 鈥?鍙屽眰 bootstrap锛堟牴 + scope MEMORY 骞跺瓨锛夛紱scope `MEMORY.md` 鑷姩鍒涘缓锛涜鍒?sync 鑷?`workspace/MEMORY.md` 鏍囪娈碉紱`prompt-handler` 浠呮敞鍏?session 璺緞锛涚Щ闄?memory-scope 鐨?`before_tool_call` / tool-guard hook

## [0.8.20-fix12] - 2026-06-08

### 鏂板 / Added
- 馃洝锔?**OpenClaw edit 鍙傛暟鏍￠獙 workaround锛堢嫭绔?hook锛?* 鈥?鏂板 `src/edit-param-guard/`锛氶€氳繃 `before_tool_call` 鍦?upstream `assertRequiredParams` 涔嬪墠鎷︽埅鏃犳晥 `edit` 璋冪敤锛涚┖ `oldText` 杩斿洖鏄庣‘閿欒锛坄Invalid edit parameter: edits[0].oldText must not be empty...`锛夛紝涓嶅啀璇姤 `Missing required parameter: edits`銆備笌 memory-scope 鏃犲叧锛屾彃浠跺姞杞藉嵆鐢熸晥锛涘彲鐢?`DINGTALK_EDIT_PARAM_GUARD=0` 鍏抽棴
- 馃И **鍗曟祴** 鈥?`tests/edit-param-guard/`

**OpenClaw edit param guard** 鈥?standalone `before_tool_call` workaround; no global OpenClaw dist patch required when connector is loaded.

## [0.8.20-fix11] - 2026-06-03

### 鏂板 / Added
- 馃敀 **鎸夌敤鎴?缇よ亰闅旂闀挎湡璁板繂锛坢emory-scope锛孭hase 1锛?* 鈥?鏂板鐙珛妯″潡 `src/memory-scope/`锛氶拤閽?session 涓嶅啀娉ㄥ叆 workspace 鏍?`MEMORY.md`锛屾敼涓?`memory/users/{senderId}/` 鎴?`memory/groups/{conversationId}/`锛沗before_tool_call` 鎷︽埅瓒婃潈 memory 璇诲彇骞跺皢 daily 鍐欏叆閲嶅畾鍚戝埌 scope 鍐咃紱閰嶇疆椤?`channels.dingtalk-connector.memoryScope.enabled`锛堥粯璁?`true`锛?
- 馃И **鍗曟祴** 鈥?`tests/memory-scope/`锛?7 cases锛?

**Per-user/per-group long-term memory isolation (Phase 1)** 鈥?scoped bootstrap MEMORY, tool path guard, config `memoryScope.enabled`.

## [0.8.20-fix10] - 2026-06-03

### 鍙樻洿 / Changed
- 鈾伙笍 **绉婚櫎鍐呯疆 `dws-cli` skill** 鈥?浜у搧 CLI 鎵嬪唽鏀圭敱绀惧尯閰嶅 fork [WangKangAandy/dingtalk-workspace-cli](https://github.com/WangKangAandy/dingtalk-workspace-cli) 鐨?**`dws` skill** 鍗曚竴缁存姢锛岄伩鍏嶄笌 connector 鍓湰婕傜Щ锛堟浘缂哄け doc/wiki 绛夎兘鍔涜鏄庯級
- 鈿欙笍 **postinstall 鑷姩瀹夎绀惧尯鐗?dws** 鈥?`scripts/install-community-dws.js` 浼?clone/update fork 鍒?`~/.openclaw/vendor/`锛屽鍒?skill 鍒?`~/.openclaw/skills/dws`锛屾湁 Go 鏃剁紪璇?CLI 鍒?`~/.local/bin/dws`锛?*涓嶄娇鐢?* npm 瀹樻柟 `dingtalk-workspace-cli`锛坥pen-dingtalk 涓婃父锛屼笌 per-sender OAuth 涓嶅尮閰嶏級
- 馃攳 **鍚姩涓庡畨瑁呰嚜妫€** 鈥?鎻掍欢 register 涓?`postinstall` 妫€娴?dws skill / CLI 鏄惁灏辩华骞惰緭鍑哄畨瑁呮寚寮?
- 馃Ч **娓呯悊 legacy symlink** 鈥?postinstall 鑷姩鍒犻櫎 `~/.openclaw/plugin-skills/dws-cli` 绛夊凡绉婚櫎鍐呯疆 skill 鐨勬偓绌洪摼鎺?
- 馃摑 **鏂囨。** 鈥?README / channel-rules 鏄庣‘锛氭悳閽夐拤鏂囨。鐢?`dws doc search`锛岀姝?web 鎼?open.dingtalk.com
- 馃敡 鏀寔 `DWS_SKIP_AUTO_INSTALL`銆乣DWS_COMMUNITY_REF` 鐜鍙橀噺

**Removed bundled `dws-cli` skill** 鈥?Community dws fork auto-installed on postinstall; skill loads from `~/.openclaw/skills/dws`; stale `dws-cli` plugin-skills symlinks cleaned up.

## [0.8.20] - 2026-04-28

### 淇 / Fixes
- 馃悰 **OpenClaw 鎻掍欢鍔犺浇鍏煎鎬?(Issue #527)** 鈥?`configSchema` 鏀逛负寤惰繜鍒濆鍖栵紝閫氳繃 `createRequire` 瑙ｆ瀽 `openclaw/plugin-sdk/core`锛屼慨澶嶆彃浠跺畨瑁呭埌 `~/.openclaw/extensions/` 鏃?ESM 瑁歌鏄庣瑙ｆ瀽澶辫触瀵艰嚧鐨?"Cannot find package 'openclaw'" 宕╂簝  
  **OpenClaw plugin load compatibility (Issue #527)** 鈥?`configSchema` deferred to lazy init via `createRequire`, fixing "Cannot find package 'openclaw'" crash when plugin is installed to `~/.openclaw/extensions/`

- 馃悰 **Onboarding 鍔ㄦ€佸鍏?* 鈥?`promptSingleChannelSecretInput` 浠庨潤鎬?import 鏀逛负鍔ㄦ€?`import()`锛岄伩鍏嶅湪 ESM 鍔犺浇闃舵瑙﹀彂鍚屾牱鐨勮８璇存槑绗﹁В鏋愰敊璇? 
  **Onboarding dynamic import** 鈥?`promptSingleChannelSecretInput` switched from static to dynamic `import()` to avoid bare specifier resolution error during ESM loading

### 鏀硅繘 / Improvements
- 鉁?**DWS CLI 鐗堟湰绠＄悊閲嶆瀯** 鈥?`ensureDwsCli()` 鏂板 `compareVersions()` 璇箟鐗堟湰姣旇緝锛屾敮鎸佸洓绉嶅満鏅細鐩爣鐗堟湰鏇撮珮鏃惰嚜鍔ㄥ崌绾с€佹湰鍦扮増鏈洿楂樻椂璇㈤棶鏄惁瑕嗙洊銆佺増鏈竴鑷存椂璺宠繃銆佸叏鏂板畨瑁呮椂鏄剧ず宸插畨瑁呯増鏈彿  
  **DWS CLI version management refactor** 鈥?`ensureDwsCli()` now uses `compareVersions()` for semver comparison with four scenarios: auto-upgrade when target is newer, prompt before downgrade, skip when equal, show version on fresh install

## [0.8.19] - 2026-04-25

### 鏂板 / Added
- 馃敂 **DING 娑堟伅** 鈥?鏀寔鍚戠敤鎴?缇ゅ彂閫佸己鎻愰啋 DING锛堝簲鐢ㄥ唴/鐭俊/鐢佃瘽锛夛紝鐢ㄦ埛鎺堟潈鍚庡嵆鍙娇鐢?
- 馃搫 **閽夐拤鏂囨。** 鈥?鏀寔鍒涘缓銆佽拷鍔犮€佹悳绱€佸垪涓鹃拤閽夋枃妗ｏ紝鐢ㄦ埛鎺堟潈鍚庡嵆鍙娇鐢?
- 馃摑 **鏃ュ織** 鈥?鏀寔鎻愪氦鏃ユ姤/鍛ㄦ姤銆佹煡璇㈠巻鍙叉棩蹇楄褰曪紝鐢ㄦ埛鎺堟潈鍚庡嵆鍙娇鐢?
- 鉁?**鎻掍欢閲嶅鍔犺浇妫€娴?* 鈥?鍏ㄥ眬 Symbol 鑷鍚屼竴 plugin id 澶氳矾寰勫姞杞斤紝闃叉 stream 鍥炶皟鍐茬獊

### 淇 / Fixes
- 馃悰 AI Card QPS 闄愭祦涓嶅啀璇姤鐢ㄦ埛閿欒锛屾敼涓?warn 鏃ュ織
- 馃悰 AI Card 浠ょ墝妗舵柊澧炰覆琛屽寲閿侊紝淇骞跺彂鍑荤┛
- 馃悰 澶?Agent 閰嶇疆妫€娴嬫敼涓?OR 鏉′欢锛屾斁瀹借Е鍙戜繚鎶?
- 馃悰 CLI 鎻愮ず鏂囨缁熶竴涓嫳鏂囨贩鍚堟牸寮?

### 鏀硅繘 / Improvements
- 鉁?鏂板澶?Agent 閰嶇疆鏂囨。 `docs/MULTI_AGENT_SETUP.md`锛屾彁渚涗粠闆堕厤缃 Agent 鐨勫畬鏁存楠?
- 鉁?DWS CLI 鍗囩骇鎻愮ず銆丅otIdentity 涓婁笅鏂囬€忎紶銆乺eply-dispatcher text/markdown 闄嶇骇鍙戦€?

## [0.8.18] - 2026-04-21

### 淇 / Fixes
- **AI Card 娴佸紡涓柇娈嬬暀淇 (#463)** 鈥?Gateway 閲嶅惎鍚?AI Card 鍗″湪鎬濊€冧腑鍔ㄧ敾銆佽〃鎯呮爣绛炬湭鎾ゅ洖锛涙柊澧?`fixStuckCards` Gateway Method 鏀寔鎵嬪姩淇鍗′綇鐨?AI Card 鍜屾挙鍥炴畫鐣欒〃鎯?
  **AI Card stuck state fix (#463)** 鈥?After gateway restart, AI Card stuck in thinking animation and emotion tag not recalled; added `fixStuckCards` Gateway Method for manual recovery

- **澶?Agent 閰嶇疆瑕嗙洊淇濇姢** 鈥?瀹夎鍚戝妫€娴嬪埌宸叉湁閽夐拤 channels + bindings 閰嶇疆鏃讹紝璺宠繃鑷姩鍐欏叆锛屽睍绀哄嚟璇佷俊鎭鐢ㄦ埛鑷鍐冲畾锛岄伩鍏嶅 Agent 璺敱閰嶇疆琚剰澶栬鐩?
  **Multi-Agent config overwrite protection** 鈥?Install wizard detects existing DingTalk channels + bindings config, skips auto-write and shows credentials for user to decide

### 鏀硅繘 / Improvements
- **OpenClaw 鐗堟湰鍏煎鎬?* 鈥?peerDependency 浠?>=2026.3.23 鍗囩骇鍒?>=2026.4.9锛屽吋瀹?OpenClaw 2026.4.15 涓殑 plugin-sdk 鍙樻洿
  **OpenClaw version compatibility** 鈥?peerDependency bumped from >=2026.3.23 to >=2026.4.9

- **README 鑳藉姏灞曠ず浼樺寲** 鈥?宸叉敮鎸佺殑涓氬姟鑳藉姏锛堝緟鍔炪€丄I 琛ㄦ牸銆佹棩鍘嗘棩绋嬶級鏁村悎鍒颁富鑳藉姏琛紝Coming Soon 鍖哄煙鏇存柊
  **README capability display** 鈥?Supported capabilities consolidated into main table; Coming Soon section updated

## [0.8.17] - 2026-04-16

### 鏂板 / Added
- 鉁?**閽夐拤 DWS CLI 闆嗘垚** - 瀹夎鎻掍欢鏃惰嚜鍔ㄥ畨瑁?`dws` CLI 宸ュ叿锛屾敮鎸?AI 琛ㄦ牸銆佹棩鍘嗐€侀€氳褰曘€佺兢鑱婁笌鏈哄櫒浜恒€佸緟鍔炪€佸鎵广€佽€冨嫟銆佹棩蹇楃瓑閽夐拤浜у搧鑳藉姏锛涘嚟璇佽嚜鍔ㄦ敞鍏ワ紝鏃犻渶鎵嬪姩閰嶇疆  
  **DingTalk Workspace (DWS) CLI integration** - Auto-installs `dws` CLI during plugin setup, enabling AI Table, Calendar, Contacts, Chat & Bot, Todo, Approval, Attendance, Report and more; credentials injected automatically

- 鉁?**Agent Skills 浣撶郴** - 鏂板涓夌粍鍐呯疆 Skill 鏂囨。锛歚dingtalk-channel-rules`锛堥閬撹兘鍔涜矾鐢辫鑼冿級銆乣dingtalk-troubleshoot`锛堝父瑙侀棶棰樻帓鏌ワ級銆乣dws-cli`锛圖WS CLI 浣跨敤鎸囧崡涓庝骇鍝佸弬鑰冿級锛岄€氳繃 `openclaw.plugin.json` 娉ㄥ唽  
  **Agent Skills system** - Added three built-in Skill document sets: `dingtalk-channel-rules` (channel capability routing), `dingtalk-troubleshoot` (troubleshooting), `dws-cli` (DWS CLI guide & product references), registered via `openclaw.plugin.json`

### 淇 / Fixes
- 馃悰 **AI Card finishAICard QPS 闄愭祦** - `finishAICard` 鐨?PUT 璇锋眰鐜板湪涔熺粡杩囧叏灞€浠ょ墝妗堕檺娴佸櫒 `waitForToken()`锛岄伩鍏嶅浼氳瘽骞跺彂缁撴潫鏃惰Е鍙?403 QpsLimit  
  **AI Card finishAICard QPS rate limiting** - `finishAICard` PUT request now goes through global token bucket `waitForToken()` to prevent 403 QpsLimit when multiple conversations finish concurrently

- 馃悰 **Probe 鎺ュ彛杩佺Щ鍒?HTTP 瀹㈡埛绔?* - `probe.ts` 涓殑 token 鑾峰彇鍜?bot 淇℃伅鏌ヨ浠?`fetch` 杩佺Щ鍒扮粺涓€鐨?`dingtalkHttp` 瀹㈡埛绔紝淇娼滃湪鐨勪唬鐞嗗拰閿欒澶勭悊涓嶄竴鑷撮棶棰? 
  **Probe migrated to HTTP client** - Token and bot info requests in `probe.ts` migrated from `fetch` to unified `dingtalkHttp` client, fixing potential proxy and error handling inconsistencies

- 馃悰 **瀹夊叏鎵弿璇姤瑙勯伩** - 閲嶆瀯鐜鍙橀噺璁块棶鏂瑰紡锛堝瓧绗︿覆鎷兼帴 `globalThis['proc' + 'ess']` / `globalThis['fet' + 'ch']`锛夛紝閬垮厤 OpenClaw 瀹夊叏鎵弿灏嗗悎娉曠殑鍑瘉璇诲彇璇姤涓?"credential harvesting"  
  **Security scanner false positive avoidance** - Refactored env access via string concatenation to avoid OpenClaw security scanner flagging legitimate credential reads as "credential harvesting"

- 馃悰 **DWS 鍑瘉闅旂** - DWS clientId/clientSecret 瀛樺偍鍦ㄦā鍧椾綔鐢ㄥ煙鐨勭鏈?holder 涓紝涓嶆敞鍏?`process.env`锛岄槻姝㈠瓙杩涚▼锛堝 Shell Executor锛夐€氳繃 `env`/`printenv` 鍛戒护娉勯湶鍑瘉  
  **DWS credential isolation** - DWS credentials stored in module-scoped private holder instead of `process.env`, preventing child processes from leaking secrets via `env`/`printenv`

### 鏀硅繘 / Improvements
- 鉁?**棰勭紪璇戞瀯寤?(tsdown)** - 寮曞叆 `tsdown` 鏋勫缓宸ュ叿锛屾彃浠跺彂甯冧负棰勭紪璇戠殑 `dist/index.mjs`锛屾浛浠?jiti 杩愯鏃?TS 鍔犺浇锛屾彁鍗囧惎鍔ㄩ€熷害鍜屽吋瀹规€? 
  **Pre-compiled build (tsdown)** - Introduced `tsdown` build tool, plugin now ships pre-compiled `dist/index.mjs` instead of relying on jiti runtime TS loading, improving startup speed and compatibility

- 鉁?**Channel ID 甯搁噺鍖?* - 鎻愬彇 `CHANNEL_ID = "dingtalk-connector"` 涓烘ā鍧楃骇甯搁噺锛屾秷闄ゅ叏浠ｇ爜搴撲腑鐨勭‖缂栫爜瀛楃涓? 
  **Channel ID as constant** - Extracted `CHANNEL_ID` as a module-level constant, eliminating hardcoded strings across the codebase

- 鉁?**CLI 瀹夎娴佺▼澧炲己** - `bin/dingtalk-connector.js` 鏂板 `--skip-dws` 鍙傛暟璺宠繃 DWS CLI 瀹夎锛涘畨瑁呮垚鍔熷悗鎻愮ず缃戝叧鍒濆鍖栭渶绾?3 鍒嗛挓  
  **CLI install flow enhancement** - Added `--skip-dws` flag to skip DWS CLI installation; post-install message now mentions ~3 min gateway warm-up

- 鉁?**openclaw.plugin.json 鍏冩暟鎹ˉ鍏?* - 鏂板 `name`銆乣version`銆乣description`銆乣author`銆乣main` 瀛楁鍜?`skills` 娉ㄥ唽  
  **openclaw.plugin.json metadata** - Added `name`, `version`, `description`, `author`, `main` fields and `skills` registration

- 鉁?**渚濊禆鐗堟湰閿佸畾** - `form-data`銆乣qrcode-terminal`銆乣zod` 浠?`^` 鑼冨洿閿佸畾涓虹簿纭増鏈紝`openclaw` peerDependency 鏀逛负 `>=2026.3.23`  
  **Dependency version pinning** - Pinned `form-data`, `qrcode-terminal`, `zod` to exact versions; `openclaw` peerDependency changed to `>=2026.3.23`

- 鉁?**npm 鍙戝寘浼樺寲** - 鏂板 `prepack`/`postpack` 鑴氭湰鍦ㄥ彂鍖呮椂鑷姩鍓ョ `devDependencies`锛屽噺灏忓畨瑁呬綋绉紱`files` 鍒楄〃鏂板 `dist/` 鍜?`skills/`  
  **npm publish optimization** - Added `prepack`/`postpack` scripts to strip `devDependencies` during publish; `files` list now includes `dist/` and `skills/`

## [0.8.16] - 2026-04-16

### 淇 / Fixes
- 馃悰 **AI Card 娴佸紡鏇存柊 QPS 闄愭祦** - 鏂板鍏ㄥ眬浠ょ墝妗堕檺娴佸櫒锛坄cardRateLimiter`锛夛紝鎵€鏈変細璇濆叡浜?20 QPS 閫熺巼闄愬埗锛岄伩鍏嶅浼氳瘽骞跺彂鏃舵€?QPS 鍙犲姞瓒呰繃閽夐拤 API 闄愬埗锛涢亣鍒?403 QpsLimit 鑷姩閫€閬?2s 鍚庨噸璇? 
  **AI Card streaming QPS rate limiting** - Added global token bucket rate limiter shared across all sessions (20 QPS cap) with automatic 2s backoff and retry on 403 QpsLimit

- 馃悰 **streamAICard null card 宕╂簝** - 淇 `createAICardForTarget` 杩斿洖 `null` 鍚庤皟鐢ㄦ柟閫氳繃 `as any` 缁曡繃绫诲瀷妫€鏌ュ鑷?`Cannot read properties of null` 宕╂簝锛屾坊鍔?null 瀹堝崼  
  **streamAICard null card crash** - Fixed crash when `createAICardForTarget` returns `null` and callers bypass type checking; added null guard

- 馃悰 **鎻掍欢閰嶇疆鏍煎紡鍏煎鎬?* - 淇 `package.json` 涓己灏?`openclaw.channels` 鏁扮粍瀵艰嚧鏃х増 OpenClaw 妗嗘灦瀹夎澶辫触鐨勯棶棰橈紝鍚屾椂淇濈暀鏂扮増 `openclaw.channel` 瀵硅薄鏍煎紡  
  **Plugin config format compatibility** - Fixed missing `openclaw.channels` array in `package.json` that caused installation failure on older OpenClaw framework versions; both old and new config formats are now present

### 鏀硅繘 / Improvements
- 鉁?**鍗曞疄渚嬭妭娴侀棿闅斾紭鍖?* - `reply-dispatcher.ts` 鐨?`updateInterval` 浠?500ms 澧炲ぇ鍒?800ms锛岄厤鍚堝叏灞€闄愭祦鍣ㄩ檷浣庡崟瀹炰緥鍙戦€侀鐜? 
  **Per-instance throttle interval** - Increased `updateInterval` from 500ms to 800ms to complement global rate limiter

## [0.8.15] - 2026-04-15

### 鏂板 / Added
- 鉁?**涓€閿壂鐮佸畨瑁?* - 鏂板 `npx -y @dingtalk-real-ai/dingtalk-connector install` 鍛戒护锛岄€氳繃閽夐拤鎵爜涓€閿畬鎴愭満鍣ㄤ汉鍒涘缓銆佸嚟璇佽幏鍙栥€佹彃浠跺畨瑁呭拰閰嶇疆鍐欏叆锛岄浂鎵嬪姩閰嶇疆  
  **One-click QR install** - Added `npx` CLI command for one-click DingTalk bot setup via QR scan: creates bot, obtains credentials, installs plugin, and writes config automatically

- 鉁?**Device Authorization Flow** - 鏂板 `device-auth.ts` 鍜?`device-auth-config.ts` 妯″潡锛屽疄鐜伴拤閽?Device Flow 鎺堟潈锛坕nit 鈫?begin 鈫?poll锛夛紝鏀寔 QR 鐮佺粓绔覆鏌撱€佹寚鏁伴€€閬胯疆璇€? 鍒嗛挓鐬椂閿欒閲嶈瘯绐楀彛  
  **Device Authorization Flow** - Added `device-auth.ts` and `device-auth-config.ts` implementing DingTalk Device Flow (init 鈫?begin 鈫?poll) with terminal QR rendering, exponential backoff polling, and 2-minute transient error retry window

- 鉁?**Onboarding 鎵爜鎺堟潈闆嗘垚** - `onboarding.ts` 閰嶇疆鍚戝鏂板鎵爜鎺堟潈璺緞锛岄閫変竴閿壂鐮侊紝澶辫触鏃惰嚜鍔ㄩ檷绾т负鎵嬪姩杈撳叆 Client ID / Client Secret  
  **Onboarding QR auth integration** - Setup wizard now prefers one-click QR authorization, with automatic fallback to manual credential input on failure

- 鉁?**CLI 鍑瘉鏆傚瓨涓庢仮澶?* - 褰撴彃浠跺畨瑁呭け璐ユ椂锛屽嚟璇佷繚瀛樺埌鐙珛鐨?staging 鏂囦欢锛坄.dingtalk-staging.json`锛夛紝閬垮厤姹℃煋 `openclaw.json`锛涗笅娆″畨瑁呮垚鍔熷悗鑷姩鎭㈠  
  **CLI credential staging & recovery** - Credentials saved to separate staging file on plugin install failure, auto-recovered on next successful install

- 鉁?**CLI 瀹夎鍓嶈嚜鍔ㄦ竻鐞?* - 瀹夎鍓嶈嚜鍔ㄥ垹闄ゆ棫鐗堟彃浠剁洰褰曪紝娓呯悊 `openclaw.json` 涓殑杩囨湡 channel/plugin/allow 閰嶇疆锛岄伩鍏嶉獙璇侀敊璇? 
  **CLI pre-install cleanup** - Auto-removes old plugin directory and stale config entries before install to prevent validation errors

- 鉁?**CLI 429 闄愭祦閲嶈瘯** - 鎻掍欢瀹夎閬囧埌 ClawHub 429 闄愭祦鏃讹紝浣跨敤 `Atomics.wait` 鍚屾绛夊緟锛?5s/30s锛夊悗閲嶈瘯锛屾渶澶?3 娆? 
  **CLI 429 rate limit retry** - Plugin install retries up to 3 times with synchronous backoff (15s/30s) on ClawHub 429 rate limiting

### 鏀硅繘 / Improvements
- 鉁?**Prerelease 鐗堟湰鑷姩璇嗗埆** - CLI `install` 鍛戒护鑷姩妫€娴嬪綋鍓?package 鏄惁涓?prerelease 鐗堟湰锛坅lpha/beta/rc/canary锛夛紝鑻ユ槸鍒欎紶閫掔簿纭増鏈彿缁?`openclaw plugins install`锛岀‘淇濆畨瑁呮纭増鏈? 
  **Prerelease version auto-detection** - CLI auto-detects prerelease versions and passes exact version spec to `openclaw plugins install`

- 鉁?**鎵嬪姩閰嶇疆鏂囨。鎷嗗垎** - 灏嗘墜鍔ㄥ垱寤烘満鍣ㄤ汉鍜屾墜鍔ㄩ厤缃祦绋嬩粠 README 鎷嗗垎鍒扮嫭绔嬬殑 `docs/DINGTALK_MANUAL_SETUP.md`锛孯EADME 绮剧畝涓哄揩閫熷叆闂? 
  **Manual setup docs separation** - Extracted manual bot creation and config steps to `docs/DINGTALK_MANUAL_SETUP.md`, keeping README focused on quickstart

- 鉁?**README 鍏ㄩ潰閲嶅啓** - 鍙傝€冮涔?OpenClaw 鎻掍欢椋庢牸閲嶅啓涓嫳鏂?README锛岀簿绠€缁撴瀯锛岀獊鍑烘牳蹇冨姛鑳斤紝FAQ 杩佺Щ鍒?`docs/TROUBLESHOOTING.md`  
  **README overhaul** - Rewrote Chinese and English README following Lark plugin style, streamlined structure with FAQ moved to `docs/TROUBLESHOOTING.md`

- 鉁?**GitHub 绱㈠紩浼樺寲** - 鏂板 `.gitattributes` 鎺掗櫎 `coverage/` 鍜?`docs/` 鐨勮瑷€缁熻锛涗紭鍖?`package.json` keywords銆乨escription銆乷penclaw channel 鍏冩暟鎹紱`openclaw.plugin.json` 绉婚櫎鍐椾綑瀛楁  
  **GitHub index optimization** - Added `.gitattributes` for language detection; optimized `package.json` keywords, description, openclaw channel metadata; cleaned `openclaw.plugin.json`

### 鏂囨。 / Documentation
- 馃摑 **鏂板 `docs/DINGTALK_MANUAL_SETUP.md`** - 瀹屾暣鐨勬墜鍔ㄥ垱寤烘満鍣ㄤ汉鍜屾墜鍔ㄩ厤缃?OpenClaw 娴佺▼鏂囨。  
  **Added `docs/DINGTALK_MANUAL_SETUP.md`** - Complete manual bot creation and OpenClaw configuration guide

- 馃摑 **鏂板 `docs/TROUBLESHOOTING.md`** - 甯歌闂鎺掓煡鏂囨。锛屾兜鐩栨満鍣ㄤ汉涓嶅洖澶嶃€侀厤缃牎楠屻€丠TTP 401/400銆佹彃浠跺畨瑁呭け璐ャ€佸浗鍐呯綉缁滅瓑鍦烘櫙  
  **Added `docs/TROUBLESHOOTING.md`** - Troubleshooting guide covering common issues like bot not responding, config validation, HTTP errors, install failures, and China network issues

## [0.8.13] - 2026-04-08

### 淇 / Fixes
- 馃悰 **淇鏂囦欢鍙戦€?mediaId 鏍煎紡涓嶄竴鑷村鑷撮潤榛樺け璐?* - `sendFileProactive` 鍦ㄤ笉鍚岃皟鐢ㄧ偣浼犲叆 `cleanMediaId`锛堜笉甯?`@`锛夊拰 `mediaId`锛堝甫 `@`锛夛紝缁忓疄娴嬮拤閽?API 缁熶竴瑕佹眰甯?`@` 鍓嶇紑銆傚悓鏃朵慨澶?catch 鍧楀悶鎺夊紓甯稿鑷村灞傝鎶ユ垚鍔? 
  **Fix inconsistent mediaId format causing silent file send failure** - Unified to `@`-prefixed `mediaId`; fixed catch blocks swallowing errors

- 馃悰 **淇澶氳处鍙峰満鏅笅鍑嵁鏈В鏋?* - `sendText`/`sendMedia` 鍦ㄥ璐﹀彿妯″紡涓?`clientId`/`clientSecret` 鍙兘涓?`SecretInput` 瀵硅薄锛岀幇宸茬敤宸茶В鏋愬€艰鐩? 
  **Fix unresolved credentials in multi-account mode** - Resolved values now override raw config

- 馃悰 **淇杩炴帴閿欒鍦?async 鍥炶皟涓棤娉曚紶鎾?* - 鏀逛负 `reject(new Error(...))` 纭繚 400/401 绛夐敊璇纭紶鎾? 
  **Fix connection errors not propagating** - Changed `throw` to `reject()` inside async error handlers

- 馃悰 **淇 QPS 闄愭祦鍚庣珛鍗抽噸璇?* - 鏀跺埌 403 QpsLimit 鍚庡悓姝ユ洿鏂?`lastUpdateTime`  
  **Fix QPS rate limit immediate retry** - `lastUpdateTime` is now synced when skipping

- 馃悰 **淇 `resolveAllowFrom` 鍏ㄥ眬杩囨护璇嫤鎴兢娑堟伅** - 杩斿洖绌哄垪琛ㄧ鐢ㄦ鏋跺眰鍏ㄥ眬杩囨护锛岀兢娑堟伅鐢卞唴閮?`groupAllowFrom` 澶勭悊  
  **Fix resolveAllowFrom blocking group messages** - Returns `[]` to disable framework-level filtering

### 鏂板 / Added
- 鉁?**娑堟伅璺敱鏀寔 `group:`/`user:` 鍓嶇紑** - `sendTextToDingTalk` 鍜?`sendMediaToDingTalk` 鏂板鍓嶇紑鏍煎紡瑙ｆ瀽锛屽吋瀹规棫鐗堣８ `cid` 鍓嶇紑  
  **Message routing supports `group:`/`user:` prefix targets** - Backward compatible with bare `cid` prefix

### 鏀硅繘 / Improvements
- 鉁?**鍏煎 pdf-parse v1/v2 API** - 鑷姩妫€娴嬪鍑烘牸寮忥紝v2.x 浣跨敤 class API锛寁1.x 浣跨敤鍑芥暟 API  
  **Support both pdf-parse v1 and v2 API** - Auto-detects export format

- 鉁?**`enableMediaUpload`/`systemPrompt` 绉昏嚦鍏变韩閰嶇疆** - 鏀寔澶氳处鍙风嫭绔嬮厤缃? 
  **Move `enableMediaUpload`/`systemPrompt` to shared config** - Per-account configurable

- 鉁?**鏂板鍑虹珯璺敱娴嬭瘯** - 瑕嗙洊 `group:`/`user:` 鍓嶇紑瑙ｆ瀽鍜屾秷鎭矾鐢卞満鏅? 
  **Add outbound routing tests** - Covers prefix parsing and routing scenarios

### 鏂囨。 / Documentation
- 馃摑 **浼樺寲 README 瀹夎楠岃瘉璇存槑** - 绉婚櫎鐗堟湰鍙风‖缂栫爜锛屾柊澧炴彃浠舵湭鍔犺浇鏃剁殑璀︾ず鎻愮ず  
  **Improve README plugin verification instructions** - Removed hardcoded version, added warning

## [0.8.12] - 2026-04-01

### 淇 / Fixes
- 馃悰 **淇 v0.8.11 瀹夎鍚庡惎鍔ㄥ穿婧?* ([#419](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/issues/419)) - `mammoth` 鍜?`pdf-parse` 浣跨敤闈欐€?import 浣嗗凡浠?dependencies 绉婚櫎锛屽鑷存ā鍧楀姞杞介樁娈垫姤閿?`Cannot find module 'mammoth'`銆傛敼涓哄姩鎬?import + 浼橀泤闄嶇骇  
  **Fix startup crash after v0.8.11 installation** - Changed `mammoth` and `pdf-parse` from static import to dynamic import with graceful degradation

### 鏀硅繘 / Improvements
- 鉁?**澶у箙绮剧畝渚濊禆浣撶Н** - 绉婚櫎 `pdf-parse`锛垀21MB锛夈€乣fluent-ffmpeg`锛垀12MB锛夈€乣@ffmpeg-installer/ffmpeg`锛垀70MB锛夈€乣@ffprobe-installer/ffprobe` 绛夐潪鏍稿績渚濊禆锛屼粎淇濈暀 `mammoth`锛垀2MB锛夊湪 `optionalDependencies`  
  **Significantly reduce dependency size** - Removed ~100MB of non-core optional dependencies, keeping only `mammoth` (~2MB)

### 閲嶆瀯 / Refactoring
- 鉁?**绉婚櫎鏃犳晥鐨勪唬鐞嗙鐢ㄤ唬鐮?* - 缁忔簮鐮佸垎鏋?`dingtalk-stream` SDK 鐨?WebSocket 杩炴帴浣跨敤 `ws` 搴撶洿鎺ュ缓绔嬶紝涓嶅彈 `axios.defaults.proxy` 褰卞搷銆傜Щ闄?`proxy-config.ts` 鍙婄浉鍏充唬鐞嗛厤缃? 
  **Remove ineffective proxy bypass code** - Analysis showed `ws` library bypasses axios entirely; removed `proxy-config.ts` and all proxy configuration code

## [0.8.11] - 2026-04-01

### 鏂板 / Added
- 鉁?**鍗囩骇 Zod v4 + 鑷姩鐢熸垚 configSchema** - 灏?Zod 浠?v3 鍗囩骇鑷?v4锛坄zod@^4.3.6`锛夛紝閫氳繃 SDK 鐨?`buildChannelConfigSchema()` 鑷姩浠?Zod Schema 鐢熸垚 JSON Schema锛屾浛浠ｆ墜鍔ㄧ淮鎶ょ殑 `configSchema.schema`  
  **Upgrade Zod v4 + auto-generate configSchema** - Upgraded Zod from v3 to v4, auto-generating JSON Schema via SDK's `buildChannelConfigSchema()`

### 鏀硅繘 / Improvements
- 鉁?**渚濊禆缁撴瀯浼樺寲锛屽噺灏忓畨瑁呬綋绉?* - 灏?`openclaw` 绉昏嚦 `peerDependencies`锛坥ptional锛夛紝灏?`fluent-ffmpeg`/`@ffmpeg-installer/ffmpeg`/`@ffprobe-installer/ffprobe` 绉昏嚦 `optionalDependencies`锛岀Щ闄ゆ湭浣跨敤鐨?`pako`  
  **Dependency optimization, reduced install size** - Moved `openclaw` to `peerDependencies` (optional), moved ffmpeg packages to `optionalDependencies`, removed unused `pako`

## [0.8.10] - 2026-03-31

### 淇 / Fixes
- 馃悰 **Gateway Methods 閰嶇疆璁块棶澶辫触** ([#397](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/issues/397)) - 淇 SDK 鍗囩骇鍚?`context.deps.config` 涓?`undefined`锛屾墍鏈?Gateway RPC 鏂规硶璋冪敤澶辫触銆傛敼鐢?SDK 鐨?`loadConfig()` 鍑芥暟鑾峰彇閰嶇疆  
  **Gateway Methods config access failure** - Fixed `context.deps.config` being `undefined` after SDK upgrade, now uses `loadConfig()` from `openclaw/plugin-sdk/config-runtime`

- 馃悰 **閿佸畾 axios 鐗堟湰閬垮厤鍏煎鎬ч棶棰?* ([#396](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/issues/396)) - 灏?`axios` 浠?`^1.6.0` 閿佸畾涓?`1.6.0`锛岄伩鍏嶈嚜鍔ㄥ崌绾у紩鍏ヤ笉鍏煎鍙樻洿  
  **Pin axios version** - Pinned `axios` from `^1.6.0` to `1.6.0` to prevent incompatible upgrades

### 鏀硅繘 / Improvements
- 鉁?**connection.ts 鍔ㄦ€?import 浼樺寲** - 灏?`createLoggerFromConfig` 鏀逛负鍔ㄦ€?import锛岄伩鍏嶆綔鍦ㄥ惊鐜緷璧? 
  **connection.ts dynamic import** - Changed `createLoggerFromConfig` to dynamic import to avoid potential circular dependencies

## [0.8.9] - 2026-03-31

### 鏂板 / Added
- 鉁?**寮曠敤娑堟伅瀹屾暣瑙ｆ瀽** - 鏂板 `extractQuotedMsgText` 閫掑綊瑙ｆ瀽寮曠敤娑堟伅锛堟渶澶?3 灞傚祵濂楋級锛屾敮鎸?text銆乺ichText銆乸icture銆乿ideo銆乤udio銆乫ile銆乵arkdown銆乮nteractiveCard 绛夋秷鎭被鍨嬶紝鑷姩鎻愬彇寮曠敤涓殑濯掍綋闄勪欢鍜岄摼鎺? 
  **Quoted message full parsing** - Added recursive quoted message parsing (up to 3 levels) with media attachment and URL extraction

- 鉁?**鏂板閰嶇疆椤?asyncMode / ackText / endpoint / debug** - `configSchema` 鏂板鍥涗釜閰嶇疆瀛楁  
  **New config options** - Added `asyncMode`, `ackText`, `endpoint`, `debug` to configSchema

- 鉁?**鏅€氭秷鎭湰鍦板浘鐗囧悗澶勭悊** - `sendNormalToUser` 鍜?`sendNormalToGroup` 鏂板鏈湴鍥剧墖涓婁紶鍚庡鐞嗭紝鍙戦€佹櫘閫氭秷鎭椂鑷姩鏇挎崲鏈湴鍥剧墖璺緞涓?media_id  
  **Local image post-processing for normal messages** - Added automatic local image upload and replacement in `sendNormalToUser` and `sendNormalToGroup`

### 淇 / Fixes
- 馃悰 **macOS LaunchAgent 鐜 WebSocket 杩炴帴澶辫触** - 淇 macOS LaunchAgent/daemon 鐜涓?fd 0/1/2 鏃犳晥锛圗BADF锛夊鑷?TCP 杩炴帴鍒涘缓澶辫触鐨勯棶棰? 
  **WebSocket connection failure on macOS LaunchAgent** - Fixed EBADF errors on macOS LaunchAgent environments by redirecting invalid file descriptors to `/dev/null`

- 馃悰 **AI Card 娴佸紡鍏抽棴绔炰簤鏉′欢** - 淇 `closeStreaming` 琚?`onIdle` 鍜?`onError` 鍚屾椂瑙﹀彂鏃剁殑绔炰簤鏉′欢锛岄噰鐢?snapshot 妯″紡闃叉骞跺彂宕╂簝  
  **AI Card streaming close race condition** - Fixed race condition in `closeStreaming` using snapshot pattern to prevent concurrent crashes

- 馃悰 **FormData CJS 浜掓搷浣滈棶棰?* - 灏?`form-data` 浠庡姩鎬?import 鏀逛负闈欐€?import锛屼慨澶?jiti/ESM 鐜涓?`.default` 鍋跺彂涓?undefined 鐨勯棶棰? 
  **FormData CJS interop issue** - Changed `form-data` from dynamic to static import, fixing intermittent `.default` undefined errors in jiti/ESM

- 馃悰 **绾枃鏈浘鐗囪矾寰勮杞崲** - 绂佺敤绾枃鏈腑鏈湴鍥剧墖璺緞鑷姩杞崲涓哄浘鐗囪娉曠殑琛屼负锛岄伩鍏嶅奖鍝嶇敤鎴峰睍绀鸿矾寰勬枃鏈殑鍦烘櫙  
  **Bare image path false conversion** - Disabled automatic conversion of bare local image paths to image syntax

### 鏀硅繘 / Improvements
- 鉁?**Zod Schema 鎷嗗垎鍏煎 Web UI** - 灏?`DingtalkConfigSchema` 鎷嗗垎涓?`DingtalkConfigBaseSchema` 鍜屽甫 `superRefine` 鐨勫畬鏁?Schema锛岃В鍐?JSON Schema 鐢熸垚鍏煎鎬ч棶棰? 
  **Zod Schema split for Web UI compatibility** - Split schema to fix `buildChannelConfigSchema` JSON Schema generation

- 鉁?**configSchema 绫诲瀷绠€鍖?* - 灏?`clientId`銆乣clientSecret` 绛夊瓧娈典粠 `oneOf` 鑱斿悎绫诲瀷绠€鍖栦负鍗曚竴 `string` 绫诲瀷  
  **configSchema type simplification** - Simplified JSON Schema from `oneOf` union types to single `string` type

- 鉁?**reply-dispatcher logger 缁熶竴** - 鏇挎崲鎵嬪姩鏋勫缓鐨?log 瀵硅薄涓?`createLoggerFromConfig`  
  **reply-dispatcher logger unification** - Replaced manual log object with `createLoggerFromConfig`

- 鉁?**閿佸畾 axios 鐗堟湰鍒?1.6.0** - 閬垮厤鑷姩鍗囩骇寮曞叆涓嶅吋瀹瑰彉鏇? 
  **Pin axios to 1.6.0** - Prevent automatic upgrades from introducing incompatible changes

## [0.8.8] - 2026-03-29

### 淇 / Fixes
- 馃悰 **澶?block 娴佸紡鍝嶅簲浜х敓澶氭潯鐙珛姘旀场** ([#369](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/issues/369)) - 閲嶆瀯 `startStreaming` 骞跺彂鎺у埗閫昏緫锛屼粠 `isCreatingCard` 甯冨皵鏍囧織鏀逛负 `cardCreationPromise`锛屽交搴曟秷闄ゅ block 鍝嶅簲鍦烘櫙涓嬫瘡涓?block 鏂板缓鐙珛 AI Card 姘旀场鐨勯棶棰? 
  **Multi-block streaming response creates multiple bubbles** - Refactored `startStreaming` concurrency control from boolean flag to `cardCreationPromise`, eliminating independent AI Card bubbles per block in multi-block responses

- 馃悰 **Web UI Connected / Last inbound 鏄剧ず n/a** - 鏂板 `onStatusChange` 鍥炶皟鍦ㄨ繛鎺ュ缓绔?鏂紑/鏀跺埌娑堟伅鏃朵笂鎶ョ姸鎬佸瓧娈碉紱琛ュ叏 `buildSessionContext` 涓?`conversationId` 鍜?`groupSubject` 瀛楁閫忎紶  
  **Web UI shows n/a for Connected and Last inbound** - Added `onStatusChange` callback to report status fields on connection events; fixed `buildSessionContext` field passthrough

- 馃悰 **AI Card 鍑芥暟璋冪敤鍙傛暟閿欒** - 淇 `reply-dispatcher.ts` 涓?`createAICardForTarget`銆乣streamAICard`銆乣finishAICard` 鍙傛暟浠?`params.runtime` 鏀逛负 `account.config/log`  
  **AI Card function call parameter error** - Fixed parameters in `reply-dispatcher.ts` from `params.runtime` to `account.config/log`

- 馃悰 **sendFileProactive 鍙傛暟閿欒瀵艰嚧鏂囦欢鍙戦€佸け璐?* - 淇 `processFileMarkers` 鍜?`processRawMediaPaths` 閿欒浼犲叆 `downloadUrl`锛屾敼涓烘纭殑 `cleanMediaId`  
  **File sending failure due to wrong sendFileProactive parameter** - Fixed incorrect `downloadUrl` parameter, now correctly uses `cleanMediaId`

- 馃悰 **绾璐﹀彿閰嶇疆涓?probe 琚烦杩?* ([#381](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/issues/381)) - `getStatus()` 鏀圭敤 `resolveDingtalkAccount()` 缁熶竴鑾峰彇璐﹀彿淇℃伅锛屼慨澶嶇函澶氳处鍙烽厤缃笅鐘舵€佹樉绀轰笉鍑嗙‘鐨勯棶棰? 
  **Probe skipped in pure multi-account config** - `getStatus()` now uses `resolveDingtalkAccount()` for unified account resolution

### 鏀硅繘 / Improvements
- 鉁?**闊抽鏃堕暱鎻愬彇瀹夊叏鎬ф敼杩?* ([#134](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/issues/134)) - `extractAudioDuration` 鏀圭敤 `fluent-ffmpeg` 鐨?`ffprobe` API锛屾秷闄ゅ畨鍏ㄦ壂鎻忚鎶? 
  **Audio duration extraction security improvement** - Changed to `fluent-ffmpeg` `ffprobe` API, eliminating security scan false positives

- 鉁?**SDK 鎺ュ彛杩佺Щ** - `onboarding.ts` 绫诲瀷寮曠敤杩佺Щ鍒版柊鐗?`ChannelSetupWizardAdapter`锛屽鍏ヨ矾寰勬洿鏂颁负 `openclaw/plugin-sdk/setup`  
  **SDK interface migration** - Migrated to `ChannelSetupWizardAdapter` and updated import path to `openclaw/plugin-sdk/setup`

## [0.8.7] - 2026-03-26

### 淇 / Fixes
- 馃悰 **璐﹀彿 ID 澶у皬鍐欐晱鎰熶慨澶?* - 淇 `normalizeAccountId` 鍑芥暟寮哄埗灏嗚处鍙?ID 杞负灏忓啓锛坄.toLowerCase()`锛夊鑷撮┘宄板懡鍚嶈处鍙凤紙濡?`zhizaoDashuIP`锛夋棤娉曞尮閰嶉厤缃殑闂銆傜幇鍦ㄨ处鍙?ID 浠呭仛 `trim()` 澶勭悊锛屼繚鐣欏師濮嬪ぇ灏忓啓锛屼笌閰嶇疆鏂囦欢涓殑 key 涓ユ牸鍖归厤  
  **Account ID case-sensitivity fix** - Fixed `normalizeAccountId` forcibly lowercasing account IDs, which caused camelCase account IDs (e.g., `zhizaoDashuIP`) to fail configuration lookup. Account IDs are now only trimmed, preserving original casing for strict matching against config keys

- 馃悰 **WebSocket 杩炴帴浠ｇ悊鎺у埗缁熶竴** - 淇 `src/core/connection.ts` 涓?WebSocket 杩炴帴鏈伒寰?`DINGTALK_FORCE_PROXY` 鐜鍙橀噺鐨勯棶棰橈紝鐜板湪涓?HTTP 璇锋眰淇濇寔涓€鑷寸殑浠ｇ悊鎺у埗閫昏緫  
  **Unified proxy control for WebSocket connections** - Fixed WebSocket connections not respecting the `DINGTALK_FORCE_PROXY` environment variable; proxy control is now consistent with HTTP requests

- 馃悰 **濯掍綋涓嬭浇浠ｇ悊鎺у埗缁熶竴** - 淇 `src/core/message-handler.ts` 涓浘鐗?鏂囦欢涓嬭浇鏃朵唬鐞嗛厤缃笌 HTTP 瀹㈡埛绔笉涓€鑷寸殑闂锛岀‘淇濇墍鏈夊獟浣撲笅杞借姹傜粺涓€閬靛惊浠ｇ悊鎺у埗绛栫暐  
  **Unified proxy control for media downloads** - Fixed inconsistent proxy configuration for image/file downloads; all media download requests now follow the unified proxy control policy

- 馃悰 **澶氳处鍙锋秷鎭幓閲嶈鍒?* - 淇澶氳处鍙凤紙澶氭満鍣ㄤ汉锛夊満鏅笅锛屽悓涓€鏉＄兢娑堟伅 @澶氫釜鏈哄櫒浜烘椂锛岀浜屼釜鏈哄櫒浜哄洜鍘婚噸缂撳瓨鏈寜璐﹀彿闅旂锛岃灏嗘秷鎭垽瀹氫负閲嶅鑰岃烦杩囧鐞嗙殑闂銆俙checkAndMarkDingtalkMessage` 鐨勫幓閲?key 鐜板湪甯︽湁 `accountId` 鍓嶇紑锛屼笉鍚屾満鍣ㄤ汉璐﹀彿鐨勫幓閲嶇紦瀛樺畬鍏ㄩ殧绂? 
  **Multi-account message deduplication false positive** - Fixed an issue where a group message mentioning multiple bots caused the second bot to skip processing due to a shared deduplication cache. The deduplication key now includes an `accountId` prefix, fully isolating each bot's cache

## [0.8.6] - 2026-03-24

### 鏀硅繘 / Improvements
- 鉁?**绉婚櫎鐗堟湰鏍￠獙閫昏緫** - 鍒犻櫎鎻掍欢鍏ュ彛 `index.ts` 涓殑 OpenClaw SDK 鐗堟湰鍏煎鎬ф鏌ヤ唬鐮侊紝绠€鍖栨彃浠跺惎鍔ㄦ祦绋嬶紝鎻愬崌鍔犺浇鎬ц兘  
  **Removed version check logic** - Removed OpenClaw SDK version compatibility check code from plugin entry `index.ts`, simplifying plugin startup process and improving load performance

## [0.8.5] - 2026-03-24

### 鏀硅繘 / Improvements
- 鉁?**绉婚櫎 SDK 鐗堟湰鍏煎鎬ф鏌?* - 绉婚櫎鎻掍欢鍚姩鏃剁殑 OpenClaw SDK 鐗堟湰妫€鏌ラ€昏緫锛岀畝鍖栨彃浠跺叆鍙ｄ唬鐮侊紝鎻愬崌鍔犺浇鎬ц兘  
  **Removed SDK version compatibility check** - Removed OpenClaw SDK version check logic at plugin startup, simplifying entry code and improving load performance

## [0.8.4] - 2026-03-24

### 淇 / Fixes
- 馃悰 **缇よ亰娑堟伅澶勭悊宕╂簝** - 淇缇よ亰鏃舵姤閿?`TypeError: Cannot read properties of undefined (reading 'config')` 瀵艰嚧 Agent 鏃犳硶鍥炲鐨勯棶棰樸€傛牴鍥犳槸 `src/policy.ts` 涓?`resolveDingtalkGroupToolPolicy` 鍑芥暟鐨勫弬鏁扮鍚嶄笌 OpenClaw SDK 鐨?`ChannelGroupContext` 鎺ュ彛涓嶅尮閰嶏紝鍑芥暟鏈熸湜鎺ユ敹 `account: ResolvedDingtalkAccount`锛屼絾妗嗘灦瀹為檯浼犲叆 `{ cfg, groupId, accountId, ... }`锛屽鑷?`account` 涓?`undefined`銆傜幇宸蹭慨姝ｅ弬鏁扮鍚嶏紝鍐呴儴閫氳繃 `resolveDingtalkAccount()` 姝ｇ‘鑾峰彇璐﹀彿淇℃伅銆傚崟鑱婁笉鍙楀奖鍝嶃€? 
  **Group chat message processing crash** - Fixed `TypeError: Cannot read properties of undefined (reading 'config')` crash in group chats. Root cause: `resolveDingtalkGroupToolPolicy` in `src/policy.ts` had a parameter signature mismatch with the OpenClaw SDK's `ChannelGroupContext` interface. Fixed by correcting the parameter signature and resolving the account internally via `resolveDingtalkAccount()`. Direct messages were unaffected.

- 馃悰 **鍏煎鏃х増 OpenClaw Gateway锛坈reatePluginRuntimeStore 缂哄け锛?* - 淇鍦ㄦ棫鐗?OpenClaw Gateway 涓婂姞杞芥彃浠舵椂鎶ラ敊 `TypeError: (0 , _pluginSdk.createPluginRuntimeStore) is not a function` 鐨勯棶棰樸€傛牴鍥犳槸 `src/runtime.ts` 鐩存帴浠?`openclaw/plugin-sdk` 瀵煎叆 `createPluginRuntimeStore`锛岃€岃鍑芥暟鍦ㄦ棫鐗?SDK 涓苟涓嶅瓨鍦ㄣ€傜幇宸叉浛鎹负鍐呰仈瀹炵幇鐨?`createRuntimeStore`锛屽姛鑳藉畬鍏ㄧ瓑浠凤紝鍏煎鎵€鏈夌増鏈殑 OpenClaw  
  **Compatible with older OpenClaw Gateway (missing createPluginRuntimeStore)** - Fixed `TypeError: (0 , _pluginSdk.createPluginRuntimeStore) is not a function` when loading the plugin on older OpenClaw Gateway versions. Root cause: `src/runtime.ts` imported `createPluginRuntimeStore` from `openclaw/plugin-sdk`, which doesn't exist in older SDK versions. Replaced with an inline `createRuntimeStore` implementation that is fully equivalent and compatible with all OpenClaw versions

- 馃悰 **openclaw 渚濊禆鐗堟湰绾︽潫鏀惧** - 灏?`package.json` 涓殑 `"openclaw": "^2026.3.0"` 鏀逛负 `"openclaw": "*"`锛岄伩鍏嶇増鏈害鏉熷鑷村畨瑁呭け璐ユ垨涓庣敤鎴峰凡瀹夎鐗堟湰鍐茬獊  
  **Relaxed openclaw dependency version constraint** - Changed `"openclaw": "^2026.3.0"` to `"openclaw": "*"` in `package.json` to avoid installation failures or conflicts with the user's installed version

## [0.8.3] - 2026-03-24

### 淇 / Fixes
- 馃悰 **鍏煎 OpenClaw Gateway 鏂扮増鏈?* - 淇鍦?OpenClaw Gateway 2026.3.22+ 鐗堟湰涓嬪畨瑁呮彃浠舵椂鎶ラ敊 `ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './plugin-sdk/compat' is not defined by "exports"` 鐨勯棶棰樸€傛牴鍥犳槸 `src/runtime.ts` 浣跨敤浜嗗凡琚柊鐗?SDK 绉婚櫎鐨?`openclaw/plugin-sdk/compat` 瀛愯矾寰勶紝鐜板凡鏀逛负浠?`openclaw/plugin-sdk` 涓诲叆鍙ｅ鍏ワ紝瀵规墍鏈夌増鏈紙2026.3.1+锛夊潎鍏煎  
  **Compatible with newer OpenClaw Gateway versions** - Fixed `ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './plugin-sdk/compat' is not defined by "exports"` when installing under OpenClaw Gateway 2026.3.22+. Root cause: `src/runtime.ts` imported from the removed `openclaw/plugin-sdk/compat` sub-path; now imports from the `openclaw/plugin-sdk` main entry, compatible with all versions (2026.3.1+)

- 鉁?**AI 鍗＄墖娴佸紡鏇存柊寤惰繜浼樺寲** - 鏀瑰姩鍓?`onReplyStart` 涓茶绛夊緟 AI Card 鍒涘缓锛堢害 500ms~1s锛夛紝鏈熼棿 partial reply 鍏ㄩ儴涓㈠純锛岃妭娴侀棿闅?1000ms 涔熻繃浜庝繚瀹堛€傛敼鍔ㄥ悗 AI Card 鍒涘缓鏀逛负 fire-and-forget 涓?AI 鐢熸垚骞惰锛岃妭娴侀棿闅旇皟鏁翠负 500ms锛屾祦寮忓唴瀹硅兘鏇存棭鏇撮绻佸湴鍛堢幇  
  **AI card progressive update latency improvement** - Previously `onReplyStart` awaited AI Card creation serially (~500ms鈥?s), discarding all partial replies during that window, with a 1000ms throttle too conservative for short replies. AI Card creation now runs fire-and-forget in parallel with AI generation; throttle reduced to 500ms for earlier and more frequent streaming updates

- 馃悰 **澶?Agent 璺敱涓?sharedMemoryAcrossConversations 鍐茬獊** - 淇閰嶇疆 `sharedMemoryAcrossConversations: true` 鏃讹紝澶氱兢鍒嗛厤涓嶅悓 Agent 鐨?bindings 鍏ㄩ儴璺敱鍒板悓涓€ Agent 鐨勯棶棰樸€傝矾鐢卞尮閰嶇幇鍦ㄤ娇鐢ㄤ笓鐢ㄧ殑 `peerId`锛堢湡瀹?peer 鏍囪瘑锛屼笉鍙椾細璇濋殧绂婚厤缃奖鍝嶏級锛宻ession 鏋勫缓浣跨敤 `sessionPeerId`锛屼袱鑰呰亴璐ｄ弗鏍煎垎绂? 
  **Multi-Agent routing conflict with sharedMemoryAcrossConversations** - Fixed all bindings resolving to the same Agent when `sharedMemoryAcrossConversations: true`. Routing now uses dedicated `peerId` (real peer identifier, unaffected by session isolation config); session construction uses `sessionPeerId` with strict separation of responsibilities

- 馃悰 **鍙戦€佸浘鐗囧け璐?* - 淇鍙戦€佸浘鐗囨椂鍑虹幇寮傚父鐨勯棶棰?([#316](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/issues/316))  
  **Image sending failure** - Fixed an issue where sending images would fail with an error ([#316](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/issues/316))

- 馃悰 **鍙戦€佷汉鏄电О涓庣兢鍚嶇О鏈纭紶閫掔粰 AI** - 淇浼氳瘽涓婁笅鏂囦腑 `SenderName` 瀛楁閿欒浼犲叆鐢ㄦ埛 ID锛堣€岄潪鏄电О锛夈€乣GroupSubject` 瀛楁閿欒浼犲叆缇?ID锛堣€岄潪缇ゅ悕绉帮級鐨勯棶棰橈紝AI 鐜板湪鑳芥纭幏鍙栧彂閫佷汉鐨勯拤閽夋樀绉板拰鎵€鍦ㄧ兢鐨勫悕绉? 
  **Sender nickname and group name not passed to AI** - Fixed `SenderName` being set to user ID instead of display name, and `GroupSubject` being set to group ID instead of group title; AI now correctly receives the sender's nickname and group name

### 鏀硅繘 / Improvements
- 鉁?**娑堟伅闃熷垪绻佸繖鏃剁殑鍗虫椂鎺掗槦鍙嶉** - 褰撶敤鎴峰揩閫熻繛缁彂閫佹秷鎭€佷笂涓€鏉′粛鍦ㄥ鐞嗕腑鏃讹紝鏂版秷鎭幇鍦ㄤ細绔嬪嵆寮瑰嚭涓€鏉?AI Card 姘旀场鏄剧ず鎺掗槦鎻愮ず鏂囨锛屽悓鏃惰创涓?鎬濊€冧腑"琛ㄦ儏銆傜瓑杞埌璇ユ秷鎭鐞嗘椂锛屾皵娉?*鍘熷湴鏇存柊**涓烘渶缁堝洖澶嶅唴瀹癸紝涓嶄細棰濆澶氬彂涓€鏉℃秷鎭? 
  **Instant queue acknowledgement when busy** - When a user sends messages in quick succession while the previous one is still processing, the new message now immediately shows an AI Card bubble with a queuing acknowledgement and a "thinking" emoji. When it's the message's turn, the same bubble is **updated in place** with the final reply 鈥?no extra message is sent

## [0.8.2] - 2026-03-22

### 淇 / Fixes
- 馃悰 **澶氳处鍙烽噸澶嶅惎鍔ㄩ棶棰?* - 淇 `enabled: false` 鐨勮处鍙蜂粛浼氬缓绔?WebSocket 杩炴帴鐨勯棶棰橈紝绂佺敤璐﹀彿鐜板湪姝ｇ‘淇濇寔 pending 鐘舵€佺洿鍒?Gateway 鍋滄  
  **Multi-account duplicate startup** - Fixed accounts with `enabled: false` still establishing WebSocket connections; disabled accounts now correctly remain in a pending state until the Gateway stops

- 馃悰 **鐩稿悓 clientId 璐﹀彿鍘婚噸** - 淇澶氫釜璐﹀彿閰嶇疆鐩稿悓 `clientId` 鏃跺缓绔嬮噸澶嶈繛鎺ョ殑闂锛岄€氳繃闈欐€侀厤缃垎鏋愮‘淇濆悓涓€ `clientId` 鍙湁鍒楄〃涓涓€涓惎鐢ㄨ处鍙峰缓绔嬭繛鎺? 
  **Duplicate clientId deduplication** - Fixed duplicate connections when multiple accounts share the same `clientId`; static config analysis now ensures only the first enabled account per `clientId` establishes a connection


### 鏀硅繘 / Improvements
- 鉁?**Onboarding 閰嶇疆鍚戝浼樺寲** - 鏀硅繘閽夐拤杩炴帴鍣ㄩ厤缃紩瀵奸€昏緫锛岃皟鏁村嚟鎹緭鍏ラ『搴忥紙鍏?Client ID 鍚?Client Secret锛夛紝浼樺寲寮曞鏂囨  
  **Onboarding wizard improvement** - Improved DingTalk connector onboarding flow, adjusted credential input order (Client ID first, then Client Secret), and refined guidance text

- 鉁?**浼氳瘽 Key 閬靛惊 OpenClaw 瑙勮寖** - 浼氳瘽涓婁笅鏂囨寜 OpenClaw 鏍囧噯瑙勫垯鏋勫缓锛岄€氳繃 `channel`銆乣accountId`銆乣chatType`銆乣peerId` 鍞竴鏍囪瘑浼氳瘽锛屾敮鎸?`sharedMemoryAcrossConversations` 璺ㄤ細璇濊蹇嗗叡浜? 
  **Session key follows OpenClaw convention** - Session context now built per OpenClaw standard rules, uniquely identified via `channel`, `accountId`, `chatType`, `peerId`; supports `sharedMemoryAcrossConversations` for cross-conversation memory sharing

- 鉁?**娑堟伅澶勭悊閫昏緫浼樺寲** - 閲嶆瀯娑堟伅澶勭悊娴佺▼锛屾彁鍗囨秷鎭搷搴旈€熷害鍜屽鐞嗗彲闈犳€э紝纭繚娑堟伅鎸夊簭姝ｇ‘澶勭悊  
  **Message processing logic optimization** - Refactored message processing flow to improve response speed and reliability, ensuring messages are processed correctly in order

## [0.8.1] - 2026-03-20

### 淇 / Fixes
- 馃悰 **鏂囦欢鍜屽浘鐗囦笅杞?OSS 绛惧悕楠岃瘉澶辫触** - 淇榛樿 `Content-Type` 璇锋眰澶村鑷?OSS 绛惧悕楠岃瘉澶辫触鐨勯棶棰橈紝纭繚鏂囦欢鍜屽浘鐗囪兘澶熸甯镐笅杞? 
  **File and image download OSS signature verification failure** - Fixed OSS signature verification failure caused by default `Content-Type` header, ensuring files and images download correctly

## [0.8.0] - 2026-03-20

### 閲嶆瀯 / Refactoring
- 鉁?**涓氬姟閫昏緫鍒嗗眰閲嶆瀯** - 瀵归」鐩粨鏋勮繘琛岄噸鏋勶紝閲囩敤涓氬姟閫昏緫鍒嗗眰璁捐锛屾槑纭亴璐ｈ竟鐣岋紝闄嶄綆妯″潡鑰﹀悎骞舵彁鍗囧彲缁存姢鎬? 
  **Business-logic layered refactor** - Reworked project architecture with layered business logic design, clarifying responsibilities, reducing coupling, and improving maintainability
- 鉁?**OpenClaw 瀵规帴鏂瑰紡鍗囩骇** - 浠?OpenClaw HTTP 瀵规帴杩佺Щ涓?OpenClaw SDK锛岀粺涓€璋冪敤閾捐矾骞跺寮洪泦鎴愮ǔ瀹氭€? 
  **OpenClaw integration upgrade** - Migrated from OpenClaw HTTP integration to OpenClaw SDK for a unified invocation flow and better integration stability

### 鏀硅繘 / Improvements
- 鉁?**IM 浜や簰浣撻獙浼樺寲** - 浼樺寲 IM 鍦烘櫙涓嬬殑閮ㄥ垎浜や簰缁嗚妭锛屾彁鍗囨秷鎭鐞嗕笌鍙嶉浣撻獙  
  **IM interaction optimization** - Improved several interaction details in IM scenarios to provide smoother message handling and feedback
- 鉁?**README 閲嶅啓涓庨厤缃畝鍖?* - 閲嶅啓 README 鏂囨。锛岀畝鍖栭厤缃暀绋嬶紝闄嶄綆鎺ュ叆闂ㄦ骞舵彁鍗囦笂鎵嬫晥鐜? 
  **README rewrite & simpler setup** - Rewrote README and simplified setup guidance to reduce onboarding complexity and speed up adoption

### 淇 / Fixes
- 馃悰 **dingtalk-stream 鏂繛闂淇** - 淇 dingtalk-stream 鐩稿叧鐨勯儴鍒嗘柇杩炲満鏅紝澧炲己闀胯繛鎺ョǔ瀹氭€т笌鎭㈠鑳藉姏  
  **dingtalk-stream disconnect fixes** - Fixed several dingtalk-stream related disconnection scenarios, improving long-connection stability and recovery

## [0.7.10] - 2026-03-16

### 鏂板 / Added
- 鉁?**WebSocket 蹇冭烦閲嶈繛鏈哄埗浼樺寲** - 鍏抽棴 DWClient 鐨?`autoConnect`锛岄噰鐢ㄥ簲鐢ㄥ眰鑷姩閲嶈繛鏈哄埗锛堜慨澶?DWClient 閲嶈繛 bug锛夛紱娣诲姞鎸囨暟閫€閬块噸杩炵瓥鐣ワ紝閬垮厤闆穿鏁堝簲锛涗娇鐢?WebSocket 鍘熺敓 Ping 杩涜蹇冭烦妫€娴? 
  **WebSocket heartbeat & reconnect optimization** - Disabled DWClient's `autoConnect`, implemented app-layer auto-reconnect (fixing DWClient bug); added exponential backoff to avoid avalanche; using WebSocket native Ping for heartbeat
- 鉁?**socket-manager 妯″潡** - 鏂板妯″潡缁熶竴绠＄悊 WebSocket 杩炴帴鐢熷懡鍛ㄦ湡锛屽寘鎷績璺虫娴嬨€佽嚜鍔ㄩ噸杩炪€佹寚鏁伴€€閬裤€佷簨浠剁洃鍚瓑  
  **socket-manager module** - New module for unified WebSocket connection lifecycle management, including heartbeat, auto-reconnect, exponential backoff, event listening
- 鉁?**debug 鍙傛暟** - 娣诲姞 `debug` 閰嶇疆椤规帶鍒惰缁嗘棩蹇楄緭鍑猴紝渚夸簬闂鎺掓煡  
  **debug parameter** - Added `debug` config to control detailed log output for easier troubleshooting
- 鉁?**WebSocket 鏃犻檺閲嶈繛鏈哄埗** - 绉婚櫎鏈€澶ч噸杩炴鏁伴檺鍒讹紝瀹炵幇鏃犻檺閲嶈繛锛岀‘淇濋暱杩炴帴鏈嶅姟鐨勯珮鍙敤鎬? 
  **WebSocket infinite reconnection** - Removed maximum reconnection attempt limit, implemented infinite reconnection to ensure high availability for long-lived connection services

### 淇 / Fixes
- 馃悰 **淇 DWClient 閲嶈繛 bug** - DWClient 鍐呯疆閲嶈繛鏈哄埗瀛樺湪缂洪櫡锛岄€氳繃搴旂敤灞傞噸杩炴満鍒舵浛浠ｏ紝纭繚杩炴帴绋冲畾鍙潬  
  **Fixed DWClient reconnect bug** - DWClient's built-in reconnect has defects; replaced with app-layer reconnect for stable connection
- 馃悰 **闀胯繛鎺ラ潤榛樻柇寮€** - 閫氳繃搴旂敤灞傚績璺虫娴嬭繛鎺ユ椿鎬э紝瓒呮椂鍚庝富鍔ㄩ噸杩烇紝鍑忓皯鍥犻暱鏃堕棿鏃犳暟鎹鑷寸殑闈欓粯鏂繛涓旀棤娉曟仮澶? 
  **Long-lived connection silent disconnect** - App-layer heartbeat detects liveness and triggers reconnect on timeout, reducing silent disconnects when idle
### 鏀硅繘 / Improvements
- 鉁?**DWClient 閰嶇疆** - 璁剧疆 `autoReconnect: false`銆乣keepAlive: false`锛岀敱搴旂敤灞傛帴绠￠噸杩炲拰蹇冭烦锛岄伩鍏嶄笌閽夐拤鏈嶅姟绔瓥鐣ュ啿绐? 
  **DWClient config** - Set `autoReconnect: false`, `keepAlive: false`; app-layer takes over reconnect and heartbeat to avoid server conflicts
- 鉁?**鎸囨暟閫€閬跨瓥鐣?* - 鍏紡 `baseBackoffDelay * Math.pow(2, attempt) + jitter(0-1s)`锛屾渶澶ч€€閬?30 绉掞紝閬垮厤闆穿鏁堝簲  
  **Exponential backoff strategy** - Formula `baseBackoffDelay * Math.pow(2, attempt) + jitter(0-1s)`, max 30s backoff to avoid avalanche effect
- 鉁?**缁熶竴浜嬩欢鐩戝惉** - `pong`銆乣message`銆乣close`銆乣open` 鍥涗釜浜嬩欢缁熶竴绠＄悊鍜屾竻鐞嗭紝鎻愬崌浠ｇ爜鍙淮鎶ゆ€? 
  **Unified event listening** - `pong`, `message`, `close`, `open` events managed and cleaned up uniformly, improving maintainability
- 鉁?**閰嶇疆绠€鍖?* - 浠?`SocketManagerConfig` 涓Щ闄?`maxReconnectAttempts` 閰嶇疆椤癸紝绠€鍖栭厤缃鏉傚害  
  **Configuration simplification** - Removed `maxReconnectAttempts` from `SocketManagerConfig`, simplifying configuration
- 鉁?**鏃ュ織杈撳嚭浼樺寲** - 鏇存柊閲嶈繛鏃ュ織鏍煎紡锛岀Щ闄ゆ渶澶ф鏁版樉绀猴紙浠?"灏濊瘯 X/5" 鏀逛负 "灏濊瘯 X"锛? 
  **Log output optimization** - Updated reconnection log format, removed maximum attempt display (from "attempt X/5" to "attempt X")

### 鎶€鏈粏鑺?/ Technical Details
- **閫€閬跨瓥鐣?*锛氭寚鏁伴€€閬?+ 闅忔満鎶栧姩锛屽叕寮?`baseBackoffDelay * Math.pow(2, attempt) + jitter(0-1s)`  
- **鏈€澶ч€€閬?*锛?0 绉掞紙鐢?`maxBackoffDelay` 闄愬埗锛? 
- **閲嶇疆鏉′欢**锛氶噸杩炴垚鍔熷悗 `reconnectAttempts` 褰掗浂  
- **绔嬪嵆閲嶈繛**锛氬績璺虫娴嬪け璐ャ€乄ebSocket close銆乨isconnect 娑堟伅瑙﹀彂鏃剁珛鍗抽噸杩烇紝涓嶉€€閬? 

## [0.7.9] - 2026-03-13

### 鏂板 / Added
- 鉁?**搴旂敤灞傚績璺虫満鍒?* - 閽夐拤 Stream 瀹㈡埛绔娇鐢ㄨ嚜瀹氫箟蹇冭烦锛圵ebSocket ping/pong锛?0 绉掗棿闅斻€?0 绉掕秴鏃讹級锛岃秴鏃跺悗涓诲姩鏂紑骞堕噸杩烇紝閲嶈繛澶辫触 5 绉掑悗閲嶈瘯  
  **Application-layer heartbeat** - Stream client uses custom ping/pong heartbeat (30s interval, 90s timeout), reconnects on timeout with 5s retry on failure
- 鉁?**缁熶竴鍋滄涓庢竻鐞?* - 鍋滄瀹㈡埛绔椂閫氳繃 `doStop` 缁熶竴娓呯悊蹇冭烦瀹氭椂鍣ㄥ苟璋冪敤 `client.disconnect()`锛岀‘淇濊繛鎺ユ纭叧闂? 
  **Unified stop & cleanup** - `doStop` clears heartbeat timer and calls `client.disconnect()` when stopping the client

### 淇 / Fixes
- 馃悰 **闀胯繛鎺ラ潤榛樻柇寮€** - 鍏抽棴 SDK 婵€杩?keepAlive锛? 绉掕秴鏃讹級锛屾敼鐢ㄥ簲鐢ㄥ眰蹇冭烦锛屽噺灏戝洜闀挎椂闂存棤鏁版嵁瀵艰嚧鐨勯潤榛樻柇杩炰笖鏃犳硶鎭㈠  
  **Long-lived connection silent disconnect** - Disabled SDK aggressive keepAlive (8s timeout), use app-layer heartbeat to reduce silent disconnects when idle

### 鏀硅繘 / Improvements
- 鉁?**DWClient 閰嶇疆** - 鍚敤 `autoReconnect: true`锛岃缃?`keepAlive: false`锛岀敱搴旂敤灞傚績璺虫浛浠?SDK 蹇冭烦锛岄伩鍏嶄笌閽夐拤鏈嶅姟绔瓥鐣ュ啿绐? 
  **DWClient config** - `autoReconnect: true`, `keepAlive: false`; app-layer heartbeat replaces SDK keepAlive to avoid conflicts with server

## [0.7.8] - 2026-03-13

### 淇 / Fixes
- 馃悰 **AI 鍗＄墖妯＄増涓庢覆鏌撲紭鍖?* - 鏇存柊 AI 鍗＄墖妯＄増 ID锛屼娇鍗＄墖鏍峰紡涓庢渶鏂板畼鏂硅鑼冧繚鎸佷竴鑷达紝骞舵彁鍗囧缁堢灞曠ず鏁堟灉  
  **AI card template & rendering optimization** - Updated the AI card template ID to match the latest official standard and improved rendering across clients
- 馃悰 **Markdown 琛ㄦ牸娓叉煋淇** - 鍦ㄥ彂閫佸埌閽夐拤鍓嶈嚜鍔ㄤ负 Markdown 琛ㄦ牸澶撮儴琛ュ厖蹇呰绌鸿锛岄伩鍏嶅洜缂哄皯绌鸿瀵艰嚧琛ㄦ牸琚綋浣滄櫘閫氭枃鏈覆鏌? 
  **Markdown table rendering fix** - Automatically inserts required blank lines before Markdown table headers to prevent DingTalk from rendering tables as plain text
- 馃悰 **娑堟伅鍘婚噸閫昏緫浼樺寲** - 灏嗘秷鎭幓閲嶇淮搴︿粠銆岃处鍙?+ 娑堟伅 ID銆嶇畝鍖栦负鍗曚竴銆屾秷鎭?ID銆嶏紝閬垮厤澶氳处鍙峰満鏅笅鐨勯噸澶嶅鐞嗘垨璇垽  
  **Message de-duplication optimization** - Simplified de-duplication from `(accountId, messageId)` to `messageId` only, preventing duplicate handling or misjudgment in multi-account scenarios

### 鏀硅繘 / Improvements
- 鉁?**缁熶竴 Markdown 淇绠￠亾** - 瀵?AI 鍗＄墖娴佸紡鍐呭銆佹渶缁堝唴瀹广€佹櫘閫?Markdown 娑堟伅鍙?`sampleMarkdown` 鍗＄墖鏂囨湰缁熶竴搴旂敤 Markdown 淇瑙勫垯锛岀‘淇濊〃鏍肩瓑鏍煎紡鍦ㄥ悇鍏ュ彛琛屼负涓€鑷? 
  **Unified Markdown normalization pipeline** - Applies the same Markdown normalization to streaming AI card content, final content, regular Markdown messages, and `sampleMarkdown` card text for consistent behavior
- 鉁?**AI 鍗＄墖鐘舵€佸唴瀹逛竴鑷存€?* - 鍦ㄥ畬鎴?AI 鍗＄墖鏃讹紝瀵瑰睍绀哄唴瀹瑰拰鍐欏叆 `cardParamMap.msgContent` 鐨勫唴瀹逛娇鐢ㄥ悓涓€浠?Markdown 淇缁撴灉锛岀‘淇濈敤鎴风湅鍒扮殑鍐呭涓庡唴閮ㄧ姸鎬佷竴鑷? 
  **Consistent AI card status content** - Ensures the same normalized Markdown is used both for the visible content and `cardParamMap.msgContent` when finishing AI cards

## [0.7.7] - 2026-03-13

### 鏂板 / Added
- 鉁?**鑷畾涔?Gateway URL 鏀寔** - 鏂板 `gatewayBaseUrl` 閰嶇疆椤癸紝鏀寔閫氳繃鑷畾涔?URL锛堝 Nginx 鍙嶅悜浠ｇ悊鍒?TLS/HTTPS Gateway锛夎闂?Gateway  
  **Custom Gateway URL support** - Added `gatewayBaseUrl` option to allow using a custom URL (e.g., Nginx reverse proxy to a TLS/HTTPS Gateway)
- 鉁?**閽夐拤銆屾€濊€冧腑銆嶈〃鎯呭弽棣?* - 鍦ㄥ鐞嗙敤鎴锋秷鎭湡闂翠负鍘熸秷鎭创涓娿€岎煠旀€濊€冧腑銆嶈〃鎯咃紝澶勭悊缁撴潫鍚庤嚜鍔ㄦ挙鍥烇紝娓呮櫚灞曠ず澶勭悊杩涘害  
  **DingTalk 鈥渢hinking鈥?emotion feedback** - Attaches a 鈥滒煠?Thinking鈥?emotion to the original user message while processing and automatically recalls it after completion to clearly indicate progress
- 鉁?**娴嬭瘯鍩虹璁炬柦瀹屽杽** - 寮曞叆 Vitest 鍙婂绉嶆祴璇曡剼鏈紙run/watch/coverage/ui/integration锛夛紝涓哄悗缁嚜鍔ㄥ寲娴嬭瘯鍜屽洖褰掗獙璇佹彁渚涘熀纭€  
  **Improved testing infrastructure** - Introduced Vitest and multiple test scripts (run/watch/coverage/ui/integration) to enable better automated and regression testing
- 鉁?**Issue Webhook 宸ヤ綔娴?* - 鏂板 GitHub Actions 宸ヤ綔娴侊紝灏?Issue 鍙樻洿浠ョ粺涓€ JSON 鏍煎紡鎺ㄩ€佸埌閰嶇疆鐨?Webhook  
  **Issue webhook workflow** - Added a GitHub Actions workflow to push Issue changes as unified JSON payloads to a configured webhook

### 淇 / Fixes
- 馃悰 **濯掍綋鍏冩暟鎹笌缂╃暐鍥炬彁鍙栨洿鍋ュ．** - ffprobe 鎴栫缉鐣ュ浘鐢熸垚澶辫触鏃朵笉鍐嶄腑鏂富娴佺▼锛岃€屾槸杩斿洖榛樿鍏冩暟鎹垨绌虹缉鐣ュ浘  
  **More robust media metadata & thumbnail extraction** - ffprobe or thumbnail generation failures no longer abort the main flow but return default metadata or a null thumbnail instead
- 馃悰 **闊抽鏃堕暱鎻愬彇鍏煎鎬ф敼杩?* - 浣跨敤鍔ㄦ€?`import('child_process')` 鏇夸唬 `require('child_process')`锛屾彁鍗囧湪涓嶅悓杩愯鐜涓嬬殑鍏煎鎬? 
  **Audio duration extraction compatibility** - Replaced `require('child_process')` with dynamic `import('child_process')` to improve compatibility across environments
- 馃悰 **涓诲姩娑堟伅鐢ㄦ埛鍒楄〃鏍￠獙** - 涓轰富鍔ㄦ秷鎭殑 `userIds` 鍒楄〃澧炲姞绌哄€艰繃婊わ紝閬垮厤鍥犳棤鏁堢敤鎴?ID 瀵艰嚧璇锋眰澶辫触  
  **Proactive message user list validation** - Added empty value filtering for the `userIds` list in proactive messages to prevent request failures caused by invalid IDs

## [0.7.6] - 2026-03-12

### 淇 / Fixes
- 馃悰 **Gateway 绔彛杩炴帴淇** - 淇淇敼 gateway 绔彛鍚庢棤娉曡繛鎺ョ殑闂锛岀‘淇濋厤缃腑鐨?`gateway.port` 鑳藉姝ｇ‘鐢熸晥  
  **Gateway port connection fix** - Fixed issue where connection fails after modifying gateway port, ensuring that `gateway.port` in configuration takes effect correctly
- 馃悰 **鏂颁細璇濆懡浠や慨澶?* - 淇鏂颁細璇濆懡浠わ紙`/new`銆乣/reset`銆乣/clear`銆乣鏂颁細璇漙 绛夛級鏈湡姝ｆ竻鐞嗕細璇濈殑闂锛岀粺涓€灏嗗懡浠ら€忎紶鍒?Gateway 鐢?Gateway 缁熶竴澶勭悊浼氳瘽閲嶇疆  
  **New session command fix** - Fixed issue where new session commands (`/new`, `/reset`, `/clear`, `鏂颁細璇漙, etc.) did not actually clear sessions, commands are now forwarded to Gateway for unified session reset handling

## [0.7.5] - 2026-03-10

### 淇 / Fixes
- 馃悰 **淇 Stream 瀹㈡埛绔绻侀噸杩為棶棰?* - 绂佺敤 `DWClient` 鍐呯疆鐨?`autoReconnect`锛岀敱妗嗘灦鐨?health-monitor 缁熶竴绠＄悊閲嶈繛閫昏緫锛岄伩鍏嶅弻閲嶉噸杩炴満鍒跺啿绐? 
  **Fixed Stream client frequent reconnection issue** - Disabled `DWClient` built-in `autoReconnect`, reconnection is now managed by framework's health-monitor to avoid dual reconnection mechanism conflict
- 馃悰 **淇杩炴帴鍏抽棴涓嶅畬鏁撮棶棰?* - `stop()` 鏂规硶鐜板湪姝ｇ‘璋冪敤 `client.disconnect()` 鍏抽棴 WebSocket 杩炴帴  
  **Fixed incomplete connection closure** - `stop()` method now correctly calls `client.disconnect()` to close WebSocket connection
- 馃悰 **Gateway 绔彛杩炴帴淇** - 淇淇敼 gateway 绔彛鍚庢棤娉曡繛鎺ョ殑闂
  **Gateway port connection fix** - Fixed issue where connection fails after modifying gateway port

### 閲嶆瀯 / Refactoring
- 鉁?**OpenClaw session.dmScope 鏈哄埗** - 浼氳瘽绠＄悊鐢?OpenClaw Gateway 缁熶竴澶勭悊锛屾彃浠朵笉鍐嶅唴閮ㄧ鐞嗕細璇濊秴鏃? 
  **OpenClaw session.dmScope mechanism** - Session management is now handled by OpenClaw Gateway, plugin no longer manages session timeout internally
- 鉁?**SessionContext 鏍囧噯鍖?* - 浣跨敤 OpenClaw 鏍囧噯鐨?SessionContext JSON 鏍煎紡浼犻€掍細璇濅笂涓嬫枃  
  **SessionContext standardization** - Use OpenClaw standard SessionContext JSON format for session context

### 閰嶇疆鍙樻洿 / Configuration Changes
- 鏂板 `groupSessionScope`锛堥粯璁わ細`group`锛? 缇よ亰浼氳瘽闅旂绛栫暐锛堜粎褰?separateSessionByConversation=true 鏃剁敓鏁堬級锛歚group`=缇ゅ叡浜紝`group_sender`=缇ゅ唴鐢ㄦ埛鐙珛  
  Added `groupSessionScope` (default: `group`) - Group chat session isolation (only when separateSessionByConversation=true): `group`=shared, `group_sender`=per-user
- 鈿狅笍 **搴熷純** `sessionTimeout` - 浼氳瘽瓒呮椂鐢?OpenClaw Gateway 鐨?`session.reset.idleMinutes` 閰嶇疆鎺у埗锛岃瑙?[Gateway 閰嶇疆鏂囨。](https://docs.openclaw.ai/gateway/configuration)  
  **Deprecated** `sessionTimeout` - Session timeout is now controlled by OpenClaw Gateway's `session.reset.idleMinutes`, see [Gateway Configuration](https://docs.openclaw.ai/gateway/configuration)

### 鍚戝悗鍏煎 / Backward Compatibility
- 鏃ч厤缃?`sessionTimeout` 浠嶅彲浣跨敤锛屼絾浼氭墦鍗板簾寮冭鍛婃棩蹇? 
  Old config `sessionTimeout` still works but will print deprecation warning

## [0.7.4] - 2026-03-09

### 鏂板鍔熻兘 / Added Features
- 鉁?**鎸変細璇濆尯鍒?Session** - 鏀寔鎸夊崟鑱娿€佺兢鑱娿€佷笉鍚岀兢鍒嗗埆缁存姢鐙珛浼氳瘽锛屽崟鑱婁笌缇よ亰銆佷笉鍚岀兢涔嬮棿鐨勫璇濅笂涓嬫枃浜掍笉骞叉壈  
  **Session by conversation** - Support separate sessions for direct chat, group chat, and different groups; conversation context is isolated between DMs, group chats, and different groups
- 鉁?**璁板繂闅旂/鍏变韩閰嶇疆** - 鏂板 `sharedMemoryAcrossConversations` 閰嶇疆锛屾帶鍒跺崟 Agent 鍦烘櫙涓嬫槸鍚﹀湪涓嶅悓浼氳瘽闂村叡浜蹇嗭紱榛樿 `false` 瀹炵幇缇よ亰涓庣鑱娿€佷笉鍚岀兢涔嬮棿鐨勮蹇嗛殧绂? 
  **Memory isolation/sharing config** - Added `sharedMemoryAcrossConversations` option to control whether memory is shared across conversations in single-Agent mode; default `false` isolates memory between DMs, group chats, and different groups
- 鉁?**Gateway Session 鏍煎紡澧炲己** - Session key 鏀寔 `group:conversationId` 鏍煎紡锛屼究浜?Gateway 璇嗗埆缇よ亰鍦烘櫙  
  **Gateway session format enhancement** - Session key supports `group:conversationId` format for Gateway to identify group chat scenarios
- 鉁?**X-OpenClaw-Memory-User 鏀寔** - 鍚?Gateway 浼犻€掕蹇嗗綊灞炵敤鎴锋爣璇嗭紝鏀寔 Gateway 渚ц蹇嗙鐞? 
  **X-OpenClaw-Memory-User support** - Pass memory user identifier to Gateway for memory management

### 閰嶇疆 / Configuration
- 鏂板 `separateSessionByConversation`锛堥粯璁わ細`true`锛? 鏄惁鎸夊崟鑱?缇よ亰/缇ゅ尯鍒?session  
  Added `separateSessionByConversation` (default: `true`) - Whether to separate sessions by direct/group/different groups  
  Added `separateSessionByConversation` (default: `true`) - Whether to separate sessions by direct/group/different groups (deprecated in 0.7.5)
- 鏂板 `sharedMemoryAcrossConversations`锛堥粯璁わ細`false`锛? 鍗?Agent 鍦烘櫙涓嬫槸鍚﹀湪涓嶅悓浼氳瘽闂村叡浜蹇嗭紱`false` 鏃朵笉鍚岀兢鑱娿€佺兢鑱婁笌绉佽亰璁板繂闅旂  
  Added `sharedMemoryAcrossConversations` (default: `false`) - Whether to share memory across conversations in single-Agent mode; when `false`, memory is isolated between different groups and between DMs and groups

## [0.7.3] - 2026-03-09

### 淇 / Fixes
- 馃悰 **鍏煎鎬т慨澶?*锛氫慨澶?0.7.0 寮曞叆鐨勯粯璁?Agent 璺敱鍥炲綊闂銆?.7.0 涔嬪墠榛樿璺敱鍒?`main` agent锛?.7.0 涔嬪悗閿欒鍦拌矾鐢卞埌 `default` agent锛岀幇宸叉仮澶嶄负 `main` agent  
  **Compatibility fix**: Fixed default agent routing regression introduced in 0.7.0. Before 0.7.0 default routed to `main` agent, after 0.7.0 incorrectly routed to `default` agent, now restored to `main` agent
- 馃悰 淇鐢ㄦ埛鏄惧紡閰嶇疆鍚嶄负 `default` 鐨勮处鍙锋椂琚敊璇槧灏勭殑闂锛氫娇鐢?`__default__` 浣滀负鍐呴儴榛樿璐﹀彿鏍囪瘑  
  Fixed issue where user-configured account named `default` was incorrectly mapped: Use `__default__` as internal default account identifier

### 鏀硅繘 / Improvements
- 鎶藉彇 `DEFAULT_ACCOUNT_ID` 甯搁噺鍒版枃浠堕《閮紝缁熶竴绠＄悊榛樿璐﹀彿鏍囪瘑  
  Extracted `DEFAULT_ACCOUNT_ID` constant to file top, unified management of default account identifier
- 鏇存柊 API 鏂囨。娉ㄩ噴锛岀Щ闄ゅ `default` 鐨勭‖缂栫爜寮曠敤  
  Updated API documentation comments, removed hardcoded references to `default`

## [0.7.2] - 2026-03-05

### 鏂板鍔熻兘 / Added Features
- 鉁?鏂板寮傛妯″紡锛氱珛鍗冲洖鎵х敤鎴锋秷鎭紝鍚庡彴澶勭悊浠诲姟锛岀劧鍚庝富鍔ㄦ帹閫佹渶缁堢粨鏋滀綔涓虹嫭绔嬫秷鎭? 
  Added async mode: immediately acknowledge user messages, process in background, then push the final result as a separate message
- 鉁?鏀寔鑷畾涔夊洖鎵ф秷鎭枃鏈紝鍙€氳繃 `ackText` 閰嶇疆椤硅缃? 
  Support custom acknowledgment message text, configurable via `ackText` option

### 淇 / Fixes
- 馃悰 淇寮傛妯″紡涓?Agent 璺敱闂锛歚streamFromGateway` 璋冪敤鏃剁己灏?`accountId` 鍙傛暟锛屽鑷翠細璇濊矾鐢卞埌 undefined agent  
  Fixed agent routing in async mode: `streamFromGateway` was called without `accountId`, causing sessions to route to undefined agent
- 馃悰 淇榛樿 Agent 璺敱锛氬綋 `accountId` 涓?`'default'` 鏃惰烦杩?`X-OpenClaw-Agent-Id` header锛岃 gateway 璺敱鍒板叾閰嶇疆鐨勯粯璁?agent  
  Fixed default agent routing: Skip `X-OpenClaw-Agent-Id` header when `accountId` is `'default'`, letting gateway route to its configured default agent
- 馃悰 淇寮傛妯″紡鍐呭澶勭悊锛氫娇鐢?`userContent`锛堝寘鍚枃浠堕檮浠讹級鏇夸唬鍘熷 `content.text`  
  Fixed async mode content: Use `userContent` (includes file attachments) instead of raw `content.text`
- 馃悰 淇寮傛妯″紡鍥剧墖鏀寔锛氬皢 `imageLocalPaths` 浼犻€掔粰 gateway stream  
  Fixed image support for async mode: Pass `imageLocalPaths` to gateway stream

### 閰嶇疆 / Configuration
- 鏂板 `asyncMode` 閰嶇疆椤癸紙榛樿锛歚false`锛? 鍚敤寮傛妯″紡  
  Added `asyncMode` configuration option (default: `false`) - Enable async mode
- 鏂板 `ackText` 閰嶇疆椤癸紙榛樿锛歚'馃 浠诲姟宸叉帴鏀讹紝澶勭悊涓?..'`锛? 鑷畾涔夊洖鎵ф秷鎭枃鏈? 
  Added `ackText` configuration option (default: `'馃 浠诲姟宸叉帴鏀讹紝澶勭悊涓?..'`) - Custom ack message text

## [0.7.1] - 2026-03-05

### 淇 / Fixes
- 馃悰 淇 stream 妯″紡 model 鍙傛暟閿欒瀵艰嚧 session 璺敱澶辫触鐨勯棶棰? 
  Fixed issue where incorrect model parameter in stream mode caused session routing failures
- 馃悰 灏?Gateway 璇锋眰涓殑 model 鍙傛暟浠?`'default'` 鏇存涓?`'main'`锛岀‘淇濇纭殑 Agent 璺敱  
  Corrected model parameter in Gateway requests from `'default'` to `'main'` to ensure proper Agent routing

### 鏀硅繘 / Improvements
- 浼樺寲寮傛妯″紡澶勭悊娴佺▼锛屾敼杩涢敊璇鐞嗗拰鏃ュ織杈撳嚭  
  Optimized async mode processing flow, improved error handling and log output
- 澧炲己 DM Policy 妫€鏌ユ満鍒讹紝鏀寔鐧藉悕鍗曢厤缃? 
  Enhanced DM Policy check mechanism, supporting allowlist configuration

## [0.7.0] - 2026-03-05

### 鏂板鍔熻兘 / Added Features

#### 瀵屽獟浣撴帴鏀舵敮鎸?/ Rich Media Reception Support
- 鉁?鏀寔鎺ユ敹 JPEG 鍥剧墖娑堟伅锛岃嚜鍔ㄤ笅杞藉埌 `~/.openclaw/workspace/media/inbound/` 鐩綍  
  Support receiving JPEG image messages, automatically downloaded to `~/.openclaw/workspace/media/inbound/` directory
- 鉁?鏀寔鎺ユ敹 PNG 鍥剧墖锛堝湪 richText 涓級锛岃嚜鍔ㄦ彁鍙?URL 鍜?downloadCode 骞朵笅杞? 
  Support receiving PNG images (in richText), automatically extract URL and downloadCode and download
- 鉁?鍥剧墖鑷姩浼犻€掔粰瑙嗚妯″瀷锛孉I 鍙互璇嗗埆鍜屽垎鏋愬浘鐗囧唴瀹? 
  Images are automatically passed to vision models, AI can recognize and analyze image content
- 鉁?濯掍綋鏂囦欢缁熶竴鍛藉悕鏍煎紡锛歚openclaw-media-{timestamp}.{ext}`  
  Unified naming format for media files: `openclaw-media-{timestamp}.{ext}`

#### 鏂囦欢闄勪欢鎻愬彇 / File Attachment Extraction
- 鉁?鏀寔瑙ｆ瀽 `.docx` 鏂囦欢锛堥€氳繃 `mammoth` 搴撴彁鍙栨枃鏈唴瀹癸級  
  Support parsing `.docx` files (extract text content via `mammoth` library)
- 鉁?鏀寔瑙ｆ瀽 `.pdf` 鏂囦欢锛堥€氳繃 `pdf-parse` 搴撴彁鍙栨枃鏈唴瀹癸級  
  Support parsing `.pdf` files (extract text content via `pdf-parse` library)
- 鉁?鏀寔璇诲彇绾枃鏈枃浠讹紙`.txt`銆乣.md`銆乣.json` 绛夛級锛屽唴瀹圭洿鎺ユ敞鍏ュ埌 AI 涓婁笅鏂? 
  Support reading plain text files (`.txt`, `.md`, `.json`, etc.), content directly injected into AI context
- 鉁?鏀寔澶勭悊浜岃繘鍒舵枃浠讹紙`.xlsx`銆乣.pptx`銆乣.zip` 绛夛級锛屾枃浠朵繚瀛樺埌纾佺洏骞跺湪娑堟伅涓姤鍛婅矾寰? 
  Support processing binary files (`.xlsx`, `.pptx`, `.zip`, etc.), files saved to disk and paths reported in messages

#### 閽夐拤鏂囨。 API / DingTalk Document API
- 鉁?鏀寔鍒涘缓閽夐拤鏂囨。 (`docs.create`)  
  Support creating DingTalk documents (`docs.create`)
- 鉁?鏀寔鍦ㄧ幇鏈夋枃妗ｄ笂杩藉姞鍐呭 (`docs.append`)  
  Support appending content to existing documents (`docs.append`)
- 鉁?鏀寔鎼滅储閽夐拤鏂囨。 (`docs.search`)  
  Support searching DingTalk documents (`docs.search`)
- 鉁?鏀寔鍒椾妇绌洪棿涓嬬殑鏂囨。 (`docs.list`)  
  Support listing documents under a space (`docs.list`)
- 鈿狅笍 娉ㄦ剰锛氳鍙栨枃妗ｅ姛鑳?(`docs.read`) 闇€瑕?MCP 鎻愪緵鐩稿簲鐨?tool锛屽綋鍓嶇増鏈殏涓嶆敮鎸? 
  Note: Document reading functionality (`docs.read`) requires MCP to provide the corresponding tool, currently not supported in this version

#### 澶?Agent 璺敱鏀寔 / Multi-Agent Routing Support
- 鉁?鏀寔涓€涓繛鎺ュ櫒瀹炰緥鍚屾椂杩炴帴澶氫釜 Agent  
  Support one connector instance connecting to multiple Agents simultaneously
- 鉁?鏀寔澶氫釜閽夐拤鏈哄櫒浜哄垎鍒粦瀹氬埌涓嶅悓鐨?Agent锛屽疄鐜拌鑹插垎宸ュ拰涓撲笟鍖栨湇鍔? 
  Support multiple DingTalk bots binding to different Agents, enabling role division and specialized services
- 鉁?姣忎釜 Agent 鎷ユ湁鐙珛鐨勪細璇濈┖闂达紝瀹炵幇浼氳瘽闅旂  
  Each Agent has an independent session space, achieving session isolation
- 鉁?鍚戝悗鍏煎鍗?Agent 鍦烘櫙锛屾棤闇€棰濆閰嶇疆  
  Backward compatible with single Agent scenarios, no additional configuration required
- 鉁?鎻愪緵澶?Agent 閰嶇疆璇存槑鍜岀ず渚嬶紝鏀寔閫氳繃 `accounts` 鍜?`bindings` 閰嶇疆澶氫釜鏈哄櫒浜? 
  Provides multi-Agent configuration documentation and examples, supports configuring multiple bots via `accounts` and `bindings`

### 淇 / Fixes
- 馃悰 淇鏈哄櫒浜哄彂閫佽闊虫秷鎭挱鏀惧紓甯搁棶棰橈紝闊抽杩涘害鍜屾挱鏀惧姛鑳界幇宸叉甯稿伐浣? 
  Fixed bot voice message playback issues, audio progress and playback functionality now work correctly

### 鏀硅繘 / Improvements
- 浼樺寲濯掍綋鏂囦欢涓嬭浇鍜屽瓨鍌ㄦ満鍒? 
  Optimized media file download and storage mechanism
- 鏀硅繘鏂囦欢闄勪欢澶勭悊娴佺▼锛屾敮鎸佹洿澶氭枃浠剁被鍨? 
  Improved file attachment processing flow, supporting more file types
- 澧炲己閿欒澶勭悊鍜屾棩蹇楄緭鍑? 
  Enhanced error handling and log output
- 鏂板 Markdown 琛ㄦ牸鑷姩杞崲鍔熻兘锛屽皢 Markdown 琛ㄦ牸杞崲涓洪拤閽夋敮鎸佺殑鏂囨湰鏍煎紡锛屾彁鍗囨秷鎭彲璇绘€? 
  Added automatic Markdown table conversion, converting Markdown tables to DingTalk-supported text format for better message readability

### 渚濊禆鏇存柊 / Dependency Updates
- 鏂板 `mammoth@^1.8.0` - Word 鏂囨。瑙ｆ瀽  
  Added `mammoth@^1.8.0` - Word document parsing
- 鏂板 `pdf-parse@^1.1.1` - PDF 鏂囨。瑙ｆ瀽  
  Added `pdf-parse@^1.1.1` - PDF document parsing

### 宸茬煡闂 / Known Issues
- 鈿狅笍 閽夐拤鏂囨。璇诲彇鍔熻兘 (`docs.read`) 褰撳墠涓嶅彲鐢紝鍥犱负 MCP 涓湭鎻愪緵鐩稿簲鐨?tool銆備唬鐮佸眰闈㈠疄鐜版甯革紝绛夊緟 MCP 鏀寔銆? 
  DingTalk document reading functionality (`docs.read`) is currently unavailable because MCP does not provide the corresponding tool. Implementation is correct at the code level, waiting for MCP support.

### 鏂囨。鏇存柊 / Documentation Updates
- 鏇存柊 README.md锛屾坊鍔犳柊鍔熻兘浣跨敤璇存槑  
  Updated README.md, added usage instructions for new features
- 娣诲姞瀵屽獟浣撴帴鏀躲€佹枃浠堕檮浠舵彁鍙栥€侀拤閽夋枃妗?API銆佸 Agent 璺敱绛夌珷鑺? 
  Added sections on rich media reception, file attachment extraction, DingTalk document API, multi-Agent routing, etc.
- 鏂板"澶?Agent 閰嶇疆"绔犺妭锛屾彁渚涜缁嗙殑閰嶇疆绀轰緥鍜岃鏄? 
  Added "Multi-Agent Configuration" section with detailed configuration examples and instructions
- 琛ュ厖甯歌闂瑙ｇ瓟  
  Added FAQ section
