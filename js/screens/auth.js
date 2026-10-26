import { app } from '../app.js';
import { $, toast } from '../util.js';
import { friendlyError } from '../cloud.js';

export function initAuth() {
  const { router, cloud } = app;
  const form = $('#a-form'), title = $('#a-title'), nameF = $('#a-name-f');
  const name = $('#a-name'), email = $('#a-email'), pass = $('#a-pass'), msg = $('#a-msg');
  const submit = $('#a-submit'), sw = $('#a-switch'), forgot = $('#a-forgot'), lead = $('#a-lead');
  let mode = 'signin', busy = false;

  function setMode(m) {
    mode = m;
    const up = m === 'signup';
    title.textContent = up ? 'CREATE ACCOUNT' : 'SIGN IN';
    submit.textContent = up ? 'SIGN UP' : 'SIGN IN';
    nameF.hidden = !up;
    forgot.hidden = up;
    sw.textContent = up ? 'Have an account? Sign in' : 'New here? Create an account';
    lead.textContent = up ? 'Pick a player name for the leaderboard.' : 'Save your progress and join the leaderboard.';
    pass.autocomplete = up ? 'new-password' : 'current-password';
    say('');
  }
  function say(text, ok = false) { msg.textContent = text; msg.classList.toggle('ok', ok); }
  function setBusy(b) { busy = b; submit.disabled = b; submit.textContent = b ? 'PLEASE WAIT...' : (mode === 'signup' ? 'SIGN UP' : 'SIGN IN'); }

  sw.onclick = () => setMode(mode === 'signup' ? 'signin' : 'signup');

  forgot.onclick = async () => {
    if (!email.value.trim()) { say('Enter your email first, then tap "Forgot password?".'); return; }
    try { await cloud.resetPassword(email.value); say('Password reset email sent. Check your inbox.', true); }
    catch (e) { say(friendlyError(e)); }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    say('');
    if (!email.value.trim() || !pass.value) { say('Please enter your email and password.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') await cloud.signUp(name.value, email.value, pass.value);
      else await cloud.signIn(email.value, pass.value);
      pass.value = '';
      toast(`Welcome, ${cloud.user ? cloud.user.name : 'player'}!`);
      router.go('home', {}, { back: true });
    } catch (err) { say(friendlyError(err)); }
    setBusy(false);
  });

  cloud.init(); // warm up in the background
  return { enter: (p = {}) => { setMode(p.mode === 'signup' ? 'signup' : 'signin'); email.value = pass.value = name.value = ''; } };
}
