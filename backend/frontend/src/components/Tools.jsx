// src/components/Tools.jsx
//
// "منظومة حوسبة اللغة العربية": the ecosystem page. Mirrors the project
// diagram — three levels (صرفي / دلالي / معجمي), each with a goal, its
// ready tools — then the Wikimedia outputs row.
import { useState, useEffect } from 'react';
import {
  ExternalLink, BookOpen, Github, Play, Database, Code, FlaskConical,
  Layers, Languages, Sparkles, Hammer, Search, ArrowLeft,
} from 'lucide-react';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import MaziniTryIt from './MaziniTryIt';

const formatNumber = (num) =>
  num === null || num === undefined ? '…' : num.toLocaleString('en-US');

// Link kinds → icon + label. Kept small and generic so cards stay uniform.
const LINK_KINDS = {
  github: { icon: Github, label: 'GitHub' },
  demo: { icon: Play, label: 'تجربة' },
  site: { icon: ExternalLink, label: 'الموقع' },
  pypi: { icon: Code, label: 'PyPI' },
  npm: { icon: Code, label: 'npm' },
  hf: { icon: Database, label: 'Hugging Face' },
  wiki: { icon: BookOpen, label: 'ويكي' },
  api: { icon: Code, label: 'API' },
};

const LinkChip = ({ kind, href, label }) => {
  const { icon: Icon, label: defaultLabel } = LINK_KINDS[kind];
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-gray-300 dark:border-gray-600 px-2.5 py-0.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >
      <Icon size={12} />
      <span dir="auto">{label || defaultLabel}</span>
    </a>
  );
};

// Palette follows the diagram: green = level, yellow = goal, blue = tool,
// outputs neutral.
const LEVEL_CLASSES = 'bg-green-100 text-green-900 dark:bg-green-900/50 dark:text-green-100';
const GOAL_CLASSES = 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100';
const TOOL_CLASSES = 'bg-sky-50 border border-sky-200 dark:bg-sky-900/30 dark:border-sky-800';
const OUTPUT_CLASSES = 'bg-white border border-gray-200 text-gray-900 dark:bg-gray-800 dark:border-gray-700 dark:text-white';

const ToolCard = ({ tool, stats }) => {
  const Icon = tool.icon;
  const facts = typeof tool.facts === 'function' ? tool.facts(stats) : tool.facts;
  return (
    <div className={`${TOOL_CLASSES} rounded-lg p-4`}>
      <div className="flex items-start gap-3">
        <Icon size={22} className="text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-base leading-tight">
            {tool.name}
            {tool.latin && (
              <span className="text-sm font-mono font-normal text-gray-500 dark:text-gray-400 mx-2" dir="ltr">
                {tool.latin}
              </span>
            )}
          </h4>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{tool.description}</p>
          {facts && facts.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
              {facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tool.links.map((l) => (
              <LinkChip key={l.href} {...l} />
            ))}
          </div>
          {tool.extra && <div className="mt-3">{tool.extra}</div>}
        </div>
      </div>
    </div>
  );
};

// The three levels, in the diagram's right-to-left order.
const LEVELS = [
  {
    key: 'morphology',
    title: 'المستوى الصرفي',
    goal: 'تنظيم البيانات المعجمية',
    tools: [
      {
        name: 'الفراهيدي',
        latin: 'farahidi',
        icon: FlaskConical,
        description:
          'محلّل صرفي: يعطي لكل كلمة عربية جذرها ولفظها المعجمي وجذعها ووزنها وقسم الكلام، مرتّبة حسب شيوعها في المدوّنات. إعادة كتابة كاملة لمحلّل الخليل (AlKhalil Morpho Sys 2) بلغتي بايثون وجافاسكريبت، يعمل دون خادم.',
        facts: ['بايثون بلا اعتماديات', 'نسخة جافاسكريبت تعمل داخل المتصفّح'],
        links: [
          { kind: 'demo', href: 'https://forzagreen.github.io/farahidi-js/' },
          { kind: 'github', href: 'https://github.com/forzagreen/farahidi', label: 'farahidi (Python)' },
          { kind: 'github', href: 'https://github.com/forzagreen/farahidi-js', label: 'farahidi-js' },
          { kind: 'pypi', href: 'https://pypi.org/project/farahidi/' },
          { kind: 'npm', href: 'https://www.npmjs.com/package/farahidi' },
        ],
      },
      {
        name: 'المازني',
        latin: 'mazini',
        icon: Sparkles,
        description:
          'مصرّف الأفعال: من الجذر والوزن يولّد 119 صيغة مشكولة (الماضي والمضارع بأحواله الثلاثة والأمر، للمعلوم والمجهول، والمشتقات والمصدر). نقلٌ لمحرّك التصريف في ويكاموس العربي (وحدة:ar-verb)، متحقَّق منه مقابل 16٬593 صيغة مطبوعة.',
        facts: ['بايثون وجافاسكريبت', 'مطابق حرفيًا لوحدة لوا في ويكاموس'],
        links: [
          { kind: 'demo', href: 'https://forzagreen.github.io/mazini-js/' },
          { kind: 'github', href: 'https://github.com/forzagreen/mazini', label: 'mazini (Python)' },
          { kind: 'github', href: 'https://github.com/forzagreen/mazini-js', label: 'mazini-js' },
          { kind: 'pypi', href: 'https://pypi.org/project/mazini/' },
          { kind: 'npm', href: 'https://www.npmjs.com/package/mazini' },
          { kind: 'wiki', href: 'https://ar.wiktionary.org/wiki/وحدة:ar-verb', label: 'وحدة:ar-verb' },
          { kind: 'wiki', href: 'https://ar.wiktionary.org/wiki/قالب:تصريف', label: 'قالب:تصريف' },
        ],
        extra: <MaziniTryIt />,
      },
      {
        name: 'جداول تصريف الأفعال',
        latin: 'ar-conjugation',
        icon: Database,
        description:
          'مجموعة بيانات: 495 نموذج تصريف و16٬593 صيغة مشكولة منقولة من «معجم تصريف الأفعال العربية» لأنطوان الدحداح، في 22 وزنًا، مع المصادر والمشتقات. بصيغ JSON وCSV.',
        facts: ['495 نموذجًا', '16٬593 صيغة'],
        links: [
          { kind: 'github', href: 'https://github.com/forzagreen/ar-conjugation' },
          { kind: 'hf', href: 'https://huggingface.co/datasets/forzagreen/ar-conjugation' },
        ],
      },
      {
        name: 'جداول الأفعال العربية',
        latin: 'arabic-morphology',
        icon: Layers,
        description:
          'إحصاء للأفعال العربية مرتّبًا بحسب الجذور: نحو 24٬190 فعلًا من 9٬314 جذرًا ثلاثيًا ورباعيًا، مجرّدة ومزيدة، مع تعدّيها ولزومها. من إعداد م. بكني.',
        facts: ['≈ 24٬190 فعلًا', '9٬314 جذرًا'],
        links: [
          { kind: 'demo', href: 'https://m-bakni.github.io/arabic-morphology/' },
          { kind: 'github', href: 'https://github.com/M-Bakni/arabic-morphology' },
        ],
      },
      {
        name: 'جموع التكسير',
        latin: 'ar-plurals',
        icon: Hammer,
        description:
          'قاعدة تفاعلية تربط أوزان المفرد بأوزان جموع التكسير مع الأمثلة، من «دليل جموع التكسير». تُعرض جدولًا أو مصفوفة أو مخطّط سانكي، وتُنزَّل بصيغ CSV وJSON وXLSX.',
        links: [
          { kind: 'demo', href: 'https://forzagreen.github.io/ar-plurals/' },
          { kind: 'github', href: 'https://github.com/forzagreen/ar-plurals' },
        ],
      },
    ],
  },
  {
    key: 'semantics',
    title: 'المستوى الدلالي',
    goal: 'ضبط شروحات المعجم',
    tools: [
      {
        name: 'مراجعة المعاني',
        latin: 'ar-senses',
        icon: Search,
        description:
          'أداة لمراجعة معاني الأفعال المستخرجة من المعاجم العربية ونشرها: كل معنى يُراجَع ثم يُضاف مفردةً (Lexeme) في ويكي بيانات ومدخلًا في ويكاموس.',
        facts: ['تكامل مع ويكي بيانات', 'تكامل مع ويكاموس'],
        links: [{ kind: 'site', href: 'https://ar-senses.toolforge.org/' }],
      },
    ],
  },
  {
    key: 'translation',
    title: 'المستوى المعجمي',
    goal: 'توحيد المصطلحات المُعرَّبة',
    tools: [
      {
        name: 'مسرد الويكي',
        latin: 'wikitermbase',
        icon: Languages,
        description:
          'هذا الموقع: بحث موحّد في المعاجم المصطلحية العربية/الإنجليزية/الفرنسية، مع ترشيح الترجمة الأكثر شيوعًا ورمز الاستشهاد الجاهز. متاح أيضًا كواجهة برمجية وكأداة داخل ويكيبيديا العربية.',
        facts: (stats) => [
          `${formatNumber(stats?.number_terms)} مصطلح`,
          `${formatNumber(stats?.number_dictionaries)} معجمًا`,
        ],
        links: [
          { kind: 'github', href: 'https://github.com/forzagreen/wikitermbase' },
          { kind: 'api', href: '/docs' },
          { kind: 'wiki', href: 'https://ar.wikipedia.org/wiki/ويكيبيديا:مسرد_الويكي', label: 'أداة ويكيبيديا' },
        ],
      },
      {
        name: 'قاعدة المعاجم',
        latin: 'arabterm',
        icon: BookOpen,
        description:
          'المستودع الذي تُنسَّق فيه المعاجم المصدرية وتُراجَع: لكل معجم صفحة تصفّح مستقلة، ومنه تُبنى قاعدة بيانات مسرد الويكي.',
        links: [
          { kind: 'site', href: 'https://forzagreen.github.io/arabterm/' },
          { kind: 'github', href: 'https://github.com/forzagreen/arabterm' },
        ],
      },
    ],
  },
];

const OUTPUTS = [
  {
    name: 'ويكي بيانات',
    description: 'مفردات (Lexemes) بمعانيها وصيغها',
    href: 'https://www.wikidata.org/wiki/Wikidata:Lexicographical_data',
  },
  {
    name: 'ويكاموس',
    description: 'قالب:تصريف ووحدة:ar-verb ومداخل الأفعال',
    href: 'https://ar.wiktionary.org/wiki/قالب:تصريف',
  },
  {
    name: 'ويكيبيديا',
    description: 'أداة مسرد الويكي لتوحيد المصطلحات في المقالات',
    href: 'https://ar.wikipedia.org/wiki/ويكيبيديا:مسرد_الويكي',
  },
];

const Tools = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch('/api/v1/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const themeClasses = 'bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-white';
  const cardClasses = 'bg-white shadow-md dark:bg-gray-800';

  return (
    <div className={`min-h-screen flex flex-col ${themeClasses}`} dir="rtl">
      <SiteHeader title="منظومة حوسبة اللغة العربية" />

      <div className="max-w-7xl mx-auto mt-8 px-4 pb-16 w-full">
        {/* Intro */}
        <div className={`${cardClasses} rounded-lg p-6 mb-8`}>
          <p className="text-lg leading-relaxed text-gray-700 dark:text-gray-200">
            مسرد الويكي جزء من منظومة مفتوحة المصدر لحوسبة اللغة العربية، تعمل على ثلاثة مستويات:
            <strong> صرفي</strong> (تحليل الكلمة وتصريفها)،
            <strong> دلالي</strong> (ضبط المعاني وشروحاتها)،
            <strong> معجمي</strong> (توحيد المصطلحات المعرَّبة).
            وكلّها تصبّ في مشاريع ويكيميديا: ويكي بيانات وويكاموس وويكيبيديا.
          </p>
        </div>

        {/* The three levels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {LEVELS.map((level) => (
            <section key={level.key} className="flex flex-col gap-3">
              <h2 className={`${LEVEL_CLASSES} rounded-lg px-4 py-3 text-xl font-bold text-center`}>
                {level.title}
              </h2>
              <div className={`${GOAL_CLASSES} rounded-lg px-4 py-3 text-center`}>
                <span className="text-xs uppercase tracking-wide opacity-70 block">الغاية</span>
                <span className="font-semibold">{level.goal}</span>
              </div>
              <div className="flex flex-col gap-3">
                {level.tools.map((tool) => (
                  <ToolCard key={tool.latin} tool={tool} stats={stats} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Outputs */}
        <section className="mt-10">
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
            <ArrowLeft size={20} className="text-gray-500 dark:text-gray-400" />
            المخرجات
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {OUTPUTS.map((o) => (
              <a
                key={o.name}
                href={o.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${OUTPUT_CLASSES} rounded-lg px-4 py-4 hover:border-blue-400 hover:shadow-md transition-all`}
              >
                <span className="font-bold text-lg block">{o.name}</span>
                <span className="text-sm text-gray-600 dark:text-gray-300">{o.description}</span>
              </a>
            ))}
          </div>
        </section>
      </div>

      <SiteFooter />
    </div>
  );
};

export default Tools;
