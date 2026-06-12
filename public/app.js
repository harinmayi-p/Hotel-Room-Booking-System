/* ════════════════════════════════════════════════
   LuxeStay — app.js   (Database-connected version)
   ✅ Every action calls the backend API → MySQL
   ✅ No hardcoded data — refresh-safe
   ✅ All original features preserved
════════════════════════════════════════════════ */

// ── Session: only stores who is logged in (not data) ──
let SESSION = { role: null, user: null };

// ── UI state (never persisted, just current modal state) ──
let pendingBooking    = null;
let selectedPayMethod = 'card';
let roomToDelete      = null;

/* ════════════════════════════════════════════════
   CORE API HELPER
   All backend calls go through this one function.
   It calls /api/<path>, sends JSON, returns parsed response.
   On HTTP error it throws with the server's error message.
════════════════════════════════════════════════ */
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

/* ════════════════════════════════════════════════
   SCREEN NAVIGATION
════════════════════════════════════════════════ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

let loginRole = '';

function goLogin(role) {
  loginRole = role;
  const hints = {
    customer: 'Demo: email = <b>cust@gmail.com</b> &nbsp;|&nbsp; password = <b>pass</b>',
    staff:    'Demo: email = <b>staff@gmail.com</b> &nbsp;|&nbsp; password = <b>pass</b>',
    admin:    'Demo: email = <b>admin@gmail.com</b> &nbsp;|&nbsp; password = <b>pass</b>',
  };
  const titles = { customer: 'Customer Login', staff: 'Staff Login', admin: 'Admin Login' };
  const subs   = {
    customer: 'Access your bookings & browse rooms',
    staff:    'Manage check-ins & room operations',
    admin:    'Full system access & control',
  };
  document.getElementById('login-title').textContent = titles[role];
  document.getElementById('login-sub').textContent   = subs[role];
  document.getElementById('login-hint').innerHTML    = hints[role];
  document.getElementById('login-err').classList.remove('show');
  document.getElementById('login-id').value   = '';
  document.getElementById('login-pass').value = '';
  const linksRow = document.getElementById('auth-links-row');
  linksRow.innerHTML = role === 'customer'
    ? `<span onclick="showScreen('register')">New customer? <b>Register here →</b></span>` : '';
  showScreen('login');
}

/* ════════════════════════════════════════════════
   F2 — LOGIN  →  POST /api/login
   Sends email + password to MySQL, gets back role.
════════════════════════════════════════════════ */
async function doLogin() {
  const id    = document.getElementById('login-id').value.trim();
  const pass  = document.getElementById('login-pass').value.trim();
  const errEl = document.getElementById('login-err');
  errEl.classList.remove('show');

  if (!id || !pass) {
    errEl.textContent = 'Please enter your email and password.';
    errEl.classList.add('show'); return;
  }

  try {
    const data = await api('POST', '/login', { email: id, password: pass });
    const user = data.user; // { id, name, email, role }

    // Make sure the user is logging into the correct role panel
    if (user.role !== loginRole) {
      errEl.textContent = `This account is a "${user.role}" — please select the "${user.role}" role on the home screen.`;
      errEl.classList.add('show'); return;
    }

    SESSION.role = user.role;
    SESSION.user = user;

    document.getElementById('header-right').style.display = 'flex';
    document.getElementById('user-label').textContent     = user.name;
    document.getElementById('user-avatar').textContent    = user.name[0].toUpperCase();

    if (user.role === 'customer') {
      document.getElementById('cust-welcome').textContent = 'Welcome back, ' + user.name + '!';
      loadProfileFields();
      custTab('browse', document.querySelector('.nav-tab'));
      await renderRoomsGrid();
      await renderCustomerBookings();
      showScreen('customer');
    } else if (user.role === 'staff') {
      document.getElementById('today-date-label').textContent = new Date().toDateString();
      await renderStaffStats();
      await renderStaffTable();
      await renderStaffRooms();
      await renderTodayActivity();
      showScreen('staff');
    } else {
      await renderAdminStats();
      await renderAdminBookings();
      await renderAdminRooms();
      await renderRevenue();
      await renderCustomers();
      showScreen('admin');
    }
  } catch (err) {
    errEl.textContent = err.message || 'Login failed. Please try again.';
    errEl.classList.add('show');
  }
}

/* ════════════════════════════════════════════════
   F1 — REGISTER  →  POST /api/register
   Creates a new User + Customer row in MySQL.
════════════════════════════════════════════════ */
async function doRegister() {
  const name    = document.getElementById('reg-name').value.trim();
  const phone   = document.getElementById('reg-phone').value.trim();
  const email   = document.getElementById('reg-email').value.trim();
  const pass    = document.getElementById('reg-pass').value;
  const confirm = document.getElementById('reg-confirm').value;
  const errEl   = document.getElementById('reg-err');
  errEl.classList.remove('show');

  if (!name || !phone || !email || !pass || !confirm) {
    errEl.textContent = 'All fields are required.'; errEl.classList.add('show'); return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Please enter a valid email address.'; errEl.classList.add('show'); return;
  }
  if (pass.length < 4) {
    errEl.textContent = 'Password must be at least 4 characters.'; errEl.classList.add('show'); return;
  }
  if (pass !== confirm) {
    errEl.textContent = 'Passwords do not match.'; errEl.classList.add('show'); return;
  }

  try {
    await api('POST', '/register', { name, email, phone_no: phone, password: pass });
    showToast('Account created! You can now log in.', 'success');
    document.getElementById('login-id').value   = email;
    document.getElementById('login-pass').value = '';
    showScreen('login');
  } catch (err) {
    errEl.textContent = err.message || 'Registration failed.';
    errEl.classList.add('show');
  }
}

function checkPassStrength(val) {
  const fill  = document.getElementById('strength-fill');
  const label = document.getElementById('strength-label');
  if (!val) { fill.style.width = '0%'; label.textContent = 'Enter a password'; return; }
  let score = 0;
  if (val.length >= 4)  score++;
  if (val.length >= 8)  score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const levels = [
    {w:'20%',c:'#ef4444',t:'Very Weak'}, {w:'40%',c:'#f97316',t:'Weak'},
    {w:'60%',c:'#eab308',t:'Fair'},      {w:'80%',c:'#22c55e',t:'Strong'},
    {w:'100%',c:'#16a34a',t:'Very Strong'}
  ];
  const lv = levels[Math.min(score-1, 4)] || levels[0];
  fill.style.width = lv.w; fill.style.background = lv.c; label.textContent = lv.t;
}

/* ════════════════════════════════════════════════
   F10 — LOGOUT
════════════════════════════════════════════ */
function logout() {
  SESSION = { role: null, user: null };
  document.getElementById('header-right').style.display = 'none';
  showScreen('select');
}

/* ════════════════════════════════════════════════
   TAB SWITCHING
════════════════════════════════════════════ */
function custTab(name, btn) {
  document.querySelectorAll('.nav-tab').forEach(t  => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const el = document.getElementById('tab-' + name); if (el) el.classList.add('active');
  if (name === 'mybookings') renderCustomerBookings();
}

function adminTab(name, btn) {
  document.querySelectorAll('#screen-admin .admin-tab').forEach(t         => t.classList.remove('active'));
  document.querySelectorAll('#screen-admin .admin-tab-content').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('ac-' + name).classList.add('active');
  if (name === 'rooms')     renderAdminRooms();
  if (name === 'revenue')   renderRevenue();
  if (name === 'customers') renderCustomers();
  if (name === 'users')     renderUserAccounts();
}

function staffTab(name, btn) {
  document.querySelectorAll('#screen-staff .admin-tab').forEach(t         => t.classList.remove('active'));
  document.querySelectorAll('#screen-staff .admin-tab-content').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('sc-' + name).classList.add('active');
  if (name === 'rooms') renderStaffRooms();
  if (name === 'today') renderTodayActivity();
}

/* ════════════════════════════════════════════════
   PROFILE
════════════════════════════════════════════ */
function loadProfileFields() {
  const u = SESSION.user;
  document.getElementById('profile-name').value    = u.name  || '';
  document.getElementById('profile-email').value   = u.email || '';
  document.getElementById('profile-phone').value   = u.phone || '';
  document.getElementById('profile-cid').value     = 'ID-' + u.id;
  document.getElementById('profile-newpass').value = '';
  document.getElementById('profile-avatar-big').textContent = u.name[0].toUpperCase();
  if (document.getElementById('profile-joined'))
    document.getElementById('profile-joined').textContent = '';
}

async function saveProfile() {
  const name    = document.getElementById('profile-name').value.trim();
  const phone   = document.getElementById('profile-phone').value.trim();
  const newPass = document.getElementById('profile-newpass').value;
  if (!name) { showToast('Name is required.', 'error'); return; }
  const payload = { name, phone_no: phone };
  if (newPass) {
    if (newPass.length < 4) { showToast('New password must be at least 4 characters.', 'error'); return; }
    payload.password = newPass;
  }
  try {
    await api('PUT', '/users/' + SESSION.user.id, payload);
    SESSION.user.name  = name;
    SESSION.user.phone = phone;
    document.getElementById('user-label').textContent            = name;
    document.getElementById('user-avatar').textContent           = name[0].toUpperCase();
    document.getElementById('profile-avatar-big').textContent    = name[0].toUpperCase();
    document.getElementById('profile-newpass').value             = '';
    showToast('Profile saved successfully!', 'success');
  } catch (err) { showToast(err.message || 'Profile update failed.', 'error'); }
}

/* ════════════════════════════════════════════════
   DATE HELPERS  (timezone-safe, IST-friendly)
════════════════════════════════════════════ */
function getLocalDateStr(date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return getLocalDateStr(d);
}
function fmtDate(d) {
  if (!d) return '—';
  return String(d).split('T')[0]; // strip time component from MySQL datetime
}
function nightsBetween(ci, co) {
  return Math.max(1, Math.round((new Date(co) - new Date(ci)) / 86400000));
}

/* ════════════════════════════════════════════════
   F4 — BROWSE ROOMS  →  GET /api/rooms/available
   Reads directly from MySQL — always fresh.
════════════════════════════════════════════ */
function filterRooms() { renderRoomsGrid(); }

async function renderRoomsGrid() {
  const typeFilter = (document.getElementById('room-type-filter')?.value || '').toLowerCase();
  const container  = document.getElementById('rooms-grid');
  const label      = document.getElementById('search-results-label');

  container.innerHTML = loadingGrid('Loading available rooms…');
  try {
    const data  = await api('GET', '/rooms/available');
    let rooms   = data.rooms || [];

    // Client-side type filter (backend only filters by status=available)
    if (typeFilter) rooms = rooms.filter(r => (r.room_type || '').toLowerCase() === typeFilter);

    if (label) label.textContent = rooms.length + ' room' + (rooms.length !== 1 ? 's' : '') + ' available';

    if (!rooms.length) {
      container.innerHTML = emptyGrid('🛏', 'No available rooms match your criteria. Try adjusting your filters.');
      return;
    }

    container.innerHTML = rooms.map(r => `
      <div class="room-card available">
        <div class="room-number">Rm ${r.room_no}</div>
        <div class="room-type">${r.room_type}</div>
        <div class="room-price">₹${Number(r.price).toLocaleString()} <span>/ night</span></div>
        <span class="badge badge-available" style="margin-bottom:10px;">● Available</span>
        <button class="room-book-btn" onclick="startBooking(${r.room_no}, '${escQ(r.room_type)}', ${r.price})">Book Now →</button>
      </div>`).join('');
  } catch (err) {
    container.innerHTML = emptyGrid('⚠️', 'Could not load rooms: ' + err.message);
  }
}

/* ════════════════════════════════════════════════
   F5 / F6 — BOOKING FLOW
════════════════════════════════════════════ */
function startBooking(room_no, room_type, price) {
  pendingBooking = { room_no, room_type, price };

  document.getElementById('book-room-title').textContent = `Book Room ${room_no}`;
  document.getElementById('book-room-sub').textContent   = `${room_type} · ₹${Number(price).toLocaleString()}/night`;
  document.getElementById('book-guest-name').value       = SESSION.user?.name || '';
  document.getElementById('book-step1-err').classList.remove('show');

  const todayStr = getLocalDateStr();
  const tmrwStr  = addDays(todayStr, 1);
  const ciEl = document.getElementById('book-checkin');
  const coEl = document.getElementById('book-checkout');
  ciEl.value = document.getElementById('ci-date')?.value || todayStr;
  coEl.value = document.getElementById('co-date')?.value || tmrwStr;
  ciEl.min = todayStr;
  coEl.min = addDays(ciEl.value, 1);
  document.getElementById('book-guests').value = document.getElementById('guests-filter')?.value || '1';

  updateBookingSummary();
  goBookStep(1);
  openModal('modal-booking');
}

function updateBookingSummary() {
  if (!pendingBooking) return;
  const ci   = document.getElementById('book-checkin')?.value;
  const co   = document.getElementById('book-checkout')?.value;
  const gsts = document.getElementById('book-guests')?.value || '1';
  const nights   = (ci && co) ? nightsBetween(ci, co) : 1;
  const subtotal = pendingBooking.price * nights;
  const tax      = Math.round(subtotal * 0.12);
  const total    = subtotal + tax;

  pendingBooking = { ...pendingBooking, nights, total, checkin: ci, checkout: co, guests: parseInt(gsts) };

  const html = `
    <div class="summary-row"><span class="label">Room</span><span class="val">Rm ${pendingBooking.room_no} (${pendingBooking.room_type})</span></div>
    <div class="summary-row"><span class="label">Guests</span><span class="val">${gsts}</span></div>
    <div class="summary-row"><span class="label">Check-in</span><span class="val">${ci || '—'}</span></div>
    <div class="summary-row"><span class="label">Check-out</span><span class="val">${co || '—'}</span></div>
    <div class="summary-row"><span class="label">Nights</span><span class="val">${nights}</span></div>
    <div class="summary-row"><span class="label">Room Rate</span><span class="val">₹${subtotal.toLocaleString()}</span></div>
    <div class="summary-row"><span class="label">Tax &amp; Fees (12%)</span><span class="val">₹${tax.toLocaleString()}</span></div>
    <div class="summary-row total"><span class="label">Total</span><span class="val">₹${total.toLocaleString()}</span></div>`;

  ['book-summary', 'book-pay-summary'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = html;
  });
}

function validateBookingDates() {
  const today = getLocalDateStr();
  const ciEl  = document.getElementById('book-checkin');
  const coEl  = document.getElementById('book-checkout');
  const errEl = document.getElementById('book-step1-err');
  if (ciEl.value && ciEl.value < today) {
    ciEl.value = today; errEl.textContent = 'Check-in date cannot be in the past. Reset to today.'; errEl.classList.add('show'); return;
  }
  if (ciEl.value) {
    const minCO = addDays(ciEl.value, 1);
    coEl.min = minCO;
    if (coEl.value && coEl.value <= ciEl.value) {
      coEl.value = minCO; errEl.textContent = 'Check-out must be after check-in. Adjusted automatically.'; errEl.classList.add('show'); return;
    }
  }
  errEl.classList.remove('show');
  updateBookingSummary();
}

function goBookStep(step) {
  if (step === 2) {
    const name = document.getElementById('book-guest-name').value.trim();
    const ci   = document.getElementById('book-checkin').value;
    const co   = document.getElementById('book-checkout').value;
    const err  = document.getElementById('book-step1-err');
    if (!name) { err.textContent = 'Please enter the guest name.'; err.classList.add('show'); return; }
    if (!ci || !co) { err.textContent = 'Please select check-in and check-out dates.'; err.classList.add('show'); return; }
    if (co <= ci) { err.textContent = 'Check-out date must be after check-in date.'; err.classList.add('show'); return; }
    err.classList.remove('show');
    updateBookingSummary();
  }
  [1, 2, 3].forEach(s => {
    document.getElementById(`book-step-${s}`).style.display = s === step ? 'block' : 'none';
    const ps = document.getElementById(`pstep-${s}`);
    ps.className = 'pstep' + (s < step ? ' done' : s === step ? ' active' : '');
    ps.querySelector('.pstep-num').textContent = s < step ? '✓' : s;
  });
}

function payTab(method, btn) {
  selectedPayMethod = method;
  document.querySelectorAll('.pay-tab').forEach(t  => t.classList.remove('active'));
  document.querySelectorAll('.pay-form').forEach(f => f.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('pf-' + method).classList.add('active');
}

function selectUpi(el) {
  document.querySelectorAll('.upi-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function formatCardNum(el) { let v = el.value.replace(/\D/g,'').substring(0,16); el.value = v.replace(/(.{4})/g,'$1 ').trim(); }
function formatExpiry(el)  { let v = el.value.replace(/\D/g,''); if (v.length >= 2) v = v.substring(0,2) + ' / ' + v.substring(2,4); el.value = v; }

/* ── F5: Confirm booking → POST /api/book-room + POST /api/payment ── */
async function processPayment() {
  const pb = pendingBooking; if (!pb) return;
  const payLabels = { card: 'Card', upi: 'UPI', netbanking: 'Net Banking', cash: 'Pay at Hotel' };

  try {
    // 1. Create booking in DB
    const bookRes = await api('POST', '/book-room', {
      room_no:     pb.room_no,
      customer_id: SESSION.user.id,
      check_in:    pb.checkin,
      check_out:   pb.checkout,
    });
    const bid = bookRes.booking_id;

    // 2. Record payment in DB
    const isCash = selectedPayMethod === 'cash';
    await api('POST', '/payment', {
      booking_id:     bid,
      amount:         pb.total,
      payment_method: payLabels[selectedPayMethod] || 'Card',
      payment_status: isCash ? 'pending' : 'paid',
    });

    document.getElementById('confirm-bid').textContent = 'LX-' + bid;
    document.getElementById('confirm-details').innerHTML = `
      Room: <b>Rm ${pb.room_no} (${pb.room_type})</b><br>
      Check-in: <b>${pb.checkin}</b> &nbsp; Check-out: <b>${pb.checkout}</b><br>
      Guests: <b>${pb.guests}</b> &nbsp; Nights: <b>${pb.nights}</b><br>
      Total: <b>₹${pb.total.toLocaleString()}</b> via <b>${payLabels[selectedPayMethod]}</b>`;

    goBookStep(3);
    showToast('Booking confirmed! ID: LX-' + bid, 'success');
  } catch (err) {
    showToast(err.message || 'Booking failed. Please try again.', 'error');
  }
}

/* ════════════════════════════════════════════════
   F7 — CUSTOMER BOOKINGS  →  GET /api/bookings/customer/:id
   Reads from MySQL — reflects DB changes immediately.
════════════════════════════════════════════ */
async function renderCustomerBookings() {
  const tbody  = document.getElementById('cust-bookings-tbody');
  const counter= document.getElementById('cust-booking-count');
  tbody.innerHTML = loadingRow(12);
  try {
    const data = await api('GET', '/bookings/customer/' + SESSION.user.id);
    const bks  = data.bookings || [];
    if (counter) counter.textContent = bks.length + ' booking' + (bks.length !== 1 ? 's' : '');
    if (!bks.length) {
      tbody.innerHTML = emptyRow(12, '📋', 'No bookings yet. Browse rooms to make a booking!');
      return;
    }
    tbody.innerHTML = bks.map(b => {
      const nights = nightsBetween(b.check_in, b.check_out);
      const amount = Number(b.amount || (b.price * nights) || 0);
      const action = b.booking_status === 'confirmed'
        ? `<button class="btn-danger" style="font-size:0.78rem;padding:5px 10px;" onclick="cancelBooking(${b.booking_id})">Cancel</button>`
        : `<span style="color:var(--muted);font-size:0.78rem;">—</span>`;
      return `<tr>
        <td class="td-id">LX-${b.booking_id}</td>
        <td class="td-primary">Rm ${b.room_no}</td>
        <td>${b.room_type || '—'}</td>
        <td style="text-align:center;">—</td>
        <td>${fmtDate(b.check_in)}</td>
        <td>${fmtDate(b.check_out)}</td>
        <td style="text-align:center;">${nights}</td>
        <td class="td-gold">₹${amount.toLocaleString()}</td>
        <td>${b.payment_method || '—'}</td>
        <td>${payStatusBadge(b.payment_status)}</td>
        <td>${statusBadge(b.booking_status)}</td>
        <td>${action}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = emptyRow(12, '⚠️', 'Error loading bookings: ' + err.message);
  }
}

/* ── F7: Cancel booking  →  DELETE /api/cancel-booking/:id ── */
async function cancelBooking(bid) {
  try {
    await api('DELETE', '/cancel-booking/' + bid);
    showToast('Booking LX-' + bid + ' cancelled.', 'info');
    await renderCustomerBookings();
    await renderRoomsGrid(); // room freed → show it as available again
  } catch (err) {
    showToast(err.message || 'Cancellation failed.', 'error');
  }
}

/* ════════════════════════════════════════════════
   STAFF DASHBOARD
════════════════════════════════════════════ */
async function renderStaffStats() {
  try {
    const [bd, rd] = await Promise.all([api('GET', '/bookings'), api('GET', '/rooms')]);
    const bks   = bd.bookings || [];
    const rooms = rd.rooms    || [];
    const today = getLocalDateStr();
    const booked    = bks.filter(b => b.booking_status === 'confirmed').length;
    const available = rooms.filter(r => r.room_status === 'available').length;
    const todayCI   = bks.filter(b => fmtDate(b.check_in) === today && b.booking_status === 'confirmed').length;
    document.getElementById('staff-stats').innerHTML = `
      <div class="stat-card blue"><div class="stat-label">Active Bookings</div><div class="stat-val">${booked}</div><div class="stat-sub">${todayCI} check-in today</div></div>
      <div class="stat-card green"><div class="stat-label">Available Rooms</div><div class="stat-val">${available}</div><div class="stat-sub">of ${rooms.length} total</div></div>
      <div class="stat-card orange"><div class="stat-label">Total Bookings</div><div class="stat-val">${bks.length}</div></div>
      <div class="stat-card gold"><div class="stat-label">Today</div><div class="stat-val" style="font-size:1.1rem;margin-top:4px;">${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div></div>`;
  } catch (err) { console.error('staff stats:', err); }
}

async function renderStaffTable() {
  const search  = (document.getElementById('staff-search')?.value || '').toLowerCase();
  const sFilter = document.getElementById('staff-status-filter')?.value || '';
  const tbody   = document.getElementById('staff-tbody');
  tbody.innerHTML = loadingRow(11);
  try {
    const data = await api('GET', '/bookings');
    let bks = data.bookings || [];
    if (sFilter) bks = bks.filter(b => b.booking_status === sFilter);
    if (search)  bks = bks.filter(b => (b.booking_id + (b.customer_name||'') + b.room_no + b.booking_status).toLowerCase().includes(search));
    if (!bks.length) { tbody.innerHTML = emptyRow(11, '📋', 'No bookings found.'); return; }
    tbody.innerHTML = bks.map(b => {
      const nights = nightsBetween(b.check_in, b.check_out);
      const amount = Number(b.amount || (b.price * nights) || 0);
      let actions = '';
      if (b.booking_status === 'confirmed') {
        actions = `<button class="btn-gold" style="font-size:0.75rem;padding:5px 10px;" onclick="staffCheckin(${b.booking_id},'${b.room_no}')">✓ Check-in</button> `;
        actions += `<button class="btn-icon" onclick="openModifyBooking(${b.booking_id},'${fmtDate(b.check_in)}','${fmtDate(b.check_out)}','${escQ(b.customer_name||'')}','${b.payment_status||'pending'}')">✏ Edit</button>`;
      } else if (b.booking_status === 'checked-in') {
        actions = `<button class="btn-secondary" style="font-size:0.75rem;padding:5px 10px;" onclick="staffCheckout(${b.booking_id},'${b.room_no}')">↩ Checkout</button>`;
      } else {
        actions = `<span style="color:var(--muted);font-size:0.78rem;">${b.booking_status}</span>`;
      }
      return `<tr>
        <td class="td-id">LX-${b.booking_id}</td>
        <td class="td-primary">${b.customer_name || 'Guest'}</td>
        <td>Rm ${b.room_no}</td>
        <td style="text-align:center;">—</td>
        <td>${fmtDate(b.check_in)}</td>
        <td>${fmtDate(b.check_out)}</td>
        <td class="td-gold">₹${amount.toLocaleString()}</td>
        <td>${b.payment_method || '—'}</td>
        <td>${payStatusBadge(b.payment_status)}</td>
        <td>${statusBadge(b.booking_status)}</td>
        <td style="white-space:nowrap;">${actions}</td>
      </tr>`;
    }).join('');
  } catch (err) { tbody.innerHTML = emptyRow(11, '⚠️', 'Error: ' + err.message); }
}

/* ── Staff check-in: update booking_status + room_status in DB ── */
async function staffCheckin(bid, room_no) {
  try {
    await api('PUT', '/bookings/' + bid, { booking_status: 'checked-in' });
    await api('PUT', '/rooms/' + room_no, { room_status: 'booked' });
    showToast('Booking LX-' + bid + ' checked in ✓', 'success');
    await renderStaffTable();
    await renderStaffStats();
    await renderTodayActivity();
  } catch (err) { showToast(err.message, 'error'); }
}

/* ── Staff checkout: update booking_status + free the room in DB ── */
async function staffCheckout(bid, room_no) {
  try {
    await api('PUT', '/bookings/' + bid, { booking_status: 'completed' });
    await api('PUT', '/rooms/' + room_no, { room_status: 'available' });
    showToast('Booking LX-' + bid + ' checked out.', 'info');
    await renderStaffTable();
    await renderStaffStats();
    await renderTodayActivity();
  } catch (err) { showToast(err.message, 'error'); }
}

async function renderStaffRooms() {
  const grid = document.getElementById('staff-rooms-grid');
  grid.innerHTML = loadingGrid('Loading rooms…');
  try {
    const data  = await api('GET', '/rooms');
    const rooms = data.rooms || [];
    grid.innerHTML = rooms.map(r => {
      const cls = r.room_status === 'available' ? 'available' : r.room_status === 'booked' ? 'booked' : 'maintenance';
      return `<div class="room-card ${cls}">
        <div class="room-number">Rm ${r.room_no}</div>
        <div class="room-type">${r.room_type}</div>
        <div class="room-price">₹${Number(r.price).toLocaleString()} <span>/ night</span></div>
        ${statusBadge(r.room_status)}
      </div>`;
    }).join('');
  } catch (err) { grid.innerHTML = emptyGrid('⚠️', err.message); }
}

async function renderTodayActivity() {
  const today = getLocalDateStr();
  document.getElementById('today-date-label').textContent = new Date().toDateString();
  const tbody = document.getElementById('today-tbody');
  tbody.innerHTML = loadingRow(7);
  try {
    const data = await api('GET', '/bookings');
    const bks  = data.bookings || [];
    const events = [];
    bks.forEach(b => {
      if (fmtDate(b.check_in) === today && b.booking_status === 'confirmed')
        events.push({ b, event: 'Check-in',  action: `<button class="btn-gold" style="font-size:0.75rem;padding:5px 10px;" onclick="staffCheckin(${b.booking_id},'${b.room_no}')">✓ Check-in</button>` });
      if (fmtDate(b.check_out) === today && b.booking_status !== 'cancelled')
        events.push({ b, event: 'Check-out', action: `<button class="btn-secondary" style="font-size:0.75rem;padding:5px 10px;" onclick="staffCheckout(${b.booking_id},'${b.room_no}')">↩ Checkout</button>` });
    });
    if (!events.length) { tbody.innerHTML = emptyRow(7, '📅', 'No check-ins or check-outs expected today.'); return; }
    tbody.innerHTML = events.map(({ b, event, action }) => `<tr>
      <td class="td-id">LX-${b.booking_id}</td>
      <td class="td-primary">${b.customer_name || 'Guest'}</td>
      <td>Rm ${b.room_no}</td><td>${b.room_type || '—'}</td>
      <td>${event === 'Check-in' ? fmtDate(b.check_in) : fmtDate(b.check_out)}</td>
      <td><span class="badge ${event === 'Check-in' ? 'badge-booked' : 'badge-checkedin'}">${event}</span></td>
      <td>${action}</td>
    </tr>`).join('');
  } catch (err) { tbody.innerHTML = emptyRow(7, '⚠️', err.message); }
}

/* ── Modify booking (staff) ── */
function openModifyBooking(bid, checkin, checkout, guestName, payStatus) {
  document.getElementById('mod-booking-id').value = bid;
  document.getElementById('mod-guest-name').value  = guestName;
  document.getElementById('mod-checkin').value     = checkin;
  document.getElementById('mod-checkout').value    = checkout;
  document.getElementById('mod-guests').value      = '1';
  document.getElementById('mod-pay-status').value  = payStatus || 'pending';
  document.getElementById('mod-notes').value       = '';
  document.getElementById('mod-err').classList.remove('show');
  openModal('modal-modify-booking');
}

/* ── Save modification → PUT /api/bookings/:id (updates dates + pay status) ── */
async function saveModifyBooking() {
  const bid       = document.getElementById('mod-booking-id').value;
  const checkin   = document.getElementById('mod-checkin').value;
  const checkout  = document.getElementById('mod-checkout').value;
  const payStatus = document.getElementById('mod-pay-status').value;
  const errEl     = document.getElementById('mod-err');
  errEl.classList.remove('show');
  if (!checkin || !checkout || checkout <= checkin) {
    errEl.textContent = 'Check-out must be after check-in.'; errEl.classList.add('show'); return;
  }
  try {
    // Update booking dates + payment status together
    await api('PUT', '/bookings/' + bid, {
      check_in:       checkin,
      check_out:      checkout,
      payment_status: payStatus.toLowerCase(),
    });
    closeModal('modal-modify-booking');
    showToast('Booking LX-' + bid + ' updated.', 'success');
    await renderStaffTable();
    await renderStaffStats();
  } catch (err) {
    errEl.textContent = err.message; errEl.classList.add('show');
  }
}

/* ════════════════════════════════════════════════
   ADMIN DASHBOARD
════════════════════════════════════════════ */
async function renderAdminStats() {
  try {
    const [bd, rd] = await Promise.all([api('GET', '/bookings'), api('GET', '/rooms')]);
    const bks   = bd.bookings || [];
    const rooms = rd.rooms    || [];
    const active    = bks.filter(b => b.booking_status === 'confirmed').length;
    const available = rooms.filter(r => r.room_status === 'available').length;
    const revenue   = bks.filter(b => b.booking_status !== 'cancelled').reduce((s, b) => s + Number(b.amount || 0), 0);
    document.getElementById('admin-stats').innerHTML = `
      <div class="stat-card gold"><div class="stat-label">Total Rooms</div><div class="stat-val">${rooms.length}</div><div class="stat-sub">${available} available</div></div>
      <div class="stat-card blue"><div class="stat-label">Active Bookings</div><div class="stat-val">${active}</div></div>
      <div class="stat-card green"><div class="stat-label">Total Bookings</div><div class="stat-val">${bks.length}</div></div>
      <div class="stat-card orange"><div class="stat-label">Total Revenue</div><div class="stat-val">₹${(revenue/1000).toFixed(0)}K</div><div class="stat-sub">all time</div></div>`;
  } catch (err) { console.error('admin stats:', err); }
}

async function renderAdminBookings() {
  const search  = (document.getElementById('admin-search')?.value || '').toLowerCase();
  const sFilter = document.getElementById('admin-status-filter')?.value || '';
  const pFilter = document.getElementById('admin-pay-filter')?.value || '';
  const tbody   = document.getElementById('admin-bookings-tbody');
  tbody.innerHTML = loadingRow(13);
  try {
    const data = await api('GET', '/bookings');
    let bks = data.bookings || [];
    if (sFilter) bks = bks.filter(b => b.booking_status === sFilter);
    if (pFilter) bks = bks.filter(b => (b.payment_status || '').toLowerCase() === pFilter.toLowerCase());
    if (search)  bks = bks.filter(b => (b.booking_id + (b.customer_name||'') + b.room_no + (b.room_type||'')).toLowerCase().includes(search));
    if (!bks.length) { tbody.innerHTML = emptyRow(13, '📋', 'No bookings found.'); return; }
    tbody.innerHTML = bks.map(b => {
      const nights = nightsBetween(b.check_in, b.check_out);
      const amount = Number(b.amount || (b.price * nights) || 0);
      let actions = '';
      if (b.booking_status === 'confirmed') {
        actions = `<button class="btn-gold" style="font-size:0.72rem;padding:4px 9px;" onclick="adminCheckin(${b.booking_id},'${b.room_no}')">Check-in</button> `;
        actions += `<button class="btn-danger" style="font-size:0.72rem;padding:4px 8px;" onclick="adminCancelBooking(${b.booking_id},'${b.room_no}')">Cancel</button>`;
      } else if (b.booking_status === 'checked-in') {
        actions = `<button class="btn-secondary" style="font-size:0.72rem;padding:4px 9px;" onclick="adminCheckout(${b.booking_id},'${b.room_no}')">Check-out</button>`;
      } else {
        actions = `<span style="color:var(--muted);font-size:0.75rem;">${b.booking_status}</span>`;
      }
      return `<tr>
        <td class="td-id">LX-${b.booking_id}</td>
        <td class="td-primary">${b.customer_name || '—'}</td>
        <td>Rm ${b.room_no}</td><td>${b.room_type || '—'}</td>
        <td style="text-align:center;">—</td>
        <td>${fmtDate(b.check_in)}</td><td>${fmtDate(b.check_out)}</td>
        <td style="text-align:center;">${nights}</td>
        <td class="td-gold">₹${amount.toLocaleString()}</td>
        <td>${b.payment_method || '—'}</td>
        <td>${payStatusBadge(b.payment_status)}</td>
        <td>${statusBadge(b.booking_status)}</td>
        <td style="white-space:nowrap;">${actions}</td>
      </tr>`;
    }).join('');
  } catch (err) { tbody.innerHTML = emptyRow(13, '⚠️', 'Error: ' + err.message); }
}

async function adminCheckin(bid, room_no) {
  try {
    await api('PUT', '/bookings/' + bid, { booking_status: 'checked-in' });
    await api('PUT', '/rooms/' + room_no, { room_status: 'booked' });
    showToast('Booking LX-' + bid + ' checked in ✓', 'success');
    await renderAdminStats(); await renderAdminBookings();
  } catch (err) { showToast(err.message, 'error'); }
}

async function adminCheckout(bid, room_no) {
  try {
    await api('PUT', '/bookings/' + bid, { booking_status: 'completed' });
    await api('PUT', '/rooms/' + room_no, { room_status: 'available' });
    showToast('Booking LX-' + bid + ' completed.', 'info');
    await renderAdminStats(); await renderAdminBookings();
  } catch (err) { showToast(err.message, 'error'); }
}

async function adminCancelBooking(bid, room_no) {
  try {
    await api('DELETE', '/cancel-booking/' + bid);
    showToast('Booking LX-' + bid + ' cancelled.', 'info');
    await renderAdminStats(); await renderAdminBookings();
  } catch (err) { showToast(err.message, 'error'); }
}

/* ── F3: ROOMS (Admin) ── */
async function renderAdminRooms() {
  const statusF = document.getElementById('admin-room-status-filter')?.value || '';
  const typeF   = document.getElementById('admin-room-type-filter')?.value   || '';
  const grid    = document.getElementById('admin-rooms-grid');
  grid.innerHTML = loadingGrid('Loading rooms…');
  try {
    const data  = await api('GET', '/rooms');
    let rooms   = data.rooms || [];
    if (statusF) rooms = rooms.filter(r => r.room_status === statusF.toLowerCase());
    if (typeF)   rooms = rooms.filter(r => r.room_type   === typeF);
    if (!rooms.length) { grid.innerHTML = emptyGrid('🛏', 'No rooms match your filters.'); return; }
    grid.innerHTML = rooms.map(r => {
      const cls = r.room_status === 'available' ? 'available' : r.room_status === 'booked' ? 'booked' : 'maintenance';
      return `<div class="room-card ${cls}">
        <div class="room-number">Rm ${r.room_no}</div>
        <div class="room-type">${r.room_type}</div>
        <div class="room-price">₹${Number(r.price).toLocaleString()} <span>/ night</span></div>
        ${statusBadge(r.room_status)}
        <div style="display:flex;gap:6px;margin-top:10px;">
          <button class="room-book-btn" style="background:var(--card);color:var(--primary);border:1px solid var(--primary-glow);"
            onclick="openEditRoom(${r.room_no},'${escQ(r.room_type)}',${r.price},'${r.room_status}')">✏ Edit</button>
          <button class="room-book-btn" style="background:var(--red-bg);color:var(--red);border:1px solid rgba(239,68,68,0.25);flex:none;padding:9px 12px;"
            onclick="openDeleteRoom(${r.room_no},'${r.room_status}')">🗑</button>
        </div>
      </div>`;
    }).join('');
  } catch (err) { grid.innerHTML = emptyGrid('⚠️', err.message); }
}

function openAddRoomModal() {
  document.getElementById('room-modal-title').textContent = 'Add New Room';
  document.getElementById('edit-room-id').value = '';
  ['room-num-input','room-price-input','room-floor-input','room-desc-input'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('room-type-input').value     = 'Single';
  document.getElementById('room-capacity-input').value = '2';
  document.getElementById('room-amenities-input').value= 'WiFi, AC, TV';
  document.getElementById('room-status-input').value   = 'Available';
  document.getElementById('room-err').classList.remove('show');
  openModal('modal-room');
}

function openEditRoom(room_no, room_type, price, room_status) {
  document.getElementById('room-modal-title').textContent = 'Edit Room ' + room_no;
  document.getElementById('edit-room-id').value          = room_no;
  document.getElementById('room-num-input').value        = room_no;
  document.getElementById('room-type-input').value       = room_type;
  document.getElementById('room-price-input').value      = price;
  document.getElementById('room-floor-input').value      = '';
  document.getElementById('room-capacity-input').value   = '2';
  document.getElementById('room-amenities-input').value  = '';
  document.getElementById('room-desc-input').value       = '';
  // Preserve actual status from DB — only capitalise first letter for the select
  const capStatus = room_status ? room_status.charAt(0).toUpperCase() + room_status.slice(1) : 'Available';
  document.getElementById('room-status-input').value     = capStatus;
  document.getElementById('room-err').classList.remove('show');
  openModal('modal-room');
}

/* ── F3: Save room  →  POST /api/rooms  or  PUT /api/rooms/:no ── */
async function saveRoom() {
  const editId  = document.getElementById('edit-room-id').value;
  const room_no = document.getElementById('room-num-input').value.trim();
  const type    = document.getElementById('room-type-input').value;
  const price   = parseFloat(document.getElementById('room-price-input').value) || 0;
  const status  = document.getElementById('room-status-input').value.toLowerCase();
  const errEl   = document.getElementById('room-err');
  errEl.classList.remove('show');
  if (!room_no || !price) {
    errEl.textContent = 'Room number and price are required.'; errEl.classList.add('show'); return;
  }
  try {
    if (editId) {
      await api('PUT', '/rooms/' + editId, { room_type: type, price, room_status: status });
      showToast('Room ' + editId + ' updated.', 'success');
    } else {
      await api('POST', '/rooms', { room_no: parseInt(room_no), room_type: type, price, room_status: status });
      showToast('Room ' + room_no + ' added.', 'success');
    }
    closeModal('modal-room');
    await renderAdminRooms();
    await renderAdminStats();
  } catch (err) {
    errEl.textContent = err.message; errEl.classList.add('show');
  }
}

/* ── F3: Delete room  →  DELETE /api/rooms/:no ── */
function openDeleteRoom(room_no, status) {
  if (status === 'booked') { showToast('Cannot delete a room that is currently booked.', 'error'); return; }
  roomToDelete = room_no;
  document.getElementById('delete-room-num').textContent = room_no;
  openModal('modal-delete-room');
}

async function confirmDeleteRoom() {
  try {
    await api('DELETE', '/rooms/' + roomToDelete);
    showToast('Room ' + roomToDelete + ' deleted.', 'info');
    roomToDelete = null;
    closeModal('modal-delete-room');
    await renderAdminRooms();
    await renderAdminStats();
  } catch (err) { showToast(err.message, 'error'); }
}

/* ── Revenue ── */
async function renderRevenue() {
  try {
    const data = await api('GET', '/bookings');
    const paid = (data.bookings || []).filter(b => b.booking_status !== 'cancelled');
    const total = paid.reduce((s, b) => s + Number(b.amount || 0), 0);
    const methods = {}, roomTypes = {};
    paid.forEach(b => {
      const m = b.payment_method || 'Unknown';
      const t = b.room_type      || 'Unknown';
      if (!methods[m])   methods[m]   = { count: 0, total: 0 };
      if (!roomTypes[t]) roomTypes[t] = { count: 0, total: 0 };
      methods[m].count++;   methods[m].total   += Number(b.amount || 0);
      roomTypes[t].count++; roomTypes[t].total += Number(b.amount || 0);
    });
    document.getElementById('revenue-stats').innerHTML = `
      <div class="stat-card gold"><div class="stat-label">Total Revenue</div><div class="stat-val">₹${(total/1000).toFixed(1)}K</div></div>
      <div class="stat-card green"><div class="stat-label">Paid Bookings</div><div class="stat-val">${paid.length}</div></div>
      <div class="stat-card blue"><div class="stat-label">Avg. per Booking</div><div class="stat-val">₹${paid.length ? Math.round(total/paid.length).toLocaleString() : 0}</div></div>`;
    document.getElementById('revenue-breakdown-tbody').innerHTML =
      Object.entries(methods).map(([m, d]) =>
        `<tr><td class="td-primary">${m}</td><td>${d.count}</td><td class="td-gold">₹${d.total.toLocaleString()}</td><td>${total ? Math.round(d.total/total*100) : 0}%</td></tr>`
      ).join('') || `<tr><td colspan="4"><div class="empty-state"><p>No data</p></div></td></tr>`;
    document.getElementById('room-revenue-tbody').innerHTML =
      Object.entries(roomTypes).map(([t, d]) =>
        `<tr><td class="td-primary">${t}</td><td>${d.count}</td><td class="td-gold">₹${d.total.toLocaleString()}</td></tr>`
      ).join('') || `<tr><td colspan="3"><div class="empty-state"><p>No data</p></div></td></tr>`;
  } catch (err) { console.error('revenue:', err); }
}

/* ── F9: Customers ── */
async function renderCustomers() {
  const search = (document.getElementById('cust-search')?.value || '').toLowerCase();
  const tbody  = document.getElementById('customers-tbody');
  tbody.innerHTML = loadingRow(8);
  try {
    const data = await api('GET', '/customers');
    let list   = data.customers || [];
    if (search) list = list.filter(c => (c.name + c.email + (c.phone_no||'')).toLowerCase().includes(search));
    tbody.innerHTML = list.map(c => `<tr>
      <td class="td-id">${c.user_id}</td>
      <td class="td-primary">${c.name}</td>
      <td>${c.email}</td>
      <td>${c.phone_no || '—'}</td>
      <td style="text-align:center;">${c.loyalty_points || 0} pts</td>
      <td class="td-gold">—</td>
      <td><span class="badge badge-active">Active</span></td>
      <td><button class="btn-icon" onclick="viewCustomer(${c.user_id},'${escQ(c.name)}','${c.email}','${c.phone_no||''}')">View</button></td>
    </tr>`).join('') || emptyRow(8, '👥', 'No customers found.');
  } catch (err) { tbody.innerHTML = emptyRow(8, '⚠️', err.message); }
}

async function viewCustomer(uid, name, email, phone) {
  document.getElementById('vc-name').textContent = name;
  document.getElementById('vc-id').textContent   = 'ID: ' + uid;
  document.getElementById('vc-info').innerHTML = `
    <div class="summary-row"><span class="label">Email</span><span class="val">${email}</span></div>
    <div class="summary-row"><span class="label">Phone</span><span class="val">${phone || '—'}</span></div>`;
  try {
    const data = await api('GET', '/bookings/customer/' + uid);
    const bks  = data.bookings || [];
    const spent= bks.filter(b=>b.booking_status!=='cancelled').reduce((s,b)=>s+Number(b.amount||0),0);
    document.getElementById('vc-info').innerHTML += `
      <div class="summary-row"><span class="label">Total Bookings</span><span class="val">${bks.length}</span></div>
      <div class="summary-row total"><span class="label">Total Spent</span><span class="val">₹${spent.toLocaleString()}</span></div>`;
    document.getElementById('vc-bookings-tbody').innerHTML =
      bks.map(b => {
        const nights = nightsBetween(b.check_in, b.check_out);
        return `<tr>
          <td class="td-id">LX-${b.booking_id}</td><td>Rm ${b.room_no}</td>
          <td>${fmtDate(b.check_in)}</td><td>${fmtDate(b.check_out)}</td>
          <td style="text-align:center;">${nights}</td>
          <td class="td-gold">₹${Number(b.amount||(b.price*nights)||0).toLocaleString()}</td>
          <td>${statusBadge(b.booking_status)}</td>
        </tr>`;
      }).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:14px;">No bookings</td></tr>`;
  } catch (e) { console.error(e); }
  openModal('modal-view-customer');
}

/* ── User Accounts tab (reads from DB customers) ── */
async function renderUserAccounts() {
  const roleFilter = document.getElementById('user-role-filter')?.value || '';
  const tbody      = document.getElementById('users-tbody');
  tbody.innerHTML  = loadingRow(7);
  try {
    const data = await api('GET', '/customers');
    let list   = (data.customers || []).map(c => ({ ...c, role: 'customer' }));
    if (roleFilter && roleFilter !== 'customer') {
      // Staff/admin not exposed via API yet — show placeholder
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted);">
        Staff and Admin account management requires adding GET /api/staff and GET /api/admins endpoints to server.js.
      </td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(u => `<tr>
      <td class="td-id">${u.user_id}</td>
      <td class="td-primary">${u.name}</td>
      <td>${u.email}</td>
      <td>${u.phone_no || '—'}</td>
      <td><span class="badge badge-available">customer</span></td>
      <td><span class="badge badge-active">Active</span></td>
      <td>—</td>
    </tr>`).join('') || emptyRow(7, '🔐', 'No accounts found.');
  } catch (err) { tbody.innerHTML = emptyRow(7, '⚠️', err.message); }
}

function openAddUserModal()  { showToast('Add a POST /api/register endpoint call for new users.','info'); }
function openEditUser()      {}
function saveUser()          {}
function toggleUserStatus()  {}

/* ════════════════════════════════════════════════
   BOOKING CODE + CSV EXPORT
════════════════════════════════════════════ */
function openGenCodeModal() { genNewCode(); openModal('modal-gencode'); }
function genNewCode() { document.getElementById('gen-code-val').textContent = 'BK-' + Math.random().toString(36).substr(2,6).toUpperCase(); }
function copyCode() {
  const code = document.getElementById('gen-code-val').textContent;
  navigator.clipboard?.writeText(code).catch(()=>{});
  showToast('Code copied: ' + code, 'info');
}

async function exportReport() {
  try {
    const data = await api('GET', '/bookings');
    const bks  = data.bookings || [];
    const headers = ['Booking ID','Customer','Room','Type','Check-in','Check-out','Nights','Amount','Pay Method','Pay Status','Status'];
    const rows    = bks.map(b => {
      const nights = nightsBetween(b.check_in, b.check_out);
      return [`LX-${b.booking_id}`, b.customer_name||'', b.room_no, b.room_type||'', fmtDate(b.check_in), fmtDate(b.check_out), nights, b.amount||0, b.payment_method||'', b.payment_status||'', b.booking_status].join(',');
    });
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'luxestay-bookings.csv'; a.click();
    URL.revokeObjectURL(url);
    showToast('Report exported as CSV.', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

/* ════════════════════════════════════════════════
   RENDER ALL  (called after modal close)
════════════════════════════════════════════ */
async function renderAll() {
  if (SESSION.role === 'customer') { await renderRoomsGrid(); await renderCustomerBookings(); }
  if (SESSION.role === 'admin')    { await renderAdminStats(); await renderAdminBookings(); await renderAdminRooms(); }
  if (SESSION.role === 'staff')    { await renderStaffStats(); await renderStaffTable(); }
}

/* ════════════════════════════════════════════════
   MODAL HELPERS
════════════════════════════════════════════ */
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('.modal-backdrop').forEach(bd => {
  bd.addEventListener('click', e => { if (e.target === bd) bd.classList.add('hidden'); });
});

/* ════════════════════════════════════════════════
   BADGE HELPERS
════════════════════════════════════════════ */
function statusBadge(s) {
  const map = {
    confirmed:   'badge-booked',    cancelled: 'badge-cancelled',
    pending:     'badge-pending',   available: 'badge-available',
    booked:      'badge-booked',    maintenance:'badge-maintenance',
    'checked-in':'badge-checkedin', completed:  'badge-completed',
  };
  return `<span class="badge ${map[(s||'').toLowerCase()]||''}">${s||'—'}</span>`;
}

function payStatusBadge(s) {
  const map = { paid: 'badge-paid', pending: 'badge-pending', failed: 'badge-failed' };
  return `<span class="badge ${map[(s||'').toLowerCase()]||'badge-pending'}">${s||'Pending'}</span>`;
}

/* ════════════════════════════════════════════════
   LOADING / EMPTY STATE HELPERS
════════════════════════════════════════════ */
function loadingGrid(msg) { return `<div class="empty-state" style="grid-column:1/-1"><div class="e-icon">⏳</div><p>${msg}</p></div>`; }
function emptyGrid(icon, msg) { return `<div class="empty-state" style="grid-column:1/-1"><div class="e-icon">${icon}</div><p>${msg}</p></div>`; }
function loadingRow(cols) { return `<tr><td colspan="${cols}" style="text-align:center;padding:24px;color:var(--muted);">Loading…</td></tr>`; }
function emptyRow(cols, icon, msg) { return `<tr><td colspan="${cols}"><div class="empty-state"><div class="e-icon">${icon}</div><p>${msg}</p></div></td></tr>`; }
function escQ(s) { return String(s||'').replace(/'/g, "\\'"); } // escape quotes for inline onclick attrs

/* ════════════════════════════════════════════════
   TOAST
════════════════════════════════════════════ */
let toastTimer;
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ════════════════════════════════════════════════
   INIT — runs when page loads
════════════════════════════════════════════ */
const todayStr    = getLocalDateStr();
const tomorrowStr = addDays(todayStr, 1);

// Prevent selecting past dates on the browse filter
const ciDateEl = document.getElementById('ci-date');
const coDateEl = document.getElementById('co-date');
if (ciDateEl) ciDateEl.min = todayStr;
if (coDateEl) coDateEl.min = tomorrowStr;

// Auto-update checkout minimum when checkin changes
if (ciDateEl) {
  ciDateEl.addEventListener('change', function () {
    const nextDay = addDays(this.value, 1);
    if (coDateEl) {
      coDateEl.min = nextDay;
      if (coDateEl.value <= this.value) coDateEl.value = nextDay;
    }
    filterRooms();
  });
}

// Booking modal: update checkout minimum when checkin changes
const bookCIEl = document.getElementById('book-checkin');
if (bookCIEl) {
  bookCIEl.addEventListener('change', function () {
    const nextDay = addDays(this.value, 1);
    const bookCOEl = document.getElementById('book-checkout');
    if (bookCOEl) {
      bookCOEl.min = nextDay;
      if (bookCOEl.value <= this.value) bookCOEl.value = nextDay;
    }
    updateBookingSummary();
  });
}
