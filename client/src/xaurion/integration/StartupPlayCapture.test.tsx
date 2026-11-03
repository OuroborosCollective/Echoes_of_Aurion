import { act, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Ax1PlayNavigationBridge, { AX1_PLAY_REQUEST_EVENT } from './Ax1PlayNavigationBridge';
import { installStartupViewCapture } from './StartupViewCapture';
import { AURION_PLAY_LAUNCH_KEY } from './AurionPlayRoute';
vi.mock('./AurionOpenWorldRuntime', () => ({ default: () => null }));
vi.mock('./Ax1CompanionOverlay', () => ({ default: () => null }));
vi.mock('@/lib/trpc', () => ({ trpc: { gameplay: { enterOpenWorld: { useMutation: () => ({
  mutate: (_input: unknown, callbacks: any) => callbacks.onSuccess({globalWorld:{worldSeed:'synthetic-navigation-control',epoch:1}}),
}) } } } }));
afterEach(() => { delete window.__aurionStartupCapture; delete window.__aurionStartupCaptureHandoff; history.replaceState(null,'','/'); sessionStorage.clear(); });
it('keeps a one-use capture handoff through the real confirmed homepage-to-play navigation', async () => {
  const nonce = 'a'.repeat(32);
  history.replaceState(null,'','/?aurionParity='+nonce);
  window.__aurionStartupCaptureHandoff = { nonce, documentId:'unit-document' };
  render(<Ax1PlayNavigationBridge />);
  act(() => window.dispatchEvent(new Event(AX1_PLAY_REQUEST_EVENT)));
  await waitFor(() => expect(location.pathname).toBe('/play'));
  expect(location.search).toBe('');
  expect(sessionStorage.getItem(AURION_PLAY_LAUNCH_KEY)).toContain('synthetic-navigation-control');
  const observer = installStartupViewCapture(() => ({}), () => document.createElement('canvas'));
  expect(observer?.nonce).toBe(nonce);
  expect(observer?.documentId).toBe('unit-document');
  expect(window.__aurionStartupCaptureHandoff).toBeUndefined();
  delete window.__aurionStartupCapture;
  expect(installStartupViewCapture(() => ({}), () => document.createElement('canvas'))).toBeNull();
});
