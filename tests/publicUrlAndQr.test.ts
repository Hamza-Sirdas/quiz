import { describe, it, expect, vi, afterEach } from 'vitest';

describe('Public URL & QR Join URL helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('uses VITE_PUBLIC_APP_URL for QR join and present links when configured', async () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://quizora-five-jet.vercel.app/');
    vi.resetModules();

    const { getPublicAppOrigin, buildGameJoinUrl, buildGamePresentUrl } =
      await import('../src/config/runtime');

    expect(getPublicAppOrigin()).toBe('https://quizora-five-jet.vercel.app');
    expect(buildGameJoinUrl('482913')).toBe(
      'https://quizora-five-jet.vercel.app/join/482913',
    );
    expect(buildGameJoinUrl('48-29-13')).toBe(
      'https://quizora-five-jet.vercel.app/join/482913',
    );
    expect(buildGamePresentUrl('482913', 'tok_abc')).toBe(
      'https://quizora-five-jet.vercel.app/present/482913?token=tok_abc',
    );
    expect(buildGameJoinUrl('482913')).not.toMatch(/localhost|127\.0\.0\.1/);
  });

  it('falls back to window.location.origin when VITE_PUBLIC_APP_URL is empty', async () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', '');
    vi.stubGlobal('window', {
      location: {
        origin: 'https://quizora.custom.edu.tr/',
        hostname: 'quizora.custom.edu.tr',
      },
    });
    vi.resetModules();

    const { getPublicAppOrigin, buildGameJoinUrl } = await import(
      '../src/config/runtime'
    );

    expect(getPublicAppOrigin()).toBe('https://quizora.custom.edu.tr');
    expect(buildGameJoinUrl('123456')).toBe(
      'https://quizora.custom.edu.tr/join/123456',
    );
  });
});
