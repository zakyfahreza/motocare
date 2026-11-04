import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { formatNumber, formatDate, describeReminder } from '../utils/format.js';
import { validateReminder } from '../utils/validate.js';
import {
  pageHead, statusBadge, emptyState, openDialog, confirmDialog, field, numberInput, readNumber,
  showFieldErrors, toast, toastError, toggleSwitch, affix,
} from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { categoryIcon, STATUS_TONES } from '../ui/meta.js';
import { loadCategories } from '../state.js';

function schedule(r) {
  const parts = [];
  if (r.intervalKm) parts.push(`${formatNumber(r.intervalKm)} km`);
  if (r.intervalDays) parts.push(`${r.intervalDays} hari`);
  return parts.length ? `Tiap ${parts.join(' / ')}` : '—';
}

/** Persentase umur pakai yang sudah terpakai (0–100), berdasarkan km atau hari yang paling mendesak. */
function usage(r) {
  const ratios = [];
  if (r.intervalKm && r.remainingKm !== null) ratios.push(1 - r.remainingKm / r.intervalKm);
  if (r.intervalDays && r.remainingDays !== null) ratios.push(1 - r.remainingDays / r.intervalDays);
  if (!ratios.length) return 0;
  return Math.max(0, Math.min(100, Math.round(Math.max(...ratios) * 100)));
}

export async function render({ motor, mount, refresh }) {
  const [list, categories] = await Promise.all([
    call('reminders.list', { motorId: motor.id }),
    loadCategories(),
  ]);

  const usedCats = new Set(list.map((r) => r.category));
  const available = categories.filter((c) => c.active && !usedCats.has(c.code));

  const addBtn = h('button', {
    type: 'button', class: 'btn btn-primary btn-sm', disabled: available.length === 0,
    onclick: async () => {
      if (await openReminderDialog({ motor, reminder: null, categories: available })) {
        toast('Pengingat ditambahkan', 'success');
        refresh();
      }
    },
  }, icon('add', 20), 'Pengingat');

  const count = (s) => list.filter((r) => r.status === s).length;
  const late = count('TERLAMBAT');
  const soon = count('SEGERA');
  const tile = (iconName, n, label, cls) => h('div', { class: 'card stat-tile' },
    h('span', { class: ['stat-num', cls] }, icon(iconName, 18), String(n)),
    h('span', { class: 't-sm c-2', style: { fontWeight: '600' } }, label),
  );

  const cards = list.map((r) => {
    const tone = STATUS_TONES[r.status];
    const lineCls = r.status === 'TERLAMBAT' ? 'c-late' : r.status === 'SEGERA' ? 'c-soon' : r.status === 'OK' ? 'c-ok' : 'c-3';
    const hasData = r.status !== 'BELUM_ADA_DATA' && r.status !== 'NONAKTIF' && Boolean(r.lastDate);
    const progressCls = r.status === 'TERLAMBAT' ? 'late' : r.status === 'SEGERA' ? 'soon' : '';
    const bar = h('span');
    bar.style.width = `${usage(r)}%`;

    const editBtn = h('button', {
      type: 'button', class: 'btn btn-tonal btn-sm', 'aria-label': `Edit pengingat ${r.label}`,
      onclick: async () => {
        const cats = categories.filter((c) => c.code === r.category || (c.active && !usedCats.has(c.code)));
        if (await openReminderDialog({ motor, reminder: r, categories: cats })) {
          toast('Pengingat diperbarui', 'success');
          refresh();
        }
      },
    }, icon('edit', 18), 'Edit');
    const deleteBtn = h('button', {
      type: 'button', class: 'btn btn-danger btn-sm', 'aria-label': `Hapus pengingat ${r.label}`,
      onclick: async () => {
        if (!(await confirmDialog(`Hapus pengingat ${r.label}?`, { title: 'Hapus pengingat', okText: 'Hapus', danger: true }))) return;
        try {
          await call('reminders.delete', { id: r.id });
          toast('Pengingat dihapus', 'success');
          refresh();
        } catch (err) { toastError(err); }
      },
    }, icon('delete', 18), 'Hapus');

    return h('article', { class: 'card card-pad', 'aria-label': `${r.label}, ${r.status}` },
      h('div', { class: 'row-between', style: { alignItems: 'flex-start' } },
        h('div', { class: 'row gap-12' },
          h('span', { class: ['tile-icon', r.status === 'OK' ? '' : tone] }, icon(categoryIcon(r.category), 22)),
          h('div', { class: 'stack' },
            h('span', { class: 't-h3' }, r.label),
            h('span', { class: ['t-sm', lineCls], style: { fontWeight: '700' } }, r.status === 'BELUM_ADA_DATA' ? 'Belum pernah dicatat' : describeReminder(r)),
          ),
        ),
        statusBadge(r.status),
      ),
      hasData && h('div', { class: ['progress mt-12', progressCls], role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(usage(r)), 'aria-label': `Pemakaian ${usage(r)}%` }, bar),
      h('div', { class: 'inner-box mt-12' },
        h('div', { class: 'row-between' }, h('span', null, 'Jadwal standar'), h('span', { style: { color: 'var(--text)' } }, schedule(r))),
        hasData && h('div', null,
          'Riwayat terakhir:', h('br'),
          `${formatDate(r.lastDate)} @ ${formatNumber(r.lastOdometer)} km`,
          (r.nextKm || r.nextDate) ? ` → berikutnya ${[r.nextKm && `${formatNumber(r.nextKm)} km`, r.nextDate && formatDate(r.nextDate)].filter(Boolean).join(' / ')}` : '',
        ),
      ),
      h('div', { class: 'row mt-12', style: { justifyContent: 'flex-end' } },
        r.status === 'BELUM_ADA_DATA'
          ? [h('a', { class: 'btn btn-tonal btn-sm', href: `#/records/new?category=${encodeURIComponent(r.category)}` }, icon('add', 18), 'Catat Penggantian'), editBtn]
          : [editBtn, deleteBtn],
      ),
    );
  });

  mount(
    pageHead('Pengingat', { subtitle: 'Pantau ritme perawatan motor berkala', actions: [addBtn] }),
    h('div', { class: 'note' },
      icon('info', 22),
      h('div', null,
        h('strong', null, 'Metode perhitungan otomatis'), h('br'),
        'Dihitung dari catatan terakhir tiap kategori dan odometer terkini (',
        h('strong', { class: 'c-primary' }, `${formatNumber(motor.odometerCurrent)} km`),
        '). Status ', h('strong', { class: 'c-soon' }, 'Segera'), ' muncul saat sisa ≤ 10% interval km atau ≤ 7 hari.',
      ),
    ),
    list.length ? h('div', { class: 'stat-tiles' },
      soon ? tile('warning', late + soon, 'Perlu tindakan', 'c-late') : tile('warning', late, 'Terlambat', 'c-late'),
      tile('check_circle', count('OK'), 'Kondisi OK', 'c-ok'),
      tile('help', count('BELUM_ADA_DATA'), 'Belum ada data', 'c-3'),
    ) : null,
    list.length
      ? h('div', { class: 'stack gap-12' }, cards)
      : emptyState({ iconName: 'notification_important', title: 'Belum ada pengingat', text: 'Tambahkan jadwal perawatan, misalnya ganti oli tiap 2.000 km.', action: addBtn }),
  );
}

async function openReminderDialog({ motor, reminder, categories }) {
  const isEdit = Boolean(reminder);
  const catSel = h('select', { required: true, disabled: isEdit },
    !isEdit && h('option', { value: '' }, '— pilih —'),
    categories.map((c) => h('option', { value: c.code, selected: reminder && reminder.category === c.code }, c.label)),
  );
  const kmInput = numberInput({ value: reminder ? reminder.intervalKm : null, placeholder: '2.000' });
  const daysInput = numberInput({ value: reminder ? reminder.intervalDays : null, placeholder: '60' });
  const active = toggleSwitch({ checked: reminder ? reminder.active : true, label: 'Pengingat aktif' });

  const form = h('form', { novalidate: true },
    field({ label: 'Kategori', input: catSel, name: 'category' }),
    h('div', { class: 'field-grid' },
      field({ label: 'Interval km', input: kmInput, name: 'intervalKm', control: affix(kmInput, 'km', { suffix: true }) }),
      field({ label: 'Interval hari', input: daysInput, name: 'intervalDays', control: affix(daysInput, 'hari', { suffix: true }) }),
    ),
    h('p', { class: 'hint mt-8' }, 'Isi salah satu atau keduanya. Jatuh tempo dihitung dari mana yang lebih dulu.'),
    h('label', { class: 'check-row', style: { justifyContent: 'space-between', alignItems: 'center' } }, h('span', { class: 't-title' }, 'Pengingat aktif'), active.el),
  );

  let saved = null;
  await openDialog({
    title: isEdit ? `Edit pengingat ${reminder.label}` : 'Tambah pengingat',
    body: form,
    actions: [{ label: 'Batal', value: 'cancel' }, { label: 'Simpan', value: 'save', class: 'btn-primary' }],
    onAction: async (value) => {
      if (value !== 'save') return true;
      const data = {
        category: catSel.value,
        intervalKm: readNumber(kmInput),
        intervalDays: readNumber(daysInput),
        active: active.input.checked,
      };
      const errors = validateReminder(data);
      if (Object.keys(errors).length) { showFieldErrors(form, errors); return false; }
      try {
        saved = await call('reminders.upsert', { ...(isEdit ? { id: reminder.id } : {}), motorId: motor.id, ...data });
        return true;
      } catch (err) {
        const rest = showFieldErrors(form, err.fields || {});
        if (!err.fields || Object.keys(rest).length) toastError(err);
        return false;
      }
    },
  });
  return saved;
}
