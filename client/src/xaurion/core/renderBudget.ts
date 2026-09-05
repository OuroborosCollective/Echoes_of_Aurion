/** Projection-only GPU budgets. They never alter simulation ticks, world generation or server state. */
export function renderBudget(width: number, height: number, devicePixelRatio: number, rendererName: string) {
  if (![width,height,devicePixelRatio].every(Number.isFinite) || width <= 0 || height <= 0 || devicePixelRatio <= 0) throw new Error("RENDER_DIMENSIONS_INVALID");
  const software = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(rendererName);
  const tier = width < 768 ? "phone" : width < 1200 ? "tablet" : "desktop";
  const maximumPixels = software ? 96_000 : tier === "phone" ? 400_000 : tier === "tablet" ? 800_000 : 1_600_000;
  const pixelRatio = Math.min(devicePixelRatio, tier === "desktop" ? 2 : 1.5, Math.sqrt(maximumPixels / width / height));
  return Object.freeze({ tier, software, maximumPixels, pixelRatio, far: software ? 96 : tier === "phone" ? 220 : tier === "tablet" ? 320 : 500 });
}
