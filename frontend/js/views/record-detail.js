import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { formatRupiah, formatKm, formatDate, formatNumber, formatTimestamp } from '../utils/format.js';
import { pageHead, typeBadge, confirmDialog, toast, toastError, busy } from '../ui/components.js';
import { categoryLabel, getMotors } from '../state.js';
import { navigate } from '../router.js';

export async function render({ params, mount }) {
  const r = await call('records.get', { id: params.id });
  const motor = getMotors().find((m) => m.id === r.motorId);

  const deleteBtn = h('button', { type: 'button', class: 'btn btn-danger' }, 'Hapus');
  deleteBtn.addEventListener('click', async () => {
    const ok = await confirmDialog(`Hapus catatan ${formatDate(r.date)}?`, { okText: 'Hapus', danger: true });
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

  const itemsTable = r.items.length
    ? h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, 'Item'),
        h('th', { scope: 'col', class: 'num' }, 'Qty'),
        h('th', { scope: 'col', class: 'num' }, 'Harga'),
        h('th', { scope: 'col', class: 'num' }, 'Subtotal'),
      )),
      h('tbody', null, r.items.map((it) => h('tr', null,
        h('td', null,
          h('div', { class: 'list-title' }, it.name),
          h('div', { class: 'list-sub' }, [categoryLabel(it.category), it.brand].filter(Boolean).join(' · ')),
        ),
        h('td', { class: 'num' }, formatNumber(it.qty)),
        h('td', { class: 'num' }, formatRupiah(it.unitPrice)),
        h('td', { class: 'num' }, formatRupiah(it.subtotal)),
      ))),
    ))
    : h('p', { class: 'muted' }, 'Tidak ada item part/oli.');

  mount(
    pageHead('Detail catatan',
      h('a', { class: 'btn', href: `#/records/${encodeURIComponent(r.id)}/edit` }, 'Edit'),
      deleteBtn,
    ),
    h('div', { class: 'card' },
      h('p', null, typeBadge(r.type)),
      h('dl', { class: 'kv' },
        h('dt', null, 'Tanggal'), h('dd', null, formatDate(r.date)),
        h('dt', null, 'Odometer'), h('dd', null, formatKm(r.odometer)),
        h('dt', null, 'Tempat'), h('dd', null, r.place || '—'),
        h('dt', null, 'Motor'), h('dd', null, motor ? motor.name : '—'),
      ),
    ),
    h('div', { class: 'card' },
      h('h2', null, 'Part / oli'),
      itemsTable,
      h('div', { class: 'totals' },
        h('div', null, h('span', null, 'Total part'), h('span', null, formatRupiah(r.itemsTotal))),
        h('div', null, h('span', null, 'Biaya jasa'), h('span', null, formatRupiah(r.serviceFee))),
        h('div', { class: 'grand' }, h('span', null, 'Total'), h('span', null, formatRupiah(r.grandTotal))),
      ),
    ),
    r.notes && h('div', { class: 'card' }, h('h2', null, 'Catatan'), h('p', { class: 'pre-wrap' }, r.notes)),
    h('p', { class: 'muted small' }, `Dibuat ${formatTimestamp(r.createdAt)}`, r.updatedAt && r.updatedAt !== r.createdAt ? ` · diubah ${formatTimestamp(r.updatedAt)}` : ''),
    h('a', { href: '#/records' }, '← Kembali ke riwayat'),
  );
}
