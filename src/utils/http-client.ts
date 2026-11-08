/**
 * HTTP 客户端配置模块
 * 
 * 提供统一的 axios 实例，用于钉钉 API 请求。
 * 所有钉钉 API 调用必须使用此模块导出的实例，禁止直接使用 axios 或 fetch。
 * 
 * 使用方式：
 * ```typescript
 * import { dingtalkHttp } from './utils/http-client.ts';
 * 
 * const response = await dingtalkHttp.post('/api/endpoint', data);
 * ```
 */

import axios, { type AxiosInstance } from 'axios';
import { assertConversationOutputActive } from '../core/conversation-run.ts';

/** Enforce Stop at the DingTalk request boundary, including callbacks resumed after an await. */
function guardVisibleOutput(client: AxiosInstance): void {
  const visible = (method: 'post' | 'put', url: unknown): boolean => {
    if (typeof url !== 'string') return false;
    let route: string;
    try { route = new URL(url).pathname; } catch { return false; }
    if (method === 'post') return route === '/robot/send' || route === '/robot/sendBySession' || route === '/media/upload'
      || route.startsWith('/v1.0/robot/') || route.startsWith('/v1.0/card/instances');
    return route.startsWith('/v1.0/card/');
  };
  for (const method of ['post', 'put'] as const) {
    const send = client[method].bind(client);
    client[method] = ((url: string, ...args: unknown[]) => {
      if (visible(method, url)) assertConversationOutputActive();
      return send(url, ...args);
    }) as typeof client[typeof method];
  }
}

/** 钉钉新版 API 专用 HTTP 客户端（30 秒超时，用于 api.dingtalk.com） */
export const dingtalkHttp: AxiosInstance = axios.create({
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});
guardVisibleOutput(dingtalkHttp);

/** 钉钉 OAPI 专用 HTTP 客户端（60 秒超时，用于媒体上传等） */
export const dingtalkOapiHttp: AxiosInstance = axios.create({
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});
guardVisibleOutput(dingtalkOapiHttp);

/** 文件上传专用 HTTP 客户端（120 秒超时，无 body 大小限制） */
export const dingtalkUploadHttp: AxiosInstance = axios.create({
  timeout: 120000,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});
guardVisibleOutput(dingtalkUploadHttp);
