/** The Binary wordmark: a lime square and the product name. */
export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="size-3 rounded-[3px] bg-primary" />
      <span className="text-lg font-semibold tracking-tight">Binary</span>
    </div>
  );
}
