import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

/**
 * Listens for events that should trigger a causal backup notification.
 * In a real system, the server might send a push notification.
 * For this implementation, we hook into the quest completion and logout logic
 * by showing a confirmation toast when those actions are performed.
 */
export function CausalBackupNotifier() {
  const utils = trpc.useUtils();

  useEffect(() => {
    const handleBackup = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      toast.success(detail.message || "Kausale Kette gesichert", {
        description: "Der Weltzustand und deine Fortschritte wurden im Kaltlager archiviert.",
        icon: <ShieldCheck className="h-4 w-4 text-emerald-400" />,
        duration: 5000,
      });
    };

    window.addEventListener("aurion:causal-backup-confirmed", handleBackup);
    return () => window.removeEventListener("aurion:causal-backup-confirmed", handleBackup);
  }, []);

  return null;
}
