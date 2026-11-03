import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { formatRupiah, formatKm, formatDate, TYPE_LABELS } from '../utils/format.js';
import { pageHead, typeBadge, emptyState, field, busy, toastError } from '../ui/components.js';
import { loadCategories } from '../state.js';
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

  // ---------- filter ----------
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
  const activeCount = Object.values(filters).filter(Boolean).length;

  const filterForm = h('form', null,
    h('div', { class: 'field-row' },
      field({ label: 'Jenis', input: typeSel }),
      field({ label: 'Kategori', input: catSel }),
    ),
    h('div', { class: 'field-row' },
      field({ label: 'Dari tanggal', input: fromInput }),
      field({ label: 'Sampai tanggal', input: toInput }),
    ),
    h('div', { class: 'btn-row' },
      h('a', { class: 'btn', href: '#/records' }, 'Reset'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Terapkan'),
    ),
  );
  filterForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    navigate(buildHash('/records', { type: typeSel.value, category: catSel.value, from: fromInput.value, to: toInput.value }).slice(1), { replace: true });
  });
  const filterBox = h('details', { class: 'filters card', open: activeCount > 0 },
    h('summary', null, activeCount ? `Filter (${activeCount} aktif)` : 'Filter'),
    filterForm,
  );

  // ---------- daftar ----------
  const listEl = h('ul', { class: 'list' });
  const summaryEl = h('p', { class: 'muted small', 'aria-live': 'polite' });
  let loaded = 0;
  let total = first.total;

  const moreBtn = h('button', { type: 'button', class: 'btn btn-block' }, 'Muat lagi');
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

  function append(items) {
    items.forEach((r) => listEl.appendChild(h('li', null, recordItem(r))));
    loaded += items.length;
  }

  function updateFooter() {
    summaryEl.textContent = `Menampilkan ${loaded} dari ${total} catatan`;
    moreBtn.hidden = loaded >= total;
  }

  append(first.items);
  updateFooter();

  const addBtn = h('a', { class: 'btn btn-primary', href: '#/records/new' }, '＋ Catatan');
  const content = total === 0
    ? emptyState({
      title: activeCount ? 'Tidak ada catatan yang cocok' : 'Belum ada catatan',
      text: activeCount ? 'Ubah atau reset filter.' : 'Catat servis, ganti oli, atau belanja part pertama Anda.',
      action: activeCount ? h('a', { class: 'btn', href: '#/records' }, 'Reset filter') : addBtn,
    })
    : h('div', { class: 'card' }, listEl, summaryEl, moreBtn);

  mount(pageHead('Riwayat', total ? addBtn : null), filterBox, content);
}

function recordItem(r) {
  const sub = [formatKm(r.odometer), r.place].filter(Boolean).join(' · ');
  return h('a', { class: 'list-item', href: `#/records/${encodeURIComponent(r.id)}` },
    h('div', { class: 'list-main' },
      h('div', { class: 'list-title' }, formatDate(r.date), ' ', typeBadge(r.type)),
      h('div', { class: 'list-sub' }, sub),
      r.itemNames && r.itemNames.length
        ? h('div', { class: 'list-sub' }, r.itemNames.join(', ') + (r.itemCount > r.itemNames.length ? ` +${r.itemCount - r.itemNames.length}` : ''))
        : null,
    ),
    h('div', { class: 'list-side' }, h('strong', null, formatRupiah(r.grandTotal))),
  );
}
