const isProd = process.env.NODE_ENV === 'production';

type LogMeta = Record<string, unknown>;

function write(level: 'info' | 'warn' | 'error', event: string, meta?: LogMeta): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(meta ?? {}),
  };

  if (isProd) {
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }

  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[QUIZORA ${level.toUpperCase()}] ${event}${suffix}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, meta?: LogMeta) => write('info', event, meta),
  warn: (event: string, meta?: LogMeta) => write('warn', event, meta),
  error: (event: string, meta?: LogMeta) => write('error', event, meta),
};
