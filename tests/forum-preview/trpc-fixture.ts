// Isolated preview only: deliberately synthetic local read-only fixture.
const invalidate = async () => undefined;
export const trpc = {
  useUtils: () => ({ admin: { community: { listEditorialThreads: { invalidate } } }, community: { forum: { list: { invalidate } } } }),
  admin: { community: {
    listEditorialThreads: { useQuery: () => ({ data: [{ id: "t1", title: "Observatorium", category: "events", body: "Sternenfest", pinned: true }] }) },
    updateForumThread: { useMutation: () => ({ isPending: false, error: null, mutate: () => undefined }) },
  } },
};
