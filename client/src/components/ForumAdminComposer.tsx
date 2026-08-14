import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Megaphone, Pin } from "lucide-react";
import { useState } from "react";

type StaffCategory = "announcements" | "patch_notes" | "events";

const labels: Record<StaffCategory, string> = {
  announcements: "Ankündigung",
  patch_notes: "Patch Note",
  events: "Event",
};

export default function ForumAdminComposer() {
  const [category, setCategory] = useState<StaffCategory>("announcements");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const utils = trpc.useUtils();
  const createThread = trpc.admin.community.createForumThread.useMutation({
    onSuccess: async () => {
      setTitle("");
      setBody("");
      setPinned(false);
      await utils.community.forum.list.invalidate({ category });
    },
  });

  return <Card className="border-amber-200/15 bg-slate-950/70">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-amber-100"><Megaphone className="h-5 w-5" />Forum-Redaktion</CardTitle>
      <CardDescription>Hier veröffentlichst du sichtbare Sternwartenmeldungen. Community-Fragen entstehen im allgemeinen Forum direkt aus dem Spiel.</CardDescription>
    </CardHeader>
    <CardContent>
      <form className="grid gap-3 md:grid-cols-[.8fr_1.2fr]" onSubmit={event => { event.preventDefault(); if (title.trim() && body.trim()) createThread.mutate({ category, title, body, pinned }); }}>
        <div className="space-y-3">
          <div className="space-y-2"><Label htmlFor="forumCategory">Bereich</Label><select id="forumCategory" value={category} onChange={event => setCategory(event.target.value as StaffCategory)} className="flex h-10 w-full rounded-md border border-cyan-200/20 bg-slate-950 px-3 text-sm"><option value="announcements">Ankündigungen</option><option value="patch_notes">Patch Notes</option><option value="events">Events</option></select></div>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={pinned} onChange={event => setPinned(event.target.checked)} /><Pin className="h-3.5 w-3.5 text-cyan-300" />Oben anheften</label>
          <Button type="submit" disabled={!title.trim() || !body.trim() || createThread.isPending} className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-300">{createThread.isPending ? "Wird veröffentlicht…" : `${labels[category]} veröffentlichen`}</Button>
        </div>
        <div className="space-y-3"><div className="space-y-2"><Label htmlFor="forumTitle">Titel</Label><Input id="forumTitle" value={title} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder="Titel der Sternwartenmeldung" /></div><div className="space-y-2"><Label htmlFor="forumBody">Beitrag</Label><textarea id="forumBody" value={body} maxLength={8000} onChange={event => setBody(event.target.value)} rows={5} className="flex w-full rounded-md border border-cyan-200/20 bg-slate-950 px-3 py-2 text-sm" placeholder="Klarer, nachvollziehbarer Inhalt für die Community…" /></div>{createThread.error && <p className="text-sm text-red-300">{createThread.error.message}</p>}</div>
      </form>
    </CardContent>
  </Card>;
}
