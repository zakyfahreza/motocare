import { h, uid } from '../utils/dom.js';
import { call, read } from '../api.js';
import { formatRupiah, formatNumber, formatMonthShort, formatDate, currentYear, todayISO, TYPE_LABELS } from '../utils/format.js';
import { pageHead, busy, toast, toastError, downloadFile, radioGroup } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { TYPE_ICONS, TYPE_TONES } from '../ui/meta.js';
import { categoryLabel } from '../state.js';
import { navigate, buildHash } from '../router.js';

const MONTH_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BAR_CLASS = { SERVIS: 't-servis', GANTI_OLI: 't-oli', BELANJA_PART: 't-part', BENSIN: 't-bensin', BAN: 't-ban' };
const GROUP_META = {
  JASA: { iconName: 'build', tone: '', color: 'var(--primary)', badge: 'badge-primary' },
  FUEL: { iconName: 'local_gas_station', tone: 'tone-soon', color: '#f59e0b', badge: 'badge-soon' },
  TIRE: { iconName: 'tire_repair', tone: 'tone-ok', color: '#10b981', badge: 'badge-ok' },
  FLUID: { iconName: 'water_drop', tone: 'tone-sky', color: 'var(--sky)', badge: 'badge-sky' },
  PART: { iconName: 'settings', tone: 'tone-violet', color: '#a5b4fc', badge: '' },
};

function compact(n) {
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')}jt`;
  if (n >= 1e3) return `Rp ${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace('.', ',').replace(',0', '')}rb`;
  return `Rp ${n}`;
}

export async function render({ motor, query, mount }) {
  const thisYear = currentYear();
  const qYear = Number(query.get('year'));
  const year = qYear >= 1950 && qYear <= thisYear ? qYear : thisYear;
  const mode = query.get('mode') === 'monthly' ? 'monthly' : 'yearly';

  const [s, rolling] = await Promise.all([
    read('reports.summary', { motorId: motor.id, year }),
    mode === 'monthly' ? read('reports.monthly', { motorId: motor.id, months: 12 }) : Promise.resolve(null),
  ]);

  // ---------- Kontrol ----------
  const years = Array.from(new Set([thisYear, ...s.years])).sort((a, b) => b - a);
  const yearSel = h('select', { 'aria-label': 'Pilih tahun' }, years.map((y) => h('option', { value: String(y), selected: y === year }, y === thisYear ? `${y} (Tahun Ini)` : String(y))));
  yearSel.addEventListener('change', () => navigate(buildHash('/reports', { year: yearSel.value, mode: mode === 'monthly' ? 'monthly' : '' }), { replace: true }));
  const modeGroup = radioGroup({
    name: uid('mode'), className: 'segmented light', label: 'Mode grafik', value: mode,
    options: [{ value: 'yearly', label: 'Tahunan' }, { value: 'monthly', label: 'Bulanan' }],
  });
  Object.values(modeGroup.inputs).forEach((i) => i.addEventListener('change', () => navigate(buildHash('/reports', { year: String(year), mode: modeGroup.value === 'monthly' ? 'monthly' : '' }), { replace: true })));
  modeGroup.el.style.minWidth = '168px';
  modeGroup.el.querySelectorAll('label').forEach((l) => { l.style.minHeight = '36px'; });

  const exportBtn = h('button', { type: 'button', class: 'btn btn-tonal btn-sm' }, icon('download', 18), 'Ekspor');
  exportBtn.addEventListener('click', async () => {
    const restore = busy(exportBtn, '…');
    try {
      const rows = await call('records.export', { motorId: motor.id, from: `${year}-01-01`, to: `${year}-12-31` });
      const lines = [['Tanggal', 'Jenis', 'Odometer (km)', 'Tempat', 'Item', 'Biaya Jasa', 'Total'].join(';')];
      rows.forEach((r) => lines.push([r.date, TYPE_LABELS[r.type], r.odometer, r.place, r.items.map((it) => it.name).join(', '), r.serviceFee, r.grandTotal]
        .map((v) => { const t = String(v ?? ''); const safe = /^[=+\-@]/.test(t) ? `'${t}` : t; return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; }).join(';')));
      downloadFile(`motocare-laporan-${year}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
      toast(`Laporan ${year} diekspor`, 'success');
    } catch (err) { toastError(err); } finally { restore(); }
  });

  // ---------- Total ----------
  const totalStr = formatRupiah(s.total);
  const cut = totalStr.lastIndexOf('.');
  const change = s.changePct;
  const changeChip = change === null ? null
    : change <= 0
      ? h('span', { class: 'badge badge-ok' }, icon('trending_down', 14), `Hemat ${Math.abs(change)}%`)
      : h('span', { class: 'badge badge-late' }, icon('trending_up', 14), `Naik ${change}%`);
  const totalCard = h('section', { class: 'card card-pad-lg hero', 'aria-labelledby': 'tot-h' },
    h('div', { class: 'row-between' }, h('span', { class: 'row gap-4 t-caps c-2', id: 'tot-h' }, icon('receipt_long', 16), `Total biaya ${year}`), changeChip),
    h('div', { class: 'big-total mt-8' },
      h('span', { class: 'main' }, cut > 0 && s.total >= 1000 ? totalStr.slice(0, cut) : totalStr),
      cut > 0 && s.total >= 1000 ? h('span', { class: 'tail' }, totalStr.slice(cut)) : null,
    ),
    h('div', { class: 'card-tint row-between mt-12', style: { padding: '10px 12px' } },
      h('span', { class: 'row gap-8 t-sm c-2' }, icon(change !== null && change > 0 ? 'warning' : 'check_circle', 16),
        change === null ? 'Belum ada data tahun sebelumnya' : change <= 0 ? 'Pengeluaran lebih hemat dari tahun lalu' : 'Pengeluaran lebih tinggi dari tahun lalu'),
      h('span', { class: 't-sm', style: { fontWeight: '700', whiteSpace: 'nowrap' } }, `vs ${year - 1}`),
    ),
  );

  // ---------- Statistik mini ----------
  const biggestMonth = s.biggest ? MONTH_LONG[Number(s.biggest.date.slice(5, 7)) - 1] : '';
  const mini = (iconName, tone, label, value, sub) => h('div', { class: 'card mini-stat' },
    h('span', { class: ['tile-icon', tone] }, icon(iconName, 16)),
    h('span', { class: 't-sm c-2' }, label),
    h('strong', null, value),
    h('span', { class: 't-sm c-2' }, sub),
  );
  const miniStats = h('div', { class: 'mini-stats' },
    mini('query_stats', '', 'Rata-rata', compact(s.average), '/ bulan'),
    mini('receipt_long', 'tone-sky', 'Aktivitas', `${s.sessions} Sesi`, 'Perawatan'),
    mini('priority_high', 'tone-late', 'Terbesar', s.biggest ? compact(s.biggest.grandTotal) : 'Rp 0', s.biggest ? `${biggestMonth} (${TYPE_LABELS[s.biggest.type]})` : '—'),
  );

  // ---------- Grafik ----------
  const bars = mode === 'monthly'
    ? rolling.map((m) => ({ month: m.month, total: m.total, cls: m.total ? 't-servis' : '' }))
    : s.months.map((m) => ({ month: m.month, total: m.total, cls: m.dominantType ? BAR_CLASS[m.dominantType] : '' }));
  const max = Math.max(0, ...bars.map((b) => b.total));
  const chartTotal = bars.reduce((sum, b) => sum + b.total, 0);
  const chart = h('div', { class: 'chart', role: 'img', 'aria-label': `Grafik pengeluaran per bulan, total ${formatRupiah(chartTotal)}` },
    bars.map((b) => {
      const isMax = max > 0 && b.total === max;
      const bar = h('div', { class: ['chart-bar', b.cls] });
      bar.style.height = b.total ? `${Math.max(6, Math.round((b.total / max) * 100))}%` : '6px';
      return h('div', { class: ['chart-col', isMax && 'is-max'], title: `${formatMonthShort(b.month)}: ${formatRupiah(b.total)}` },
        isMax ? h('span', { class: 'chart-tip' }, formatRupiah(b.total)) : null,
        bar,
        h('span', { class: 'chart-label' }, formatMonthShort(b.month).split(' ')[0]),
      );
    }),
  );
  const chartCard = h('section', { class: 'card card-pad', 'aria-labelledby': 'chart-h' },
    h('div', { class: 'row-between' },
      h('h2', { class: 'row gap-8 t-h3', id: 'chart-h' }, h('span', { class: 'section-bar' }), mode === 'monthly' ? '12 Bulan Terakhir' : `Grafik Bulanan ${year}`),
      h('span', { class: 't-sm c-2' }, 'Nominal (Rupiah)'),
    ),
    chart,
    mode === 'yearly'
      ? h('div', { class: 'legend mt-16' },
        h('span', null, h('i', { style: { background: 'var(--primary)' } }), 'Servis'),
        h('span', null, h('i', { style: { background: 'var(--sky)' } }), 'Ganti oli'),
        h('span', null, h('i', { style: { background: '#a5b4fc' } }), 'Belanja part'),
        h('span', null, h('i', { style: { background: '#f59e0b' } }), 'Bensin'),
        h('span', null, h('i', { style: { background: '#10b981' } }), 'Ban'),
        h('span', null, h('i', { style: { background: 'var(--surface-high)' } }), 'Tanpa biaya'),
      )
      : null,
    h('details', { class: 'mt-12' },
      h('summary', { class: 't-label c-primary', style: { cursor: 'pointer', minHeight: '36px', display: 'flex', alignItems: 'center' } }, 'Lihat tabel bulanan'),
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Bulan'), h('th', { scope: 'col', class: 'n' }, 'Total'))),
        h('tbody', null, bars.slice().reverse().map((b) => h('tr', null, h('td', null, formatMonthShort(b.month)), h('td', { class: 'n' }, formatRupiah(b.total))))),
      )),
    ),
  );

  // ---------- Kategori ----------
  const groups = s.groups.filter((g) => g.total > 0);
  const stack = h('div', { class: 'stack-bar', 'aria-hidden': 'true' }, groups.map((g) => {
    const seg = h('span');
    seg.style.width = `${g.pct}%`;
    seg.style.background = GROUP_META[g.key].color;
    return seg;
  }));
  const catCard = h('section', { class: 'card card-pad', 'aria-labelledby': 'cat-h' },
    h('div', { class: 'row-between' },
      h('h2', { class: 'row gap-8 t-h3', id: 'cat-h' }, h('span', { class: 'section-bar', style: { background: 'var(--secondary)' } }), 'Kategori Pengeluaran'),
      h('span', { class: 't-sm c-2', style: { fontWeight: '700' } }, `${groups.length} Kategori`),
    ),
    groups.length
      ? [
        h('div', { class: 'mt-12' }, stack),
        h('div', { class: 'mt-16' }, groups.map((g) => h('div', { class: 'group-row' },
          h('span', { class: ['tile-icon', GROUP_META[g.key].tone] }, icon(GROUP_META[g.key].iconName, 20)),
          h('div', { class: 'stack grow' },
            h('span', { class: 'row gap-8', style: { flexWrap: 'wrap', rowGap: '2px' } }, h('span', { class: 't-title' }, g.label), h('span', { class: ['badge', GROUP_META[g.key].badge] }, `${g.pct}%`)),
            g.samples.length ? h('span', { class: 't-sm c-2 truncate' }, g.samples.join(' & ')) : null,
          ),
          h('div', { class: 'stack', style: { alignItems: 'flex-end', flexShrink: '0' } },
            h('strong', { class: 'num', style: { fontSize: '15px' } }, formatRupiah(g.total)),
            h('span', { class: 't-sm c-2' }, `${g.count} Transaksi`),
          ),
        ))),
      ]
      : h('p', { class: 'c-2 mt-8' }, `Belum ada pengeluaran di tahun ${year}.`),
  );

  // ---------- Biaya per km ----------
  const cpk = s.costPerKm;
  const cpkCard = h('section', { class: 'card card-pad', 'aria-labelledby': 'cpk-h' },
    h('div', { class: 'row-between' },
      h('h2', { class: 'row gap-8 t-h3', id: 'cpk-h' }, h('span', { class: 'c-ok' }, icon('speed', 22)), 'Biaya per Kilometer'),
      h('span', { class: 'badge badge-ok' }, icon('eco', 14), 'Sejak dicatat'),
    ),
    cpk.value === null
      ? h('p', { class: 'c-2 mt-8' }, 'Perbarui odometer agar biaya per km bisa dihitung.')
      : [
        h('div', { class: 'row gap-4 mt-8', style: { alignItems: 'baseline' } },
          h('span', { class: 't-stat c-primary', style: { fontSize: '30px', lineHeight: '36px' } }, `Rp ${formatNumber(cpk.value)}`),
          h('span', { class: 'c-2' }, '/ km'),
        ),
        h('p', { class: 't-sm c-2 mt-4' }, `Total ${formatRupiah(cpk.total)} untuk ${formatNumber(cpk.km)} km yang tercatat sejak odometer awal.`),
      ],
  );

  // ---------- Bensin ----------
  const fu = s.fuel || { fills: 0 };
  const fuelCard = fu.fills ? h('section', { class: 'card card-pad', 'aria-labelledby': 'fuel-h' },
    h('div', { class: 'row-between' },
      h('h2', { class: 'row gap-8 t-h3', id: 'fuel-h' }, h('span', { class: 'c-soon' }, icon('local_gas_station', 22)), `Bensin ${year}`),
      h('span', { class: 'badge badge-soon' }, `${fu.fills}× isi`),
    ),
    h('div', { class: 'mini-stats mt-12' },
      h('div', { class: 'card-tint mini-stat' }, h('span', { class: 't-sm c-2' }, 'Total liter'), h('strong', null, `${formatNumber(fu.liters)} L`)),
      h('div', { class: 'card-tint mini-stat' }, h('span', { class: 't-sm c-2' }, 'Biaya'), h('strong', null, compact(fu.spend))),
      h('div', { class: 'card-tint mini-stat' }, h('span', { class: 't-sm c-2' }, 'Rata-rata'), h('strong', null, fu.avgKmPerL ? `${formatNumber(fu.avgKmPerL)} km/L` : '—')),
    ),
    !fu.avgKmPerL ? h('p', { class: 't-sm c-2 mt-8' }, 'Konsumsi km/L dihitung dari dua kali isi penuh (full tank) berturut-turut.') : null,
  ) : null;

  // ---------- Riwayat terakhir ----------
  const recentCard = h('section', { class: 'card card-pad', 'aria-labelledby': 'rec-h' },
    h('div', { class: 'row-between' },
      h('h2', { class: 'row gap-8 t-h3', id: 'rec-h' }, h('span', { class: 'section-bar' }), 'Riwayat Terakhir'),
      h('span', { class: 't-sm c-primary', style: { fontWeight: '700' } }, `${s.recent.length} Transaksi`),
    ),
    s.recent.length
      ? h('div', { class: 'mt-8' }, s.recent.map((r) => h('a', { class: 'row gap-12', href: `#/records/${encodeURIComponent(r.id)}`, style: { color: 'inherit', padding: '10px 0' } },
        h('span', { class: ['tile-icon round', TYPE_TONES[r.type]] }, icon(TYPE_ICONS[r.type], 20)),
        h('div', { class: 'stack grow' },
          h('span', { class: 't-title truncate' }, (r.itemNames && r.itemNames[0]) || r.place || TYPE_LABELS[r.type]),
          h('span', { class: 't-sm c-2 truncate' }, formatDate(r.date), ' • ', h('span', { class: 'c-primary' }, r.categories && r.categories[0] ? categoryLabel(r.categories[0]) : TYPE_LABELS[r.type])),
        ),
        h('strong', { class: 'num' }, formatRupiah(r.grandTotal)),
      )))
      : h('p', { class: 'c-2 mt-8' }, 'Belum ada catatan.'),
    h('a', { class: 'btn btn-tonal btn-block mt-12', href: '#/records' }, 'Lihat semua riwayat servis', icon('arrow_forward', 18)),
  );

  mount(
    pageHead('Laporan Pengeluaran', { subtitle: 'Analisis & ringkasan biaya perawatan motor', actions: [exportBtn] }),
    h('div', { class: 'row-between', style: { flexWrap: 'wrap', gap: '8px' } },
      h('label', { class: 'pill-select' }, icon('calendar_today', 18), h('span', null, year === thisYear ? `${year} (Tahun Ini)` : String(year)), icon('expand_more', 18), yearSel),
      modeGroup.el,
    ),
    totalCard,
    miniStats,
    chartCard,
    catCard,
    fuelCard,
    cpkCard,
    recentCard,
    h('p', { class: 't-sm c-3', style: { textAlign: 'center' } }, `Data per ${formatDate(todayISO())}`),
  );
}
