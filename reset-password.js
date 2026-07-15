/* ==========================================================================
   The Hearth — Reset password
   Reached via the link Supabase emails after "forgot password". The
   Supabase client library automatically reads the recovery token out of
   the URL and fires a PASSWORD_RECOVERY auth event, giving this page a
   temporary session that's only good for setting a new password.
   ========================================================================== */

function showResetMsg(text, type){
  const el = document.getElementById('resetMsg');
  el.textContent = text;
  el.className = 'auth-msg ' + type;
}

let recoveryReady = false;

supabase.auth.onAuthStateChange((event) => {
  if(event === 'PASSWORD_RECOVERY'){
    recoveryReady = true;
  }
});

// If someone lands here without a valid/expired recovery link, there's no
// session at all — show the "invalid link" state instead of a dead form.
setTimeout(async () => {
  const { data } = await supabase.auth.getSession();
  if(!data.session && !recoveryReady){
    document.getElementById('resetFormView').style.display = 'none';
    document.getElementById('resetInvalidView').style.display = 'block';
  }
}, 1500);

async function handleResetPassword(){
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if(newPassword.length < 6){
    showResetMsg('Password needs to be at least 6 characters.', 'error');
    return;
  }
  if(newPassword !== confirmPassword){
    showResetMsg("Passwords don't match.", 'error');
    return;
  }

  const btn = document.querySelector('#resetFormView .auth-submit');
  btn.disabled = true;
  btn.textContent = 'Updating...';

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  btn.disabled = false;
  btn.textContent = 'Set new password';

  if(error){
    showResetMsg(error.message, 'error');
    return;
  }

  showResetMsg('Password updated! Redirecting you to sign in...', 'success');
  await supabase.auth.signOut();
  setTimeout(() => { window.location.href = 'auth.html'; }, 1800);
}
