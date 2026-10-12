import fs from 'fs';

const content = fs.readFileSync('server/zoneRuntime.ts', 'utf8');

const search = `  private refreshPeerOrder(): void {
    if (!this.sortedPeersDirty) return;
    this.sortedPeers = Array.from(this.peers.values()).sort((a, b) => compareBinary(a.connectionId, b.connectionId));
    this.sortedPeersByEntityId = Array.from(this.peers.values()).sort((a, b) => compareBinary(\`player:\${a.userId}\`, \`player:\${b.userId}\`));
    this.sortedPresences = this.sortedPeersByEntityId.map(peer => peer.presence);
    this.sortedPeersDirty = false;
  }`;

const replacement = `  private refreshPeerOrder(): void {
    if (!this.sortedPeersDirty) return;
    // ⚡ Bolt: Eliminate dynamic array creation and mapping per tick while ensuring valid array length
    const newPeers = new Array(this.peers.size);
    const newPeersByEntityId = new Array(this.peers.size);
    const newPresences = new Array(this.peers.size);

    let i = 0;
    for (const peer of this.peers.values()) {
      newPeers[i] = peer;
      newPeersByEntityId[i] = peer;
      i++;
    }

    newPeers.sort((a, b) => compareBinary(a.connectionId, b.connectionId));
    newPeersByEntityId.sort((a, b) => compareBinary(\`player:\${a.userId}\`, \`player:\${b.userId}\`));

    for (let j = 0; j < newPeersByEntityId.length; j++) {
      newPresences[j] = newPeersByEntityId[j].presence;
    }

    this.sortedPeers = newPeers;
    this.sortedPeersByEntityId = newPeersByEntityId;
    this.sortedPresences = newPresences;
    this.sortedPeersDirty = false;
  }`;

if (content.includes(search)) {
  fs.writeFileSync('server/zoneRuntime.ts', content.replace(search, replacement));
  console.log('Patched peers again successfully');
} else {
  console.log('Search string not found');
}
