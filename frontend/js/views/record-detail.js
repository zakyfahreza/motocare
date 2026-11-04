import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { formatRupiah, formatNumber, formatDate, formatTimestamp, TYPE_LABELS } from '../utils/format.js';
import { pageHead, typeBadge, confirmDialog, toast, toastError, busy, sectionHead } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { categoryIcon, TYPE_ICONS, TYPE_TONES } from '../ui/meta.js';
import { categoryLabel, getMotors } from '../state.js';
import { navigate } from '../router.js';

export async function render({ params, mount }) {
  const r = await call('records.get', { id: params.id });
  const motor = getMotors().find((m) => m.id === r.motorId);

  const deleteBtn = h('button', { type: 'button', class: 'btn btn-danger' }, icon('delete', 20), 'Hapus');
  deleteBtn.addEventListener('click', async () => {
    const ok = await confirmDialog(`Hapus catatan ${formatDate(r.date)}? Data tetap tersimpan di spreadsheet dengan tanda terhapus.`, { title: 'Hapus catatan', okText: 'Hapus', danger: true });
    if (!ok) return;
    const restore = busy(deleteBtn, 'Menghapus…');
    try {
      await call('records.delete', { id: r.id });
      toast('Catatan dihapus', 'success');
      navigate('/records', { replace: true });
    } catch (err) {
      restore();
      toastError(err);
    }
  });

  const info = (iconName, label, value) => h('div', { class: 'row gap-12', style: { padding: '10px 0' } },
    h('span', { class: 'tile-icon sm' }, icon(iconName, 18)),
    h('span', { class: 'c-2 grow' }, label),
    h('strong', { class: 'num', style: { textAlign: 'right' } }, value),
  );

  mount(
    pageHead('Detail Catatan', { subtitle: `${TYPE_LABELS[r.type]} · ${formatDate(r.date)}` }),
    h('div', { class: 'card card-pad-lg' },
      h('div', { class: 'row-between' },
        h('div', { class: 'row gap-12' },
          h('span', { class: ['tile-icon lg', TYPE_TONES[r.type]] }, icon(TYPE_ICONS[r.type], 26)),
          h('div', { class: 'stack' }, typeBadge(r.type), h('span', { class: 't-h3 mt-4' }, formatDate(r.date))),
        ),
        h('span', { class: 'amount c-primary' }, formatRupiah(r.grandTotal)),
      ),
      h('div', { class: 'list-divider mt-12' },
        info('speed', 'Odometer', `${formatNumber(r.odometer)} km`),
        info('storefront', 'Tempat', r.place || '—'),
        info('two_wheeler', 'Motor', motor ? motor.name : '—'),
      ),
    ),
    h('section', null,
      sectionHead('Part & Oli', { extra: h('span', { class: 'badge badge-primary' }, `${r.items.length} item`) }),
      h('div', { class: 'card' },
        r.items.length
          ? h('div', { class: 'list-divider' }, r.items.map((it) => h('div', { class: 'list-row' },
            h('span', { class: 'tile-icon' }, icon(categoryIcon(it.category), 20)),
            h('div', { class: 'stack grow' },
              h('span', { class: 'list-title' }, it.name),
              h('span', { class: 'list-sub' }, [categoryLabel(it.category), it.brand, `${formatNumber(it.qty)} × ${formatRupiah(it.unitPrice)}`].filter(Boolean).join(' · ')),
            ),
            h('strong', { class: 'num' }, formatRupiah(it.subtotal)),
          )))
          : h('p', { class: 'card-pad c-2' }, 'Tidak ada item part/oli.'),
      ),
    ),
    h('div', { class: 'summary-card' },
      h('div', { class: 'row-between' }, h('span', { class: 'c-2' }, 'Total part & bahan'), h('strong', { class: 'num' }, formatRupiah(r.itemsTotal))),
      h('div', { class: 'row-between' }, h('span', { class: 'c-2' }, 'Biaya jasa bengkel'), h('strong', { class: 'num' }, formatRupiah(r.serviceFee))),
      h('div', { class: 'summary-total' }, h('span', { class: 't-h3' }, 'Total biaya'), h('span', { class: 't-stat c-primary' }, formatRupiah(r.grandTotal))),
    ),
    r.notes && h('section', null, sectionHead('Catatan Perawatan'), h('div', { class: 'card card-pad pre-wrap' }, r.notes)),
    h('p', { class: 't-sm c-3', style: { textAlign: 'center' } }, `Dibuat ${formatTimestamp(r.createdAt)}`, r.updatedAt && r.updatedAt !== r.createdAt ? ` · diubah ${formatTimestamp(r.updatedAt)}` : ''),
    h('div', { class: 'btn-row' },
      deleteBtn,
      h('a', { class: 'btn btn-primary', href: `#/records/${encodeURIComponent(r.id)}/edit` }, icon('edit', 20), 'Edit'),
    ),
  );
}
