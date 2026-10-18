// src/whatsNew.js
//
// What returning visitors are told about, and how we remember what each of
// them has already been told. Two kinds of news, one panel (WhatsNew.jsx):
//
//  * Features: FEATURES below, written by hand. Only put there what a reader
//    of the site notices (a new link, a new page, a new search ability), in
//    plain Arabic, no code or version talk. The entries are shown newest
//    first; drop an entry once it is a few months old, the list is meant to
//    stay short. `Media` is an optional component shown under the text,
//    e.g. a small animation of the feature; `link` an optional page of the
//    site (`to`) or external site (`href`, opens in a new tab) to open from
//    the entry.
//
//  * Dictionaries: not listed here at all. The panel compares the dictionary
//    ids the API returns with the largest one the visitor has seen, so a new
//    dictionary announces itself with the DB import, with no edit here.
//
// "Seen" lives in localStorage (same as the theme), so it is per browser:
// nothing is sent anywhere, and no account is needed. A first visit records
// the current state silently: everything is new to a first-time visitor, so
// the panel would only be noise. From then on, unseen news opens the panel
// once; closing it marks everything seen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDicts, fetchStats } from './api';
import PageLinkDemo from './components/PageLinkDemo';

export const FEATURES = [
  {
    // Keep the ids stable: they are what the browser remembers having seen.
    id: 'gen-ar',
    date: '2026-10-18',
    title: 'أداة جديدة: توليد الكلمات العربية',
    body:
      'أداة تقترح ألفاظًا عربية لمصطلح إنجليزي أو فرنسي، باشتقاقها من الجذور والأوزان، وتبيّن ما ورد منها في المعاجم.',
    link: { href: 'https://genar.waeltellat.com/', label: 'جرّب الأداة' },
  },
  {
    id: 'morphology',
    date: '2026-10-18',
    title: 'تحليل صرفي اختياري تحت كل نتيجة',
    body:
      'من زرّ الإعدادات (⚙) في أعلى الصفحة يمكنك تفعيل «التحليل الصرفي»: تحت كل نتيجة يظهر جذر كلماتها العربية ووزنها، ومن «المزيد» تصل إلى السمات الصرفية والسوابق واللواحق، والأفعال المشتقة من الجذر مع معانيها المنشورة في ويكي بيانات وتصريفها. وفي الإعدادات نفسها انتقل اختيار المظهر الفاتح والداكن.',
  },
  {
    id: 'grouped-citations',
    date: '2026-10-16',
    title: 'تجميع استشهادات المعاجم في مرجع واحد',
    body:
      'إذا ورد المصطلح في أكثر من معجم، فزرّ «تجميع الاستشهادات» يعطيك مرجعًا واحدًا يضمّ المعاجم التي تختارها مرقّمةً (أ، ب، جـ…)، جاهزًا للّصق في مقالة ويكيبيديا، بدل مرجع منفصل لكل معجم.',
  },
  {
    id: 'page-links',
    date: '2026-10-16',
    title: 'رقم الصفحة يفتح المعجم المصوّر',
    body:
      'في المعاجم الورقية صار رقم الصفحة (ص. 412) رابطًا: اضغط عليه لتفتح الصفحة نفسها من النسخة المصوّرة للمعجم على archive.org، فتتحقّق من المصطلح في مصدره مباشرة.',
    Media: PageLinkDemo,
  },
  {
    id: 'tools-page',
    date: '2026-09-14',
    title: 'صفحة منظومة حوسبة اللغة العربية',
    body:
      'مسرد الويكي جزء من منظومة أدوات مفتوحة المصدر لحوسبة اللغة العربية: محلّل صرفي، ومصرّف أفعال يمكنك تجربته في الصفحة نفسها، وجداول تصريف، وأداة لمراجعة المعاني. صفحة واحدة تجمعها كلّها.',
    link: { to: '/tools', label: 'استعرض الأدوات' },
  },
];

const STORAGE_KEY = 'whatsNew';

// { features: [ids], maxDictId: number, numberDictionaries: number } or null
// on a first visit, or when localStorage is unavailable.
const readSeen = () => {
  try {
    const seen = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (seen && Array.isArray(seen.features) && Number.isFinite(seen.maxDictId)) return seen;
  } catch {
    /* unavailable or garbage: treated as a first visit */
  }
  return null;
};

const writeSeen = (seen) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    /* ignore persistence failures */
  }
};

const maxId = (dicts) => dicts.reduce((max, d) => Math.max(max, d.id), 0);

export function useWhatsNew() {
  const [unseenFeatures, setUnseenFeatures] = useState([]);
  // Dictionaries added since the last visit; [] until known.
  const [newDicts, setNewDicts] = useState([]);
  // Whether the panel is open and why. The auto-open is one-shot: once the
  // visitor closes it, the news counts as seen.
  const [open, setOpen] = useState(false);
  const [openedBy, setOpenedBy] = useState(null); // 'auto' | 'button'
  // What markSeen() will record, filled in as the requests answer.
  const pendingRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const seen = readSeen();

    const check = async () => {
      // Counts are cheap and already fetched by the page; the dictionary list
      // is only fetched when the count moved (or on the very first visit, to
      // know where "new" starts).
      const stats = await fetchStats().catch(() => null);
      const count = stats?.number_dictionaries;

      if (!seen) {
        const dicts = await fetchDicts().catch(() => null);
        // Without the list we cannot say where "new" starts; try next time.
        if (dicts && !cancelled) {
          writeSeen({ features: FEATURES.map((f) => f.id), maxDictId: maxId(dicts), numberDictionaries: count ?? dicts.length });
        }
        return;
      }

      const features = FEATURES.filter((f) => !seen.features.includes(f.id));
      let dicts = null;
      if (count !== undefined && count !== seen.numberDictionaries) {
        dicts = await fetchDicts().catch(() => null);
      }
      if (cancelled) return;

      const added = dicts ? dicts.filter((d) => d.id > seen.maxDictId) : [];
      pendingRef.current = {
        features: FEATURES.map((f) => f.id),
        maxDictId: dicts ? Math.max(seen.maxDictId, maxId(dicts)) : seen.maxDictId,
        numberDictionaries: dicts ? (count ?? dicts.length) : seen.numberDictionaries,
      };
      setUnseenFeatures(features);
      setNewDicts(added);
      if (features.length > 0 || added.length > 0) {
        setOpen(true);
        setOpenedBy('auto');
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasUnseen = unseenFeatures.length > 0 || newDicts.length > 0;

  const markSeen = useCallback(() => {
    if (pendingRef.current) writeSeen(pendingRef.current);
    setUnseenFeatures([]);
    setNewDicts([]);
  }, []);

  const show = useCallback(() => {
    setOpen(true);
    setOpenedBy('button');
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    markSeen();
  }, [markSeen]);

  return { open, openedBy, show, close, hasUnseen, unseenFeatures, newDicts };
}
