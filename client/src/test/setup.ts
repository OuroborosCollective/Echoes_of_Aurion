import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  if (typeof document !== "undefined") cleanup();
  if (typeof window !== "undefined") window.history.replaceState({}, "", "/");
});
