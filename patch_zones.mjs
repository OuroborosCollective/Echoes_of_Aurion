import fs from 'fs';

const content = fs.readFileSync('server/zoneRuntime.ts', 'utf8');

const search = `  tick(): void {
    if (this.sortedZonesDirty) {
      this.sortedZones = Array.from(this.zones.entries()).sort(([left], [right]) => compareBinary(left, right)).map(([, zone]) => zone);
      this.sortedZonesDirty = false;
    }
    for (const zone of this.sortedZones) zone.tick();
  }`;

const replacement = `  tick(): void {
    if (this.sortedZonesDirty) {
      // ⚡ Bolt: Eliminate Map entries allocation and array mapping overhead per tick
      this.sortedZones.length = this.zones.size;
      let i = 0;
      for (const zone of this.zones.values()) {
        this.sortedZones[i++] = zone;
      }
      this.sortedZones.sort((left, right) => compareBinary(left.zoneId, right.zoneId));
      this.sortedZonesDirty = false;
    }
    for (const zone of this.sortedZones) zone.tick();
  }`;

if (content.includes(search)) {
  fs.writeFileSync('server/zoneRuntime.ts', content.replace(search, replacement));
  console.log('Patched successfully');
} else {
  console.log('Search string not found');
}
