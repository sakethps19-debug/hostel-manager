import SharingRatesTable from "./SharingRatesTable";
import HostelBRatesTable from "./HostelBRatesTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type SharingRateRow = {
  hostel_name: string;
  sharing_type: number;
  monthly_rent: number;
  effective_from: string;
};

type HostelBRoomRow = {
  room_id: number;
  floor_number: number;
  floor_name: string | null;
  room_number: string;
  sharing_type: number;
  standard_rate: number | null;
};

async function getSharingRates(): Promise<SharingRateRow[]> {
  return callRpcServer<SharingRateRow[]>("get_sharing_type_pricing");
}

async function getHostelBRates(): Promise<HostelBRoomRow[]> {
  return callRpcServer<HostelBRoomRow[]>("get_hostel_b_room_rates");
}

export default async function RatesSettingsPage() {
  await requirePermission("manageRates");

  const [sharingRates, hostelBRates] = await Promise.all([
    getSharingRates(),
    getHostelBRates(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
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
          <h1 className="mt-2 text-4xl font-bold">Standard Rates</h1>
          <p className="mt-2 text-slate-500">
            These are the default/standard rates shown on room cards, Find a
            Bed, and prefilled on new bookings. A booking&apos;s actual
            Agreed Monthly Rent is always separate and stays editable per
            booking — changing it here never touches existing bookings.
          </p>
        </div>

        <section className="mt-8">
          <h2 className="text-xl font-bold">Hostel A &amp; C — by Sharing Type</h2>
          <p className="mt-1 text-sm text-slate-500">
            Editing a rate here keeps the old rate on record (effective until
            the day before your new rate starts) rather than overwriting it.
          </p>
          <SharingRatesTable rates={sharingRates} />
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold">Hostel B — by Room</h2>
          <p className="mt-1 text-sm text-slate-500">
            Hostel B is priced per room rather than by sharing type, since two
            rooms with the same capacity can have different rates.
          </p>
          <HostelBRatesTable rooms={hostelBRates} />
        </section>
      </div>
    </main>
  );
}
