import { afterEach, expect, it, vi } from 'vitest';
import { createTurnFeedback, feedbackState, type FeedbackTransport } from '../../src/turn-state/feedback.ts';
import type { TurnSnapshot } from '../../src/turn-state/runtime.ts';
const snapshot=(patch:Partial<TurnSnapshot>={}):TurnSnapshot=>({key:'key',owner:'owner',execution:'running',disposition:'received',closed:0,
  received_at:0,updated_at:0,delivery:'not_observed',reviewRequired:true,attempts:[],feedback:undefined,...patch});
afterEach(()=>vi.useRealTimers());
it('distinguishes processing, submitted, unobserved, partial, cancelled and review facts',()=>{
  expect(feedbackState(snapshot(),false)).toBe('processing');
  expect(feedbackState(snapshot({execution:'not_started'}),true)).toBeUndefined();
  const closed={closed:1,reviewRequired:false,disposition:'handled' as const,execution:'settled' as const};
  expect(feedbackState(snapshot({...closed,delivery:'accepted'}),true)).toBe('submitted');
  expect(feedbackState(snapshot({...closed}),true)).toBe('ended');
  expect(feedbackState(snapshot({...closed,delivery:'partial'}),true)).toBe('failed');
  expect(feedbackState(snapshot({...closed,execution:'cancelled'}),true)).toBe('cancelled');
  expect(feedbackState(snapshot({...closed,delivery:'unknown',reviewRequired:true}),true)).toBe('review');
});
it('serializes remove/add, coalesces intermediate observations and keeps terminal state final',async()=>{
  let release!:()=>void;const barrier=new Promise<void>(r=>release=r);const calls:string[]=[];
  const transport:FeedbackTransport=vi.fn(async(op,label)=>{calls.push(op+':'+label);if(calls.length===1)await barrier;});
  const observer=createTurnFeedback(transport),persist=vi.fn();
  observer.changed(snapshot(),false,persist);await Promise.resolve();
  observer.changed(snapshot({closed:1,execution:'settled',delivery:'accepted',reviewRequired:false}),true,persist);
  observer.changed(snapshot(),false,persist);
  release();await observer.drain!();
  expect(calls).toEqual(['add:处理中','remove:处理中','add:回复已提交']);
  expect(persist).toHaveBeenLastCalledWith('submitted','submitted','accepted');
});
it('does not mutate the platform if feedback intent cannot be persisted',async()=>{
  const send=vi.fn();const observer=createTurnFeedback(send);observer.changed(snapshot(),false,()=>{throw new Error('disk');});
  await observer.drain!();expect(send).not.toHaveBeenCalled();
});
it('stops on an unknown mutation and preserves final desired state for operator inspection',async()=>{
  const send=vi.fn(async()=>{throw new Error('private timeout');}),persist=vi.fn();const observer=createTurnFeedback(send);
  observer.changed(snapshot(),false,persist);await observer.drain!();
  observer.changed(snapshot({closed:1,execution:'settled',delivery:'accepted',reviewRequired:false}),true,persist);await observer.drain!();
  expect(send).toHaveBeenCalledOnce();expect(persist).toHaveBeenLastCalledWith('submitted',undefined,'unknown');
  expect(JSON.stringify(persist.mock.calls)).not.toContain('private timeout');
});
it('bounds waiting and cannot mark an aborted late result accepted',async()=>{
  vi.useFakeTimers();let release!:()=>void;const barrier=new Promise<void>(r=>release=r);const persist=vi.fn();
  const observer=createTurnFeedback(async()=>barrier);observer.changed(snapshot(),false,persist);await Promise.resolve();
  const drained=observer.drain!();await vi.advanceTimersByTimeAsync(6000);await drained;
  release();await Promise.resolve();await Promise.resolve();
  expect(persist.mock.calls.some(c=>c[2]==='accepted')).toBe(false);
  expect(persist.mock.calls.at(-1)?.[2]).toBe('unknown');
});
it('does not retract a label it has never successfully applied',async()=>{
  const send=vi.fn(async()=>{});const observer=createTurnFeedback(send);
  observer.changed(snapshot({closed:1,execution:'unknown',reviewRequired:true}),true,vi.fn());await observer.drain!();
  expect(send).toHaveBeenCalledWith('add','结果待核查',expect.any(AbortSignal));
  expect(send).toHaveBeenCalledOnce();
});
