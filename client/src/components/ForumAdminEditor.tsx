import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilePenLine, Pin } from "lucide-react";
import { useState } from "react";

type StaffCategory = "announcements" | "patch_notes" | "events";

export default function ForumAdminEditor() {
  const utils = trpc.useUtils();
  const threads = trpc.admin.community.listEditorialThreads.useQuery();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [category, setCategory] = useState<StaffCategory>("announcements");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const updateThread = trpc.admin.community.updateForumThread.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.admin.community.listEditorialThreads.invalidate(),
        utils.community.forum.list.invalidate(),
      ]);
    },
  });
  const selectThread = (thread: NonNullable<typeof threads.data>[number]) => {
    setThreadId(thread.id);
    setCategory(thread.category as StaffCategory);
    setTitle(thread.title);
    setBody(thread.body);
    setPinned(Boolean(thread.pinned));
  };

  return <Card className="border-cyan-200/15 bg-slate-950/70">
    <CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><FilePenLine className="h-5 w-5" />Redaktionelle Einträge bearbeiten</CardTitle><CardDescription>Nur Administratoren können bestehende Ankündigungen, Patch Notes und Events aktualisieren. Jede Änderung wird serverseitig rückgelesen.</CardDescription></CardHeader>
    <CardContent className="grid gap-4 lg:grid-cols-[.82fr_1.18fr]">
      <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-cyan-200/10 p-2">{threads.data?.map(thread => <button type="button" key={thread.id} onClick={() => selectThread(thread)} className={`w-full rounded-md border p-3 text-left text-sm ${threadId === thread.id ? "border-cyan-300/60 bg-cyan-400/10" : "border-cyan-200/10 hover:bg-cyan-400/[.04]"}`}><p className="font-medium text-amber-50">{thread.title}</p><p className="mt-1 text-xs text-cyan-100/60">{thread.category} · {thread.pinned ? "angeheftet" : "normal"}</p></button>)}{!threads.data?.length && <p className="p-3 text-sm text-slate-400">Keine redaktionellen Einträge vorhanden.</p>}</div>
      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); if (threadId && title.trim() && body.trim()) updateThread.mutate({ threadId, category, title, body, pinned }); }}>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="forumEditCategory">Bereich</Label><select id="forumEditCategory" value={category} onChange={event => setCategory(event.target.value as StaffCategory)} disabled={!threadId} className="flex h-10 w-full rounded-md border border-cyan-200/20 bg-slate-950 px-3 text-sm"><option value="announcements">Ankündigungen</option><option value="patch_notes">Patch Notes</option><option value="events">Events</option></select></div><label className="mt-8 flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={pinned} disabled={!threadId} onChange={event => setPinned(event.target.checked)} /><Pin className="h-3.5 w-3.5 text-cyan-300" />Oben anheften</label></div>
        <div className="space-y-2"><Label htmlFor="forumEditTitle">Titel</Label><Input id="forumEditTitle" value={title} disabled={!threadId} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder="Zuerst links einen Eintrag wählen" /></div>
        <div className="space-y-2"><Label htmlFor="forumEditBody">Beitrag</Label><textarea id="forumEditBody" value={body} disabled={!threadId} maxLength={8000} onChange={event => setBody(event.target.value)} rows={5} className="flex w-full rounded-md border border-cyan-200/20 bg-slate-950 px-3 py-2 text-sm" placeholder="Bearbeiteter Redaktionstext…" /></div>
        {updateThread.error && <p className="text-sm text-red-300">{updateThread.error.message}</p>}<Button type="submit" disabled={!threadId || !title.trim() || !body.trim() || updateThread.isPending} className="bg-cyan-500 text-slate-950 hover:bg-cyan-300">{updateThread.isPending ? "Bearbeitung wird bestätigt…" : "Redaktionseintrag speichern"}</Button>
      </form>
    </CardContent>
  </Card>;
}
