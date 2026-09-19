import { createPool, type RowDataPacket } from "mysql2/promise";
import pin from "../config/wasd-npc-capsule.json" with { type: "json" };
const AIM293_BOOTSTRAP_SOURCE_REVISION="002e7c35309816cd043295f47398e52fdb388694";
const AIM293_BOOTSTRAP_SOURCE_SHA256="7a524e3d329dd34205c41fdc00dc088e3b3187ab39c9f17a42a0c2cd8294e82f";
import {
  merchantBootstrapMarkets,
  merchantInventoryStateHash,
  merchantMarketStateHash,
  merchantPolityStateHash,
  type HubId,
} from "../server/wasdNpcCapsule";

if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
const url=new URL(process.env.DATABASE_URL);
if(!["mysql:","mariadb:"].includes(url.protocol)) throw new Error("AIM293_DATABASE_URL_INVALID");
const pool=createPool(process.env.DATABASE_URL);
try{
  const [rows]=await pool.query<RowDataPacket[]>(
    "SELECT hubId,active,marketVersion,marketJson,marketHash,inventoryJson,inventoryHash,polityVersion,polityId,polityStability,polityStateHash,sourceRevision,sourceSha256 FROM aurionNpcActionEpochStates ORDER BY hubId"
  );
  const expectedHubs=Object.keys(merchantBootstrapMarkets).sort() as HubId[];
  if(rows.length!==expectedHubs.length||rows.map(row=>row.hubId).join("|")!==expectedHubs.join("|")) throw new Error("AIM293_EPOCH_SEED_SET_MISMATCH");
  const evidence=[];
  for(const row of rows){
    const hubId=row.hubId as HubId;
    const market=JSON.parse(row.marketJson);
    const inventory=JSON.parse(row.inventoryJson);
    if(row.active!==1&&row.active!==true) throw new Error("AIM293_EPOCH_SEED_ACTIVE_MISMATCH");
    if(Number(row.marketVersion)!==0||Number(row.polityVersion)!==0||Number(row.polityStability)!==72) throw new Error("AIM293_EPOCH_SEED_VERSION_MISMATCH");
    if(JSON.stringify(market)!==JSON.stringify(merchantBootstrapMarkets[hubId])) throw new Error("AIM293_EPOCH_SEED_MARKET_MISMATCH");
    const marketHash=merchantMarketStateHash(market);
    const inventoryHash=merchantInventoryStateHash({ownerId:inventory.ownerId,market,entries:inventory.entries});
    const polityHash=merchantPolityStateHash({polityId:row.polityId,version:Number(row.polityVersion),stability:Number(row.polityStability)});
    if(row.marketHash!==marketHash||inventory.stateHash!==inventoryHash||row.inventoryHash!==inventoryHash||row.polityStateHash!==polityHash) throw new Error("AIM293_EPOCH_SEED_HASH_MISMATCH");
    if(row.polityId!==`polity:${hubId}`||row.sourceRevision!==AIM293_BOOTSTRAP_SOURCE_REVISION||row.sourceSha256!==AIM293_BOOTSTRAP_SOURCE_SHA256) throw new Error("AIM293_EPOCH_SEED_SOURCE_MISMATCH");
    evidence.push({hubId,marketHash,inventoryHash,polityHash});
  }
  process.stdout.write(JSON.stringify({
    schemaVersion:1,
    recordType:"aim293_action_epoch_seed_readback",
    sourceRevision:AIM293_BOOTSTRAP_SOURCE_REVISION,
    sourceSha256:AIM293_BOOTSTRAP_SOURCE_SHA256,
    consumerSourceRevision:pin.sourceRevision,
    consumerSourceSha256:pin.sourceSha256,
    consumerManifestSha256:pin.manifestSha256,
    rowCount:evidence.length,
    rows:evidence,
    readOnly:true,
    databaseCredentialReturned:false,
    secretValuesReturned:false,
  })+"\n");
}finally{
  await pool.end();
}
