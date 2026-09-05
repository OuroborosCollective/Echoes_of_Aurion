(* Prepared independent replay. Not executed while the Wolfram MCP is unavailable.
   Usage: wolframscript -file scripts/balancing/aim265-wolfram.wl /tmp/aurion-balancing-v2.json
   Inputs are generated from the real TypeScript protocols; this creates no game state. *)
r = Import[Last[$ScriptCommandLine], "RawJSON"];
xp[l_] := Floor[Surd[50^5 l^7, 5]];
integer[s_] := FromDigits[s];
progression = r["progression"];
checks = <|
  "ExactXpRoots" -> And @@ Map[Function[row, integer[row["xpNextExact"]] == xp[integer[row["levelExact"]]]], progression],
  "IncreasingXp1Through10000" -> And @@ Thread[Differences[Table[xp[l], {l, 1, 10000}]] > 0],
  "YieldCarry" -> And @@ Map[Function[row, With[{qr = QuotientRemainder[Max[0, integer[row["levelExact"]] - 49], 1000]},
    qr[[1]] == integer[row["yield"]["guaranteedBonusBatchesExact"]] && 10 qr[[2]] == row["yield"]["bonusChanceBps"]]], progression],
  "BossChunkReconstruction" -> And @@ Flatten[Map[Function[boss, Table[
    With[{qr = QuotientRemainder[boss["coordinatesMm"][[i]] + 32000, 64000], axis = {"x", "z"}[[i]]},
      qr[[1]] == boss["chunk"]["coordinate"][axis] && qr[[2]] == boss["chunk"]["localPositionMm"][axis]], {i, 1, 2}]], r["worldBosses"]]],
  "BossTtk" -> And @@ Flatten[Map[Function[boss, Map[Function[s,
    integer[s["ttkMillisecondsExact"]] == Ceiling[1000 integer[boss["sourceHpExact"]]/(s["partySize"] s["dpsPerPlayer"]) ]], boss["ttkScenarios"]]], r["worldBosses"]]],
  "RecipeYield" -> And @@ Flatten[Map[Function[recipe, Map[Function[y,
    integer[y["expectedOutputNumeratorExact"]]/integer[y["expectedOutputDenominatorExact"]] == integer[recipe["baseOutputExact"]] (1 + Max[0, integer[y["levelExact"]] - 49]/1000)], recipe["yields"]]], r["recipes"]]]
|>;
Print[ExportString[<|"checks" -> checks, "kernelVersion" -> $Version, "inputSha256" -> FileHash[Last[$ScriptCommandLine], "SHA256", "HexString"]|>, "RawJSON"]];
If[!TrueQ[And @@ Values[checks]], Exit[1]];
