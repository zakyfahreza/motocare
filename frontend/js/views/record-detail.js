import { h } from '../utils/dom.js';
import { call, read } from '../api.js';
import { formatRupiah, formatNumber, formatDate, formatTimestamp, formatLiters, TYPE_LABELS, parseDetails } from '../utils/format.js';
import { pageHead, typeBadge, confirmDialog, toast, toastError, busy, sectionHead } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { categoryIcon, TYPE_ICONS, TYPE_TONES, SERVICE_TAGS, tireActionLabel, tirePositionLabel } from '../ui/meta.js';
import { categoryLabel, getMotors } from '../state.js';
import { navigate } from '../router.js';
import { loadPhotoIds, cachedPhotoById } from '../photos.js';

function viewPhoto(url, label) {
  const dlg = h('dialog', { class: 'photo-viewer', 'aria-label': label },
    h('img', { src: url, alt: label }),
    h('div', { class: 'dialog-actions' }, h('button', { type: 'button', class: 'btn btn-outline', onclick: () => dlg.close() }, 'Tutup')),
  );
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.appendChild(dlg);
  dlg.showModal();
}

export async function render({ params, mount }) {
  const r = await read('records.get', { id: params.id });
  const motor = getMotors().find((m) => m.id === r.motorId);
  const d = parseDetails(r.details);

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
    h('strong', { class: 'num', style: { textAlign: 'right', whiteSpace: 'normal' } }, value),
  );

  const tags = String(r.tags || '').split(',').filter(Boolean);
  const placeLabel = r.type === 'BENSIN' ? 'SPBU' : r.type === 'BAN' ? 'Toko / bengkel' : 'Tempat';

  // ---------- Rincian khusus ----------
  let specific = null;
  if (r.type === 'BENSIN') {
    const f = d.fuel || {};
    specific = h('section', null,
      sectionHead('Rincian Bensin'),
      h('div', { class: 'card card-pad list-divider' },
        info('local_gas_station', 'Bahan bakar', f.fuelType || '—'),
        info('water_drop', 'Jumlah', f.liters ? formatLiters(f.liters) : '—'),
        info('payments', 'Harga per liter', formatRupiah(f.pricePerLiter)),
        info('ev_station', 'Isi penuh', f.fullTank ? 'Ya' : 'Tidak'),
        info('speed', 'Konsumsi', r.economy ? `${formatNumber(r.economy.kmPerL)} km/L (${formatNumber(r.economy.distance)} km)` : (f.fullTank ? 'Butuh isi penuh sebelumnya' : 'Hanya dihitung saat isi penuh')),
      ),
    );
  } else if (r.type === 'BAN') {
    const t = d.tire || {};
    const psi = [t.psiFront !== null && t.psiFront !== undefined ? `Depan ${t.psiFront}` : '', t.psiRear !== null && t.psiRear !== undefined ? `Belakang ${t.psiRear}` : ''].filter(Boolean).join(' · ');
    specific = h('section', null,
      sectionHead('Rincian Ban'),
      h('div', { class: 'card card-pad list-divider' },
        info('tire_repair', 'Tindakan', tireActionLabel(t.action)),
        info('adjust', 'Posisi', tirePositionLabel(t.position)),
        t.action === 'GANTI' ? info('style', 'Merk & seri', t.brand || '—') : null,
        t.action === 'GANTI' && t.size ? info('straighten', 'Ukuran', t.size) : null,
        t.action === 'GANTI' && t.dot ? info('event', 'Kode DOT', t.dot) : null,
        t.action === 'GANTI' && t.construction ? info('verified', 'Konstruksi', t.construction === 'TL' ? 'Tubeless' : 'Tube type') : null,
        psi ? info('compress', 'Tekanan (PSI)', psi) : null,
        t.gas ? info('eco', 'Gas', t.gas === 'N2' ? 'Nitrogen' : 'Angin biasa') : null,
      ),
    );
  }

  // ---------- Foto ----------
  const photoIds = String(r.photoIds || '').split(',').filter(Boolean);
  let photoSection = null;
  if (photoIds.length) {
    const strip = h('div', { class: 'photo-strip' });
    const draw = (map) => strip.replaceChildren(...photoIds.map((id, i) => {
      const url = map[id];
      const label = `Foto ${i + 1} catatan ${formatDate(r.date)}`;
      return url
        ? h('a', { href: '#', 'aria-label': `Perbesar foto ${i + 1}`, onclick: (e) => { e.preventDefault(); viewPhoto(url, label); } }, h('img', { src: url, alt: label }))
        : h('a', { href: '#', 'aria-label': 'Memuat foto', onclick: (e) => e.preventDefault() }, h('span', { class: 'attach-loading' }, h('span', { class: 'spinner' })));
    }));
    const initial = {};
    photoIds.forEach((id) => { const u = cachedPhotoById(id); if (u) initial[id] = u; });
    draw(initial);
    if (Object.keys(initial).length < photoIds.length) {
      loadPhotoIds(photoIds).then(draw).catch(() => strip.replaceChildren(h('p', { class: 'c-2' }, 'Foto gagal dimuat.')));
    }
    photoSection = h('section', null, sectionHead(r.type === 'BENSIN' ? 'Foto Struk' : 'Foto Nota & Part', { extra: h('span', { class: 'badge badge-primary' }, `${photoIds.length} foto`) }), h('div', { class: 'card card-pad' }, strip));
  }

  const itemsSection = r.type === 'BENSIN' ? null : h('section', null,
    sectionHead(r.type === 'BAN' ? 'Ban Dipasang' : 'Part & Oli', { extra: h('span', { class: 'badge badge-primary' }, `${r.items.length} item`) }),
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
        : h('p', { class: 'card-pad c-2' }, r.type === 'BAN' ? 'Tidak ada pembelian ban baru.' : 'Tidak ada item part/oli.'),
    ),
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
      tags.length ? h('div', { class: 'chip-row mt-12' }, tags.map((t) => h('span', { class: 'badge badge-primary' }, (SERVICE_TAGS.find((x) => x.code === t) || {}).label || t))) : null,
      h('div', { class: 'list-divider mt-12' },
        info('speed', 'Odometer', `${formatNumber(r.odometer)} km`),
        info(r.type === 'BENSIN' ? 'local_gas_station' : 'storefront', placeLabel, r.place || '—'),
        info('two_wheeler', 'Motor', motor ? motor.name : '—'),
      ),
    ),
    specific,
    itemsSection,
    h('div', { class: 'summary-card' },
      r.type === 'BENSIN'
        ? h('div', { class: 'row-between' }, h('span', { class: 'c-2' }, 'Pembelian bensin'), h('strong', { class: 'num' }, formatRupiah(r.itemsTotal)))
        : [
          h('div', { class: 'row-between' }, h('span', { class: 'c-2' }, r.type === 'BAN' ? 'Harga ban' : 'Total part & bahan'), h('strong', { class: 'num' }, formatRupiah(r.itemsTotal))),
          h('div', { class: 'row-between' }, h('span', { class: 'c-2' }, r.type === 'BAN' ? 'Jasa & tambahan' : 'Biaya jasa bengkel'), h('strong', { class: 'num' }, formatRupiah(r.serviceFee))),
        ],
      h('div', { class: 'summary-total' }, h('span', { class: 't-h3' }, 'Total biaya'), h('span', { class: 't-stat c-primary' }, formatRupiah(r.grandTotal))),
    ),
    photoSection,
    r.notes && h('section', null, sectionHead('Catatan'), h('div', { class: 'card card-pad pre-wrap' }, r.notes)),
    h('p', { class: 't-sm c-3', style: { textAlign: 'center' } }, `Dibuat ${formatTimestamp(r.createdAt)}`, r.updatedAt && r.updatedAt !== r.createdAt ? ` · diubah ${formatTimestamp(r.updatedAt)}` : ''),
    h('div', { class: 'btn-row' },
      deleteBtn,
      h('a', { class: 'btn btn-primary', href: `#/records/${encodeURIComponent(r.id)}/edit` }, icon('edit', 20), 'Edit'),
    ),
  );
}
