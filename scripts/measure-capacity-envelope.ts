import { globalCapacityEnvelopeService } from "../server/performance/capacityEnvelopeService";

async function main() {
  const envelope = globalCapacityEnvelopeService.generateFullEnvelope();
  console.log(JSON.stringify(envelope, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
