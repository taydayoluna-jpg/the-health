/* ==========================================================================
   The Hearth — Chat (Room + Inbox + Explore)
   Everything here is stored in localStorage since there's no backend:
   - hearth_users            registered accounts (from auth.js)
   - hearth_session          which account is currently logged in
   - hearth_chat_messages    the shared group chat
   - hearth_presence         each user's chosen vibe + last-active time
   - hearth_dm_threads       private DM threads, keyed by sorted email pair
   - hearth_dm_lastread      per-user "I've seen up to this time" markers
   - hearth_now_playing      the shared music queue (see Explore)
   Multiple browser tabs on the same machine sync live via the 'storage'
   event — great for demoing multi-user behavior locally, but this does
   NOT sync across different computers. That needs a real backend.
   ========================================================================== */

/* ==========================================================================
   The Hearth — Chat (Room + Inbox + Explore + Status)
   Everything here is stored in localStorage since there's no backend:
   - hearth_users            registered accounts (from auth.js)
   - hearth_session          which account is currently logged in
   - hearth_chat_messages    the shared group chat
   - hearth_presence         each user's chosen vibe + last-active time
   - hearth_dm_threads       private DM threads, keyed by sorted email pair
   - hearth_dm_lastread      per-user "I've seen up to this time" markers
   - hearth_now_playing      the shared music queue (see Explore)
   - hearth_avatars          profile picture per user email (base64 dataUrl)
   - hearth_status_updates   Stories-style updates per user, auto-expire 24h
   - hearth_status_seen      per-viewer "I've seen this status id" markers
   Multiple browser tabs on the same machine sync live via the 'storage'
   event — great for demoing multi-user behavior locally, but this does
   NOT sync across different computers. That needs a real backend.
   ========================================================================== */

const USERS_KEY = 'hearth_users';
const SESSION_KEY = 'hearth_session';
const MESSAGES_KEY = 'hearth_chat_messages';
const PRESENCE_KEY = 'hearth_presence';
const DM_KEY = 'hearth_dm_threads';
const DM_READ_KEY = 'hearth_dm_lastread';
const QUEUE_KEY = 'hearth_now_playing';
const AVATAR_KEY = 'hearth_avatars';
const STATUS_KEY = 'hearth_status_updates';
const STATUS_SEEN_KEY = 'hearth_status_seen';
const STATUS_TTL = 24 * 60 * 60 * 1000; // 24 hours, like WhatsApp Status
const ANALYTICS_KEY = 'hearth_analytics_events'; // lightweight nav events only — never message content

function readJSON(key, fallback){
  try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch(e){ return fallback; }
}
function writeJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

const currentEmail = localStorage.getItem(SESSION_KEY);
const allUsers = readJSON(USERS_KEY, {});
const me = allUsers[currentEmail];

if(!me){
  window.location.href = 'auth.html';
}

function initial(name){ return (name || '?').trim().charAt(0).toUpperCase(); }

function logout(){
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'auth.html';
}

// ==========================================================================
// Admin role
// ==========================================================================
function isAdmin(){ return !!(me && me.role === 'admin'); }

function anyAdminExists(){
  return Object.values(readJSON(USERS_KEY, {})).some(u => u.role === 'admin');
}

// Self-serve bootstrap: if this browser's accounts predate the admin system
// (so nobody has the admin role yet), let whoever's logged in claim it once.
function claimAdminAccess(){
  const users = readJSON(USERS_KEY, {});
  if(!users[currentEmail]) return;
  users[currentEmail].role = 'admin';
  writeJSON(USERS_KEY, users);
  window.location.reload();
}

function renderAdminEntry(){
  const banner = document.getElementById('claimAdminBanner');
  const link = document.getElementById('adminLink');
  if(isAdmin()){
    link.style.display = 'inline-flex';
    banner.style.display = 'none';
  } else {
    link.style.display = 'none';
    banner.style.display = anyAdminExists() ? 'none' : 'flex';
  }
}

// Lightweight navigation logging for the admin analytics dashboard.
// Only records which tab was opened and when — never message content.
function logTabView(view){
  const events = readJSON(ANALYTICS_KEY, []);
  events.push({ type:'tab_view', view, email: currentEmail, timestamp: Date.now() });
  if(events.length > 3000) events.splice(0, events.length - 3000);
  writeJSON(ANALYTICS_KEY, events);
}

// ==========================================================================
// Profile pictures
// ==========================================================================
function getAvatars(){ return readJSON(AVATAR_KEY, {}); }

function setMyAvatar(dataUrl){
  const avatars = getAvatars();
  avatars[currentEmail] = dataUrl;
  writeJSON(AVATAR_KEY, avatars);
  renderMe();
  renderRoom();
  renderMessages();
  renderDmList();
  if(activeDm) renderDmMessages();
}

// Returns the HTML to drop inside any avatar-shaped container: a photo if
// the user has set one, otherwise the same initial-letter fallback as before.
function avatarInner(email, name){
  const img = getAvatars()[email];
  return img ? `<img class="avatar-img" src="${img}" alt="${escapeHtml(name || '')}">` : initial(name);
}

function triggerAvatarUpload(){
  document.getElementById('avatarFileInput').click();
}

function handleAvatarChosen(event){
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => setMyAvatar(reader.result);
  reader.readAsDataURL(file);
  event.target.value = '';
}

function renderMe(){
  document.getElementById('myAvatar').innerHTML = avatarInner(me.email, me.name);
  document.getElementById('myName').textContent = me.name;
  document.getElementById('myEmail').textContent = me.email;
}


// ==========================================================================
// Vibes / presence (the Hearth)
// ==========================================================================
const vibes = [
  { key:'chill', label:'🌙 chill', color:'#a79bd1' },
  { key:'cozy', label:'☕ cozy', color:'#e8a667' },
  { key:'vibing', label:'🎶 vibing', color:'#8fb39c' },
  { key:'chatty', label:'💬 chatty', color:'#d98686' },
];
const vibeColor = (key) => (vibes.find(v=>v.key===key)||vibes[1]).color;

function getPresence(){ return readJSON(PRESENCE_KEY, {}); }

function setMyVibe(vibeKey){
  const presence = getPresence();
  presence[currentEmail] = { vibe: vibeKey, lastSeen: Date.now() };
  writeJSON(PRESENCE_KEY, presence);
  renderRoom();
}

function touchPresence(){
  const presence = getPresence();
  const existing = presence[currentEmail];
  presence[currentEmail] = { vibe: existing ? existing.vibe : 'cozy', lastSeen: Date.now() };
  writeJSON(PRESENCE_KEY, presence);
}

function renderRoom(){
  const users = readJSON(USERS_KEY, {});
  const presence = getPresence();
  const emails = Object.keys(users);

  // Hearth seats
  const stage = document.getElementById('hearthStage');
  stage.querySelectorAll('.seat').forEach(s => s.remove());
  const radius = 92;
  emails.forEach((email, i) => {
    const angle = (360 / emails.length) * i;
    const rad = (angle * Math.PI) / 180;
    const x = Math.cos(rad) * radius;
    const y = Math.sin(rad) * radius * 0.72;
    const vibe = (presence[email] && presence[email].vibe) || 'cozy';
    const seat = document.createElement('div');
    seat.className = 'seat' + (email === currentEmail ? ' me' : '');
    seat.style.setProperty('--seat-color', vibeColor(vibe));
    seat.style.left = `calc(50% + ${x}px - 23px)`;
    seat.style.top = `calc(50% + ${y}px - 23px)`;
    seat.innerHTML = avatarInner(email, users[email].name) + `<span class="vibe-tag">${users[email].name}${email===currentEmail ? ' (you)' : ''}</span>`;
    stage.appendChild(seat);
  });

  document.getElementById('presenceCount').textContent = `(${emails.length} registered)`;

  const myVibe = (presence[currentEmail] && presence[currentEmail].vibe) || 'cozy';
  document.getElementById('hearthGlow').style.setProperty('--glow-color', vibeColor(myVibe));
  document.getElementById('hearthCore').style.setProperty('--glow-color', vibeColor(myVibe));

  // Vibe picker
  const picker = document.getElementById('vibePicker');
  picker.innerHTML = '';
  vibes.forEach(v => {
    const btn = document.createElement('button');
    btn.className = 'vibe-btn' + (myVibe === v.key ? ' active' : '');
    btn.textContent = v.label;
    btn.onclick = () => setMyVibe(v.key);
    picker.appendChild(btn);
  });
}

// ==========================================================================
// Group chat (The Room)
// ==========================================================================
function mediaHtml(attachment){
  if(!attachment) return '';
  const name = attachment.name || `hearth-media-${Date.now()}`;
  const downloadBtn = `<a class="media-download" href="${attachment.dataUrl}" download="${name}" title="Save to device" style="display:inline-block;margin-top:4px;font-size:0.8rem;text-decoration:none;color:var(--amber,#e8a667);">⬇ Save</a>`;
  if(attachment.type === 'video'){
    return `<div class="msg-media"><video src="${attachment.dataUrl}" controls></video>${downloadBtn}</div>`;
  }
  if(attachment.type === 'audio'){
    return `<div class="msg-media"><audio src="${attachment.dataUrl}" controls style="width:220px"></audio>${downloadBtn}</div>`;
  }
  return `<div class="msg-media"><img src="${attachment.dataUrl}" alt="${attachment.name||'attachment'}">${downloadBtn}</div>`;
}

function escapeHtml(text){
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMessages(){
  const stream = document.getElementById('chatStream');
  const messages = readJSON(MESSAGES_KEY, []);
  document.getElementById('msgCount').textContent = `(${messages.length})`;
  stream.innerHTML = '';
  messages.forEach(msg => {
    const mine = msg.senderEmail === currentEmail;
    const row = document.createElement('div');
    row.className = 'msg' + (mine ? ' mine' : '');
    row.innerHTML = `
      <div class="bubble-avatar" style="--seat-color:${mine ? 'var(--amber)' : 'var(--sage)'}">${avatarInner(msg.senderEmail, msg.senderName)}</div>
      <div class="msg-body">
        <div class="msg-name">${msg.senderName}${mine ? ' (you)' : ''}</div>
        ${msg.text ? `<div class="msg-text">${escapeHtml(msg.text)}</div>` : ''}
        ${mediaHtml(msg.attachment)}
      </div>`;
    stream.appendChild(row);
  });
  stream.scrollTop = stream.scrollHeight;
}

function addRoomMessage(text, attachment){
  const messages = readJSON(MESSAGES_KEY, []);
  messages.push({
    id: Date.now() + '-' + Math.random().toString(36).slice(2),
    senderEmail: currentEmail,
    senderName: me.name,
    text: text || '',
    attachment: attachment || null,
    timestamp: Date.now()
  });
  writeJSON(MESSAGES_KEY, messages); // no cap on length — unlimited history
  renderMessages();
}

function sendChatMessage(){
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  const attachment = (attachTarget === 'room') ? pendingAttachment : null;
  if(!text && !attachment) return;
  addRoomMessage(text, attachment);
  input.value = '';
  clearAttachment();
}

// ==========================================================================
// Inbox / DMs between real accounts
// ==========================================================================
let activeDm = null;

function threadKey(a, b){ return [a,b].sort().join('|'); }

function getDmThreads(){ return readJSON(DM_KEY, {}); }

function getMyReadMarks(){ return readJSON(DM_READ_KEY, {})[currentEmail] || {}; }

function markThreadRead(key){
  const marks = readJSON(DM_READ_KEY, {});
  marks[currentEmail] = marks[currentEmail] || {};
  marks[currentEmail][key] = Date.now();
  writeJSON(DM_READ_KEY, marks);
}

function renderDmList(){
  const list = document.getElementById('dmList');
  const users = readJSON(USERS_KEY, {});
  const threads = getDmThreads();
  const myReads = getMyReadMarks();
  list.innerHTML = '';

  let totalUnread = 0;

  Object.values(users).filter(u => u.email !== currentEmail).forEach(u => {
    const key = threadKey(currentEmail, u.email);
    const thread = threads[key] || [];
    const last = thread[thread.length - 1];
    const preview = last ? (last.text || (last.attachment ? `sent a ${last.attachment.type}` : '')) : 'Say hi';
    const lastReadAt = myReads[key] || 0;
    const unread = thread.filter(m => m.senderEmail !== currentEmail && m.timestamp > lastReadAt).length;
    totalUnread += unread;

    const item = document.createElement('div');
    item.className = 'dm-item' + (activeDm === u.email ? ' active' : '');
    item.onclick = () => openDm(u.email);
    item.innerHTML = `
      <div class="dm-avatar">${avatarInner(u.email, u.name)}</div>
      <div class="dm-info">
        <div class="dm-name">${u.name}</div>
        <div class="dm-preview">${preview}</div>
      </div>
      ${unread > 0 ? '<div class="dm-dot"></div>' : ''}`;
    list.appendChild(item);
  });

  document.getElementById('inboxCountLabel').textContent = totalUnread > 0 ? `(${totalUnread})` : '';
}

function openDm(email){
  activeDm = email;
  const key = threadKey(currentEmail, email);
  markThreadRead(key);
  renderDmList();

  const users = readJSON(USERS_KEY, {});
  document.getElementById('dmThreadTitle').textContent = users[email] ? users[email].name : email;
  renderDmMessages();
}

function renderDmMessages(){
  const stream = document.getElementById('dmStream');
  stream.innerHTML = '';
  if(!activeDm) return;
  const key = threadKey(currentEmail, activeDm);
  const thread = getDmThreads()[key] || [];
  thread.forEach(msg => {
    const mine = msg.senderEmail === currentEmail;
    const row = document.createElement('div');
    row.className = 'msg' + (mine ? ' mine' : '');
    row.innerHTML = `
      <div class="bubble-avatar" style="--seat-color:${mine ? 'var(--amber)' : 'var(--sage)'}">${avatarInner(msg.senderEmail, msg.senderName)}</div>
      <div class="msg-body">
        <div class="msg-name">${msg.senderName}${mine ? ' (you)' : ''}</div>
        ${msg.text ? `<div class="msg-text">${escapeHtml(msg.text)}</div>` : ''}
        ${mediaHtml(msg.attachment)}
      </div>`;
    stream.appendChild(row);
  });
  stream.scrollTop = stream.scrollHeight;
}

function addDmMessage(toEmail, text, attachment){
  const key = threadKey(currentEmail, toEmail);
  const threads = getDmThreads();
  threads[key] = threads[key] || [];
  threads[key].push({
    id: Date.now() + '-' + Math.random().toString(36).slice(2),
    senderEmail: currentEmail,
    senderName: me.name,
    text: text || '',
    attachment: attachment || null,
    timestamp: Date.now()
  });
  writeJSON(DM_KEY, threads); // no cap on length — unlimited history
  markThreadRead(key);
  renderDmMessages();
  renderDmList();
}

function sendDm(){
  if(!activeDm) return;
  const input = document.getElementById('dmInput');
  const text = input.value.trim();
  const attachment = (attachTarget === 'dm') ? pendingAttachment : null;
  if(!text && !attachment) return;
  addDmMessage(activeDm, text, attachment);
  input.value = '';
  clearAttachment();
}

// ==========================================================================
// View switching
// ==========================================================================
let attachTarget = 'room';

function switchView(view){
  ['Room','Inbox','Explore','Status'].forEach(name=>{
    document.getElementById('view'+name).classList.toggle('active', view === name.toLowerCase());
    document.getElementById('tab'+name).classList.toggle('active', view === name.toLowerCase());
  });
  attachTarget = view === 'inbox' ? 'dm' : (view === 'status' ? 'status' : 'room');
  if(view === 'inbox'){ renderDmList(); }
  if(view === 'status'){ renderStatusTab(); }
  logTabView(view);
}

// ==========================================================================
// Explore — real music preview search (iTunes Search API, no key needed)
// and a shared "now playing" queue everyone in the room can see.
// ==========================================================================

// ---- API keys: get these free, see setup notes at bottom of this file ----
const YOUTUBE_API_KEY = 'AIzaSyCKwHs2nzTdUgBYw_nQK8FkIWWabBuOtg8';
const PEXELS_API_KEY = 'NWxWwUssIDqpE4W35oKPGlF4MaViOZ0NIH7JA8kUfxEsDoSWKduGStJa';

function switchExploreMode(mode){
  ['music','video','image'].forEach(m => {
    document.getElementById('exploreMode' + m.charAt(0).toUpperCase() + m.slice(1)).classList.toggle('active', m === mode);
    document.getElementById('exploreSub' + m.charAt(0).toUpperCase() + m.slice(1)).classList.toggle('active', m === mode);
  });
  if(mode !== 'video' && currentVideoPlayer){
    document.getElementById('videoPlayerSlot').innerHTML = '';
    currentVideoPlayer = null;
  }
}

let currentPreviewAudio = null;
let roomAudio = null;
let currentVideoPlayer = null;

async function runExploreSearch(){
  const query = document.getElementById('exploreInput').value.trim();
  const results = document.getElementById('exploreResults');
  if(!query) return;
  results.innerHTML = '<div class="explore-empty">Searching...</div>';
  try{
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=25`);
    const data = await res.json();
    renderExploreResults(data.results || []);
  } catch(err){
    results.innerHTML = '<div class="explore-empty">Search failed — check your internet connection.</div>';
    console.error(err);
  }
}

function renderExploreResults(items){
  const results = document.getElementById('exploreResults');
  results.innerHTML = '';
  if(items.length === 0){
    results.innerHTML = '<div class="explore-empty">No results. Try a different search.</div>';
    return;
  }
  items.forEach(item => {
    const hasPreview = !!item.previewUrl;
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <img src="${item.artworkUrl100}" alt="${item.trackName}">
      <div class="result-title">${item.trackName}</div>
      <div class="result-artist">${item.artistName}</div>
      <div class="result-actions">
        <button data-role="play" ${hasPreview ? '' : 'disabled title="No preview clip available for this track"'}>${hasPreview ? '▶ Preview' : 'No preview'}</button>
        <button data-role="queue" ${hasPreview ? '' : 'disabled'}>+ Queue</button>
        ${hasPreview ? `<a data-role="download" href="${item.previewUrl}" download title="Downloads the 30-second preview clip only, not the full song">⬇</a>` : ''}
      </div>`;
    if(hasPreview){
      card.querySelector('[data-role="play"]').onclick = () => playPreview(item, card.querySelector('[data-role="play"]'));
      card.querySelector('[data-role="queue"]').onclick = () => addToSharedQueue(item);
    }
    results.appendChild(card);
  });
}

function playPreview(item, btn){
  if(currentPreviewAudio){ currentPreviewAudio.pause(); currentPreviewAudio = null; }
  if(btn.textContent.includes('Pause')){ btn.textContent = '▶ Preview'; return; }
  document.querySelectorAll('[data-role="play"]').forEach(b => { if(!b.disabled) b.textContent = '▶ Preview'; });
  currentPreviewAudio = new Audio(item.previewUrl);
  btn.textContent = '⏳ Loading...';
  currentPreviewAudio.play().then(() => {
    btn.textContent = '❚❚ Pause';
  }).catch(err => {
    console.error('Preview playback failed:', err);
    btn.textContent = '⚠ Playback failed';
    setTimeout(() => { btn.textContent = '▶ Preview'; }, 2000);
  });
  currentPreviewAudio.onended = () => { btn.textContent = '▶ Preview'; };
}

function getQueue(){ return readJSON(QUEUE_KEY, { tracks: [], currentIndex: 0 }); }

function addToSharedQueue(item){
  const queue = getQueue();
  queue.tracks.push({ name: item.trackName, sub: `${item.artistName} · added by ${me.name}`, previewUrl: item.previewUrl });
  queue.currentIndex = queue.tracks.length - 1;
  writeJSON(QUEUE_KEY, queue);
  renderNowPlaying();
  addRoomMessage(`added "${item.trackName}" to the room queue 🎶`, null);
  switchView('room');
}

// ==========================================================================
// Explore — Videos (YouTube Data API search + official embedded player)
// ==========================================================================
async function runVideoSearch(){
  const query = document.getElementById('videoInput').value.trim();
  const results = document.getElementById('videoResults');
  if(!query) return;
  if(YOUTUBE_API_KEY.startsWith('PASTE_')){
    results.innerHTML = '<div class="explore-empty">YouTube search isn\'t set up yet — add your API key in chat.js (see YOUTUBE_API_KEY).</div>';
    return;
  }
  results.innerHTML = '<div class="explore-empty">Searching...</div>';
  try{
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=25&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`);
    const data = await res.json();
    if(data.error){
      results.innerHTML = `<div class="explore-empty">YouTube search failed: ${data.error.message}</div>`;
      return;
    }
    renderVideoResults(data.items || []);
  } catch(err){
    results.innerHTML = '<div class="explore-empty">Search failed — check your internet connection.</div>';
    console.error(err);
  }
}

function renderVideoResults(items){
  const results = document.getElementById('videoResults');
  results.innerHTML = '';
  if(items.length === 0){
    results.innerHTML = '<div class="explore-empty">No results. Try a different search.</div>';
    return;
  }
  items.forEach(item => {
    const videoId = item.id.videoId;
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <img src="${item.snippet.thumbnails.medium.url}" alt="${item.snippet.title}">
      <div class="result-title">${item.snippet.title}</div>
      <div class="result-artist">${item.snippet.channelTitle}</div>
      <div class="result-actions">
        <button data-role="play">▶ Play here</button>
        <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" rel="noopener">Open on YouTube</a>
      </div>`;
    card.querySelector('[data-role="play"]').onclick = () => playVideo(videoId, item.snippet.title);
    results.appendChild(card);
  });
}

function playVideo(videoId, title){
  const slot = document.getElementById('videoPlayerSlot');
  slot.innerHTML = `
    <div class="video-player-wrap">
      <div class="video-player-title">${title}</div>
      <iframe width="100%" height="360" src="https://www.youtube.com/embed/${videoId}?autoplay=1"
        title="${title}" frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen></iframe>
    </div>`;
  currentVideoPlayer = videoId;
  slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ==========================================================================
// Explore — Images (Pexels API — free, high-quality stock photos)
// Note: Pexels is a royalty-free stock library, so results are strong for
// general subjects/objects/scenery but inconsistent for specific named
// celebrities (stock libraries rarely license individual people's likeness).
// ==========================================================================
async function runImageSearch(){
  const query = document.getElementById('imageInput').value.trim();
  const results = document.getElementById('imageResults');
  if(!query) return;
  if(PEXELS_API_KEY.startsWith('PASTE_')){
    results.innerHTML = '<div class="explore-empty">Image search isn\'t set up yet — add your API key in chat.js (see PEXELS_API_KEY).</div>';
    return;
  }
  results.innerHTML = '<div class="explore-empty">Searching...</div>';
  try{
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=24`, {
      headers: { Authorization: PEXELS_API_KEY }
    });
    const data = await res.json();
    if(data.error){
      results.innerHTML = `<div class="explore-empty">Image search failed: ${data.error}</div>`;
      return;
    }
    renderImageResults(data.photos || []);
  } catch(err){
    results.innerHTML = '<div class="explore-empty">Search failed — check your internet connection.</div>';
    console.error(err);
  }
}

function renderImageResults(items){
  const results = document.getElementById('imageResults');
  results.innerHTML = '';
  if(items.length === 0){
    results.innerHTML = '<div class="explore-empty">No results. Try a different search.</div>';
    return;
  }
  items.forEach(item => {
    const card = document.createElement('a');
    card.className = 'image-result-card';
    card.href = item.url;
    card.target = '_blank';
    card.rel = 'noopener';
    card.title = item.alt || 'Photo by ' + item.photographer;
    card.innerHTML = `
      <img src="${item.src.medium}" alt="${item.alt || ''}" loading="lazy" onerror="this.closest('.image-result-card').style.display='none'">
      <div class="image-result-title">📷 ${item.photographer}</div>`;
    results.appendChild(card);
  });
}

function renderNowPlaying(){
  const queue = getQueue();
  const track = queue.tracks[queue.currentIndex];

  document.getElementById('trackName').textContent = track ? track.name : 'Nothing queued yet';
  document.getElementById('trackSub').textContent = track ? track.sub : 'search Explore to add a track';

  const q = document.getElementById('queueList');
  q.innerHTML = '';
  queue.tracks.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.textContent = t.name;
    btn.className = i === queue.currentIndex ? 'current' : '';
    btn.onclick = () => {
      const qq = getQueue();
      qq.currentIndex = i;
      writeJSON(QUEUE_KEY, qq);
      stopRoomAudio();
      renderNowPlaying();
    };
    q.appendChild(btn);
  });

  renderWaveform();
}

function renderWaveform(){
  const wf = document.getElementById('waveform');
  wf.innerHTML = '';
  for(let i = 0; i < 38; i++){
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = (6 + Math.random() * 20) + 'px';
    bar.style.animationDelay = (Math.random()) + 's';
    wf.appendChild(bar);
  }
}

let playing = false;
function stopRoomAudio(){
  if(roomAudio){ roomAudio.pause(); roomAudio = null; }
  playing = false;
  document.getElementById('playBtn').textContent = '▶';
  document.getElementById('waveform').classList.toggle('playing', false);
}

function togglePlay(){
  const queue = getQueue();
  const track = queue.tracks[queue.currentIndex];
  if(!track) return;

  playing = !playing;
  document.getElementById('playBtn').textContent = playing ? '❚❚' : '▶';
  document.getElementById('waveform').classList.toggle('playing', playing);

  if(playing){
    roomAudio = new Audio(track.previewUrl);
    roomAudio.play();
    roomAudio.onended = () => stopRoomAudio();
  } else if(roomAudio){
    roomAudio.pause();
    roomAudio = null;
  }
}

// ==========================================================================
// Attachments (file picker) — shared by room and DM inputs
// ==========================================================================
let pendingAttachment = null;

function triggerAttach(target){
  attachTarget = target;
  document.getElementById('fileInput').click();
}

function handleFileChosen(event){
  const file = event.target.files[0];
  if(!file) return;
  const type = file.type.startsWith('video') ? 'video' : 'image';
  const reader = new FileReader();
  reader.onload = () => {
    if(attachTarget === 'status'){
      addMyStatus(type, reader.result);
    } else {
      pendingAttachment = { type, dataUrl: reader.result, name: file.name };
      renderAttachPreview();
    }
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function renderAttachPreview(){
  const containerId = attachTarget === 'dm' ? 'dmAttachPreview' : 'chatAttachPreview';
  const container = document.getElementById(containerId);
  if(!pendingAttachment){ container.innerHTML = ''; return; }
  const tag = pendingAttachment.type === 'video'
    ? `<video src="${pendingAttachment.dataUrl}"></video>`
    : `<img src="${pendingAttachment.dataUrl}">`;
  container.innerHTML = `
    <div class="attach-preview">
      ${tag}
      <span>${pendingAttachment.name}</span>
      <span class="remove-attach" onclick="clearAttachment()">remove</span>
    </div>`;
}

function clearAttachment(){
  pendingAttachment = null;
  document.getElementById('chatAttachPreview').innerHTML = '';
  document.getElementById('dmAttachPreview').innerHTML = '';
}

// ==========================================================================
// Quick capture modal — live photo/video into whichever chat opened it
// ==========================================================================
let modalStream = null;
let modalRecorder = null;
let modalChunks = [];
let modalIsRecording = false;
let modalCaptured = null;
let modalContext = 'room';

async function openCaptureModal(context){
  modalContext = context;
  modalCaptured = null;
  document.getElementById('captureModalOverlay').style.display = 'flex';
  document.getElementById('modalViewport').style.display = 'flex';
  document.getElementById('modalCaptureResult').style.display = 'none';
  document.getElementById('modalCaptureResult').innerHTML = '';
  document.getElementById('modalLiveControls').style.display = 'flex';
  document.getElementById('modalResultControls').style.display = 'none';

  const video = document.getElementById('modalVideo');
  const placeholder = document.getElementById('modalPlaceholder');
  video.style.display = 'none';
  placeholder.style.display = 'block';
  placeholder.textContent = 'Starting camera...';

  try{
    modalStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
    video.srcObject = modalStream;
    video.style.display = 'block';
    placeholder.style.display = 'none';
  } catch(err){
    placeholder.textContent = "Couldn't access your camera — check your browser's permission prompt.";
    console.error(err);
  }
}

function closeCaptureModal(){
  if(modalIsRecording && modalRecorder){ modalRecorder.stop(); modalIsRecording = false; }
  if(modalStream){ modalStream.getTracks().forEach(t => t.stop()); modalStream = null; }
  document.getElementById('captureModalOverlay').style.display = 'none';
}

function modalTakePhoto(){
  const video = document.getElementById('modalVideo');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  modalCaptured = { type:'image', dataUrl: canvas.toDataURL('image/png'), name:`photo-${Date.now()}.png` };
  showModalResult();
}

function modalToggleRecording(){
  const recordBtn = document.getElementById('modalRecordBtn');
  const recDot = document.getElementById('modalRecDot');
  if(!modalIsRecording){
    modalChunks = [];
    modalRecorder = new MediaRecorder(modalStream);
    modalRecorder.ondataavailable = e => { if(e.data.size > 0) modalChunks.push(e.data); };
    modalRecorder.onstop = () => {
      const blob = new Blob(modalChunks, { type:'video/webm' });
      const reader = new FileReader();
      reader.onload = () => {
        modalCaptured = { type:'video', dataUrl: reader.result, name:`clip-${Date.now()}.webm` };
        showModalResult();
      };
      reader.readAsDataURL(blob);
    };
    modalRecorder.start();
    modalIsRecording = true;
    recordBtn.textContent = '⏹ Stop recording';
    recDot.style.display = 'flex';
  } else {
    modalRecorder.stop();
    modalIsRecording = false;
    recordBtn.textContent = '⏺ Record video';
    recDot.style.display = 'none';
  }
}

function showModalResult(){
  document.getElementById('modalViewport').style.display = 'none';
  document.getElementById('modalLiveControls').style.display = 'none';
  document.getElementById('modalResultControls').style.display = 'flex';
  const result = document.getElementById('modalCaptureResult');
  result.style.display = 'block';
  result.innerHTML = modalCaptured.type === 'video'
    ? `<video src="${modalCaptured.dataUrl}" controls></video>`
    : `<img src="${modalCaptured.dataUrl}">`;
}

function modalRetake(){
  modalCaptured = null;
  document.getElementById('modalCaptureResult').style.display = 'none';
  document.getElementById('modalViewport').style.display = 'flex';
  document.getElementById('modalLiveControls').style.display = 'flex';
  document.getElementById('modalResultControls').style.display = 'none';
}

function modalSendCapture(){
  if(!modalCaptured) return;
  if(modalContext === 'status'){
    addMyStatus(modalCaptured.type, modalCaptured.dataUrl);
  } else if(modalContext === 'dm' && activeDm){
    addDmMessage(activeDm, '', modalCaptured);
  } else {
    addRoomMessage('', modalCaptured);
  }
  closeCaptureModal();
}

// ==========================================================================
// Voice note modal
// ==========================================================================
let voiceStream = null;
let voiceRecorder = null;
let voiceChunks = [];
let voiceIsRecording = false;
let voiceCaptured = null;
let voiceContext = 'room';
let voiceTimerInterval = null;
let voiceSeconds = 0;

async function openVoiceModal(context){
  voiceContext = context;
  voiceCaptured = null;
  voiceSeconds = 0;

  document.getElementById('voiceModalOverlay').style.display = 'flex';
  document.getElementById('voiceStage').style.display = 'flex';
  document.getElementById('voiceResult').style.display = 'none';
  document.getElementById('voiceResult').innerHTML = '';
  document.getElementById('voiceLiveControls').style.display = 'flex';
  document.getElementById('voiceResultControls').style.display = 'none';
  document.getElementById('voiceRecordBtn').textContent = '⏺ Start recording';
  document.getElementById('voiceMic').classList.remove('recording');
  document.getElementById('voiceTimer').textContent = '0:00';
  document.getElementById('voiceStatus').textContent = 'Tap record to start';

  try{
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio:true });
  } catch(err){
    document.getElementById('voiceStatus').textContent = "Couldn't access your mic — check your browser's permission prompt.";
    console.error(err);
  }
}

function closeVoiceModal(){
  if(voiceIsRecording && voiceRecorder){ voiceRecorder.stop(); voiceIsRecording = false; }
  if(voiceTimerInterval){ clearInterval(voiceTimerInterval); voiceTimerInterval = null; }
  if(voiceStream){ voiceStream.getTracks().forEach(t => t.stop()); voiceStream = null; }
  document.getElementById('voiceModalOverlay').style.display = 'none';
}

function voiceToggleRecording(){
  const btn = document.getElementById('voiceRecordBtn');
  const mic = document.getElementById('voiceMic');
  const status = document.getElementById('voiceStatus');
  if(!voiceStream){ status.textContent = 'Mic not ready yet — try reopening this.'; return; }

  if(!voiceIsRecording){
    voiceChunks = [];
    voiceRecorder = new MediaRecorder(voiceStream);
    voiceRecorder.ondataavailable = e => { if(e.data.size > 0) voiceChunks.push(e.data); };
    voiceRecorder.onstop = () => {
      const blob = new Blob(voiceChunks, { type:'audio/webm' });
      const reader = new FileReader();
      reader.onload = () => {
        voiceCaptured = { type:'audio', dataUrl: reader.result, name:`voice-note-${Date.now()}.webm` };
        showVoiceResult();
      };
      reader.readAsDataURL(blob);
    };
    voiceRecorder.start();
    voiceIsRecording = true;
    voiceSeconds = 0;
    document.getElementById('voiceTimer').textContent = '0:00';
    voiceTimerInterval = setInterval(updateVoiceTimer, 1000);
    btn.textContent = '⏹ Stop recording';
    mic.classList.add('recording');
    status.textContent = 'Recording...';
  } else {
    voiceRecorder.stop();
    voiceIsRecording = false;
    clearInterval(voiceTimerInterval);
    voiceTimerInterval = null;
    mic.classList.remove('recording');
  }
}

function updateVoiceTimer(){
  voiceSeconds++;
  const m = Math.floor(voiceSeconds / 60);
  const s = voiceSeconds % 60;
  document.getElementById('voiceTimer').textContent = `${m}:${s.toString().padStart(2,'0')}`;
}

function showVoiceResult(){
  document.getElementById('voiceStage').style.display = 'none';
  document.getElementById('voiceLiveControls').style.display = 'none';
  document.getElementById('voiceResultControls').style.display = 'flex';
  const result = document.getElementById('voiceResult');
  result.style.display = 'block';
  result.innerHTML = `<audio src="${voiceCaptured.dataUrl}" controls style="width:100%"></audio>`;
}

function voiceRetake(){
  voiceCaptured = null;
  document.getElementById('voiceResult').style.display = 'none';
  document.getElementById('voiceStage').style.display = 'flex';
  document.getElementById('voiceLiveControls').style.display = 'flex';
  document.getElementById('voiceResultControls').style.display = 'none';
  document.getElementById('voiceRecordBtn').textContent = '⏺ Start recording';
  document.getElementById('voiceTimer').textContent = '0:00';
  document.getElementById('voiceStatus').textContent = 'Tap record to start';
}

function voiceSendCapture(){
  if(!voiceCaptured) return;
  if(voiceContext === 'dm' && activeDm){
    addDmMessage(activeDm, '', voiceCaptured);
  } else {
    addRoomMessage('', voiceCaptured);
  }
  closeVoiceModal();
}

// ==========================================================================
// Status (Stories) — photo/video updates that auto-expire after 24h
// ==========================================================================
function timeAgo(ts){
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if(mins < 1) return 'just now';
  if(mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if(hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Reads all statuses and prunes any older than 24h, persisting the cleanup.
function getAllStatuses(){
  const raw = readJSON(STATUS_KEY, {});
  const now = Date.now();
  let changed = false;
  Object.keys(raw).forEach(email => {
    const before = (raw[email] || []).length;
    raw[email] = (raw[email] || []).filter(s => now - s.timestamp < STATUS_TTL);
    if(raw[email].length !== before) changed = true;
    if(raw[email].length === 0) delete raw[email];
  });
  if(changed) writeJSON(STATUS_KEY, raw);
  return raw;
}

function addMyStatus(type, dataUrl){
  const all = readJSON(STATUS_KEY, {});
  all[currentEmail] = all[currentEmail] || [];
  all[currentEmail].push({
    id: Date.now() + '-' + Math.random().toString(36).slice(2),
    type,
    dataUrl,
    timestamp: Date.now()
  });
  writeJSON(STATUS_KEY, all);
  renderStatusTab();
}

function getMySeenMarks(){ return readJSON(STATUS_SEEN_KEY, {})[currentEmail] || {}; }

function markStatusSeen(statusId){
  const marks = readJSON(STATUS_SEEN_KEY, {});
  marks[currentEmail] = marks[currentEmail] || {};
  marks[currentEmail][statusId] = Date.now();
  writeJSON(STATUS_SEEN_KEY, marks);
}

function renderStatusTab(){
  const all = getAllStatuses();
  const users = readJSON(USERS_KEY, {});
  const seen = getMySeenMarks();

  // My status row
  const myUpdates = all[currentEmail] || [];
  const myRow = document.getElementById('myStatusRow');
  const myWrapClass = myUpdates.length ? 'status-avatar-wrap ring-mine' : 'status-avatar-wrap';
  myRow.innerHTML = `
    <div class="${myWrapClass}">
      <div class="status-avatar">${avatarInner(currentEmail, me.name)}</div>
      <span class="status-plus-badge" onclick="event.stopPropagation(); triggerAttach('status')" title="Add a status update">+</span>
    </div>
    <div class="status-info">
      <div class="status-name">My status</div>
      <div class="status-sub">${myUpdates.length ? `${myUpdates.length} update${myUpdates.length > 1 ? 's' : ''} · tap to view · expires in 24h` : 'Tap to add a status update'}</div>
    </div>
    <button class="attach-btn" title="Add status via camera" onclick="event.stopPropagation(); openCaptureModal('status')">🎥</button>`;
  myRow.onclick = (e) => {
    if(e.target.closest('.status-plus-badge') || e.target.closest('.attach-btn')) return;
    if(myUpdates.length) openStatusViewer(currentEmail);
    else triggerAttach('status');
  };

  // Everyone else's recent updates
  const list = document.getElementById('statusList');
  list.innerHTML = '';
  const others = Object.keys(all).filter(email => email !== currentEmail && users[email]);
  others.forEach(email => {
    const updates = all[email];
    const user = users[email];
    const allSeen = updates.every(u => seen[u.id]);
    const item = document.createElement('div');
    item.className = 'status-item';
    item.onclick = () => openStatusViewer(email);
    item.innerHTML = `
      <div class="status-avatar-wrap ${allSeen ? 'ring-seen' : 'ring-unseen'}">
        <div class="status-avatar">${avatarInner(email, user.name)}</div>
      </div>
      <div class="status-info">
        <div class="status-name">${user.name}</div>
        <div class="status-sub">${timeAgo(updates[updates.length - 1].timestamp)}</div>
      </div>`;
    list.appendChild(item);
  });

  if(others.length === 0){
    list.innerHTML = '<div class="explore-empty">No recent updates from others yet.</div>';
  }
}

// ---- Fullscreen story viewer ----
let statusViewerEmail = null;
let statusViewerIndex = 0;
let statusViewerTimer = null;
const STATUS_IMAGE_DURATION = 5000; // ms an image stays up; video uses its own length

function openStatusViewer(email){
  const updates = getAllStatuses()[email] || [];
  if(!updates.length) return;
  statusViewerEmail = email;
  statusViewerIndex = 0;
  document.getElementById('statusViewerOverlay').style.display = 'flex';
  renderStatusProgress();
  showStatusFrame();
}

function renderStatusProgress(){
  const updates = getAllStatuses()[statusViewerEmail] || [];
  document.getElementById('statusProgressRow').innerHTML = updates
    .map((_, i) => `<div class="status-progress-bar"><div class="status-progress-fill" id="statusFill${i}"></div></div>`)
    .join('');
}

function showStatusFrame(){
  const updates = getAllStatuses()[statusViewerEmail] || [];
  if(!updates.length || statusViewerIndex >= updates.length){ closeStatusViewer(); return; }

  const users = readJSON(USERS_KEY, {});
  const user = users[statusViewerEmail];
  const update = updates[statusViewerIndex];
  markStatusSeen(update.id);

  document.getElementById('statusViewerAvatar').innerHTML = avatarInner(statusViewerEmail, user ? user.name : '?');
  document.getElementById('statusViewerName').textContent = user ? user.name + (statusViewerEmail === currentEmail ? ' (you)' : '') : statusViewerEmail;
  document.getElementById('statusViewerTime').textContent = timeAgo(update.timestamp);

  const media = document.getElementById('statusViewerMedia');
  media.innerHTML = update.type === 'video'
    ? `<video src="${update.dataUrl}" autoplay playsinline></video>`
    : `<img src="${update.dataUrl}">`;

  updates.forEach((_, i) => {
    const fill = document.getElementById('statusFill' + i);
    if(!fill) return;
    fill.style.transition = 'none';
    fill.style.width = i < statusViewerIndex ? '100%' : '0%';
  });

  clearTimeout(statusViewerTimer);
  const vid = media.querySelector('video');
  if(vid){
    vid.onloadedmetadata = () => runStatusProgress((vid.duration || 5) * 1000);
    vid.onended = () => statusNext();
  } else {
    runStatusProgress(STATUS_IMAGE_DURATION);
  }
}

function runStatusProgress(duration){
  const fill = document.getElementById('statusFill' + statusViewerIndex);
  if(fill){
    requestAnimationFrame(() => {
      fill.style.transition = `width ${duration}ms linear`;
      fill.style.width = '100%';
    });
  }
  statusViewerTimer = setTimeout(() => statusNext(), duration);
}

function statusNext(){
  statusViewerIndex++;
  const updates = getAllStatuses()[statusViewerEmail] || [];
  if(statusViewerIndex >= updates.length){ closeStatusViewer(); return; }
  showStatusFrame();
}

function statusPrev(){
  statusViewerIndex = Math.max(0, statusViewerIndex - 1);
  showStatusFrame();
}

function closeStatusViewer(){
  clearTimeout(statusViewerTimer);
  const media = document.getElementById('statusViewerMedia');
  const vid = media && media.querySelector('video');
  if(vid) vid.pause();
  document.getElementById('statusViewerOverlay').style.display = 'none';
  statusViewerEmail = null;
  renderStatusTab(); // refresh seen/unseen rings
}

// ==========================================================================
// Live sync across tabs
// ==========================================================================
window.addEventListener('storage', (e) => {
  if(e.key === MESSAGES_KEY) renderMessages();
  if(e.key === USERS_KEY || e.key === PRESENCE_KEY) renderRoom();
  if(e.key === DM_KEY) { renderDmList(); if(activeDm) renderDmMessages(); }
  if(e.key === QUEUE_KEY) renderNowPlaying();
  if(e.key === AVATAR_KEY) { renderMe(); renderRoom(); renderMessages(); renderDmList(); if(activeDm) renderDmMessages(); }
  if(e.key === STATUS_KEY || e.key === STATUS_SEEN_KEY) {
    const statusView = document.getElementById('viewStatus');
    if(statusView && statusView.classList.contains('active')) renderStatusTab();
  }
});

// ---- init ----
if(me){
  renderMe();
  touchPresence();
  renderRoom();
  renderMessages();
  renderDmList();
  renderNowPlaying();
  renderAdminEntry();
}
