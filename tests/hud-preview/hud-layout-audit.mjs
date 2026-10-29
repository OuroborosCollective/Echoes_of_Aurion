#!/usr/bin/env node
/**
 * Deterministic HUD layout audit (real Chromium, real CSS).
 *
 * Fails (exit 1) when, on any listed device, any HUD control
 *   - leaves the screen,
 *   - overlaps another control, or
 *   - is smaller than the 44 CSS px touch minimum (compact controls extend their hit area with ::after).
 *
 *   node tools/hud-layout-audit.mjs [baseUrl]      default baseUrl: http://localhost:4173/index.html
 *   HUD_AUDIT_CSS="*{letter-spacing:.06em!important}" node tools/hud-layout-audit.mjs   stress test with wider text
 *
 * Serve the preview first (see hud-preview/README.md). Requires `playwright` (Chromium).
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.argv[2] ?? "http://localhost:4173/index.html";
const DEVICES = {
  "Tab A9 landscape 1340x800": { w: 1340, h: 800, touch: true },
  "Tab A9 portrait 800x1340": { w: 800, h: 1340, touch: true },
  "phone-landscape 844x390": { w: 844, h: 390, touch: true },
  "phone-small-landscape 667x375": { w: 667, h: 375, touch: true },
  "phone-portrait 390x844": { w: 390, h: 844, touch: true },
  "phone-small-portrait 360x640": { w: 360, h: 640, touch: true },
  "tablet-landscape 1180x820": { w: 1180, h: 820, touch: true },
  "tablet-portrait 820x1180": { w: 820, h: 1180, touch: true },
  "desktop 1440x900": { w: 1440, h: 900, touch: false },
};
const SOLID = ".ax-unit,.ax-status>*,.ax-party,.ax-metrics-chip,.ax-nav,.ax-minimap,.ax-tracker,.ax-joy,.ax-railbtn,.ax-orb";
const TOUCH = ".ax-orb,.ax-navbtn,.ax-railbtn,.ax-portrait,.ax-tracker__head,.ax-party__member,.ax-nearby__item,.ax-link";
const VARIANTS = {
  default: async () => {},
  "tracker+party expanded": async page => {
    for (const name of ["Ziele öffnen", "Party öffnen"]) {
      const button = page.getByRole("button", { name, exact: true });
      if (await button.count()) await button.click();
    }
  },
};

const measure = async page => page.evaluate(({ SOLID, TOUCH }) => {
  const box = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, round: getComputedStyle(el).borderRadius.includes("50%") }; };
  const label = el => `${el.className.toString().split(" ")[0]}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}`;
  const solids = [...document.querySelectorAll(SOLID)].filter(el => el.getBoundingClientRect().width > 0).map(el => ({ name: label(el), ...box(el) }));
  const touch = [...document.querySelectorAll(TOUCH)].filter(el => el.getBoundingClientRect().width > 0).map(el => ({ name: label(el), ...box(el) }));
  // children that must stay fully inside their panel (catches flex-squeezed headers that merely touch their neighbours)
  const contained = [...document.querySelectorAll(".ax-party,.ax-tracker,.ax-unit")].flatMap(parent => [...parent.querySelectorAll(":scope > button, :scope > .ax-tracker__head")].map(child => ({ name: label(parent), parent: box(parent), child: box(child) })));
  // captions inside round buttons must lie inside the circle (text that pokes over the rim looks broken)
  const caps = [...document.querySelectorAll(".ax-orb")].flatMap(orb => {
    const cap = orb.querySelector(".ax-orb__cap");
    const c = cap?.getBoundingClientRect();
    if (!cap || !c || c.width === 0) return [];
    const o = orb.getBoundingClientRect();
    const cx = o.left + o.width / 2, cy = o.top + o.height / 2, r = o.width / 2;
    const worst = Math.max(...[[c.left, c.top], [c.right, c.top], [c.left, c.bottom], [c.right, c.bottom]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
    return [{ name: `${label(orb)} "${cap.textContent}"`, outside: worst - (r - 1) }];
  });
  return { solids, touch, contained, caps, vw: innerWidth, vh: innerHeight };
}, { SOLID, TOUCH });

// Round controls (orbs, minimap, stick) are tested as circles: their bounding squares may touch without the shapes touching.
const centre = a => ({ x: a.x + a.w / 2, y: a.y + a.h / 2 });
const overlap = (a, b) => {
  if (a.round && b.round) {
    const ca = centre(a), cb = centre(b);
    return Math.hypot(ca.x - cb.x, ca.y - cb.y) < (a.w + b.w) / 2 - 0.5;
  }
  if (a.round !== b.round) {
    const [c, r] = a.round ? [a, b] : [b, a];
    const cc = centre(c);
    const nx = Math.max(r.x, Math.min(cc.x, r.x + r.w)), ny = Math.max(r.y, Math.min(cc.y, r.y + r.h));
    return Math.hypot(cc.x - nx, cc.y - ny) < c.w / 2 - 0.5;
  }
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
};
let failures = 0;
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [name, d] of Object.entries(DEVICES)) {
  for (const [variant, act] of Object.entries(VARIANTS)) {
    const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, hasTouch: d.touch, isMobile: d.touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForSelector("[data-testid=ax1-game-hud]");
    if (process.env.HUD_AUDIT_CSS) await page.addStyleTag({ content: process.env.HUD_AUDIT_CSS }); // e.g. wider fonts: "*{letter-spacing:.06em!important}"
    await page.waitForTimeout(300);
    await act(page);
    await page.waitForTimeout(150);
    if (process.env.HUD_SCREENSHOTS && name.startsWith("Tab A9") && variant === "default") {
      await mkdir(process.env.HUD_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: `${process.env.HUD_SCREENSHOTS}/${d.w}x${d.h}.png` });
    }
    const { solids, touch, contained, caps, vw, vh } = await measure(page);
    const problems = [];
    const mobileHud = await page.locator(".xaurion-game-hud.ax-hud").count();
    const desktopHud = await page.locator(".xaurion-game-hud:not(.ax-hud)").count();
    if (d.touch && mobileHud !== 1) problems.push("touch device did not render mobile HUD");
    if (!d.touch && desktopHud !== 1) problems.push("desktop did not retain the desktop HUD");
    // In the default layout, keep the central gameplay area clear on Tab A9.
    // Expanded panels are allowed to cover it temporarily.
    if (name.startsWith("Tab A9") && variant === "default") {
      const view = { x: vw * 0.38, y: vh * 0.38, w: vw * 0.24, h: vh * 0.24, round: false };
      for (const s of solids) if (overlap(s, view)) problems.push(`central play area obstructed: ${s.name}`);
    }
    for (const s of solids) if (s.x < -0.5 || s.y < -0.5 || s.x + s.w > vw + 0.5 || s.y + s.h > vh + 0.5) problems.push(`off-screen: ${s.name}`);
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) if (overlap(solids[i], solids[j])) problems.push(`overlap: ${solids[i].name} x ${solids[j].name}`);
    for (const c of contained) if (c.child.y < c.parent.y - 0.5 || c.child.y + c.child.h > c.parent.y + c.parent.h + 0.5) problems.push(`squeezed: ${c.name} does not fit inside its panel`);
    for (const c of caps) if (c.outside > 0.5) problems.push(`caption pokes out of its round button by ${c.outside.toFixed(1)}px: ${c.name}`);
    for (const t of touch) if (t.w < 43.5 || t.h < 43.5) problems.push(`touch target < 44px: ${t.name} (${t.w.toFixed(0)}x${t.h.toFixed(0)})`);
    // Verify the real pointer path: the blocking deck closes before the group
    // shortcut is used, and the preview callback actually receives the click.
    if (d.touch && variant === "default") {
      const nav = page.getByRole("navigation", { name: "Schnellnavigation" });
      await nav.getByRole("button", { name: "Weitere Menüs", exact: true }).click({ timeout: 5000 });
      const deck = page.getByRole("dialog", { name: "Weitere Menüs", exact: true });
      await deck.getByRole("button", { name: "Menü schließen", exact: true }).click({ timeout: 5000 });
      await nav.getByRole("button", { name: "Gruppe", exact: true }).click({ timeout: 5000 });
      if (await page.getByTestId("preview-party-open-count").textContent() !== "1") problems.push("group shortcut did not invoke its callback after closing the menu");
    }
    console.log(`${problems.length ? "FAIL" : "ok  "} ${name} · ${variant}${problems.length ? "\n   - " + [...new Set(problems)].join("\n   - ") : ""}`);
    failures += problems.length;
    await ctx.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);

