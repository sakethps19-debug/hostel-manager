import type { CommunicationChannel } from "./provider";

// Only WhatsApp is offered right now - an Indian SMS provider is a
// planned follow-up, not yet decided or configured. Adding "sms" back
// here (once a provider is chosen and wired into getCommunicationProvider)
// is the only change needed to re-enable it across every channel picker.
export const ENABLED_CHANNELS: CommunicationChannel[] = ["whatsapp"];

export const CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
};
