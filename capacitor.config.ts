import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "im.aurion.echoes",
  appName: "Echoes of Aurion",
  webDir: "dist/itch",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
  },
};

export default config;
