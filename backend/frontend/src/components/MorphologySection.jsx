// src/components/MorphologySection.jsx
//
// «تحليل صرفي»: the optional section at the end of a result group (settings
// panel → التحليل الصرفي والدلالي). One row per Arabic word of the headword, with its
// root, pattern and features from /api/v1/morphology (farahidi). A row
// expands to the other readings, the clitics and affixes, and
// the verbs of the root (arabic-morphology tables, served by the same
// endpoint); a verb expands to its senses on Wikidata (one SPARQL query per
// root, wikidata.js) and its main forms conjugated by mazini in the browser.
//
// Everything loads lazily: the analysis when the group scrolls into view,
// Wikidata and mazini on the first expansion that needs them.
import { Component, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import FaalIcon from './FaalIcon';
import {
  arSensesReviewUrl,
  arSensesSearchUrl,
  fetchRootLexemes,
  lexemesForVerb,
  wikidataLexemeUrl,
  wikidataSenseUrl,
  wiktionaryUrl,
} from '../wikidata';
import wikidataIcon from '../assets/wikidata.svg';
import wiktionaryIcon from '../assets/wiktionary.svg';
import { termToAnalyze } from '../morphologyTerm';

const TRANS_LABEL = { l: 'لازم', m: 'متعدٍّ', k: 'لازم ومتعدٍّ' };
const DERIV_LABEL = { basic: 'مجرد', deriv: 'مزيد' };
const AFFIX_GROUPS = [
  ['proclitics', 'سوابق'],
  ['prefixes', 'بادئات'],
  ['suffixes', 'لواحق'],
  ['enclitics', 'ضمائر متصلة'],
];
// mazini slots worth a glance (the demo site has all 119).
const HEADLINE_SLOTS = [
  ['past_3ms', 'الماضي'],
  ['ind_3ms', 'المضارع'],
  ['imp_2ms', 'الأمر'],
  ['vn', 'المصدر'],
  ['ap', 'اسم الفاعل'],
  ['pp', 'اسم المفعول'],
];
const MAX_LISTED_READINGS = 6;

const analysisCache = new Map();
const fetchAnalysis = (term) => {
  if (!analysisCache.has(term)) {
    const promise = fetch(`/api/v1/morphology?q=${encodeURIComponent(term)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        analysisCache.delete(term);
        throw err;
      });
    analysisCache.set(term, promise);
  }
  return analysisCache.get(term);
};

let maziniPromise = null;
const loadMazini = () => {
  if (!maziniPromise) maziniPromise = import('mazini');
  return maziniPromise;
};

const spacedRoot = (root) => [...root].join(' ');

const Chip = ({ children, muted = false, title }) => (
  <span
    title={title}
    className={`inline-block rounded px-1.5 py-0.5 text-xs ${
      muted
        ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
        : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200'
    }`}
  >
    {children}
  </span>
);

const Subheading = ({ children }) => (
  <h4 className="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">{children}</h4>
);

// A Subheading followed by its value on the same line.
const InlineHeading = ({ children }) => (
  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400">{children}</h4>
);

const ExternalChip = ({ href, children, title, icon }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    title={title}
    className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
  >
    {icon ? <img src={icon} alt="" className="h-3 w-3 object-contain" /> : <ExternalLink size={11} />}
    <span>{children}</span>
  </a>
);

// mazini's headline forms for one verb; several patterns (كَتَبَ يَكْتُبُ /
// يَكْتِبُ) merge slot by slot.
const Conjugation = ({ root, patterns }) => {
  const [forms, setForms] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMazini()
      .then((mazini) => {
        const merged = new Map(HEADLINE_SLOTS.map(([slot]) => [slot, []]));
        let any = false;
        for (const pattern of patterns) {
          try {
            const result = mazini.conjugate(root, pattern);
            any = true;
            for (const [slot] of HEADLINE_SLOTS) {
              for (const f of result.slots[slot] ?? []) {
                if (f.form !== '?' && !merged.get(slot).includes(f.form)) merged.get(slot).push(f.form);
              }
            }
          } catch {
            /* a pattern mazini cannot conjugate for this root: skip it */
          }
        }
        if (!cancelled) {
          if (any) setForms(merged);
          else setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [root, patterns]);

  if (failed) return null;
  if (!forms) return <p className="text-xs text-gray-400">جارٍ التصريف…</p>;
  return (
    <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-sm sm:grid-cols-6">
      {HEADLINE_SLOTS.map(([slot, label]) => {
        const list = forms.get(slot);
        if (!list || list.length === 0) return null;
        return (
          <div key={slot}>
            <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
            <dd className="font-semibold">{list.join(' / ')}</dd>
          </div>
        );
      })}
    </dl>
  );
};

// Arabic count agreement for "N senses".
const senseCountLabel = (count) => {
  if (count === 0) return 'بلا معانٍ';
  if (count === 1) return 'معنى واحد';
  if (count === 2) return 'معنيان';
  if (count <= 10) return `${count} معانٍ`;
  return `${count} معنى`;
};

const Senses = ({ lexemes, root }) => {
  if (lexemes.length === 0) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">
        لم تُنشر معاني هذا الفعل في ويكي بيانات بعد.{' '}
        <a
          href={arSensesSearchUrl(root)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          شارك في مراجعتها
        </a>
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {lexemes.map((lexeme) => (
        <div key={lexeme.id}>
          {lexeme.senses.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">المفردة {lexeme.id} في ويكي بيانات بلا معانٍ بعد.</p>
          ) : (
            <ol className="list-decimal space-y-1 pr-5 text-sm text-gray-800 dark:text-gray-100">
              {lexeme.senses.map((sense) => (
                <li key={sense.id}>
                  {sense.gloss ??
                    (sense.glossEn ? (
                      <span dir="ltr" className="text-gray-500 dark:text-gray-400">
                        {sense.glossEn}
                      </span>
                    ) : (
                      <span className="text-gray-400">(بلا شرح)</span>
                    ))}{' '}
                  <a
                    href={wikidataSenseUrl(sense.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block align-middle text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                    title={`المعنى في ويكي بيانات (${sense.id})`}
                    aria-label={`المعنى في ويكي بيانات (${sense.id})`}
                  >
                    <ExternalLink size={12} />
                  </a>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
};

// The verb's links, on its header line: each Wikidata lexeme, and the
// Wiktionary entry once per lemma (duplicate lexemes share it), or the
// ar-senses review of a lexeme whose lemma has no entry yet.
const LexemeChips = ({ lexemes }) => {
  const wiktionaryLemmas = [...new Set(lexemes.filter((l) => l.wiktionary !== false).map((l) => l.lemma))];
  return (
    <>
      {lexemes.map((lexeme) => (
        <ExternalChip
          key={lexeme.id}
          href={wikidataLexemeUrl(lexeme.id)}
          title="المفردة في ويكي بيانات"
          icon={wikidataIcon}
        >
          ويكي بيانات {lexeme.id}
        </ExternalChip>
      ))}
      {wiktionaryLemmas.map((lemma) => (
        <ExternalChip key={lemma} href={wiktionaryUrl(lemma)} title="مدخل الفعل في ويكاموس" icon={wiktionaryIcon}>
          ويكاموس
        </ExternalChip>
      ))}
      {lexemes
        .filter((l) => l.wiktionary === false)
        .map((lexeme) => (
          <ExternalChip
            key={`review-${lexeme.id}`}
            href={arSensesReviewUrl(lexeme.id)}
            title="لا مدخل في ويكاموس بعد: راجع المعاني وانشرها من أداة ar-senses"
          >
            مراجعة ونشر في ويكاموس
          </ExternalChip>
        ))}
    </>
  );
};

// The details of the verb picked in the chip row: its patterns, its senses on
// Wikidata and its headline conjugation.
const VerbDetails = ({ root, verb, entries, lexemes, lexemesStatus }) => {
  const patterns = entries.map((e) => e.pattern);
  return (
    <div className="space-y-3 rounded border border-gray-200 px-3 py-2 dark:border-gray-600">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">{verb}</span>
        {entries.map((e) => (
          <Chip key={e.pattern} title={`${DERIV_LABEL[e.deriv] ?? ''} ${e.type}`.trim()}>
            {e.pattern} · {TRANS_LABEL[e.trans] ?? e.trans}
          </Chip>
        ))}
        {lexemesStatus === 'ok' && <LexemeChips lexemes={lexemes} />}
      </div>
      <div>
        <Subheading>المعاني (ويكي بيانات)</Subheading>
        {lexemesStatus === 'loading' && <p className="text-xs text-gray-400">جارٍ التحميل من ويكي بيانات…</p>}
        {lexemesStatus === 'error' && (
          <p className="text-xs text-red-600 dark:text-red-400">تعذّر الاتصال بويكي بيانات.</p>
        )}
        {lexemesStatus === 'ok' && <Senses lexemes={lexemes} root={root} />}
      </div>
      <div>
        <Subheading>
          التصريف (
          <a
            href="https://forzagreen.github.io/mazini-js/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            المازني
          </a>
          )
        </Subheading>
        <Conjugation root={root} patterns={patterns} />
      </div>
    </div>
  );
};

// The verbs of the root as a row of chips (verb + pattern, and how many
// senses Wikidata has once known); the picked one opens its details below
// the row, one verb at a time, like the readings above.
const RootVerbs = ({ root, verbs }) => {
  const [lexemes, setLexemes] = useState(null);
  const [lexemesStatus, setLexemesStatus] = useState('loading');
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLexemesStatus('loading');
    fetchRootLexemes(root)
      .then((result) => {
        if (cancelled) return;
        setLexemes(result);
        setLexemesStatus('ok');
      })
      .catch(() => {
        if (!cancelled) setLexemesStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [root]);

  // One chip per verb form; كَتَبَ has two بابs, both on its chip.
  const byForm = new Map();
  for (const v of verbs) {
    if (!byForm.has(v.verb)) byForm.set(v.verb, []);
    byForm.get(v.verb).push(v);
  }

  if (byForm.size === 0) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">لا أفعال معروفة لهذا الجذر في جداول الأفعال.</p>;
  }
  const pickedEntries = picked === null ? null : byForm.get(picked);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {[...byForm].map(([verb, entries]) => {
          const verbLexemes = lexemesForVerb(lexemes, verb);
          const senseCount = verbLexemes.reduce((n, l) => n + l.senses.length, 0);
          const chosen = verb === picked;
          return (
            <button
              key={verb}
              type="button"
              onClick={() => setPicked(chosen ? null : verb)}
              aria-pressed={chosen}
              className={`rounded border px-2 py-0.5 text-xs ${
                chosen
                  ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-sm font-semibold">{verb}</span>
              <span className="text-gray-500 dark:text-gray-400"> {entries.map((e) => e.pattern).join(' / ')}</span>
              {lexemesStatus === 'ok' && senseCount > 0 && (
                <span className="text-gray-400" title={senseCountLabel(senseCount)}>
                  {' '}
                  · {senseCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {pickedEntries && (
        <VerbDetails
          root={root}
          verb={picked}
          entries={pickedEntries}
          lexemes={lexemesForVerb(lexemes, picked)}
          lexemesStatus={lexemesStatus}
        />
      )}
    </div>
  );
};

// Arabic count agreement for "N possible vocalizations".
const readingCountLabel = (count) => {
  if (count === 2) return 'ضبطان مُحتمَلان';
  if (count <= 10) return `${count} ضبوط مُحتمَلة`;
  return `${count} ضبطًا مُحتمَلا`;
};

const Dash = () => <span className="text-gray-400">—</span>;

const readingLabel = (reading) =>
  [reading.lemma, reading.pattern && `(${reading.pattern})`, reading.type ?? reading.pos].filter(Boolean).join(' ');

const WordDetails = ({ word, reading, readingIndex, onPickReading, verbsByRoot }) => {
  const [allReadings, setAllReadings] = useState(false);
  const readings = allReadings ? word.readings : word.readings.slice(0, MAX_LISTED_READINGS);
  const affixGroups = AFFIX_GROUPS.filter(([key]) => reading[key].length > 0);

  return (
    <div className="space-y-3 rounded bg-gray-50 p-3 dark:bg-gray-800/60">
      {word.readings.length > 1 && (
        <div>
          <Subheading>صيغ مُحتمَلة ({word.readings.length}) — انقر على إحداها:</Subheading>
          <div className="flex flex-wrap gap-1.5">
            {readings.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPickReading(i)}
                aria-pressed={i === readingIndex}
                className={`rounded border px-2 py-0.5 text-xs ${
                  i === readingIndex
                    ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {readingLabel(r)}
                {r.root && word.roots.length > 1 && <span className="text-gray-400"> · {spacedRoot(r.root)}</span>}
              </button>
            ))}
            {!allReadings && word.readings.length > MAX_LISTED_READINGS && (
              <button
                type="button"
                onClick={() => setAllReadings(true)}
                className="text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                عرض الكل
              </button>
            )}
          </div>
        </div>
      )}

      {/* Wide screens read the features and the lemma off the summary row. */}
      <div className="flex flex-wrap items-baseline gap-x-2 sm:hidden">
        <InlineHeading>السمات الصرفية:</InlineHeading>
        <p className="text-sm">
          <span className="font-semibold">{reading.lemma}</span>
          <span className="text-gray-500 dark:text-gray-400"> · {reading.features.join(' · ')}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2">
        <InlineHeading>السوابق واللواحق:</InlineHeading>
        {affixGroups.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">لا توجد</p>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {affixGroups.map(([key, label]) => (
              <li key={key}>
                <span className="text-gray-500 dark:text-gray-400">{label}: </span>
                {reading[key].map((a, i) => (
                  <span key={i} title={a.description ?? undefined}>
                    {i > 0 && '، '}
                    <span className="font-semibold">{a.form}</span>
                    {a.description && <span className="text-gray-500 dark:text-gray-400"> ({a.description})</span>}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>

      {reading.root && (
        <div>
          <Subheading>الأفعال المشتقة من الجذر ({spacedRoot(reading.root)})</Subheading>
          <RootVerbs root={reading.root} verbs={verbsByRoot[reading.root] ?? []} />
        </div>
      )}
    </div>
  );
};

// The summary row of a word: the chosen reading's word (with its lemma when
// affixes hide it: الْمَرْصَد ← مَرْصَد), root, pattern and features (the
// features on wide screens only; narrow ones get them in the details). The
// whole row toggles the details; the chevron is there for the keyboard.
const WordRow = ({ word, verbsByRoot }) => {
  const [expanded, setExpanded] = useState(false);
  const [readingIndex, setReadingIndex] = useState(0);
  const reading = word.readings[readingIndex] ?? null;
  const cell = 'px-2 py-1.5 align-top';
  const toggle = () => setExpanded((v) => !v);

  return (
    <>
      <tr
        onClick={reading ? toggle : undefined}
        className={`border-t border-gray-100 dark:border-gray-700 ${
          reading ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50' : ''
        }`}
      >
        <td className={`${cell} font-semibold`} title={word.word}>
          {reading ? reading.diacritized : word.word}
          {reading && reading.lemma !== reading.diacritized && (
            <span className="mr-2 font-normal text-gray-500 dark:text-gray-400" title="الأصل">
              ({reading.lemma})
            </span>
          )}
          {word.readings.length > 1 && (
            <span className="mr-2 whitespace-nowrap text-xs font-normal text-gray-400">
              {readingCountLabel(word.readings.length)}
            </span>
          )}
        </td>
        {reading ? (
          <>
            <td className={cell}>{reading.root ? spacedRoot(reading.root) : <Dash />}</td>
            <td className={cell}>{reading.pattern ?? <Dash />}</td>
            <td className={`${cell} hidden text-gray-600 sm:table-cell dark:text-gray-300`}>
              {reading.features.length > 0 ? reading.features.join(' · ') : <Dash />}
            </td>
          </>
        ) : (
          <td className={`${cell} text-xs text-gray-500 dark:text-gray-400`} colSpan={3}>
            لم يتعرّف المحلّل على الكلمة (ربما دخيلة أو اسم علم)
          </td>
        )}
        <td className={`${cell} text-left`}>
          {reading && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
              aria-expanded={expanded}
              aria-label={expanded ? 'أقل' : 'المزيد'}
              title={expanded ? 'أقل' : 'المزيد'}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          )}
        </td>
      </tr>
      {expanded && reading && (
        <tr>
          <td colSpan={5} className="px-0 pb-2">
            <WordDetails
              word={word}
              reading={reading}
              readingIndex={readingIndex}
              onPickReading={setReadingIndex}
              verbsByRoot={verbsByRoot}
            />
          </td>
        </tr>
      )}
    </>
  );
};

// A bug in this optional section must never take the results page down
// with it (React would otherwise unmount the whole tree): it fails alone,
// with a one-line note.
class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('MorphologySection failed:', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="mt-4 border-t border-gray-200 pt-3 text-xs text-red-600 dark:border-gray-700 dark:text-red-400">
          تعذّر عرض التحليل الصرفي لهذه النتيجة.
        </section>
      );
    }
    return this.props.children;
  }
}

const MorphologySectionBody = ({ group }) => {
  const term = termToAnalyze(group);
  const rootRef = useRef(null);
  const [state, setState] = useState({ status: 'idle', data: null });

  // Fetch when the group is about to scroll into view, not for every group
  // of the page at once.
  useEffect(() => {
    const element = rootRef.current;
    if (!element || !term) return undefined;
    let cancelled = false;
    const load = () => {
      setState({ status: 'loading', data: null });
      fetchAnalysis(term)
        .then((data) => !cancelled && setState({ status: 'ok', data }))
        .catch(() => !cancelled && setState({ status: 'error', data: null }));
    };
    if (typeof IntersectionObserver === 'undefined') {
      load();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [term]);

  const { status, data } = state;

  // Nothing to analyze (a group without an Arabic title).
  if (!term) return null;

  return (
    <section ref={rootRef} className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-700" aria-label="تحليل صرفي">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">
        <FaalIcon className="h-5 w-auto text-sky-600 dark:text-sky-400" />
        تحليل صرفي
      </h3>
      {(status === 'idle' || status === 'loading') && <p className="mt-1 text-xs text-gray-400">جارٍ التحليل…</p>}
      {status === 'error' && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">تعذّر التحليل الصرفي. الرجاء المحاولة لاحقًا.</p>
      )}
      {status === 'ok' && data.words.length === 0 && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">لا كلمات عربية في هذا المصطلح.</p>
      )}
      {status === 'ok' && data.words.length > 0 && (
        <table className="mt-1 w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 dark:text-gray-400">
              <th className="px-2 py-1 text-right font-medium">الكلمة</th>
              <th className="px-2 py-1 text-right font-medium">الجذر</th>
              <th className="px-2 py-1 text-right font-medium">الوزن</th>
              <th className="hidden px-2 py-1 text-right font-medium sm:table-cell">السمات الصرفية</th>
              <th className="w-10 px-2 py-1 text-left font-medium">
                <span className="sr-only">المزيد</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.words.map((word, i) => (
              <WordRow key={`${word.word}-${i}`} word={word} verbsByRoot={data.verbs} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};

const MorphologySection = ({ group }) => (
  <SectionErrorBoundary>
    <MorphologySectionBody group={group} />
  </SectionErrorBoundary>
);

export default MorphologySection;
