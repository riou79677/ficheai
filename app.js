import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Configuration Supabase
const SUPABASE_URL = 'https://qyjqtjrqnlbgtxvnjvnk.supabase.co';
const SUPABASE_KEY = ' sb_publishable_opljKH5NsZwkuLpYQAyh4A_9FwNc4yJ';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// État de l'app
let currentFormat = 'fiche';
let currentFormatName = 'Fiche de révision';
let currentFormatIcon = '📄';
let tokensLeft = 5;
let lastResult = '';
let sessionHistory = [];
let currentUser = null;
let authMode = 'signup';

// ── AUTH ──────────────────────────────────────────────────────────────────────

async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    updateNavForUser();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      currentUser = session.user;
      updateNavForUser();
    } else {
      currentUser = null;
      updateNavForGuest();
    }
  });
}

function updateNavForUser() {
  const btn = document.getElementById('nav-login-btn');
  if (btn) {
    btn.textContent = '👤 ' + (currentUser.email.split('@')[0]);
    btn.onclick = handleLogout;
  }
}

function updateNavForGuest() {
  const btn = document.getElementById('nav-login-btn');
  if (btn) {
    btn.textContent = 'Se connecter';
    btn.onclick = openAuthModal;
  }
}

async function handleLogout() {
  await supabase.auth.signOut();
  currentUser = null;
  updateNavForGuest();
}

// ── MODAL AUTH ────────────────────────────────────────────────────────────────

function openAuthModal() {
  document.getElementById('auth-modal').style.display = 'flex';
}

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('auth-success').style.display = 'none';
}

function closeModalOutside(e) {
  if (e.target.id === 'auth-modal') closeAuthModal();
}

function setAuthMode(mode, btn) {
  authMode = mode;
  document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const title = document.getElementById('auth-title');
  const sub = document.getElementById('auth-sub');
  const authBtn = document.getElementById('auth-btn');
  if (mode === 'signup') {
    title.textContent = 'Créer mon compte';
    sub.textContent = 'Commence gratuitement — aucune carte requise.';
    authBtn.textContent = 'Créer mon compte';
  } else {
    title.textContent = 'Bon retour !';
    sub.textContent = 'Connecte-toi à ton compte FicheAI.';
    authBtn.textContent = 'Se connecter';
  }
}

async function handleAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errBox = document.getElementById('auth-error');
  const successBox = document.getElementById('auth-success');
  const btn = document.getElementById('auth-btn');

  errBox.style.display = 'none';
  successBox.style.display = 'none';

  if (!email || !password) {
    errBox.textContent = 'Remplis tous les champs !';
    errBox.style.display = 'block';
    return;
  }

  btn.textContent = 'Chargement...';
  btn.disabled = true;

  if (authMode === 'signup') {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      errBox.textContent = error.message;
      errBox.style.display = 'block';
    } else {
      // Créer l'utilisateur dans la table users
      await supabase.from('users').insert([{
        id: data.user.id,
        email: email,
        plan: 'starter',
        generations_used: 0,
        generations_limit: 5
      }]);
      successBox.textContent = '✅ Compte créé ! Tu peux maintenant générer tes fiches.';
      successBox.style.display = 'block';
      setTimeout(() => closeAuthModal(), 2000);
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      errBox.textContent = 'Email ou mot de passe incorrect.';
      errBox.style.display = 'block';
    } else {
      closeAuthModal();
    }
  }

  btn.disabled = false;
  btn.textContent = authMode === 'signup' ? 'Créer mon compte' : 'Se connecter';
}

// ── GÉNÉRATEUR ────────────────────────────────────────────────────────────────

document.getElementById('course-input').addEventListener('input', function () {
  document.getElementById('char-count').textContent = this.value.length + ' caractères';
});

function selectFmt(el) {
  document.querySelectorAll('.fmt').forEach(f => f.classList.remove('active'));
  el.classList.add('active');
  currentFormat = el.dataset.fmt;
  currentFormatName = el.dataset.name;
  currentFormatIcon = el.dataset.icon;
}

function fillEx(subject, text) {
  document.getElementById('course-input').value = text;
  document.getElementById('char-count').textContent = text.length + ' caractères';
  document.getElementById('course-input').focus();
}

async function generate() {
  const input = document.getElementById('course-input').value.trim();
  const errBox = document.getElementById('error-box');
  errBox.style.display = 'none';

  if (!input) {
    showError('Colle d\'abord le contenu de ton cours !');
    return;
  }
  if (input.length < 30) {
    showError('Le cours est trop court — ajoute plus de contenu.');
    return;
  }
  if (tokensLeft <= 0) {
    showError('Tu as utilisé tes 5 générations gratuites. Passe à Pro pour continuer !');
    return;
  }

  const btn = document.getElementById('gen-btn');
  btn.disabled = true;
  btn.innerHTML = '<div style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.7s linear infinite;display:inline-block;margin-right:8px"></div> Génération en cours…';

  const resultCard = document.getElementById('result-card');
  const spinner = document.getElementById('result-spinner');
  const content = document.getElementById('result-content');

  resultCard.style.display = 'block';
  spinner.style.display = 'flex';
  content.style.display = 'none';
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const language = document.getElementById('lang-sel').value;

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course: input,
        format: currentFormat,
        language,
        email: currentUser ? currentUser.email : null
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    lastResult = data.result;
    content.textContent = data.result;
    document.getElementById('result-title').textContent = currentFormatIcon + ' ' + currentFormatName;

    spinner.style.display = 'none';
    content.style.display = 'block';

    tokensLeft--;
    document.getElementById('tok-nav').textContent = tokensLeft;

    addToHistory(currentFormatIcon, currentFormatName, input, data.result);

  } catch (error) {
    spinner.style.display = 'none';
    content.textContent = '⚠️ Une erreur est survenue : ' + error.message;
    content.style.display = 'block';
  }

  btn.disabled = false;
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Générer avec l\'IA';
}

function showError(msg) {
  const box = document.getElementById('error-box');
  box.textContent = '⚠️ ' + msg;
  box.style.display = 'block';
}

function resetGen() {
  document.getElementById('result-card').style.display = 'none';
  document.getElementById('course-input').value = '';
  document.getElementById('char-count').textContent = '0 caractères';
  document.getElementById('error-box').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function copyResult() {
  navigator.clipboard.writeText(lastResult).then(() => {
    const btn = event.target;
    const original = btn.textContent;
    btn.textContent = '✅ Copié !';
    setTimeout(() => btn.textContent = original, 2000);
  });
}

function downloadResult() {
  const blob = new Blob([lastResult], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'FicheAI_' + currentFormatName.replace(/ /g, '_') + '.txt';
  a.click();
}

function addToHistory(icon, name, course, result) {
  const now = new Date();
  const time = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
  sessionHistory.unshift({ icon, name, preview: course.substring(0, 55) + '…', time, result });
  if (sessionHistory.length > 6) sessionHistory.pop();
  renderHistory();
}

function renderHistory() {
  const section = document.getElementById('history-section');
  const list = document.getElementById('history-list');
  if (sessionHistory.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  list.innerHTML = sessionHistory.map((h, i) => `
    <div class="hist-item" onclick="loadHistory(${i})">
      <span class="hist-fmt">${h.icon}</span>
      <span class="hist-preview">${h.name} — ${h.preview}</span>
      <span class="hist-time">${h.time}</span>
    </div>
  `).join('');
}

function loadHistory(i) {
  const h = sessionHistory[i];
  document.getElementById('result-content').textContent = h.result;
  document.getElementById('result-title').textContent = h.icon + ' ' + h.name;
  document.getElementById('result-card').style.display = 'block';
  document.getElementById('result-spinner').style.display = 'none';
  document.getElementById('result-content').style.display = 'block';
  lastResult = h.result;
  document.getElementById('result-card').scrollIntoView({ behavior: 'smooth' });
}

// Exposer les fonctions globalement
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.closeModalOutside = closeModalOutside;
window.setAuthMode = setAuthMode;
window.handleAuth = handleAuth;
window.selectFmt = selectFmt;
window.fillEx = fillEx;
window.generate = generate;
window.resetGen = resetGen;
window.copyResult = copyResult;
window.downloadResult = downloadResult;
window.loadHistory = loadHistory;

// Initialisation
initAuth();
