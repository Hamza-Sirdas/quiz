const hostKey = (pin: string) => `quizora:host:${pin}`;
const presenterKey = (pin: string) => `quizora:presenter:${pin}`;
const playerKey = (pin: string) => `quizora:player:${pin}`;

export function saveHostToken(pin: string, token: string): void {
  try {
    window.sessionStorage.setItem(hostKey(pin), token);
    window.localStorage.setItem(hostKey(pin), token);
  } catch {
    // storage erişilemezse sessizce geç
  }
}

export function readHostToken(pin: string): string | null {
  try {
    return (
      window.sessionStorage.getItem(hostKey(pin)) ??
      window.localStorage.getItem(hostKey(pin))
    );
  } catch {
    return null;
  }
}

export function clearHostToken(pin: string): void {
  try {
    window.sessionStorage.removeItem(hostKey(pin));
    window.localStorage.removeItem(hostKey(pin));
  } catch {
    // ignore
  }
}

export function savePresenterToken(pin: string, token: string): void {
  try {
    window.sessionStorage.setItem(presenterKey(pin), token);
    window.localStorage.setItem(presenterKey(pin), token);
  } catch {
    // ignore
  }
}

export function readPresenterToken(pin: string): string | null {
  try {
    return (
      window.sessionStorage.getItem(presenterKey(pin)) ??
      window.localStorage.getItem(presenterKey(pin))
    );
  } catch {
    return null;
  }
}

export function clearPresenterToken(pin: string): void {
  try {
    window.sessionStorage.removeItem(presenterKey(pin));
    window.localStorage.removeItem(presenterKey(pin));
  } catch {
    // ignore
  }
}

export function savePlayerToken(pin: string, token: string): void {
  try {
    window.sessionStorage.setItem(playerKey(pin), token);
  } catch {
    // ignore
  }
}

export function readPlayerToken(pin: string): string | null {
  try {
    return window.sessionStorage.getItem(playerKey(pin));
  } catch {
    return null;
  }
}

export function clearPlayerToken(pin: string): void {
  try {
    window.sessionStorage.removeItem(playerKey(pin));
  } catch {
    // ignore
  }
}

export function formatPinDisplay(pin: string): string {
  const clean = pin.replace(/\D/g, '').slice(0, 6);
  if (clean.length <= 3) return clean;
  return `${clean.slice(0, 3)} ${clean.slice(3)}`;
}
