import fs from 'fs';

const content = fs.readFileSync('server/zoneRuntime.ts', 'utf8');

const search = `  private refreshPeerOrder(): void {
    if (!this.sortedPeersDirty) return;
    // ⚡ Bolt: Eliminate dynamic array creation and mapping per tick
    this.sortedPeers.length = this.peers.size;
    this.sortedPeersByEntityId.length = this.peers.size;
    this.sortedPresences.length = this.peers.size;

    let i = 0;
    for (const peer of this.peers.values()) {
      this.sortedPeers[i] = peer;
      this.sortedPeersByEntityId[i] = peer;
      i++;
    }

    this.sortedPeers.sort((a, b) => compareBinary(a.connectionId, b.connectionId));
    this.sortedPeersByEntityId.sort((a, b) => compareBinary(\`player:\${a.userId}\`, \`player:\${b.userId}\`));

    for (let j = 0; j < this.sortedPeersByEntityId.length; j++) {
      this.sortedPresences[j] = this.sortedPeersByEntityId[j].presence;
    }

    this.sortedPeersDirty = false;
  }`;

const replacement = `  private refreshPeerOrder(): void {
    if (!this.sortedPeersDirty) return;
    this.sortedPeers = Array.from(this.peers.values()).sort((a, b) => compareBinary(a.connectionId, b.connectionId));
    this.sortedPeersByEntityId = Array.from(this.peers.values()).sort((a, b) => compareBinary(\`player:\${a.userId}\`, \`player:\${b.userId}\`));
    this.sortedPresences = this.sortedPeersByEntityId.map(peer => peer.presence);
    this.sortedPeersDirty = false;
  }`;

if (content.includes(search)) {
  fs.writeFileSync('server/zoneRuntime.ts', content.replace(search, replacement));
  console.log('Patched peers back successfully');
} else {
  console.log('Search string not found');
}
