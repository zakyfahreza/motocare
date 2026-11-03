import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { formatRupiah, formatMonthShort, currentYear } from '../utils/format.js';
import { pageHead, field } from '../ui/components.js';
import { navigate, buildHash } from '../router.js';

function compactRupiah(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',')} jt`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} rb`;
  return String(n);
}

export async function render({ motor, query, mount }) {
  const thisYear = currentYear();
  const qYear = Number(query.get('year'));
  const year = qYear >= 1950 && qYear <= thisYear ? qYear : thisYear;

  const [monthly, byCategory] = await Promise.all([
    call('reports.monthly', { motorId: motor.id, months: 12 }),
    call('reports.byCategory', { motorId: motor.id, year }),
  ]);

  // ---------- grafik bulanan (bar CSS) ----------
  const max = Math.max(1, ...monthly.map((m) => m.total));
  const total12 = monthly.reduce((s, m) => s + m.total, 0);
  const chart = h('div', { class: 'chart', role: 'img', 'aria-label': `Grafik pengeluaran 12 bulan terakhir, total ${formatRupiah(total12)}` },
    monthly.map((m) => {
      const bar = h('div', { class: ['chart-bar', m.total === 0 && 'zero'], title: `${formatMonthShort(m.month)}: ${formatRupiah(m.total)}` });
      bar.style.height = `${Math.max(1, Math.round((m.total / max) * 100))}%`;
      return h('div', { class: 'chart-col' },
        h('div', { class: 'chart-value' }, m.total ? compactRupiah(m.total) : ''),
        bar,
        h('div', { class: 'chart-label' }, formatMonthShort(m.month).split(' ')[0]),
      );
    }),
  );
  const monthlyTable = h('details', null,
    h('summary', null, 'Lihat tabel bulanan'),
    h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Bulan'), h('th', { scope: 'col', class: 'num' }, 'Total'))),
      h('tbody', null, monthly.slice().reverse().map((m) => h('tr', null, h('td', null, formatMonthShort(m.month)), h('td', { class: 'num' }, formatRupiah(m.total))))),
    )),
  );

  // ---------- per kategori ----------
  const years = [];
  for (let y = thisYear; y >= thisYear - 5; y--) years.push(y);
  const yearSel = h('select', null, years.map((y) => h('option', { value: String(y), selected: y === year }, String(y))));
  yearSel.addEventListener('change', () => navigate(buildHash('/reports', { year: yearSel.value }), { replace: true }));

  const catTotal = byCategory.reduce((s, c) => s + c.total, 0);
  const catTable = byCategory.length
    ? h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, 'Kategori'),
        h('th', { scope: 'col', class: 'num' }, 'Total'),
        h('th', { scope: 'col', class: 'num' }, '%'),
      )),
      h('tbody', null, byCategory.map((c) => h('tr', null,
        h('td', null, c.label),
        h('td', { class: 'num' }, formatRupiah(c.total)),
        h('td', { class: 'num' }, `${Math.round((c.total / catTotal) * 100)}%`),
      ))),
      h('tfoot', null, h('tr', null, h('td', null, 'Total'), h('td', { class: 'num' }, formatRupiah(catTotal)), h('td', { class: 'num' }, '100%'))),
    ))
    : h('p', { class: 'muted' }, `Belum ada pengeluaran di tahun ${year}.`);

  mount(
    pageHead('Laporan'),
    h('section', { class: 'card', 'aria-labelledby': 'rep-m' },
      h('div', { class: 'card-head' }, h('h2', { id: 'rep-m' }, '12 bulan terakhir'), h('strong', null, formatRupiah(total12))),
      chart,
      monthlyTable,
    ),
    h('section', { class: 'card', 'aria-labelledby': 'rep-c' },
      h('div', { class: 'card-head' }, h('h2', { id: 'rep-c' }, 'Per kategori')),
      field({ label: 'Tahun', input: yearSel }),
      catTable,
    ),
  );
}
