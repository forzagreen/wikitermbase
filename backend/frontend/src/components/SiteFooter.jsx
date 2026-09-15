// src/components/SiteFooter.jsx
//
// Shared page footer: a one-line "part of the ecosystem" note and the
// secondary navigation (site pages, wiki gadget, API docs, source). Pages
// use `min-h-screen flex flex-col` so the footer sits at the bottom even
// when the content is short.
import { Link } from 'react-router';
import { BookOpen, Wrench, Code, Github, ExternalLink } from 'lucide-react';
import { WIKI_GADGET_URL, GITHUB_URL } from '../siteLinks';

const linkClasses =
  'inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors';

const FOOTER_LINKS = [
  { to: '/dictionaries', icon: BookOpen, label: 'قائمة المعاجم' },
  { to: '/tools', icon: Wrench, label: 'منظومة الأدوات' },
  { href: WIKI_GADGET_URL, icon: ExternalLink, label: 'أداة ويكيبيديا' },
  { href: '/docs', icon: Code, label: 'واجهة برمجية (API)' },
  { href: GITHUB_URL, icon: Github, label: 'GitHub' },
];

const SiteFooter = () => (
  <footer className="mt-auto border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
    <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-600 dark:text-gray-300">
      <p className="text-center sm:text-right">
        مسرد الويكي جزء من{' '}
        <Link to="/tools" className="font-semibold hover:text-blue-600 dark:hover:text-blue-400">
          منظومة حوسبة اللغة العربية
        </Link>{' '}
        مفتوحة المصدر، وتصبّ في مشاريع ويكيميديا.
      </p>
      <nav aria-label="روابط إضافية" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        {FOOTER_LINKS.map(({ to, href, icon: Icon, label }) =>
          to ? (
            <Link key={label} to={to} className={linkClasses}>
              <Icon size={14} />
              <span>{label}</span>
            </Link>
          ) : (
            <a
              key={label}
              href={href}
              target={href.startsWith('/') ? undefined : '_blank'}
              rel={href.startsWith('/') ? undefined : 'noopener noreferrer'}
              className={linkClasses}
            >
              <Icon size={14} />
              <span>{label}</span>
            </a>
          )
        )}
      </nav>
    </div>
  </footer>
);

export default SiteFooter;
