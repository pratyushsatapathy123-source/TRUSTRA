/**
 * Structured privacy-conscious server logger for TRUSTRA.
 * Never logs raw user messages, raw prompts, or credentials.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatLog(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const entry: Record<string, unknown> = {
    timestamp,
    level,
    service: 'trustra-api',
    message,
    ...meta,
  };
  return JSON.stringify(entry);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    console.log(formatLog('info', message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(formatLog('warn', message, meta));
  },
  error(message: string, meta?: Record<string, unknown>) {
    console.error(formatLog('error', message, meta));
  },
  debug(message: string, meta?: Record<string, unknown>) {
    if (process.env.DEBUG === 'true') {
      console.debug(formatLog('debug', message, meta));
    }
  },
};
