import { canonicalSha256 } from "../../shared/aurionCanonicalHash";

const BARE=/^[a-f0-9]{64}$/;

export function tradeCraftingSourceEvidenceHash(receipt:Readonly<{receiptHash:string}>):string{
  if(!BARE.test(receipt.receiptHash)) throw new Error("ECONOMIC_TRADE_CRAFTING_SOURCE_HASH_INVALID");
  return `sha256:${receipt.receiptHash}`;
}

export function lootV2SourceEvidenceHash(
  receipt:Readonly<{
    id:string;userId:number;encounterReceiptId:string;itemDefinitionId:string;category:string;quality:string;
    itemLevelExact:string;setId:string|null;resolvedJson:string;contextHash:string;deterministicHash:string;
    ruleSetVersion:string;contentVersion:string;idempotencyKey:string;
  }>,
  item:Readonly<{
    id:string;ownerUserId:number;lootReceiptId:string;baseItemDefinitionId:string;category:string;equipmentSlot:string|null;
    quality:string;itemLevelExact:string;affixesJson:string;setId:string|null;itemPower:number;deterministicHash:string;status:string;
  }>,
):string{
  if(item.lootReceiptId!==receipt.id||item.deterministicHash!==receipt.deterministicHash) throw new Error("ECONOMIC_LOOT_SOURCE_IDENTITY_INVALID");
  return canonicalSha256({
    schema:"aurion.economic-source.loot-v2.v1",
    receipt:{
      id:receipt.id,userId:receipt.userId,encounterReceiptId:receipt.encounterReceiptId,itemDefinitionId:receipt.itemDefinitionId,
      category:receipt.category,quality:receipt.quality,itemLevelExact:receipt.itemLevelExact,setId:receipt.setId,
      resolvedJson:receipt.resolvedJson,contextHash:receipt.contextHash,deterministicHash:receipt.deterministicHash,
      ruleSetVersion:receipt.ruleSetVersion,contentVersion:receipt.contentVersion,idempotencyKey:receipt.idempotencyKey,
    },
    itemCreation:{
      id:item.id,lootReceiptId:item.lootReceiptId,baseItemDefinitionId:item.baseItemDefinitionId,
      category:item.category,equipmentSlot:item.equipmentSlot,quality:item.quality,itemLevelExact:item.itemLevelExact,
      affixesJson:item.affixesJson,setId:item.setId,itemPower:item.itemPower,deterministicHash:item.deterministicHash,
      originalOwnerUserId:receipt.userId,
    },
  });
}

export function marketTransactionSourceEvidenceHash(row:Readonly<{
  id:string;listingId:string;itemId:string;sellerUserId:number;buyerUserId:number;aurionTransferred:number;idempotencyKey:string;
}>):string{
  return canonicalSha256({schema:"aurion.economic-source.market-transaction.v1",...row});
}

export function systemSaleSourceEvidenceHash(row:Readonly<{
  id:string;itemId:string;sellerUserId:number;aurionGranted:number;
}>):string{
  return canonicalSha256({schema:"aurion.economic-source.system-sale.v1",...row});
}

export function guildBankSourceEvidenceHash(row:Readonly<{
  receiptId:string;guildId:string;actorUserId:number;operation:string;expectedRevision:string|number|bigint;resultingRevision:string|number|bigint;
  idempotencyKey:string;confirmationHash:string;requestHash:string;resultHash:string;ruleSetVersion:string;contentVersion:string;
}>):string{
  return canonicalSha256({
    schema:"aurion.economic-source.guild-bank.v1",
    receiptId:row.receiptId,guildId:row.guildId,actorUserId:row.actorUserId,operation:row.operation,
    expectedRevision:String(row.expectedRevision),resultingRevision:String(row.resultingRevision),
    idempotencyKey:row.idempotencyKey,confirmationHash:row.confirmationHash,requestHash:row.requestHash,resultHash:row.resultHash,
    ruleSetVersion:row.ruleSetVersion,contentVersion:row.contentVersion,
  });
}

export function progressionPointsSourceEvidenceHash(row:Readonly<{
  id:string;userId:number;kind:string;delta:number;source:string;reason:string;idempotencyKey:string;
}>):string{
  if(row.kind!=="points") throw new Error("ECONOMIC_PROGRESSION_SOURCE_KIND_INVALID");
  return canonicalSha256({schema:"aurion.economic-source.progression-points.v1",...row});
}
