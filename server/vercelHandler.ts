import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServerApp } from './app';

let cachedApp: ((req: IncomingMessage, res: ServerResponse) => void) | null =
  null;

function getHandler() {
  if (!cachedApp) {
    const { app } = createServerApp();
    cachedApp = app as unknown as (
      req: IncomingMessage,
      res: ServerResponse,
    ) => void;
  }
  return cachedApp;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return getHandler()(req, res);
}
