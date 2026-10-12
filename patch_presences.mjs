import fs from 'fs';

const content = fs.readFileSync('server/zoneRuntime.ts', 'utf8');

const search = `  private presences(): ZonePresence[] {
    this.refreshPeerOrder();
    // ⚡ Bolt: Return a sliced copy of the cached array to ensure validation doesn't fail due to extra empty slots
    const presences = new Array(this.sortedPeersByEntityId.length);
    for (let i = 0; i < this.sortedPeersByEntityId.length; i++) {
      const peer = this.sortedPeersByEntityId[i];
      peer.presence.position = peer.position;
      peer.presence.lastAcceptedClientSeq = peer.lastAcceptedClientSeq;
      presences[i] = peer.presence;
    }
    return presences;
  }`;

const replacement = `  private presences(): ZonePresence[] {
    this.refreshPeerOrder();
    // ⚡ Bolt: Iterate over cached objects to avoid creating new ZonePresence objects on every tick
    for (let i = 0; i < this.sortedPeersByEntityId.length; i++) {
      const peer = this.sortedPeersByEntityId[i];
      peer.presence.position = peer.position;
      peer.presence.lastAcceptedClientSeq = peer.lastAcceptedClientSeq;
    }
    return this.sortedPresences;
  }`;

if (content.includes(search)) {
  fs.writeFileSync('server/zoneRuntime.ts', content.replace(search, replacement));
  console.log('Patched presences back successfully');
} else {
  console.log('Search string not found');
}
