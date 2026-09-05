import { describe, expect, it, vi } from "vitest";
import { AmplitudeDelivery } from "./amplitudeAnalytics";
const config={key:"test-only-key",salt:"test-only-pseudonym-salt-32-bytes-long",zone:"EU" as const,release:"test-revision"};
describe("consented confirmed Amplitude delivery",()=>{
 it("sends no data without configuration, consent, or an allowlisted event",async()=>{
  const send=vi.fn();const off=new AmplitudeDelivery(null,async()=>true,send);await off.record(1,"gameplay.act","receipt");await off.flush();
  const optOut=new AmplitudeDelivery(config,async()=>false,send);await optOut.record(1,"gameplay.act","receipt");await optOut.flush();
  const restricted=new AmplitudeDelivery(config,async()=>true,send);await restricted.record(1,"community.chat","private message");await restricted.flush();expect(send).not.toHaveBeenCalled();
  off.close();optOut.close();restricted.close();
 });
 it("sends only pseudonymous identity and allowlisted metadata; deduplicates pending receipts",async()=>{
  const send=vi.fn(async()=>new Response(JSON.stringify({code:200,events_ingested:1}),{status:200}));const delivery=new AmplitudeDelivery(config,async()=>true,send as typeof fetch);
  await delivery.record(123,"gameplay.act","canonical-action-9");await delivery.record(123,"gameplay.act","canonical-action-9");await delivery.flush();
  const [url,request]=send.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe("https://api.eu.amplitude.com/2/httpapi");const payload=JSON.parse(request.body as string);expect(payload.events).toHaveLength(1);expect(payload.events[0].user_id).toMatch(/^[a-f0-9]{64}$/);expect(payload.events[0].event_properties).toEqual({release:"test-revision",procedure:"gameplay.act"});expect(JSON.stringify(payload)).not.toContain("canonical-action-9");expect(delivery.status().delivered).toBe(1);delivery.close();
 });
 it("withdrawal discards queued data and consent is checked again before transmission",async()=>{
  let consent=true;const send=vi.fn();const delivery=new AmplitudeDelivery(config,async()=>consent,send);
  await delivery.record(1,"player.equipItem","one");delivery.forget(1);await delivery.flush();expect(send).not.toHaveBeenCalled();
  await delivery.record(1,"player.equipItem","two");consent=false;await delivery.flush();expect(send).not.toHaveBeenCalled();delivery.close();
 });
 it("retries bounded transport failures with the same insertion identity",async()=>{
  const send=vi.fn(async()=>new Response("busy",{status:429}));const delivery=new AmplitudeDelivery(config,async()=>true,send as typeof fetch);
  await delivery.record(1,"gameplay.act","receipt");await delivery.flush();await delivery.flush();await delivery.flush();expect(send).toHaveBeenCalledTimes(3);expect(delivery.status()).toMatchObject({pending:0,delivered:0,dropped:1});delivery.close();
 });
});
