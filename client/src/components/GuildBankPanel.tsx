import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import {
  applyBankPlan,
  bankRequest,
  ownedBankReadback,
  planBankOperation,
} from "@/lib/guildBankClient";
import type { GuildBankOperation } from "@shared/guildBankContract";
import type { GuildBankPlanView } from "@shared/guildBankView";
const labels: Record<GuildBankOperation, string> = {
  deposit_points: "AURION einzahlen",
  withdraw_points: "AURION entnehmen",
  deposit_item: "Gegenstand einlagern",
  withdraw_item: "Gegenstand entnehmen",
  donate_resource_item: "Gegenstand als Ressource spenden",
  upgrade_building: "Gebäude ausbauen",
};
const buildings: Record<string, string> = {
  bld_citadel: "Zitadelle",
  bld_turquoise_wall: "Türkiswall",
  bld_grand_bazaar: "Großer Basar",
  bld_sovereign_academy: "Souveräne Akademie",
  bld_aether_wellspring: "Ätherquelle",
  bld_sovereign_auktionator: "Auktionshaus",
};
export default function GuildBankPanel({ userId }: { userId: number }) {
  const mine = trpc.guild.mine.useQuery(undefined, {
    enabled: userId > 0,
    staleTime: 10_000,
  });
  const create = trpc.guild.create.useMutation();
  const guildId = mine.data?.guild.id;
  const [name, setName] = useState(""),
    [tag, setTag] = useState(""),
    [amount, setAmount] = useState("1"),
    [plan, setPlan] = useState<GuildBankPlanView | null>(null),
    [submittedHash, setSubmittedHash] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const generation = useRef(0),
    abort = useRef<AbortController | null>(null);
  useEffect(() => {
    generation.current++;
    setPlan(null);
    setSubmittedHash(null);
    setBusy(false);
    setMessage("");
    return () => {
      generation.current++;
      abort.current?.abort();
    };
  }, [userId, guildId]);
  const query = useQuery({
    queryKey: ["guild-bank", userId, guildId],
    enabled: Boolean(guildId) && userId > 0,
    staleTime: 10_000,
    refetchInterval: 15_000,
    queryFn: async ({ signal }) => {
      const raw = (await bankRequest("", undefined, signal)) as {
        success?: unknown;
        bank?: unknown;
      };
      if (raw.success !== true) throw Error("BANK_READ_UNCONFIRMED");
      return ownedBankReadback(raw.bank, userId, guildId!);
    },
  });
  const bank = query.data,
    ready = Boolean(bank) && !query.isError && !query.isStale && !busy && !plan;
  const prepare = async (
    operation: GuildBankOperation,
    payload: Record<string, unknown>
  ) => {
    if (!ready || !bank) return;
    const current = generation.current;
    abort.current?.abort();
    const control = new AbortController();
    abort.current = control;
    setBusy(true);
    setMessage("");
    try {
      const next = await planBankOperation(
        bank,
        operation,
        payload,
        control.signal
      );
      if (generation.current === current) {
        setSubmittedHash(null);
        setPlan(next);
      }
    } catch {
      if (generation.current === current)
        setMessage(
          "Die Vorschau wurde nicht bestätigt. Prüfe Guthaben, Rechte und Gegenstand und aktualisiere die Bank."
        );
    } finally {
      if (generation.current === current) setBusy(false);
    }
  };
  const confirm = async () => {
    if (
      !plan ||
      busy ||
      !bank ||
      (bank.revisionExact !== plan.expectedRevisionExact &&
        submittedHash !== plan.confirmationHash)
    )
      return;
    const current = generation.current;
    const control = new AbortController();
    abort.current = control;
    setSubmittedHash(plan.confirmationHash);
    setBusy(true);
    setMessage("");
    try {
      await applyBankPlan(plan, control.signal);
      if (generation.current !== current) return;
      setPlan(null);
      await query.refetch();
      if (generation.current === current)
        setMessage("Die Bankänderung ist bestätigt.");
    } catch {
      if (generation.current === current)
        setMessage(
          "Die Bestätigung ist noch offen. Derselbe Vorgang kann erneut abgefragt werden."
        );
    } finally {
      if (generation.current === current) setBusy(false);
    }
  };
  const amountValid =
    /^[1-9][0-9]{0,9}$/.test(amount) && BigInt(amount) <= 2147483647n;
  if (mine.isLoading) return <p role="status">Gilde wird geladen.</p>;
  if (mine.isError)
    return (
      <>
        <p role="alert">Deine Gilde konnte nicht geladen werden.</p>
        <button onClick={() => void mine.refetch()}>Gilde aktualisieren</button>
      </>
    );
  if (!guildId)
    return (
      <section className="guild-bank-content" aria-label="Gilde gründen">
        <p>Du gehörst noch keiner Gilde an.</p>
        <form
          onSubmit={async event => {
            event.preventDefault();
            if (create.isPending) return;
            setMessage("");
            try {
              await create.mutateAsync({
                name: name.trim(),
                tag: tag.trim().toUpperCase(),
              });
              await mine.refetch();
            } catch {
              setMessage(
                "Die Gründung wurde nicht bestätigt. Prüfe Gildenname und Kürzel."
              );
            }
          }}
        >
          <label>
            Gildenname
            <input
              value={name}
              minLength={3}
              maxLength={48}
              onChange={e => setName(e.target.value)}
              required
            />
          </label>
          <label>
            Gildenkürzel
            <input
              value={tag}
              minLength={2}
              maxLength={8}
              pattern="[A-Za-z0-9]+"
              onChange={e => setTag(e.target.value)}
              required
            />
          </label>
          <button disabled={create.isPending} type="submit">
            Gilde gründen
          </button>
        </form>
        {message && <p role="status">{message}</p>}
      </section>
    );
  return (
    <section
      className="guild-bank-content"
      aria-label="Gildenbank"
      data-testid="guild-bank-panel"
    >
      <h3>{mine.data?.guild.name} · Gildenbank</h3>
      {message && <p role="status">{message}</p>}
      {query.isError ? (
        <p role="alert">Der Bankstand konnte nicht bestätigt werden.</p>
      ) : !bank ? (
        <p role="status">Bankstand wird geladen.</p>
      ) : (
        <>
          {query.isStale && (
            <p role="status">Aktualisierung des Bankstands ausstehend.</p>
          )}
          <p>
            Dein Guthaben: <b>{bank.playerPointsExact} AURION</b>
          </p>
          <p>
            Gildenkasse: <b>{bank.treasuryBalanceExact} AURION</b>
          </p>
          {plan ? (
            <div role="group" aria-label="Bankoperation bestätigen">
              <h4>{labels[plan.operation]}</h4>
              <p>Gilde: {mine.data?.guild.name}</p>
              {typeof plan.payload.amountExact === "string" && (
                <p>Betrag: {plan.payload.amountExact} AURION</p>
              )}
              {typeof plan.payload.itemId === "string" && (
                <p>
                  Gegenstand:{" "}
                  {bank.availableItems.find(
                    i => i.itemId === plan.payload.itemId
                  )?.definitionId ?? plan.payload.itemId}
                </p>
              )}
              {typeof plan.payload.buildingId === "string" && (
                <p>
                  {buildings[plan.payload.buildingId] ??
                    plan.payload.buildingId}{" "}
                  · nächste Stufe
                </p>
              )}
              {plan.operation === "upgrade_building" &&
                bank.buildingOptions
                  .filter(b => b.buildingId === plan.payload.buildingId)
                  .map(
                    b =>
                      b.nextCost && (
                        <p key={b.buildingId}>
                          Verbrauch: {b.nextCost.points} AURION,{" "}
                          {b.nextCost.wood} Holz, {b.nextCost.stone} Stein,{" "}
                          {b.nextCost.aether} Äther aus der Gildenbank.
                        </p>
                      )
                  )}
              {plan.operation === "donate_resource_item" && (
                <p>Der Gegenstand wird dabei verbraucht.</p>
              )}
              {bank.revisionExact !== plan.expectedRevisionExact &&
                submittedHash !== plan.confirmationHash && (
                  <p role="alert">
                    Der Bankstand hat sich geändert. Bitte eine neue Vorschau
                    anfordern.
                  </p>
                )}
              <button
                onClick={() => void confirm()}
                disabled={
                  busy ||
                  (bank.revisionExact !== plan.expectedRevisionExact &&
                    submittedHash !== plan.confirmationHash)
                }
              >
                Verbindlich bestätigen
              </button>
              <button
                onClick={() => {
                  setPlan(null);
                  setSubmittedHash(null);
                  void query.refetch();
                }}
                disabled={busy}
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <>
              <label>
                Betrag in AURION
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  maxLength={10}
                />
              </label>
              {(["deposit_points", "withdraw_points"] as const)
                .filter(op => bank.allowedOperations.includes(op))
                .map(op => (
                  <button
                    key={op}
                    disabled={
                      !ready ||
                      !amountValid ||
                      (op === "deposit_points"
                        ? BigInt(amount || "0") > BigInt(bank.playerPointsExact)
                        : BigInt(amount || "0") >
                          BigInt(bank.treasuryBalanceExact))
                    }
                    onClick={() => void prepare(op, { amountExact: amount })}
                  >
                    {labels[op]} prüfen
                  </button>
                ))}
              <h4>Deine Gegenstände</h4>
              {bank.availableItems.length === 0 && (
                <p>Keine einlagerbaren Gegenstände.</p>
              )}
              {bank.availableItems.map(item => (
                <article key={`${item.itemRecordVersion}:${item.itemId}`}>
                  <b>{item.definitionId.replaceAll("_", " ")}</b>
                  {bank.allowedOperations.includes("deposit_item") && (
                    <button
                      disabled={!ready}
                      onClick={() =>
                        void prepare("deposit_item", {
                          itemRecordVersion: item.itemRecordVersion,
                          itemId: item.itemId,
                        })
                      }
                    >
                      Einlagern prüfen
                    </button>
                  )}
                  {item.resourceKey &&
                    bank.allowedOperations.includes("donate_resource_item") && (
                      <button
                        disabled={!ready}
                        onClick={() =>
                          void prepare("donate_resource_item", {
                            itemRecordVersion: item.itemRecordVersion,
                            itemId: item.itemId,
                            expectedResourceKey: item.resourceKey,
                          })
                        }
                      >
                        Als Ressource spenden prüfen
                      </button>
                    )}
                </article>
              ))}
              <h4>Eingelagerte Gegenstände</h4>
              {bank.heldItems.length === 0 && (
                <p>Die Gildenbank enthält keine Gegenstände.</p>
              )}
              {bank.heldItems.map(item => (
                <article key={item.custodyId}>
                  <span>{item.itemId}</span>
                  {bank.allowedOperations.includes("withdraw_item") && (
                    <button
                      disabled={!ready}
                      onClick={() =>
                        void prepare("withdraw_item", {
                          itemRecordVersion: item.itemRecordVersion,
                          itemId: item.itemId,
                        })
                      }
                    >
                      Entnehmen prüfen
                    </button>
                  )}
                </article>
              ))}
              <h4>Ressourcen & Gebäude</h4>
              <p>
                Holz {bank.resourceBalancesExact.wood} · Stein{" "}
                {bank.resourceBalancesExact.stone} · Äther{" "}
                {bank.resourceBalancesExact.aether}
              </p>
              {bank.buildingOptions.map(building => (
                <article key={building.buildingId}>
                  <b>
                    {buildings[building.buildingId] ?? building.buildingId} ·
                    Stufe {building.levelExact}/{building.maximumLevelExact}
                  </b>
                  {building.nextCost && (
                    <p>
                      Nächste Stufe: {building.nextCost.points} AURION,{" "}
                      {building.nextCost.wood} Holz, {building.nextCost.stone}{" "}
                      Stein, {building.nextCost.aether} Äther
                    </p>
                  )}
                  {building.canUpgrade && (
                    <button
                      disabled={!ready}
                      onClick={() =>
                        void prepare("upgrade_building", {
                          buildingId: building.buildingId,
                          expectedLevelExact: building.levelExact,
                        })
                      }
                    >
                      Ausbau prüfen
                    </button>
                  )}
                </article>
              ))}
            </>
          )}
        </>
      )}
      <button disabled={busy} onClick={() => void query.refetch()}>
        Bank aktualisieren
      </button>
    </section>
  );
}
