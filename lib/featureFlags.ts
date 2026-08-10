import { callRpcServer } from "./supabase/callRpcServer";

export type FeatureFlagRow = {
  key: string;
  enabled: boolean;
  description: string | null;
};

export async function getFeatureFlags(): Promise<FeatureFlagRow[]> {
  return callRpcServer<FeatureFlagRow[]>("get_feature_flags");
}

export async function isFeatureEnabled(key: string): Promise<boolean> {
  const flags = await getFeatureFlags();
  const flag = flags.find((f) => f.key === key);
  // Default to enabled when a flag hasn't been created yet, so a missing
  // row never silently disables an existing module.
  return flag ? flag.enabled : true;
}
