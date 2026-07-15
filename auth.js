/* ==========================================================================
   The Hearth — Auth
   No backend exists here, so accounts are stored in this browser's
   localStorage under 'hearth_users'. That means:
   - Accounts persist across refreshes and closing/reopening the tab.
   - Accounts do NOT sync across different computers or browsers — this is
     a front-end-only demo. A real version needs a server + real database
     + real email delivery for password resets.
   Passwords are hashed with SHA-256 (via the browser's built-in Web Crypto
   API) before being stored, so at least plain-text passwords never sit in
   localStorage — but this is still not equivalent to proper server-side
   auth with salting, rate limiting, etc.
   ========================================================================== */

const USERS_KEY = 'hearth_users';
const SESSION_KEY = 'hearth_session';

function getUsers(){
  try{
    return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
  } catch(e){
    return {};
  }
}

function saveUsers(users){
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function hashText(text){
  const enc = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function showAuthMsg(text, type){
  const el = document.getElementById('authMsg');
  el.textContent = text;
  el.className = 'auth-msg ' + type;
}

function clearAuthMsg(){
  const el = document.getElementById('authMsg');
  el.textContent = '';
  el.className = 'auth-msg';
}

// ---- view switching ----
function switchAuthTab(tab){
  clearAuthMsg();
  document.getElementById('mainAuthView').style.display = 'block';
  document.getElementById('forgotStep1View').classList.remove('active');
  document.getElementById('forgotStep2View').classList.remove('active');

  document.getElementById('loginView').classList.toggle('active', tab === 'login');
  document.getElementById('registerView').classList.toggle('active', tab === 'register');
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
}

function showForgotPassword(){
  clearAuthMsg();
  document.getElementById('mainAuthView').style.display = 'none';
  document.getElementById('forgotStep1View').classList.add('active');
  document.getElementById('forgotStep2View').classList.remove('active');
}

// ---- register ----
async function handleRegister(){
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim().toLowerCase();
  const password = document.getElementById('registerPassword').value;
  const confirm = document.getElementById('registerConfirm').value;

  if(!name || !email || !password){
    showAuthMsg('Fill in every field to create an account.', 'error');
    return;
  }
  if(!/^\S+@\S+\.\S+$/.test(email)){
    showAuthMsg('That email address doesn\'t look right.', 'error');
    return;
  }
  if(password.length < 6){
    showAuthMsg('Password needs to be at least 6 characters.', 'error');
    return;
  }
  if(password !== confirm){
    showAuthMsg('Passwords don\'t match.', 'error');
    return;
  }

  const users = getUsers();
  if(users[email]){
    showAuthMsg('An account with that email already exists.', 'error');
    return;
  }

  // The very first account ever created on this browser becomes admin
  // automatically. Everyone after that registers as a normal user —
  // an existing admin can promote others from the admin panel.
  const isFirstEverUser = Object.keys(users).length === 0;

  const passwordHash = await hashText(password);
  users[email] = { name, email, passwordHash, role: isFirstEverUser ? 'admin' : 'user', createdAt: Date.now() };
  saveUsers(users);

  localStorage.setItem(SESSION_KEY, email);
  window.location.href = 'chat.html';
}

// ---- login ----
async function handleLogin(){
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;

  if(!email || !password){
    showAuthMsg('Enter your email and password.', 'error');
    return;
  }

  const users = getUsers();
  const user = users[email];
  if(!user){
    showAuthMsg('No account found with that email.', 'error');
    return;
  }

  const passwordHash = await hashText(password);
  if(passwordHash !== user.passwordHash){
    showAuthMsg('Wrong password. Try again or reset it.', 'error');
    return;
  }

  localStorage.setItem(SESSION_KEY, email);
  window.location.href = 'chat.html';
}

// ---- forgot password: step 1, request a code ----
const RESET_KEY = 'hearth_reset_request';

async function handleRequestReset(){
  const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
  const users = getUsers();

  if(!users[email]){
    showAuthMsg('No account found with that email.', 'error');
    return;
  }

  const code = Math.floor(100000 + Math.random()*900000).toString();
  localStorage.setItem(RESET_KEY, JSON.stringify({
    email,
    code,
    expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
  }));

  document.getElementById('resetCodeDisplay').textContent = code;
  document.getElementById('forgotStep1View').classList.remove('active');
  document.getElementById('forgotStep2View').classList.add('active');
  clearAuthMsg();
}

// ---- forgot password: step 2, verify code + set new password ----
async function handleCompleteReset(){
  const codeInput = document.getElementById('resetCodeInput').value.trim();
  const newPassword = document.getElementById('resetNewPassword').value;
  const confirmPassword = document.getElementById('resetConfirmPassword').value;

  const pending = JSON.parse(localStorage.getItem(RESET_KEY) || 'null');
  if(!pending){
    showAuthMsg('No reset in progress — request a new code.', 'error');
    return;
  }
  if(Date.now() > pending.expiresAt){
    showAuthMsg('That code expired — request a new one.', 'error');
    localStorage.removeItem(RESET_KEY);
    return;
  }
  if(codeInput !== pending.code){
    showAuthMsg('That code doesn\'t match.', 'error');
    return;
  }
  if(newPassword.length < 6){
    showAuthMsg('New password needs to be at least 6 characters.', 'error');
    return;
  }
  if(newPassword !== confirmPassword){
    showAuthMsg('Passwords don\'t match.', 'error');
    return;
  }

  const users = getUsers();
  const user = users[pending.email];
  if(!user){
    showAuthMsg('That account no longer exists.', 'error');
    return;
  }

  user.passwordHash = await hashText(newPassword);
  saveUsers(users);
  localStorage.removeItem(RESET_KEY);

  switchAuthTab('login');
  showAuthMsg('Password reset — log in with your new password.', 'success');
}

// ---- if already logged in, skip straight to chat ----
if(localStorage.getItem(SESSION_KEY) && getUsers()[localStorage.getItem(SESSION_KEY)]){
  window.location.href = 'chat.html';
}
