// src/components/SiteHeader.jsx
//
// Shared page header: logo, page title, and the site navigation. Nav links
// carry a text label on sm+ screens (icon-only on phones) and highlight the
// current page so the navigation reads as navigation, not as a row of
// look-alike icons.
import { Link, NavLink } from 'react-router';
import { BookOpen, Wrench, HelpCircle } from 'lucide-react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import { WIKI_GADGET_URL } from '../siteLinks';

const NAV_ITEMS = [
  { to: '/dictionaries', icon: BookOpen, label: 'المعاجم', title: 'قائمة المعاجم' },
  { to: '/tools', icon: Wrench, label: 'الأدوات', title: 'منظومة حوسبة المعاجم العربية' },
];

const navLinkClasses = ({ isActive }) =>
  `flex items-center gap-1.5 rounded-full px-2 sm:px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200'
      : 'text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700'
  }`;

const SiteHeader = ({ title }) => (
  <header className="bg-white shadow-md dark:bg-gray-800">
    <div className="max-w-7xl mx-auto py-4 sm:py-6 px-4">
      {/* On phones the title drops to its own centered row under the
          logo + controls; on sm+ it sits between them. */}
      <div className="flex flex-wrap justify-between items-center gap-x-3 gap-y-3">
        <Link to="/" title="الصفحة الرئيسية" className="flex-shrink-0">
          <Logo className="h-10" />
        </Link>
        <h1 className="order-last w-full sm:order-none sm:w-auto text-2xl sm:text-3xl font-bold text-center">
          {title}
        </h1>
        <nav aria-label="التنقل في الموقع" className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {NAV_ITEMS.map(({ to, icon: Icon, label, title: linkTitle }) => (
            <NavLink key={to} to={to} className={navLinkClasses} title={linkTitle} aria-label={label}>
              <Icon size={22} />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
          <a
            href={WIKI_GADGET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-full text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700 flex items-center"
            title="للمزيد، ندعوك للاطلاع على صفحة الأداة في ويكيبيديا"
            aria-label="صفحة الأداة في ويكيبيديا"
          >
            <HelpCircle size={22} />
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </div>
  </header>
);

export default SiteHeader;
