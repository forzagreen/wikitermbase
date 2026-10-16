// src/components/PageLinkDemo.jsx
//
// Animated mock of a result row for the "what's new" panel: a pointer moves
// to the page number, clicks it, and the scanned page opens underneath. Pure
// CSS (the keyframes are in index.css), so it follows the theme and the font
// like the real row, weighs nothing and loops. Decorative: the panel text says
// what it shows, and under prefers-reduced-motion the end state is shown still.
import { MousePointer2 } from 'lucide-react';

const PageLinkDemo = () => (
  <div className="wn-demo mt-3 select-none" aria-hidden="true">
    {/* The row, as DictionaryApp renders an occurrence */}
    <div className="rounded bg-gray-50 p-3 text-sm dark:bg-gray-700">
      {/* Shorter than a real info line (no QID) so that it fits the panel
          on one line: the link must not wrap, the pointer lands on it. */}
      <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
        معجم المصطلحات العلمية والفنية (2018)
        <span className="mx-2">•</span>
        <span className="wn-link relative whitespace-nowrap rounded px-0.5 text-blue-500 dark:text-blue-400">
          ص. 412
          <MousePointer2
            size={18}
            className="wn-cursor absolute left-[45%] top-[55%] fill-white text-gray-900 drop-shadow"
          />
        </span>
      </p>
      <div className="flex items-baseline gap-4">
        <span>مِقْراب</span>
        <span dir="ltr" className="text-gray-700 dark:text-gray-300">
          telescope
        </span>
      </div>
    </div>

    {/* The scan that opens: a dark viewer bar over a page of print */}
    <div className="wn-scan mt-2 overflow-hidden rounded border border-gray-200 dark:border-gray-600">
      <div className="flex items-center justify-between bg-gray-800 px-2 py-1 text-[10px] text-gray-200" dir="ltr">
        <span>archive.org</span>
        <span>p. 412</span>
      </div>
      <div className="space-y-1.5 bg-[#fbf7ee] px-3 py-2.5">
        <div className="h-1.5 w-11/12 rounded bg-stone-400/60" />
        <div className="h-1.5 w-full rounded bg-stone-400/60" />
        <p className="text-[11px] leading-4 text-stone-800" dir="ltr">
          <span className="rounded bg-yellow-200 px-0.5">telescope</span>
          <span className="mx-1 text-stone-500">…</span>
          <span className="rounded bg-yellow-200 px-0.5">مِقْراب</span>
        </p>
        <div className="h-1.5 w-10/12 rounded bg-stone-400/60" />
        <div className="h-1.5 w-full rounded bg-stone-400/60" />
      </div>
    </div>
  </div>
);

export default PageLinkDemo;
