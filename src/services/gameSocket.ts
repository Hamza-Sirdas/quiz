import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@shared/gameTypes';
import { SOCKET_URL } from '@/config/runtime';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createGameSocket(): GameSocket {
  const options = {
    path: '/socket.io',
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
    withCredentials: true,
    transports: ['websocket', 'polling'],
  };

  return SOCKET_URL ? io(SOCKET_URL, options) : io(options);
}

export async function measureClockOffset(socket: GameSocket): Promise<number> {
  const sample = () =>
    new Promise<{ rtt: number; offset: number }>((resolve) => {
      const sentAt = Date.now();
      const timeout = window.setTimeout(() => {
        resolve({ rtt: Number.MAX_SAFE_INTEGER, offset: 0 });
      }, 2000);

      socket.emit('time:sync', { clientSentMs: sentAt }, (res) => {
        window.clearTimeout(timeout);
        const receivedAt = Date.now();
        const rtt = Math.max(0, receivedAt - res.clientSentMs);
        const estimatedServerAtReceive = res.serverNowMs + rtt / 2;
        resolve({
          rtt,
          offset: estimatedServerAtReceive - receivedAt,
        });
      });
    });

  const first = await sample();
  const second = await sample();

  const best = first.rtt <= second.rtt ? first : second;
  return best.rtt === Number.MAX_SAFE_INTEGER ? 0 : Math.round(best.offset);
}
