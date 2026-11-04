import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { formatRupiah, formatNumber, formatDate, TYPE_LABELS, todayISO } from '../utils/format.js';
import { pageHead, typeBadge, emptyState, field, busy, toast, toastError, downloadFile } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { TYPE_ICONS } from '../ui/meta.js';
import { loadCategories, categoryLabel } from '../state.js';
import { navigate, buildHash } from '../router.js';

const PAGE_SIZE = 20;

export async function render({ motor, query, mount }) {
  const filters = {
    type: query.get('type') || '',
    category: query.get('category') || '',
    from: query.get('from') || '',
    to: query.get('to') || '',
  };
  const [categories, first] = await Promise.all([
    loadCategories(),
    call('records.list', { motorId: motor.id, ...filters, limit: PAGE_SIZE, offset: 0 }),
  ]);
  const activeCount = Object.values(filters).filter(Boolean).length;

  // ---------- Filter ----------
  const typeSel = h('select', null,
    h('option', { value: '' }, 'Semua jenis'),
    Object.entries(TYPE_LABELS).map(([v, label]) => h('option', { value: v, selected: v === filters.type }, label)),
  );
  const catSel = h('select', null,
    h('option', { value: '' }, 'Semua kategori'),
    categories.map((c) => h('option', { value: c.code, selected: c.code === filters.category }, c.label)),
    h('option', { value: 'JASA', selected: filters.category === 'JASA' }, 'Jasa Servis'),
  );
  const fromInput = h('input', { type: 'date', value: filters.from });
  const toInput = h('input', { type: 'date', value: filters.to });

  const filterForm = h('form', { class: 'card card-pad', 'aria-labelledby': 'filter-h' },
    h('div', { class: 'row-between', style: { marginBottom: '12px' } },
      h('h2', { class: 'row gap-8 t-h3', id: 'filter-h' }, icon('filter_list', 22), 'Filter'),
      activeCount ? h('span', { class: 'badge badge-sky' }, `${activeCount} aktif`) : null,
    ),
    h('div', { class: 'field-grid' },
      field({ label: 'Jenis', input: typeSel }),
      field({ label: 'Kategori', input: catSel }),
    ),
    h('div', { class: 'field-grid' },
      field({ label: 'Dari tanggal', input: fromInput }),
      field({ label: 'Sampai tanggal', input: toInput }),
    ),
    h('div', { class: 'row mt-16', style: { justifyContent: 'flex-end' } },
      h('a', { class: 'btn btn-tonal', href: '#/records' }, 'Reset'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Terapkan'),
    ),
  );
  filterForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    navigate(buildHash('/records', { type: typeSel.value, category: catSel.value, from: fromInput.value, to: toInput.value }), { replace: true });
  });

  // ---------- Daftar ----------
  const listEl = h('div', { class: 'stack gap-12' });
  const summaryEl = h('p', { class: 't-body c-2', 'aria-live': 'polite' });
  let loaded = 0;
  let total = first.total;

  const moreBtn = h('button', { type: 'button', class: 'btn btn-outline btn-block' }, 'Muat lagi');
  moreBtn.addEventListener('click', async () => {
    const restore = busy(moreBtn, 'Memuat…');
    try {
      const page = await call('records.list', { motorId: motor.id, ...filters, limit: PAGE_SIZE, offset: loaded });
      total = page.total;
      append(page.items);
    } catch (err) {
      toastError(err);
    } finally {
      restore();
      updateFooter();
    }
  });

  const exportBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, icon('download', 18), 'Ekspor ke Excel (CSV)');
  exportBtn.addEventListener('click', async () => {
    const restore = busy(exportBtn, 'Menyiapkan…');
    try {
      const rows = await call('records.export', { motorId: motor.id, ...filters });
      downloadFile(`motocare-${slug(motor.name)}-${todayISO()}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
      toast(`${rows.length} catatan diekspor`, 'success');
    } catch (err) {
      toastError(err);
    } finally {
      restore();
    }
  });

  function append(items) {
    items.forEach((r) => listEl.appendChild(recordCard(r)));
    loaded += items.length;
  }

  function updateFooter() {
    summaryEl.textContent = `Menampilkan ${loaded} dari ${total} catatan`;
    moreBtn.hidden = loaded >= total;
  }

  append(first.items);
  updateFooter();

  const addBtn = h('a', { class: 'btn btn-primary', href: '#/records/new' }, icon('add', 20), 'Catatan');
  const content = total === 0
    ? emptyState({
      iconName: 'history',
      title: activeCount ? 'Tidak ada catatan yang cocok' : 'Belum ada catatan',
      text: activeCount ? 'Ubah atau reset filter.' : 'Catat servis, ganti oli, atau belanja part pertama Anda.',
      action: activeCount ? h('a', { class: 'btn btn-tonal', href: '#/records' }, 'Reset filter') : h('a', { class: 'btn btn-primary', href: '#/records/new' }, icon('add', 20), 'Catatan baru'),
    })
    : h('section', { 'aria-label': 'Daftar pemeliharaan' },
      h('div', { class: 'row-between', style: { padding: '0 4px 10px' } },
        h('span', { class: 'section-label', style: { padding: 0 } }, 'Daftar pemeliharaan'),
        h('span', { class: 't-label c-primary', style: { fontWeight: '700' } }, `Total: ${formatRupiah(first.sumTotal)}`),
      ),
      listEl,
      h('div', { class: 'stack mt-16', style: { alignItems: 'center', textAlign: 'center', gap: '8px' } },
        h('span', { class: 'load-more-line', 'aria-hidden': 'true' }),
        moreBtn,
        summaryEl,
        exportBtn,
      ),
    );

  mount(pageHead('Riwayat', { subtitle: 'Log perawatan & pembukuan motor', actions: [addBtn] }), filterForm, content);
}

function recordCard(r) {
  const title = r.itemNames && r.itemNames.length
    ? r.itemNames.join(', ') + (r.itemCount > r.itemNames.length ? ` +${r.itemCount - r.itemNames.length}` : '')
    : (r.type === 'SERVIS' ? 'Jasa servis' : TYPE_LABELS[r.type]);
  const noteLine = (r.notes || '').split('\n')[0].trim();
  return h('a', { class: 'card record-card', href: `#/records/${encodeURIComponent(r.id)}` },
    h('div', { class: 'row-between' },
      h('div', { class: 'row gap-8' }, h('span', { class: 'c-primary' }, icon(TYPE_ICONS[r.type] || 'receipt_long', 22)), h('span', { class: 't-h3' }, formatDate(r.date))),
      typeBadge(r.type),
    ),
    h('div', { class: 'meta mt-8' },
      icon('speed', 18), h('span', { class: 'num' }, `${formatNumber(r.odometer)} km`),
      r.place && [h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'), icon('storefront', 18), h('span', null, r.place)],
    ),
    h('div', { class: 'row-between mt-12', style: { alignItems: 'flex-end' } },
      h('div', { class: 'stack grow' },
        h('span', { class: 't-body truncate', style: { fontSize: '15px' } }, title),
        noteLine
          ? h('span', { class: 'row gap-4 t-sm c-ok truncate', style: { fontWeight: '700' } }, icon('check_circle', 14), h('span', { class: 'truncate' }, noteLine))
          : r.categories && r.categories.length
            ? h('span', { class: 't-sm c-2 truncate' }, r.categories.map(categoryLabel).join(', '))
            : null,
      ),
      h('span', { class: 'amount' }, formatRupiah(r.grandTotal)),
    ),
  );
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'motor';
}

/** CSV (pemisah ;) agar langsung terbaca Excel berbahasa Indonesia. Satu baris per item. */
function toCsv(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // cegah formula injection di Excel
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = ['Tanggal', 'Jenis', 'Odometer (km)', 'Tempat', 'Kategori', 'Item', 'Merk', 'Qty', 'Harga Satuan', 'Subtotal', 'Biaya Jasa', 'Total Catatan', 'Catatan'];
  const lines = [header.map(esc).join(';')];
  rows.forEach((r) => {
    const base = [r.date, TYPE_LABELS[r.type] || r.type, r.odometer, r.place];
    const tail = [r.serviceFee, r.grandTotal, r.notes];
    if (!r.items.length) {
      lines.push([...base, '', '', '', '', '', '', ...tail].map(esc).join(';'));
    } else {
      r.items.forEach((it, i) => {
        lines.push([...base, categoryLabel(it.category), it.name, it.brand, it.qty, it.unitPrice, it.subtotal, i === 0 ? r.serviceFee : '', i === 0 ? r.grandTotal : '', i === 0 ? r.notes : ''].map(esc).join(';'));
      });
    }
  });
  return '\uFEFF' + lines.join('\r\n');
}
