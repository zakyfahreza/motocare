import { h } from '../utils/dom.js';
import { call } from '../api.js';
import { formatKm, formatDate, describeReminder, describeInterval } from '../utils/format.js';
import { validateReminder } from '../utils/validate.js';
import {
  pageHead, statusBadge, emptyState, openDialog, confirmDialog, field, numberInput, readNumber,
  showFieldErrors, toast, toastError,
} from '../ui/components.js';
import { loadCategories } from '../state.js';

export async function render({ motor, mount, refresh }) {
  const [list, categories] = await Promise.all([
    call('reminders.list', { motorId: motor.id }),
    loadCategories(),
  ]);

  const usedCats = new Set(list.map((r) => r.category));
  const available = categories.filter((c) => c.active && !usedCats.has(c.code));

  const addBtn = h('button', {
    type: 'button', class: 'btn btn-primary', disabled: available.length === 0,
    onclick: async () => {
      if (await openReminderDialog({ motor, reminder: null, categories: available })) {
        toast('Pengingat ditambahkan', 'success');
        refresh();
      }
    },
  }, '＋ Pengingat');

  const content = list.length
    ? h('div', { class: 'card' }, h('ul', { class: 'list' }, list.map((r) => h('li', null,
      h('div', { class: 'list-item' },
        h('div', { class: 'list-main' },
          h('div', { class: 'list-title' }, r.label, ' ', statusBadge(r.status)),
          h('div', { class: 'list-sub' }, describeReminder(r)),
          h('div', { class: 'list-sub' }, `Jadwal: ${describeInterval(r) || '—'}`),
          r.lastDate && h('div', { class: 'list-sub' },
            `Terakhir: ${formatDate(r.lastDate)} @ ${formatKm(r.lastOdometer)}`,
            r.nextKm || r.nextDate ? ` → berikutnya ${[r.nextKm && formatKm(r.nextKm), r.nextDate && formatDate(r.nextDate)].filter(Boolean).join(' / ')}` : '',
          ),
        ),
        h('div', { class: 'list-actions' },
          h('button', {
            type: 'button', class: 'btn btn-sm', 'aria-label': `Edit pengingat ${r.label}`,
            onclick: async () => {
              const cats = categories.filter((c) => c.code === r.category || (c.active && !usedCats.has(c.code)));
              if (await openReminderDialog({ motor, reminder: r, categories: cats })) {
                toast('Pengingat diperbarui', 'success');
                refresh();
              }
            },
          }, 'Edit'),
          h('button', {
            type: 'button', class: 'btn btn-sm btn-danger', 'aria-label': `Hapus pengingat ${r.label}`,
            onclick: async () => {
              if (!(await confirmDialog(`Hapus pengingat ${r.label}?`, { okText: 'Hapus', danger: true }))) return;
              try {
                await call('reminders.delete', { id: r.id });
                toast('Pengingat dihapus', 'success');
                refresh();
              } catch (err) { toastError(err); }
            },
          }, 'Hapus'),
        ),
      ),
    ))))
    : emptyState({ icon: '⏰', title: 'Belum ada pengingat', text: 'Tambahkan jadwal perawatan, misalnya ganti oli tiap 2.000 km.', action: addBtn });

  mount(
    pageHead('Pengingat', list.length ? addBtn : null),
    h('p', { class: 'muted small' },
      `Dihitung dari catatan terakhir tiap kategori dan odometer terkini (${formatKm(motor.odometerCurrent)}). `,
      'Status Segera muncul saat sisa ≤ 10% interval km atau ≤ 7 hari.'),
    content,
  );
}

async function openReminderDialog({ motor, reminder, categories }) {
  const isEdit = Boolean(reminder);
  const catSel = h('select', { required: true, disabled: isEdit },
    !isEdit && h('option', { value: '' }, '— pilih —'),
    categories.map((c) => h('option', { value: c.code, selected: reminder && reminder.category === c.code }, c.label)),
  );
  const kmInput = numberInput({ value: reminder ? reminder.intervalKm : null, placeholder: 'contoh: 2.000' });
  const daysInput = numberInput({ value: reminder ? reminder.intervalDays : null, placeholder: 'contoh: 60' });
  const activeInput = h('input', { type: 'checkbox', id: 'rem-active', checked: reminder ? reminder.active : true });

  const form = h('form', { novalidate: true },
    field({ label: 'Kategori', input: catSel, name: 'category' }),
    h('div', { class: 'field-row' },
      field({ label: 'Interval km', input: kmInput, name: 'intervalKm' }),
      field({ label: 'Interval hari', input: daysInput, name: 'intervalDays' }),
    ),
    h('p', { class: 'muted small' }, 'Isi salah satu atau keduanya. Jatuh tempo dihitung dari mana yang lebih dulu.'),
    h('label', { class: 'check', for: 'rem-active' }, activeInput, 'Aktif'),
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
        active: activeInput.checked,
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
