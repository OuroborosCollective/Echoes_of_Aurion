import { validConfirmedPresences } from "./shared/zonePresenceContract.js";

const o1 = [{ entityId: "player:1", userId: 1, position: { x: 0, z: 0 }, lastAcceptedClientSeq: 0 }];
console.log("o1", validConfirmedPresences(o1));

const o2 = [{ entityId: "player:1", userId: 1, position: { x: 0, z: 0 }, lastAcceptedClientSeq: 0 }, undefined, null];
console.log("o2", validConfirmedPresences(o2));
