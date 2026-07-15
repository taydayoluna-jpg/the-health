/* ==========================================================================
   The Hearth — Admin panel
   Owner-only tools: manage accounts, see aggregate usage stats.
   By design this never surfaces message or DM text — only counts,
   timestamps, and navigation activity — so admin visibility doesn't
   require reading anyone's private conversations.
   ========================================================================== */

const USERS_KEY = 'hearth_users';
const SESSION_KEY = 'hearth_session';
const MESSAGES_KEY = 'hearth_chat_messages';
const PRESENCE_KEY = 'hearth_presence';
const DM_KEY = 'hearth_dm_threads';
const DM_READ_KEY = 'hearth_dm_lastread';
const AVATAR_KEY = 'hearth_avatars';
const STATUS_KEY = 'hearth_status_updates';
const STATUS_SEEN_KEY = 'hearth_status_seen';
const ANALYTICS_KEY = 'hearth_analytics_events';

function readJSON(key, fallback){
  try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch(e){ return fallback; }
}
function writeJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

function logout(){
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'auth.html';
}

async function hashText(text){
  const enc = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function initial(name){ return (name || '?').trim().charAt(0).toUpperCase(); }

function avatarInner(email, name){
  const img = readJSON(AVATAR_KEY, {})[email];
  return img ? `<img class="avatar-img" src="${img}" alt="">` : initial(name);
}

const currentEmail = localStorage.getItem(SESSION_KEY);
const bootUsers = readJSON(USERS_KEY, {});
const me = bootUsers[currentEmail];

if(!me){
  window.location.href = 'auth.html';
} else if(me.role !== 'admin'){
  document.getElementById('notAuthorizedView').style.display = 'block';
} else {
  document.getElementById('adminView').style.display = 'block';
  renderAdmin();
}

function renderAdmin(){
  renderStats();
  renderSignupChart();
  renderTabPopularity();
  renderUserList();
}

// ==========================================================================
// Stats
// ==========================================================================
function statCard(label, value){
  return `<div class="admin-stat-card"><div class="admin-stat-value">${value}</div><div class="admin-stat-label">${label}</div></div>`;
}

function renderStats(){
  const allUsers = readJSON(USERS_KEY, {});
  const presence = readJSON(PRESENCE_KEY, {});
  const messages = readJSON(MESSAGES_KEY, []);
  const dmThreads = readJSON(DM_KEY, {});
  const statuses = readJSON(STATUS_KEY, {});

  const totalUsers = Object.keys(allUsers).length;
  const onlineNow = Object.values(presence).filter(p => Date.now() - p.lastSeen < 5 * 60 * 1000).length;
  const dmMessageCount = Object.values(dmThreads).reduce((sum, t) => sum + t.length, 0);
  const statusCount = Object.values(statuses).reduce((sum, s) => sum + s.length, 0);

  let attachmentCount = 0;
  messages.forEach(m => { if(m.attachment) attachmentCount++; });
  Object.values(dmThreads).forEach(t => t.forEach(m => { if(m.attachment) attachmentCount++; }));

  document.getElementById('adminStats').innerHTML = [
    statCard('Registered users', totalUsers),
    statCard('Online now', onlineNow),
    statCard('Room messages', messages.length),
    statCard('DM messages', dmMessageCount),
    statCard('Photos / videos / voice notes sent', attachmentCount),
    statCard('Active status updates', statusCount),
  ].join('');
}

// ==========================================================================
// Signups, last 7 days
// ==========================================================================
function renderSignupChart(){
  const allUsers = Object.values(readJSON(USERS_KEY, {}));
  const days = [];
  for(let i = 6; i >= 0; i--){
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const counts = days.map(day => {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    return allUsers.filter(u => u.createdAt >= day.getTime() && u.createdAt < next.getTime()).length;
  });
  const max = Math.max(1, ...counts);
  document.getElementById('signupChart').innerHTML = days.map((day, i) => `
    <div class="admin-bar-col">
      <div class="admin-bar" style="height:${(counts[i] / max * 80) + 10}px"></div>
      <div class="admin-bar-value">${counts[i]}</div>
      <div class="admin-bar-label">${day.toLocaleDateString(undefined, { weekday: 'short' })}</div>
    </div>`).join('');
}

// ==========================================================================
// Tab popularity (from lightweight nav events logged in chat.js)
// ==========================================================================
function renderTabPopularity(){
  const events = readJSON(ANALYTICS_KEY, []).filter(e => e.type === 'tab_view');
  const list = document.getElementById('tabPopularity');
  if(events.length === 0){
    list.innerHTML = '<div class="explore-empty">No navigation activity recorded yet.</div>';
    return;
  }
  const counts = {};
  events.forEach(e => { counts[e.view] = (counts[e.view] || 0) + 1; });
  const total = events.length;
  const order = ['room', 'inbox', 'explore', 'status'];
  const labels = { room: 'The Room', inbox: 'Inbox', explore: 'Explore', status: 'Status' };

  list.innerHTML = order.map(key => {
    const count = counts[key] || 0;
    const pct = Math.round((count / total) * 100);
    return `
      <div class="admin-bar-row">
        <div class="admin-bar-row-label">${labels[key]}</div>
        <div class="admin-bar-row-track"><div class="admin-bar-row-fill" style="width:${pct}%"></div></div>
        <div class="admin-bar-row-pct">${pct}%</div>
      </div>`;
  }).join('');
}

// ==========================================================================
// User list — manage accounts
// ==========================================================================
function messageCountFor(email){
  const messages = readJSON(MESSAGES_KEY, []);
  const dmThreads = readJSON(DM_KEY, {});
  let count = messages.filter(m => m.senderEmail === email).length;
  Object.values(dmThreads).forEach(t => { count += t.filter(m => m.senderEmail === email).length; });
  return count;
}

function renderUserList(){
  const allUsers = readJSON(USERS_KEY, {});
  const presence = readJSON(PRESENCE_KEY, {});
  const list = document.getElementById('adminUserList');
  document.getElementById('userCount').textContent = `(${Object.keys(allUsers).length})`;
  list.innerHTML = '';

  Object.values(allUsers)
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach(u => {
      const online = presence[u.email] && (Date.now() - presence[u.email].lastSeen < 5 * 60 * 1000);
      const row = document.createElement('div');
      row.className = 'admin-user-row';
      row.innerHTML = `
        <div class="bubble-avatar" style="--seat-color:${online ? 'var(--sage)' : 'var(--line)'}">${avatarInner(u.email, u.name)}</div>
        <div class="admin-user-info">
          <div class="admin-user-name">${u.name}${u.role === 'admin' ? ' <span class="admin-badge">admin</span>' : ''}${u.email === currentEmail ? ' (you)' : ''}</div>
          <div class="admin-user-meta">${u.email} · joined ${new Date(u.createdAt).toLocaleDateString()} · ${messageCountFor(u.email)} messages${online ? ' · online now' : ''}</div>
        </div>
        <div class="admin-user-actions">
          ${u.email !== currentEmail ? `<button class="cam-btn" onclick="toggleAdminRole('${u.email}')">${u.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>` : ''}
          ${u.email !== currentEmail ? `<button class="cam-btn danger" onclick="removeUser('${u.email}')">Remove</button>` : '<span class="admin-self-note">that\'s you</span>'}
        </div>`;
      list.appendChild(row);
    });
}

function toggleAdminRole(email){
  const allUsers = readJSON(USERS_KEY, {});
  if(!allUsers[email]) return;
  const makingAdmin = allUsers[email].role !== 'admin';
  if(!makingAdmin){
    const adminCount = Object.values(allUsers).filter(u => u.role === 'admin').length;
    if(adminCount <= 1){
      alert("Can't remove the last admin — promote someone else first.");
      return;
    }
  }
  allUsers[email].role = makingAdmin ? 'admin' : 'user';
  writeJSON(USERS_KEY, allUsers);
  renderUserList();
}

function removeUser(email){
  if(email === currentEmail){
    alert("You can't remove your own account from here — log out instead.");
    return;
  }
  const allUsers = readJSON(USERS_KEY, {});
  const target = allUsers[email];
  if(!target) return;

  if(target.role === 'admin'){
    const adminCount = Object.values(allUsers).filter(u => u.role === 'admin').length;
    if(adminCount <= 1){
      alert("Can't remove the last admin account.");
      return;
    }
  }

  if(!confirm(`Remove ${target.name} (${email})? This deletes their account, presence, avatar, and status updates, and any DM threads with them. This can't be undone.`)) return;

  delete allUsers[email];
  writeJSON(USERS_KEY, allUsers);

  const presence = readJSON(PRESENCE_KEY, {});
  delete presence[email];
  writeJSON(PRESENCE_KEY, presence);

  const avatars = readJSON(AVATAR_KEY, {});
  delete avatars[email];
  writeJSON(AVATAR_KEY, avatars);

  const statuses = readJSON(STATUS_KEY, {});
  delete statuses[email];
  writeJSON(STATUS_KEY, statuses);

  const seenMarks = readJSON(STATUS_SEEN_KEY, {});
  delete seenMarks[email];
  writeJSON(STATUS_SEEN_KEY, seenMarks);

  const dmThreads = readJSON(DM_KEY, {});
  Object.keys(dmThreads).forEach(key => {
    if(key.split('|').includes(email)) delete dmThreads[key];
  });
  writeJSON(DM_KEY, dmThreads);

  const dmReads = readJSON(DM_READ_KEY, {});
  delete dmReads[email];
  Object.keys(dmReads).forEach(viewer => {
    Object.keys(dmReads[viewer] || {}).forEach(key => {
      if(key.split('|').includes(email)) delete dmReads[viewer][key];
    });
  });
  writeJSON(DM_READ_KEY, dmReads);

  renderAdmin();
}

// ==========================================================================
// Add an account
// ==========================================================================
function showAddUserMsg(text, type){
  const el = document.getElementById('addUserMsg');
  el.textContent = text;
  el.className = 'admin-msg ' + type;
}

async function handleAddUser(){
  const name = document.getElementById('newUserName').value.trim();
  const email = document.getElementById('newUserEmail').value.trim().toLowerCase();
  const password = document.getElementById('newUserPassword').value;
  const role = document.getElementById('newUserRole').value;

  if(!name || !email || !password){
    showAddUserMsg('Fill in every field.', 'error');
    return;
  }
  if(!/^\S+@\S+\.\S+$/.test(email)){
    showAddUserMsg("That email address doesn't look right.", 'error');
    return;
  }
  if(password.length < 6){
    showAddUserMsg('Password needs to be at least 6 characters.', 'error');
    return;
  }

  const allUsers = readJSON(USERS_KEY, {});
  if(allUsers[email]){
    showAddUserMsg('An account with that email already exists.', 'error');
    return;
  }

  const passwordHash = await hashText(password);
  allUsers[email] = { name, email, passwordHash, role, createdAt: Date.now() };
  writeJSON(USERS_KEY, allUsers);

  document.getElementById('newUserName').value = '';
  document.getElementById('newUserEmail').value = '';
  document.getElementById('newUserPassword').value = '';
  document.getElementById('newUserRole').value = 'user';
  showAddUserMsg(`Account created for ${name}.`, 'success');
  renderAdmin();
}
