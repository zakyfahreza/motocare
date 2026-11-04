import { h } from '../utils/dom.js';
import { pageHead } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const FAQ = [
  ['Bagaimana status pengingat dihitung?', 'MotoCare mencari catatan terakhir yang memuat kategori tersebut (misalnya Oli Mesin), lalu menambahkan interval km dan hari. Status Terlambat muncul jika km atau tanggal sudah lewat, Segera jika sisa ≤ 10% interval km atau ≤ 7 hari.'],
  ['Mengapa pengingat saya "Belum ada data"?', 'Belum ada catatan yang memuat item dengan kategori itu. Tekan "Catat Penggantian" di halaman Pengingat, atau tambahkan item dengan kategori yang sesuai saat mencatat servis.'],
  ['Odometer saya salah ketik, bagaimana memperbaikinya?', 'Buka Lainnya → Motor → menu ⋮ → Edit. Ubah kolom "Odometer terkini". Tombol Update km di beranda hanya menerima angka yang lebih besar.'],
  ['Di mana data saya disimpan?', 'Di Google Spreadsheet "MotoCare DB" milik Anda sendiri. Catatan yang dihapus tidak benar-benar hilang, hanya ditandai deleted = TRUE di spreadsheet.'],
  ['Bagaimana cara mencadangkan data?', 'Buka Lainnya → Cadangkan Data untuk mengunduh file JSON berisi semua motor, catatan, dan pengingat. Riwayat juga bisa diekspor ke CSV (Excel) dari halaman Riwayat atau Laporan.'],
  ['Saya lupa kode akses.', 'Buka editor Apps Script → Project Settings → Script properties → API_TOKEN. Untuk membuat kode baru, jalankan rotateToken() lalu masuk ulang.'],
  ['Kapan sebaiknya ganti oli?', 'Ikuti buku manual motor Anda. Jadwal bawaan MotoCare (oli mesin tiap 2.000 km / 60 hari) bisa diubah di halaman Pengingat sesuai rekomendasi pabrikan dan pemakaian harian.'],
];

export async function render({ mount }) {
  mount(
    pageHead('Pusat Bantuan', { subtitle: 'Pertanyaan yang sering diajukan' }),
    h('div', { class: 'card faq' }, FAQ.map(([q, a]) => h('details', null,
      h('summary', null, h('span', null, q), icon('chevron_right', 20)),
      h('p', null, a),
    ))),
    h('div', { class: 'note' }, icon('lightbulb', 22), h('span', null, 'Punya saran fitur? Catat di spreadsheet atau sampaikan ke pengelola aplikasi Anda.')),
  );
}
