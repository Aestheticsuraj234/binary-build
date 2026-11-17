/** The Binary wordmark: a lime "01" tile and the product name. */
export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-md bg-primary font-mono text-xs font-semibold text-primary-foreground"
      >
        01
      </span>
      <span className="text-lg font-semibold tracking-tight">Binary</span>
    </div>
  );
}
