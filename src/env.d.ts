// src/env.d.ts
// VSCode/TypeScript の型エラー回避用（window.p5 / window.__kolloidP5__）

export {};

declare global {
  interface Window {
    p5?: any;
    __kolloidP5__?: { remove: () => void } | null;
  }
}