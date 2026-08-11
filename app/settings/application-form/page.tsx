import DeclarationTextForm from "./DeclarationTextForm";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

const DEFAULT_DECLARATION =
  "I confirm that the information provided in this form is accurate to the best of my knowledge. I agree to follow the hostel's rules and house policies as communicated to me by hostel management.";

async function getDeclarationText(): Promise<string> {
  try {
    const value = await callRpcServer<string | null>("get_text_setting", {
      p_key: "admission_form_declaration",
    });
    return value || DEFAULT_DECLARATION;
  } catch {
    return DEFAULT_DECLARATION;
  }
}

export default async function ApplicationFormSettingsPage() {
  await requirePermission("manageUsers");

  const declarationText = await getDeclarationText();

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
          <h1 className="mt-2 text-4xl font-bold">Application Form Settings</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            The declaration paragraph printed near the bottom of every
            resident&apos;s Application / Admission Form, above the
            signatures.
          </p>
        </div>

        <DeclarationTextForm initialText={declarationText} />
      </div>
    </main>
  );
}
