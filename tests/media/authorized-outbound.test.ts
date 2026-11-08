import { beforeEach, expect, it, vi } from "vitest"
const mocks=vi.hoisted(()=>({load:vi.fn(),upload:vi.fn(),send:vi.fn()}))
vi.mock("openclaw/plugin-sdk/outbound-media",()=>({loadOutboundMediaFromUrl:mocks.load}))
vi.mock("../../src/utils/index.ts",()=>({DINGTALK_API:"https://api.test",DINGTALK_OAPI:"https://oapi.test",getAccessToken:async()=>"fake",getOapiAccessToken:async()=>"fake"}))
vi.mock("../../src/utils/http-client.ts",()=>({dingtalkOapiHttp:{post:mocks.upload},dingtalkHttp:{post:mocks.send}}))
import {sendAuthorizedMedia} from "../../src/services/media/authorized-outbound.ts"
const reader=vi.fn();const params={config:{clientId:"robot"},target:"user:sender",mediaUrl:"/workspace/report.txt",mediaAccess:{readFile:reader,localRoots:["/workspace"]}} as any
beforeEach(()=>{vi.clearAllMocks();mocks.load.mockResolvedValue({buffer:Buffer.from("test"),contentType:"text/plain",fileName:"report.txt"});mocks.upload.mockResolvedValue({data:{media_id:"@media"}});mocks.send.mockResolvedValue({data:{processQueryKey:"receipt"}})})
it("uses the host reader and real platform receipt without reopening a host path",async()=>{
 const result=await sendAuthorizedMedia(params);expect(result.processQueryKey).toBe("receipt")
 expect(mocks.load).toHaveBeenCalledWith("/workspace/report.txt",expect.objectContaining({mediaAccess:expect.objectContaining({readFile:reader,localRoots:["/workspace"]})}))
 expect(mocks.send.mock.calls[0][1]).toMatchObject({userIds:["sender"],msgKey:"sampleFile"})
})
it("stops before upload when the host rejects a private or cross-session path",async()=>{
 mocks.load.mockRejectedValue(new Error("Outside sandbox roots"));await expect(sendAuthorizedMedia({...params,mediaUrl:"/home/andy/.openclaw/private.sqlite"})).rejects.toThrow("Outside sandbox")
 expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled()
})
it("refuses absent or unbounded reader capability",async()=>{
 await expect(sendAuthorizedMedia({...params,mediaAccess:undefined})).rejects.toThrow("reader")
 await expect(sendAuthorizedMedia({...params,mediaAccess:{readFile:reader}})).rejects.toThrow("roots")
 expect(mocks.load).not.toHaveBeenCalled()
})
it("does not claim delivery without a platform acknowledgement",async()=>{
 mocks.send.mockResolvedValue({data:{}});await expect(sendAuthorizedMedia(params)).rejects.toThrow("did not acknowledge file delivery")
})
