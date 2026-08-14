import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, FileBox, X } from "lucide-react";
import { useState } from "react";

export default function GlbSubmissionReview() {
  const submissions = trpc.admin.assets.pendingSubmissions.useQuery();
  const utils = trpc.useUtils();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const review = trpc.admin.assets.reviewSubmission.useMutation({ onSuccess: async () => { await Promise.all([utils.admin.assets.pendingSubmissions.invalidate(), utils.admin.assets.list.invalidate()]); } });

  return <Card className="border-cyan-200/15 bg-slate-950/70">
    <CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><FileBox className="h-5 w-5" />Ausstehende GLB-Einreichungen</CardTitle><CardDescription>Freigaben erzeugen einen geprüften Eintrag im Asset-Katalog. Bei Charakteren wird das Modell zugleich dem einreichenden Spieler zugeordnet.</CardDescription></CardHeader>
    <CardContent className="space-y-3">{submissions.isLoading && <p className="text-sm text-slate-400">Einreichungen werden geladen…</p>}{submissions.error && <p className="text-sm text-red-300">{submissions.error.message}</p>}{submissions.data?.map(submission => <article key={submission.id} className="grid gap-3 rounded border border-cyan-200/15 bg-slate-900/50 p-3 md:grid-cols-[1fr_auto]"><div className="space-y-2"><div><p className="font-medium text-amber-50">{submission.displayName}</p><p className="text-xs text-slate-400">{submission.assetType} · {submission.subcategory} · {submission.visibility} · {(submission.bytes / 1024 / 1024).toFixed(2)} MiB</p><p className="text-xs text-cyan-100/70">von {submission.submitterName || `Explorer ${submission.submittedByUserId}`}</p></div><p className="text-sm leading-6 text-slate-300">{submission.description}</p><a href={submission.storageUrl} target="_blank" rel="noreferrer" className="inline-block text-xs text-cyan-300 underline underline-offset-4">Originales GLB prüfen</a><textarea value={notes[submission.id] ?? ""} maxLength={500} onChange={event => setNotes(current => ({ ...current, [submission.id]: event.target.value }))} className="min-h-16 w-full rounded border border-cyan-200/20 bg-slate-950 p-2 text-sm" placeholder="Optionale Rückmeldung an den Spieler" /></div><div className="flex items-start gap-2"><Button type="button" size="sm" disabled={review.isPending} onClick={() => review.mutate({ submissionId: submission.id, decision: "approved", reviewNote: notes[submission.id] || undefined })} className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"><Check className="h-4 w-4" />Freigeben</Button><Button type="button" size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ submissionId: submission.id, decision: "rejected", reviewNote: notes[submission.id] || undefined })} className="border-red-300/30 text-red-200 hover:bg-red-300/10"><X className="h-4 w-4" />Ablehnen</Button></div></article>)}{!submissions.isLoading && !submissions.data?.length && <p className="text-sm text-slate-400">Aktuell liegen keine GLB-Einreichungen zur Prüfung vor.</p>}</CardContent>
  </Card>;
}
