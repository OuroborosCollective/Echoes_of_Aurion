# AURS v2 public NPC snapshots

Source: `-ax1@d356881538dae23c3aa97364a5596d48b6ac3079`, `src/engine/net/BinaryNPCSnapshotSerializer.ts`, SHA256 `a5fdd0c434cf75f50bb19913c77c82f0ad07d7b1191ef5c1a9c452bd7baf7859`.

The source v1 uses wall-clock timestamps, numeric extraction/truncation of actor IDs, partial UTF-8 names, unchecked state mapping and an unused checksum slot. Aurion uses an explicitly incompatible v2 public projection. It preserves full bounded canonical actor/region identities, exact float64 needs and decision hashes, and uses confirmed receipt indices. It has no implicit clock or random call. Raw memories and observation text remain server-side; only the bounded count is projected.

The 24-byte big-endian header contains AURS magic, version, count, maximum receipt index, exact payload length, FNV-1a corruption checksum and zero reserved flags. At most 128 actors and 65,536 bytes are accepted. Count, length, version, flags and checksum are verified before actor allocation. Every read checks remaining bytes, enums, finite [0,1] needs, memory count, identity uniqueness/canonical ordering and the aggregate index. Trailing bytes and every truncation are rejected. The checksum is not a MAC; the authenticated HTTP boundary owns trust.

The actual `gameplay.npcSnapshots` protected query reads Lyra/Orun under a consistent database transaction and verifies each latest persisted state against its immutable decision receipt. A corrupt/missing/legacy receipt rejects the entire result. Reading never creates NPC decisions or advances ticks. No rows means an explicit empty projection.

The native contacts/quests surface decodes the owner-bound bounded packet before showing NPC behavior. Invalid/foreign responses show a recoverable error with no partial actor list. This supplies an actual server → transport → UI consumer; it does not invent server-confirmed mob coordinates or claim MobFSM/AOI work complete.

Regression: deterministic reorder/replay, exact values and immutable results; every truncation; header/body/checksum corruption; semantic invalidity with a recomputed checksum; max allocation/count; UI rejection of foreign/corrupt packets; real MariaDB receipt rehydration and corruption rejection. No schema changes.
