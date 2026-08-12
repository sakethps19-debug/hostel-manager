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
  // Default to enabled both when a flag row hasn't been created yet and
  // when get_feature_flags itself fails (migration not yet applied,
  // transient DB error) - a flags outage must never take down the module
  // it's gating, matching app/page.tsx's getFeatureFlags().catch(() => []).
  let flags: FeatureFlagRow[];
  try {
    flags = await getFeatureFlags();
  } catch {
    return true;
  }

  const flag = flags.find((f) => f.key === key);
  return flag ? flag.enabled : true;
}
