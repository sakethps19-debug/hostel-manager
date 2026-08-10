export default function GlobalSearchForm({
  defaultValue = "",
}: {
  defaultValue?: string;
}) {
  return (
    <form
      action="/search"
      method="GET"
      className="flex w-full max-w-sm items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-indigo-400"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4 shrink-0 text-slate-400"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clipRule="evenodd"
        />
      </svg>

      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search name, mobile, room, bed..."
        className="w-full text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />
    </form>
  );
}
