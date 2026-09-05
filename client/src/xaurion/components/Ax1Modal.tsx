import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AX1_UI_SOURCE } from "@shared/playerUiProtocol";
import "./ax1ImportedUi.css";

/** AX1 overlays retain their own visual shell; Radix supplies focus, Escape and restoration. */
export function Ax1Modal({ open, onClose, id, title, children }: { open: boolean; onClose: () => void; id: string; title: string; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}><Dialog.Portal><Dialog.Content asChild aria-describedby={undefined}>
    <div id={`${id}-modal-overlay`} className="ax1-imported-ui fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4" data-ax1-source={AX1_UI_SOURCE} data-aurion-panel="open"><Dialog.Title className="sr-only">{title}</Dialog.Title>{children}</div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
