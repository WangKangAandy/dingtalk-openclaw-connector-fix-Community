/**
 * 日志级别（唯一约定）
 *
 * | 级别  | 何时用                         | 是否受 debug 开关 |
 * |-------|--------------------------------|-------------------|
 * | debug | 心跳、帧细节、排查过程         | 是，关了不输出     |
 * | info  | 正常业务：连接、到账、发送成功 | 否，始终输出       |
 * | warn  | 能继续，但需要人看             | 否                |
 * | error | 失败                           | 否                |
 *
 * 不要用 warn 代替 info，也不要再 console.log 绕过级别。
 */

export function createLogger(debug: boolean = false, prefix: string = '') {
  const logger = {
    info(...args: any[]) {
      if (prefix) {
        console.log(`[${prefix}]`, ...args);
      } else {
        console.log(...args);
      }
    },

    warn(...args: any[]) {
      if (prefix) {
        console.warn(`[${prefix}]`, ...args);
      } else {
        console.warn(...args);
      }
    },

    error(...args: any[]) {
      if (prefix) {
        console.error(`[${prefix}]`, ...args);
      } else {
        console.error(...args);
      }
    },

    debug(...args: any[]) {
      if (!debug) return;
      if (prefix) {
        console.log(`[DEBUG][${prefix}]`, ...args);
      } else {
        console.log('[DEBUG]', ...args);
      }
    },
  };

  return logger;
}

export function createLoggerFromConfig(config: { debug?: boolean } | undefined | null, prefix: string = '') {
  return createLogger(!!config?.debug, prefix);
}
