import { requirePermission } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/featureFlags";
import FeatureFlagToggle from "@/components/FeatureFlagToggle";

export default async function FeatureFlagsPage() {
  await requirePermission("manageUsers");

  const flags = await getFeatureFlags();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Administration
          </p>
          <h1 className="mt-2 text-4xl font-bold">Feature Flags</h1>
          <p className="mt-2 text-slate-500">
            Safely disable a developing module without removing code.
            Disabling a flag hides its navigation entry; existing data is
            never touched.
          </p>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {flags.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-500">
              No feature flags configured yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {flags.map((flag) => (
                <li
                  key={flag.key}
                  className="flex items-center justify-between gap-4 px-6 py-4"
                >
                  <div>
                    <p className="font-mono text-sm font-semibold text-slate-900">
                      {flag.key}
                    </p>
                    {flag.description && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {flag.description}
                      </p>
                    )}
                  </div>

                  <FeatureFlagToggle
                    flagKey={flag.key}
                    initialEnabled={flag.enabled}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
