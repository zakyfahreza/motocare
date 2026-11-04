import { h } from '../utils/dom.js';
import { call, read } from '../api.js';
import { formatNumber, formatTimestamp, formatKm } from '../utils/format.js';
import {
  pageHead, emptyState, confirmDialog, toast, toastError, numberInput, readNumber, busy,
} from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { TRANSMISSION_LABELS } from '../ui/meta.js';
import { getActiveMotor, setActiveMotorId, invalidateMotors, getMotors } from '../state.js';
import { navigate } from '../router.js';
import { exportBackup } from './more.js';
import { loadPhotos, cachedPhoto, compressImage, savePhoto, fileInputs } from '../photos.js';

function compactRupiah(n) {
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')}jt`;
  if (n >= 1e3) return `Rp ${Math.round(n / 1e3)}rb`;
  return `Rp ${n}`;
}

function reminderLine(stats) {
  const top = stats.topReminder;
  if (top) {
    const km = top.remainingKm !== null && top.remainingKm <= 0 ? ` ${formatKm(-top.remainingKm)}` : '';
    return { cls: top.status === 'TERLAMBAT' ? 'c-late' : 'c-soon', iconName: 'warning', text: `${top.label} ${top.status === 'TERLAMBAT' ? 'terlambat' : 'segera'}${km}` };
  }
  const next = stats.nextReminder;
  if (next && next.remainingKm !== null) return { cls: 'c-primary', iconName: 'schedule', text: `${next.label} dalam ${formatKm(next.remainingKm)}` };
  return { cls: 'c-ok', iconName: 'check_circle', text: 'Semua jadwal servis aman' };
}

export async function render({ mount, refresh, isCurrent }) {
  const { motors, totals } = await read('motors.overview');
  // Foto tidak menahan tampilan: pakai yang sudah ada di perangkat, sisanya dimuat lalu halaman digambar ulang.
  const photos = {};
  const missing = [];
  getMotors().forEach((m) => {
    const url = cachedPhoto(m);
    if (url) photos[m.id] = url; else if (m.photoFileId) missing.push(m);
  });
  if (missing.length) loadPhotos(missing).then((p) => { if (Object.keys(p).length && isCurrent()) refresh(); }).catch(() => {});
  const active = getActiveMotor();

  const after = (msg) => {
    toast(msg, 'success');
    invalidateMotors();
    refresh();
  };

  const addBtn = h('a', { class: 'btn btn-primary btn-sm', href: '#/motors/new' }, icon('add', 20), 'Tambah');
  if (!motors.length) {
    mount(
      pageHead('Garasi & Motor Saya', { subtitle: 'Kelola motor, ganti motor aktif, dan atur spesifikasi.' }),
      emptyState({ iconName: 'two_wheeler', title: 'Belum ada motor', text: 'Tambahkan motor pertama Anda.', action: h('a', { class: 'btn btn-primary', href: '#/motors/new' }, icon('add', 20), 'Tambah motor') }),
    );
    return;
  }

  const activeMotor = motors.find((m) => active && m.id === active.id) || motors[0];
  const others = motors.filter((m) => m.id !== activeMotor.id);

  const removeMotor = async (m) => {
    const ok = await confirmDialog(`Hapus motor "${m.name}"? Riwayat catatannya tidak akan tampil lagi.`, { title: 'Hapus motor', okText: 'Hapus', danger: true });
    if (!ok) return;
    try {
      await call('motors.delete', { id: m.id });
      after('Motor dihapus');
    } catch (err) { toastError(err); }
  };

  mount(
    pageHead('Garasi & Motor Saya', { subtitle: 'Kelola motor, ganti motor aktif, dan atur spesifikasi.', actions: [addBtn] }),
    h('div', { class: 'card stat-strip' },
      h('div', null, h('span', { class: 't-sm c-2' }, 'Armada'), h('strong', { class: 'stack t-title c-primary' }, `${totals.count} Unit`)),
      h('div', null, h('span', { class: 't-sm c-2' }, 'Jarak total'), h('strong', { class: 'stack t-title num' }, formatKm(totals.totalKm))),
      h('div', null, h('span', { class: 't-sm c-2' }, 'Bulan ini'), h('strong', { class: 'stack t-title num' }, compactRupiah(totals.monthSpend))),
    ),
    activeCard(activeMotor, { after, removeMotor, photoUrl: photos[activeMotor.id] }),
    others.length ? h('section', { class: 'stack gap-12' },
      h('div', { class: 'row-between' },
        h('h2', { class: 'row gap-8 t-h3' }, h('span', { class: 'c-primary' }, icon('garage_home', 22)), 'Motor Lainnya di Garasi'),
        h('span', { class: 't-sm c-2', style: { fontWeight: '700' } }, `${others.length} tersimpan`),
      ),
      others.map((m) => otherCard(m, photos[m.id])),
    ) : null,
    h('a', { class: 'card-soft row gap-12', href: '#/motors/new', style: { color: 'inherit' } },
      h('span', { class: 'tile-icon round', style: { background: 'var(--card)' } }, icon('two_wheeler', 22)),
      h('span', { class: 'stack' }, h('span', { class: 't-title' }, 'Punya motor baru?'), h('span', { class: 't-sm c-2' }, 'Tambahkan data motor untuk memisahkan pengingat servis dan rekap biaya secara otomatis.')),
    ),
    backupCard(totals.count),
  );
}

/** Area foto motor aktif + tombol ganti/tambah foto langsung dari galeri/kamera. */
function photoArea(m, photoUrl, after) {
  const area = h('div', { class: ['motor-photo mt-12', photoUrl && 'has-photo'] });
  const inputs = fileInputs(async (file) => {
    area.classList.add('is-busy');
    btn.disabled = true;
    btn.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Mengunggah…');
    try {
      const dataUrl = await compressImage(file);
      await savePhoto(m.id, dataUrl);
      after('Foto motor disimpan');
    } catch (err) {
      toastError(err);
      area.classList.remove('is-busy');
      btn.disabled = false;
      btn.replaceChildren(icon('photo_camera', 16), photoUrl ? 'Ganti foto' : 'Tambah foto');
    }
  });
  const btn = h('button', { type: 'button', class: 'photo-edit', onclick: () => inputs.gallery.click() }, icon('photo_camera', 16), photoUrl ? 'Ganti foto' : 'Tambah foto');
  area.append(
    photoUrl ? h('img', { src: photoUrl, alt: `Foto ${m.name}` }) : icon('two_wheeler', 72),
    btn,
    m.tankLiters ? h('span', { class: 'photo-chip' }, icon('local_gas_station', 14), `Tangki: ${formatNumber(m.tankLiters)} Liter`) : '',
    inputs.gallery,
  );
  return area;
}

function activeCard(m, { after, removeMotor, photoUrl }) {
  const menu = h('div', { class: 'menu-pop', role: 'menu', hidden: true },
    h('button', { type: 'button', role: 'menuitem', onclick: () => navigate(`/motors/${encodeURIComponent(m.id)}/edit`) }, icon('edit', 18), 'Edit motor'),
    h('button', { type: 'button', role: 'menuitem', class: 'c-late', onclick: () => { menu.hidden = true; removeMotor(m); } }, icon('delete', 18), 'Hapus motor'),
  );
  const kebab = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Menu motor', 'aria-haspopup': 'menu', 'aria-expanded': 'false', style: { background: 'var(--surface-low)', borderRadius: '12px' } }, icon('more_vert', 22));
  kebab.addEventListener('click', (ev) => {
    ev.stopPropagation();
    menu.hidden = !menu.hidden;
    kebab.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) {
      const close = () => { menu.hidden = true; kebab.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', close); };
      document.addEventListener('click', close);
    }
  });

  // Update km inline
  const odoInput = numberInput({ value: m.odometerCurrent });
  odoInput.setAttribute('aria-label', 'Odometer baru (km)');
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Simpan');
  const odoErr = h('div', { class: 'field-error', role: 'alert', hidden: true });
  const odoPanel = h('div', { hidden: true }, h('div', { class: 'odo-inline' }, odoInput, saveBtn), odoErr);
  const updBtn = h('button', { type: 'button', class: 'btn btn-tonal btn-sm', onclick: () => { odoPanel.hidden = !odoPanel.hidden; if (!odoPanel.hidden) odoInput.focus(); } }, icon('speed', 18), 'Update km');
  saveBtn.addEventListener('click', async () => {
    const v = readNumber(odoInput);
    odoErr.hidden = true;
    if (v === null || Number.isNaN(v) || v < m.odometerCurrent) {
      odoErr.textContent = `Minimal ${formatKm(m.odometerCurrent)}. Untuk koreksi gunakan menu ⋮ → Edit motor.`;
      odoErr.hidden = false;
      return;
    }
    const restore = busy(saveBtn, '…');
    try {
      await call('motors.updateOdometer', { id: m.id, odometer: v });
      after('Odometer diperbarui');
    } catch (err) { restore(); toastError(err); }
  });

  const top = m.stats.topReminder;
  const specs = [
    m.oilType || m.oilLiters ? ['Oli mesin', [m.oilType, m.oilLiters && `${formatNumber(m.oilLiters)} L`].filter(Boolean).join(' • ')] : null,
    m.tireFront || m.tireRear ? ['Ukuran ban', [m.tireFront && `Depan ${m.tireFront}`, m.tireRear && `Blkg ${m.tireRear}`].filter(Boolean).join(' • ')] : null,
    m.stats.lastOilName ? ['Oli terakhir', m.stats.lastOilName] : null,
    m.engineCc ? ['Mesin', `${m.engineCc} cc${m.transmission ? ` • ${TRANSMISSION_LABELS[m.transmission]}` : ''}`] : null,
  ].filter(Boolean).slice(0, 2);
  const subtitle = [m.year && `Tahun ${m.year}`, [m.transmission && TRANSMISSION_LABELS[m.transmission], m.engineCc && `${m.engineCc}cc`].filter(Boolean).join(' ')].filter(Boolean).join(' • ');

  return h('article', { class: 'card', 'aria-label': `Motor aktif ${m.name}` },
    h('div', { class: 'card-pad' },
      h('div', { class: 'row-between', style: { alignItems: 'flex-start' } },
        h('div', { class: 'stack' },
          h('div', { class: 'row gap-8' }, h('span', { class: 'badge badge-ok badge-dot' }, 'Motor aktif'), m.plate && h('span', { class: 'badge' }, m.plate)),
          h('span', { class: 't-h2 mt-8' }, [m.brand, m.model].filter(Boolean).join(' ') || m.name),
          h('span', { class: 't-sm c-2' }, [m.name !== m.model ? m.name : null, subtitle].filter(Boolean).join(' · ')),
        ),
        h('div', { class: 'kebab' }, kebab, menu),
      ),
      photoArea(m, photoUrl, after),
      h('div', { class: 'card mt-12', style: { padding: '12px', boxShadow: 'none' } },
        h('div', { class: 'row-between' },
          h('div', { class: 'stack' },
            h('span', { class: 't-sm c-2', style: { fontWeight: '600' } }, 'Odometer terkini'),
            h('span', { class: 'row gap-4', style: { alignItems: 'baseline' } }, h('span', { class: 't-stat c-primary' }, formatNumber(m.odometerCurrent)), h('span', { class: 'c-2' }, 'km')),
            m.odometerUpdatedAt && h('span', { class: 't-sm c-2' }, `Update: ${formatTimestamp(m.odometerUpdatedAt)}`),
          ),
          updBtn,
        ),
        odoPanel,
      ),
    ),
    h('div', { class: 'card-pad', style: { background: 'var(--surface-low)', borderRadius: '0 0 16px 16px' } },
      top && h('div', { class: ['alert-row', top.status === 'SEGERA' && 'soon'] },
        icon('warning', 22),
        h('div', { class: 'stack grow' },
          h('span', { class: 't-label' }, `${top.label} • ${top.status === 'TERLAMBAT' ? 'Terlambat' : 'Segera'}${top.remainingKm !== null && top.remainingKm <= 0 ? ` ${formatKm(-top.remainingKm)}` : ''}`),
          m.oilType && top.category === 'OLI_MESIN' ? h('span', { class: 't-sm' }, `Rekomendasi: ${m.oilType}`) : null,
        ),
        h('a', { class: 'btn btn-sm', href: `#/records/new?category=${encodeURIComponent(top.category)}`, style: { background: 'var(--card)', color: 'var(--late)' } }, 'Servis'),
      ),
      specs.length ? h('div', { class: ['spec-grid', top && 'mt-12'] }, specs.map(([k, v]) => h('div', { class: 'spec', style: { background: 'var(--card)' } }, h('span', { class: 't-sm' }, k), h('strong', null, v)))) : null,
      h('a', { class: ['btn btn-tonal btn-block', (top || specs.length) && 'mt-12'], href: `#/motors/${encodeURIComponent(m.id)}/edit` }, icon('tune', 20), 'Edit rincian spesifikasi'),
    ),
  );
}

function otherCard(m, photoUrl) {
  const line = reminderLine(m.stats);
  return h('article', { class: 'card card-pad', 'aria-label': m.name },
    h('div', { class: 'row gap-12', style: { alignItems: 'flex-start' } },
      h('span', { class: 'motor-thumb' }, photoUrl ? h('img', { src: photoUrl, alt: `Foto ${m.name}` }) : icon('two_wheeler', 36)),
      h('div', { class: 'stack grow' },
        h('div', { class: 'row-between' }, h('span', { class: 't-sm c-2', style: { fontWeight: '700' } }, m.plate || '—'), h('span', { class: 'badge' }, 'Standby')),
        h('span', { class: 't-title', style: { fontSize: '16px' } }, [m.brand, m.model].filter(Boolean).join(' ') || m.name),
        h('span', { class: 't-sm c-2' }, [m.name !== m.model ? m.name : null, m.year && `Tahun ${m.year}`, formatKm(m.odometerCurrent)].filter(Boolean).join(' • ')),
        h('span', { class: ['row gap-4 t-sm mt-4', line.cls], style: { fontWeight: '700' } }, icon(line.iconName, 16), line.text),
      ),
    ),
    (m.stats.lastOilName || m.tankLiters) ? h('div', { class: 'inner-box row-between mt-12' },
      h('span', { class: 'truncate' }, m.stats.lastOilName ? `Oli terpakai: ${m.stats.lastOilName}` : 'Oli terpakai: —'),
      m.tankLiters ? h('strong', { class: 'c-primary', style: { whiteSpace: 'nowrap' } }, `Tangki ${formatNumber(m.tankLiters)}L`) : null,
    ) : null,
    h('div', { class: 'row mt-12' },
      h('button', {
        type: 'button', class: 'btn btn-tonal grow',
        onclick: () => { setActiveMotorId(m.id); toast(`${m.name} jadi motor aktif`, 'success'); navigate('/'); },
      }, icon('sync_alt', 20), 'Jadikan Motor Aktif'),
      h('a', { class: 'btn btn-outline', href: `#/motors/${encodeURIComponent(m.id)}/edit` }, 'Edit'),
    ),
  );
}

function backupCard(count) {
  const btn = h('button', { type: 'button', class: 'btn btn-tonal btn-sm' }, 'Ekspor');
  btn.addEventListener('click', async () => {
    const restore = busy(btn, '…');
    try {
      await exportBackup();
      toast('File cadangan diunduh', 'success');
    } catch (err) { toastError(err); } finally { restore(); }
  });
  return h('div', { class: 'card card-pad row gap-12' },
    h('span', { class: 'tile-icon' }, icon('backup', 22)),
    h('div', { class: 'stack grow' }, h('span', { class: 't-title' }, 'Cadangkan & Ekspor Data Garasi'), h('span', { class: 't-sm c-2' }, `Simpan spesifikasi & log ${count} motor (JSON)`)),
    btn,
  );
}
