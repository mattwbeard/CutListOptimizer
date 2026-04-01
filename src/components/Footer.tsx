export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer mt-20 px-4 pb-10 pt-8 text-[var(--sea-ink-soft)]">
      <div className="page-wrap flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-sm">
          &copy; {year} CutList Optimizer. All rights reserved.
        </p>
        <p className="island-kicker m-0">Minimize waste. Maximize wood.</p>
      </div>
    </footer>
  )
}
