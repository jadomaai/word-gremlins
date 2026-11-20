(() => {
'use strict';
const KEY = 'wordgremlins.v1';
const NAMES = ['Peek & build', 'Ghost letters', 'Spot the saboteur', 'Listen & write'];
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 864e5);
const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1);[a[i], a[j]] = [a[j], a[i]]; } return a; };
function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffleSeed(a, seed) { const r = seeded(seed); a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------- state ---------- */
let S, LIST = [], BY = {}, view = 'home', sess = null, boss = null, curQ = null, installEvt = null;
const defaults = () => ({ v: 1, settings: { batch: 6, speak: true, rate: 0.85, sound: true, custom: '', extra: [], checks: 3 }, unlocked: 6, batchStart: 0, bossReady: false, champion: false, words: {}, rules: {}, streak: { last: '', count: 0 }, stars: 0 });
function load() {
  try { const r = localStorage.getItem(KEY); S = Object.assign(defaults(), r ? JSON.parse(r) : {}); } catch (e) { S = defaults(); }
  S.settings = Object.assign(defaults().settings, S.settings || {});
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }

/* ---------- word list ---------- */
function parseEntry(raw) {
  let s = String(raw).replace(/\*/g, '').trim(), hint = '', m;
  if (s.includes('|')) { [s, hint] = s.split('|'); s = s.trim(); hint = hint.trim(); }
  else if ((m = s.match(/^(\S+)\s+\((.+)\)$/))) { s = m[1]; hint = m[2]; }
  else if ((m = s.match(/^([^\s\[\]]+)\(ly\)$/))) { s = m[1]; hint = 'also: ' + m[1] + 'ly'; }
  let word = '', marks = [], on = false;
  for (const ch of s) { if (ch === '[') { on = true; continue; } if (ch === ']') { on = false; continue; } word += ch.toLowerCase(); marks.push(on); }
  if (!marks.some(Boolean)) { for (let i = 0; i < word.length; i++) if (word[i] === word[i + 1]) { marks[i] = marks[i + 1] = true; } }
  return { word, marks, hint };
}
function buildList() {
  BY = {};
  const custom = S.settings.custom && S.settings.custom.trim();
  const entries = custom ? S.settings.custom.split('\n').map(s => s.trim()).filter(Boolean).map(parseEntry) : shuffleSeed(BUILTIN.map(parseEntry), 7);
  (S.settings.extra || []).forEach(x => entries.push(parseEntry(x)));
  const seen = new Set();
  LIST = entries.filter(e => e.word && !seen.has(e.word) && seen.add(e.word));
  LIST.forEach((w, i) => {
    w.emoji = EMOJI[i % EMOJI.length]; BY[w.word] = w;
    if (!S.words[w.word]) S.words[w.word] = { stage: 0, days: [], mastered: false, lastCredit: '', lastSeen: '', lastStageDay: '', misses: 0 };
  });
  S.unlocked = Math.min(LIST.length, Math.max(S.unlocked, Math.min(S.settings.batch, LIST.length)));
  S.batchStart = Math.min(S.batchStart, S.unlocked);
}
const P = w => S.words[w.word];
const unlockedWords = () => LIST.slice(0, S.unlocked);
const active = () => LIST.filter((w, i) => !P(w).mastered && (i < S.unlocked || P(w).flash));
const masteredCount = () => LIST.filter(w => P(w).mastered).length;
function updateBoss() { if (!S.champion && S.unlocked > 0 && active().length === 0) S.bossReady = true; }
const wordMarked = w => [...w.word].map((c, i) => w.marks[i] ? `<span class="hl">${esc(c)}</span>` : esc(c)).join('');
const pips = w => '●'.repeat(Math.min(3, P(w).days.length)) + '○'.repeat(3 - Math.min(3, P(w).days.length));

/* ---------- speech & sound ---------- */
let voice = null;
function pickVoice() { if (!('speechSynthesis' in window)) return; const v = speechSynthesis.getVoices(); voice = v.find(x => /en-GB/i.test(x.lang)) || v.find(x => /^en/i.test(x.lang)) || null; }
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
const canSpeak = () => S.settings.speak && 'speechSynthesis' in window;
function speak(text, slow) {
  if (!canSpeak()) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = slow ? 0.5 : S.settings.rate; if (voice) u.voice = voice; speechSynthesis.speak(u); } catch (e) { }
}
let ac;
function beep(ok) {
  if (!S.settings.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime; o.connect(g); g.connect(ac.destination);
    if (ok) { o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(880, t + .1); } else { o.frequency.setValueAtTime(230, t); }
    g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.001, t + .3); o.start(t); o.stop(t + .3);
  } catch (e) { }
}
function confetti(list) {
  document.querySelectorAll('.fx').forEach(x => x.remove());
  const f = document.createElement('div'); f.className = 'fx';
  for (let i = 0; i < 14; i++) { const s = document.createElement('span'); s.textContent = list[i % list.length]; s.style.left = rnd(96) + '%'; s.style.animationDelay = (Math.random() * .6) + 's'; f.appendChild(s); }
  document.body.appendChild(f); setTimeout(() => f.remove(), 2600);
}

/* ---------- shell ---------- */
function shell(inner, tab) {
  app.innerHTML = `<main>${inner}</main><nav class="tabs">${[['home', '🎮 Play'], ['lab', '🧪 Lab'], ['shelf', '🏆 Shelf'], ['settings', '⚙️ Settings']].map(([k, l]) => `<button data-go="${k}" class="${k === tab ? 'on' : ''}"><span class="ti">${l.split(' ')[0]}</span>${l.split(' ').slice(1).join(' ')}</button>`).join('')}</nav>`;
  app.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { view = b.dataset.go; render(); });
}
function render() { ({ home, shelf, settings, lab: labView })[view](); window.scrollTo(0, 0); }
const app = document.getElementById('app');

/* ---------- home ---------- */
function gremlinTile(w) {
  const p = P(w);
  return `<div class="gremlin"><div class="e ${p.mastered || p.days.length || p.stage ? '' : 'egg'}">${w.emoji}</div><div class="n">${p.mastered ? esc(w.word) : `<span class="q">${'?'.repeat(Math.min(w.word.length, 8))}</span>`}</div><div class="pips">${pips(w)}</div></div>`;
}
function home() {
  const total = LIST.length, m = masteredCount(), t = today();
  const batchWords = LIST.slice(S.batchStart, S.unlocked);
  const extra = active().filter(w => !batchWords.includes(w));
  const tiles = batchWords.concat(extra);
  const todo = active().filter(w => P(w).lastCredit !== t).length;
  let cta;
  if (S.champion && dueChecks().length) cta = `<div class="card center"><div class="stat">🏆</div><h2>You tamed every gremlin!</h2></div><button class="btn primary" data-a="checkup">👻 Today's check-up</button><button class="btn" data-a="practice">Practice mix</button>`;
  else if (S.champion) cta = `<div class="card center"><div class="stat">🏆</div><h2>You tamed every gremlin!</h2><p class="mute">Add your own words in Settings, or keep sharp with some practice.</p></div><button class="btn primary" data-a="practice">Practice mix</button>`;
  else if (S.bossReady) cta = `<button class="btn boss" data-a="boss">⚔️ Boss battle!</button><p class="center mute">All ${tiles.length} gremlins are tamed. Beat the boss to unlock the next batch.</p>`;
  else if (todo === 0 && dueChecks().length) cta = `<button class="btn primary" data-a="checkup">👻 Today's check-up (${Math.min(S.settings.checks, dueChecks().length)} tamed word${Math.min(S.settings.checks, dueChecks().length) > 1 ? 's' : ''})</button><p class="center mute">Making sure tamed words are still tamed.</p>`;
  else if (todo > 0) cta = `<button class="btn primary" data-a="daily">▶ Today's training (${todo} gremlin${todo > 1 ? 's' : ''})</button>`;
  else cta = `<div class="card center"><div class="stat">✔</div><b>Today's training is done!</b><p class="mute">Come back tomorrow. Each gremlin needs to be spelled correctly on 3 different days.</p></div><button class="btn" data-a="practice">Extra practice</button>`;
  shell(`<div class="row sp"><h1>Word Gremlins</h1></div>
   <div class="row"><span class="chip">🔥 ${S.streak.count} day${S.streak.count === 1 ? '' : 's'}</span><span class="chip">⭐ ${S.stars}</span><span class="chip">🏆 ${m}/${total}</span></div>
   <div class="card"><div class="bar"><i style="width:${total ? Math.round(100 * m / total) : 0}%"></i></div><p class="sub" style="margin:8px 0 0">${m} of ${total} words mastered</p></div>
   <h3>This batch</h3><div class="grid">${tiles.map(gremlinTile).join('')}</div>
   <p class="mute center" style="margin:8px 0 0">●●● = 3 days correct = tamed</p>
   ${cta}
   ${(() => { const due = rulesDue(); return due.length ? `<button class="btn" data-go="lab">👻 Spelling Lab: ${due.length} rule check-up${due.length > 1 ? 's' : ''} due</button>` : `<button class="btn" data-go="lab">🧪 Spelling Lab: word endings &amp; homophones</button>`; })()}
   <details class="card"><summary>How it works</summary>
    <p>Each gremlin is a word. Train it through four rounds: <b>peek &amp; build</b>, <b>ghost letters</b>, <b>spot the saboteur</b>, and <b>listen &amp; write</b>.</p>
    <p>Spell it right from memory on <b>3 different days</b> and it's tamed. Tame the whole batch, beat the boss, and the next batch unlocks. Tamed gremlins sometimes ambush you later to check you still know them!</p><p>Words learned with <b>flashcards</b> can be added in Settings. They count as tamed and join the check-ups.</p></details>`, 'home');
  app.querySelectorAll('[data-a]').forEach(b => b.onclick = () => ({ daily: () => startSession('daily'), checkup: () => startSession('checkup'), practice: () => startSession('practice'), boss: startBoss })[b.dataset.a]());
}

/* ---------- shelf ---------- */
function shelf() {
  const rulesTamed = PACKS.filter(p => RP(p.id).mastered);
  shell(`<h1>Trophy shelf</h1><p class="sub">${masteredCount()} of ${LIST.length} gremlins tamed. Tap a tamed one to hear it. 🃏 = tamed with flashcards.</p>
   <div class="grid shelf">${LIST.map((w, i) => { const p = P(w); return p.mastered ? `<div class="gremlin" data-say="${esc(w.word)}"><div class="e">${w.emoji}</div><div class="n">${esc(w.word)}</div>${p.flash ? '<div class="pips">🃏</div>' : ''}</div>` : `<div class="gremlin"><div class="e egg">${i < S.unlocked ? w.emoji : '🥚'}</div><div class="n"><span class="q">?</span></div></div>`; }).join('')}</div>
   <h3>Rule gremlins</h3><p class="sub">${rulesTamed.length} of ${PACKS.length} rules tamed in the Spelling Lab.</p>
   <div class="grid shelf">${PACKS.map(p => RP(p.id).mastered ? `<div class="gremlin"><div class="e">${p.emoji}</div><div class="n" style="word-break:normal">${esc(p.name)}</div></div>` : `<div class="gremlin"><div class="e egg">${p.emoji}</div><div class="n"><span class="q">?</span></div></div>`).join('')}</div>`, 'shelf');
  app.querySelectorAll('[data-say]').forEach(e => e.onclick = () => speak(e.dataset.say));
}

/* ---------- settings ---------- */
function settings() {
  const s = S.settings;
  shell(`<h1>Settings</h1>
   <div class="card">
    <div class="field"><label>Speak words aloud</label><input type="checkbox" id="sSpeak" ${s.speak ? 'checked' : ''}></div>
    <div class="field"><label>Speaking speed</label><input type="range" id="sRate" min="0.5" max="1.1" step="0.05" value="${s.rate}"></div>
    <div class="field"><label>Sound effects</label><input type="checkbox" id="sSound" ${s.sound ? 'checked' : ''}></div>
    <div class="field"><label>Words per batch</label><input type="number" id="sBatch" min="3" max="12" value="${s.batch}"></div>
    <button class="btn small" id="testVoice">🔊 Test voice</button>
    ${installEvt ? '<button class="btn small primary" id="inst">Install app</button>' : ''}</div>
   <h3>🃏 Flashcard words</h3>
   <div class="card"><p class="sub">Words already learned with flashcards. They count as tamed straight away and turn up in check-ups to make sure they stick. Type or paste them (one per line, or separated by commas), or upload a text or CSV file. Words that aren't on the list are added to it.</p>
    <textarea id="flashIn" placeholder="necessary, rhythm, yacht" spellcheck="false"></textarea>
    <div class="row"><button class="btn small primary" id="flashAdd">Add as tamed</button><label class="btn small" style="text-align:center">📄 Upload file<input type="file" id="flashFile" accept=".txt,.csv,text/plain,text/csv" hidden></label></div>
    <div id="flashMsg" class="note" style="font-weight:700;margin:6px 0"></div>
    <div class="field"><label for="sChecks">Check-ups per day</label><input type="number" id="sChecks" min="0" max="10" value="${s.checks}"></div>
    ${flashList()}</div>
   <h3>Your own word list</h3>
   <div class="card"><p class="sub">One word per line. Optional: put <b>[brackets]</b> round the tricky letters (<code>ne[c]e[ss]ary</code>) and add a hint after <b>|</b> (<code>equip|equipped, equipment</code>). Plain lists work too.</p>
    <textarea id="custom" placeholder="necessary&#10;rhythm&#10;..." spellcheck="false">${esc(s.custom)}</textarea>
    <button class="btn small primary" id="saveList">Use this list</button> <button class="btn small" id="builtin">Use the built-in list (${BUILTIN.length} words)</button></div>
   <h3>Progress</h3>
   <div class="card"><p class="sub">Progress is saved on this device only. To move it to another device, copy the backup code and paste it there.</p>
    <textarea id="backup" spellcheck="false">${esc(JSON.stringify(S))}</textarea>
    <button class="btn small" id="copyB">Copy backup</button> <button class="btn small" id="restoreB">Restore from the box above</button>
    <button class="btn small ghost" id="reset">Reset all progress…</button></div>
   <p class="mute center">Word Gremlins · works offline once installed</p>`, 'settings');
  $('#sSpeak').onchange = e => { s.speak = e.target.checked; save(); };
  $('#sRate').onchange = e => { s.rate = +e.target.value; save(); };
  $('#sSound').onchange = e => { s.sound = e.target.checked; save(); };
  $('#sBatch').onchange = e => { s.batch = Math.max(3, Math.min(12, +e.target.value || 6)); if (!Object.values(S.words).some(p => p.days.length || p.stage)) S.unlocked = Math.min(LIST.length, s.batch); save(); };
  $('#sChecks').onchange = e => { s.checks = Math.max(0, Math.min(10, Math.round(+e.target.value) || 0)); save(); };
  $('#flashAdd').onclick = () => { const r = importFlash($('#flashIn').value); $('#flashIn').value = ''; showFlash(r); };
  $('#flashFile').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(txt => showFlash(importFlash(txt))); };
  wireFlashList();
  $('#testVoice').onclick = () => speak('necessary');
  if ($('#inst')) $('#inst').onclick = () => installEvt.prompt();
  $('#saveList').onclick = () => { s.custom = $('#custom').value; resetBatches(); save(); view = 'home'; render(); };
  $('#builtin').onclick = () => { s.custom = ''; resetBatches(); save(); view = 'home'; render(); };
  $('#copyB').onclick = () => { $('#backup').select(); try { navigator.clipboard.writeText($('#backup').value); } catch (e) { document.execCommand('copy'); } };
  $('#restoreB').onclick = () => { try { const o = JSON.parse($('#backup').value); if (!o || !o.words || !o.settings) throw 0; S = Object.assign(defaults(), o); buildList(); updateBoss(); save(); view = 'home'; render(); } catch (e) { $('#restoreB').textContent = 'That backup code did not look right'; setTimeout(() => { const b = $('#restoreB'); if (b) b.textContent = 'Restore from the box above'; }, 2500); } };
  $('#reset').onclick = () => { const r = $('#reset'); if (!r.dataset.sure) { r.dataset.sure = '1'; r.textContent = 'Tap again to erase all progress'; r.style.color = 'var(--bad)'; setTimeout(() => { if (r.isConnected) { delete r.dataset.sure; r.textContent = 'Reset all progress…'; r.style.color = ''; } }, 4000); return; } { const keep = S.settings; S = defaults(); S.settings = keep; buildList(); save(); view = 'home'; render(); } };
}
function flashList() {
  const fl = LIST.filter(w => P(w).flash);
  if (!fl.length) return '';
  return `<details><summary>${fl.length} flashcard word${fl.length > 1 ? 's' : ''}</summary><p class="sub">Tap ✕ to take a word off the flashcard list. It goes back to normal training.</p><div class="reveal">${fl.map(w => `<span class="chip">${P(w).mastered ? '' : '🏃 '}${esc(w.word)} <button class="x" style="width:26px;height:26px;font-size:13px;box-shadow:none" data-unflash="${esc(w.word)}" aria-label="Remove ${esc(w.word)}">✕</button></span>`).join('')}</div><p class="sub" style="margin-top:8px">🏃 = escaped in a check-up and back in training.</p></details>`;
}
function wireFlashList() {
  app.querySelectorAll('[data-unflash]').forEach(b => b.onclick = () => {
    const p = S.words[b.dataset.unflash]; if (!p) return;
    Object.assign(p, { flash: false, mastered: false, days: [], stage: 0, lastCredit: '', lastSeen: '', lastStageDay: '' });
    S.champion = false; S.bossReady = false; updateBoss(); save(); settings();
    const d = document.querySelector('details'); if (d) d.open = true;
  });
}
function importFlash(text) {
  const t = today(), r = { tamed: [], added: [], already: [], bad: [] };
  const items = String(text).split(/[\n\r,;\t]+/).map(x => x.trim()).filter(Boolean);
  const seen = new Set();
  for (const raw of items) {
    const e = parseEntry(raw); const w0 = e.word.replace(/[^a-z'-]/g, '');
    if (!w0 || w0.length < 2 || w0 !== e.word || seen.has(w0)) { if (raw && !seen.has(w0)) r.bad.push(raw); continue; }
    seen.add(w0);
    if (!BY[w0]) { S.settings.extra = (S.settings.extra || []).concat(raw); r.added.push(w0); }
  }
  buildList();
  for (const w0 of seen) {
    const p = S.words[w0]; if (!p) continue;
    if (p.mastered) { if (!r.added.includes(w0)) r.already.push(w0); continue; }
    Object.assign(p, { flash: true, mastered: true, days: [t, t, t], stage: 3, lastCredit: t, lastSeen: '', lastStageDay: t });
    if (!r.added.includes(w0)) r.tamed.push(w0);
  }
  S.champion = false; updateBoss();
  if (LIST.every(w => P(w).mastered) && !S.bossReady) S.champion = S.unlocked >= LIST.length;
  save(); return r;
}
function showFlash(r) {
  const parts = [];
  if (r.tamed.length) parts.push(`${r.tamed.length} marked as tamed`);
  if (r.added.length) parts.push(`${r.added.length} new word${r.added.length > 1 ? 's' : ''} added (${r.added.join(', ')})`);
  if (r.already.length) parts.push(`${r.already.length} already tamed`);
  if (r.bad.length) parts.push(`skipped: ${r.bad.slice(0, 5).join(', ')}`);
  settings();
  $('#flashMsg').textContent = parts.length ? '✔ ' + parts.join(' · ') : 'No words found.';
  $('#flashMsg').scrollIntoView({ block: 'center' });
}
function resetBatches() { S.unlocked = S.settings.batch; S.batchStart = 0; S.bossReady = false; S.champion = false; buildList(); updateBoss(); }

/* ---------- question scaffolding ---------- */
function qScreen(ctx, body) {
  app.innerHTML = `<main class="q"><div class="top"><button class="x" id="quit" aria-label="Quit">✕</button><div class="meta">${ctx.meta}<br>${ctx.sub || ''}</div><div class="chip">⭐ ${S.stars}</div></div>
   <div class="gr">${ctx.w.emoji}</div><h2 class="prompt">${ctx.prompt}</h2><div id="body">${body}</div><div id="fb"></div></main>`;
  $('#quit').onclick = () => { try { speechSynthesis.cancel(); } catch (e) { } view = 'home'; sess = boss = null; render(); };
}
function typeBox(ctx, placeholder) {
  return `<input id="ans" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${placeholder}"><button class="btn primary" id="check">Check</button>`;
}
function wireType(ctx) {
  const go = () => { const v = $('#ans').value.trim().toLowerCase(); if (!v) return; answered(ctx, v === ctx.w.word, v); };
  $('#check').onclick = go; $('#ans').onkeydown = e => { if (e.key === 'Enter') go(); }; $('#ans').focus();
}
function answered(ctx, ok, typed) {
  beep(ok);
  const msg = ctx.onAnswer(ok);
  const body = $('#body'); body.classList.add('dim'); body.querySelectorAll('input,button').forEach(e => e.disabled = true);
  const fb = $('#fb'), w = ctx.w;
  if (ok || ctx.gentle) {
    fb.innerHTML = `<div class="fb ok"><div class="big">${ok ? '✔ ' + (ctx.okText || 'Correct!') : 'Nearly there! We\'ll go again.'}</div><div class="word">${wordMarked(w)}</div>${w.hint ? `<div class="note">${esc(w.hint)}</div>` : ''}<div class="note">${msg || ''}</div><button class="btn primary" id="next">Next →</button></div>`;
    $('#next').onclick = ctx.next; $('#next').focus();
    if (ok && msg && /Tamed/.test(msg)) confetti([w.emoji, '⭐', '🎉']);
  } else {
    const d = typed ? diffHTML(w.word, typed) : { a: wordMarked(w), b: '' };
    fb.innerHTML = `<div class="fb bad"><div class="big">Not quite</div><div class="word">${d.a}</div>${typed ? `<div class="you">You wrote: ${d.b}</div>` : ''}${w.hint ? `<div class="note">${esc(w.hint)}</div>` : ''}<div class="note">${msg || ''}</div>
     <label for="fix">Now type it correctly:</label><input id="fix" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><button class="btn primary" id="next" disabled>Next →</button></div>`;
    const fix = $('#fix'), nx = $('#next');
    fix.oninput = () => { nx.disabled = fix.value.trim().toLowerCase() !== w.word; };
    fix.onkeydown = e => { if (e.key === 'Enter' && !nx.disabled) ctx.next(); };
    nx.onclick = ctx.next; fix.focus();
  }
  fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function diffHTML(a, b) {
  const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ma = new Array(n).fill(false), mb = new Array(m).fill(false); let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { ma[i] = mb[j] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  return { a: [...a].map((c, k) => ma[k] ? esc(c) : `<span class="miss">${esc(c)}</span>`).join(''), b: [...b].map((c, k) => mb[k] ? esc(c) : `<span class="extra">${esc(c)}</span>`).join('') };
}
const hearBtns = w => `<div class="row" style="justify-content:center"><button class="btn small" id="hear">🔊 Hear it</button><button class="btn small ghost" id="slow">🐢 Slowly</button></div>`;
function wireHear(w) { const h = $('#hear'); if (!h) return; if (!canSpeak()) { h.style.display = 'none'; $('#slow').style.display = 'none'; return; } h.onclick = () => speak(w.word); $('#slow').onclick = () => speak(w.word, true); }

/* ---------- the four rounds ---------- */
function qBuild(ctx) {
  const w = ctx.w, L = [...w.word]; ctx.prompt = 'Look closely, then build it';
  qScreen(ctx, `<div id="peek"><div class="bigword">${wordMarked(w)}</div><div class="bar"><i id="fill" style="transition:width 5s linear"></i></div><button class="btn" id="ready">I've got it →</button>${hearBtns(w)}</div>`);
  wireHear(w); speak(w.word);
  requestAnimationFrame(() => requestAnimationFrame(() => { const f = $('#fill'); if (f) f.style.width = '100%'; }));
  const timer = setTimeout(build, 5000); $('#ready').onclick = () => { clearTimeout(timer); build(); };
  function build() {
    if (!$('#peek')) return;
    let tiles = shuffle(L); if (L.length > 1) while (tiles.join('') === w.word) tiles = shuffle(L);
    let pos = 0, wrong = 0;
    $('.prompt').textContent = 'Tap the letters in order';
    $('#body').innerHTML = `<div class="slots">${L.map(() => '<span class="slot"></span>').join('')}</div><div class="tiles">${tiles.map((c, i) => `<button class="tile" data-i="${i}">${esc(c)}</button>`).join('')}</div><div id="peekshow" class="bigword" style="display:none">${wordMarked(w)}</div><div class="row" style="justify-content:center"><button class="btn small ghost" id="again">👀 Peek again (costs a point)</button></div>${hearBtns(w)}`;
    wireHear(w);
    const slots = [...document.querySelectorAll('.slot')];
    $('#again').onclick = () => { wrong++; const s = $('#peekshow'); s.style.display = 'block'; setTimeout(() => s.style.display = 'none', 2500); };
    document.querySelectorAll('.tile').forEach(t => t.onclick = () => {
      if (t.textContent === L[pos]) { slots[pos].textContent = t.textContent; t.disabled = true; pos++; if (pos === L.length) setTimeout(() => answered(ctx, wrong <= 2, null), 250); }
      else { wrong++; t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); beep(false); }
    });
  }
}
function qGhost(ctx) {
  const w = ctx.w, L = [...w.word], p = P(w); ctx.prompt = 'Fill in the ghost letters';
  const want = Math.min(L.length - 1, Math.max(2, Math.round(L.length * (0.35 + 0.1 * p.days.length))));
  const tricky = shuffle(L.map((_, i) => i).filter(i => w.marks[i])), rest = shuffle(L.map((_, i) => i).filter(i => !w.marks[i]));
  const hid = new Set(tricky.concat(rest).slice(0, want));
  qScreen(ctx, `<div class="slots">${L.map((c, i) => hid.has(i) ? '<span class="slot blank"></span>' : `<span class="slot">${esc(c)}</span>`).join('')}</div>${hearBtns(w)}${typeBox(ctx, 'Type the whole word')}`);
  wireHear(w); wireType(ctx);
}
function mutants(w) {
  const L = w.word, out = new Set(), idx = L.split('').map((_, i) => i).filter(i => w.marks[i]); const pool = idx.length ? idx : L.split('').map((_, i) => i);
  const V = 'aeiou', cons = c => /[a-z]/.test(c) && !V.includes(c);
  const tries = [
    i => L[i] === L[i + 1] ? L.slice(0, i) + L.slice(i + 1) : null,
    i => i > 0 && cons(L[i]) && L[i] !== L[i + 1] && L[i] !== L[i - 1] ? L.slice(0, i + 1) + L[i] + L.slice(i + 1) : null,
    i => L.slice(i, i + 2) === 'ei' ? L.slice(0, i) + 'ie' + L.slice(i + 2) : L.slice(i, i + 2) === 'ie' ? L.slice(0, i) + 'ei' + L.slice(i + 2) : null,
    i => i < L.length - 1 && L[i] !== L[i + 1] ? L.slice(0, i) + L[i + 1] + L[i] + L.slice(i + 2) : null,
    i => V.includes(L[i]) ? L.slice(0, i) + shuffle(V.split('').filter(v => v !== L[i]))[0] + L.slice(i + 1) : null,
    i => L.length > 3 ? L.slice(0, i) + L.slice(i + 1) : null,
    i => L[i] === 'c' ? L.slice(0, i) + 's' + L.slice(i + 1) : L[i] === 's' ? L.slice(0, i) + 'c' + L.slice(i + 1) : null,
  ];
  for (const i of shuffle(pool)) for (const t of shuffle(tries)) { const r = t(i); if (r && r !== L) out.add(r); }
  if (out.size < 2) for (let i = 1; i < L.length - 1 && out.size < 4; i++) out.add(L.slice(0, i) + L[i + 1] + L[i] + L.slice(i + 2));
  out.delete(L); return shuffle([...out]).slice(0, 2);
}
function qSpot(ctx) {
  const w = ctx.w; ctx.prompt = 'Which spelling is right?';
  const opts = shuffle([w.word, ...mutants(w)]);
  qScreen(ctx, `<div class="opts">${opts.map(o => `<button class="opt" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`);
  document.querySelectorAll('.opt').forEach(b => b.onclick = () => { const ok = b.dataset.v === w.word; document.querySelectorAll('.opt').forEach(x => { if (x.dataset.v === w.word) x.classList.add('right'); }); if (!ok) b.classList.add('wrong'); answered(ctx, ok, ok ? null : b.dataset.v); });
}
function qWrite(ctx) {
  const w = ctx.w; ctx.prompt = canSpeak() ? 'Listen, then write it' : 'Write the word';
  const hintTxt = canSpeak() ? '' : `<div class="slots">${[...w.word].map((c, i) => i === 0 ? `<span class="slot">${esc(c)}</span>` : '<span class="slot blank"></span>').join('')}</div><p class="center mute">Speech isn't available here, so here's the first letter.</p>`;
  qScreen(ctx, `${hintTxt}${hearBtns(w)}${typeBox(ctx, 'Type the word')}`);
  wireHear(w); wireType(ctx); speak(w.word);
}

/* ---------- training session ---------- */
function newDayPrep(w) { const p = P(w), t = today(); if (p.lastStageDay !== t) { p.stage = p.days.length > 0 ? 2 : Math.min(p.stage, 2); p.lastStageDay = t; } }
function dueChecks() {
  const t = today();
  const due = shuffle(LIST.filter(w => { const p = P(w); return p.mastered && p.lastSeen !== t && ((p.flash && !p.lastSeen) || (p.days[p.days.length - 1] !== t && (!p.lastSeen || dayDiff(p.lastSeen, t) >= 2))); }));
  return due.sort((a, b) => (P(a).lastSeen || '').localeCompare(P(b).lastSeen || ''));
}
function pickAmbush() {
  const t = today();
  return dueChecks().slice(0, S.settings.checks);
}
function startSession(mode) {
  const t = today(); let queue, amb = [];
  if (mode === 'checkup') { queue = []; amb = pickAmbush(); }
  else if (mode === 'daily') { queue = shuffle(active().filter(w => P(w).lastCredit !== t)); queue.forEach(newDayPrep); if (!S.bossReady) amb = pickAmbush(); }
  else { queue = shuffle(unlockedWords().filter(w => !P(w).mastered)).concat(shuffle(unlockedWords().filter(w => P(w).mastered)).slice(0, 4)).slice(0, 8); }
  sess = { mode, queue, ambush: amb, asked: {}, last: '', ans: 0, stats: { stars: 0, credited: [], mastered: [], escaped: [], parked: [] }, startStars: S.stars };
  save(); nextQ();
}
function nextQ() {
  let w, amb = false;
  if (sess.queue.length) { const i = sess.queue.length > 1 && sess.queue[0].word === sess.last ? 1 : 0; w = sess.queue.splice(i, 1)[0]; }
  else if (sess.ambush.length) { w = sess.ambush.shift(); amb = true; }
  else return finishSession();
  sess.last = w.word;
  const stage = amb ? 3 : sess.mode === 'practice' ? 2 + rnd(2) : P(w).stage;
  const left = sess.queue.length + 1;
  const ctx = {
    w, stage, amb, gentle: stage === 0 && !amb && sess.mode !== 'practice',
    meta: amb ? '👻 Ambush! A tamed gremlin is back' : sess.mode === 'practice' ? 'Practice' : `Round ${stage + 1} of 4 · ${NAMES[stage]}`,
    sub: amb ? '' : `${left} to go`,
    onAnswer: ok => grade(w, stage, ok, amb),
    next: () => { afterAnswer(w, amb); nextQ(); }
  };
  curQ = { w, stage }; [qBuild, qGhost, qSpot, qWrite][stage](ctx);
}
function grade(w, stage, ok, amb) {
  const p = P(w), t = today(); sess.ans++; let msg = '', stars = 0;
  if (sess.mode === 'practice') { if (ok) stars = 2; S.stars += stars; sess.stats.stars += stars; save(); return ok ? '+2 ⭐' : ''; }
  if (amb) {
    if (ok) { p.lastSeen = t; stars = 5; msg = 'Still tamed! +5 ⭐'; (sess.checked = sess.checked || []).push(w); }
    else { p.mastered = false; p.days = p.days.slice(0, 2); p.stage = 2; p.lastStageDay = t; S.bossReady = false; sess.stats.escaped.push(w); msg = 'It escaped! It needs a bit more training.'; }
  } else {
    sess.asked[w.word] = (sess.asked[w.word] || 0) + 1;
    if (ok) {
      stars = [2, 4, 6, 10][stage];
      if (stage < 3) p.stage = stage + 1;
      else if (p.lastCredit !== t) {
        p.lastCredit = t; p.days.push(t); sess.stats.credited.push(w);
        if (p.days.length >= 3) { p.mastered = true; p.lastSeen = t; sess.stats.mastered.push(w); msg = 'Tamed for good! 🎉'; }
        else msg = `Day ${p.days.length} of 3 ✔`;
      }
      msg += (msg ? ' · ' : '') + `+${stars} ⭐`;
    } else { p.misses++; p.stage = Math.max(0, stage - 1); msg = stage === 0 ? '' : 'Back one round to build it up again.'; }
  }
  S.stars += stars; sess.stats.stars += stars; updateBoss(); save(); return msg;
}
function afterAnswer(w, amb) {
  if (sess.mode !== 'daily' || amb) return;
  const p = P(w);
  if (!p.mastered && p.lastCredit !== today()) { if ((sess.asked[w.word] || 0) < 8) sess.queue.push(w); else if (!sess.stats.parked.includes(w)) sess.stats.parked.push(w); }
}
function finishSession() {
  const st = sess.stats, t = today();
  if (sess.ans > 0 && sess.mode !== 'practice') { const last = S.streak.last; if (last !== t) { S.streak.count = last && dayDiff(last, t) === 1 ? S.streak.count + 1 : 1; S.streak.last = t; } }
  updateBoss(); save();
  const chips = l => `<div class="reveal">${l.map(w => `<span class="chip">${w.emoji} ${esc(w.word)}</span>`).join('')}</div>`;
  if (sess.ans === 0) { app.innerHTML = `<main class="center"><div class="gr">😴</div><h2>Nothing to train right now</h2><p class="mute">Come back tomorrow, or try some extra practice.</p><button class="btn primary" id="hm">Back</button></main>`; $('#hm').onclick = () => { view = 'home'; render(); }; sess = null; return; }
  app.innerHTML = `<main class="center"><div class="gr">🎉</div><h1>${sess.mode === 'practice' ? 'Practice done!' : sess.mode === 'checkup' ? 'Check-up done!' : 'Training complete!'}</h1>
   <div class="card"><div class="stat">+${st.stars} ⭐</div><div class="mute">🔥 ${S.streak.count}-day streak</div></div>
   ${st.mastered.length ? `<div class="card"><b>Tamed today!</b>${chips(st.mastered)}</div>` : ''}
   ${st.credited.length && !st.mastered.length ? `<div class="card"><b>${st.credited.length} word${st.credited.length > 1 ? 's' : ''} got a day ticked off</b></div>` : ''}
   ${st.escaped.length ? `<div class="card"><b>Escaped gremlins</b> (back in training)${chips(st.escaped)}</div>` : ''}
   ${sess.checked && sess.checked.length ? `<div class="card"><b>Still tamed</b>${chips(sess.checked)}</div>` : ''}
   ${st.parked.length ? `<div class="card"><b>Tricky ones: we'll try again tomorrow</b>${chips(st.parked)}</div>` : ''}
   ${S.bossReady ? '<button class="btn boss" id="bb">⚔️ Boss battle unlocked!</button>' : ''}<button class="btn ${S.bossReady ? '' : 'primary'}" id="hm">Done</button></main>`;
  if (st.mastered.length) confetti(['🎉', '⭐', ...st.mastered.map(w => w.emoji)]);
  $('#hm').onclick = () => { view = 'home'; render(); }; if ($('#bb')) $('#bb').onclick = startBoss; sess = null;
}

/* ---------- boss ---------- */
function startBoss() {
  const words = shuffle(LIST.slice(S.batchStart, S.unlocked));
  boss = { words, i: 0, hearts: 3, missed: [] }; bossNext();
}
function bossNext() {
  if (boss.hearts <= 0) return bossEnd(false);
  if (boss.i >= boss.words.length) return bossEnd(true);
  const w = boss.words[boss.i];
  const ctx = {
    w, stage: 3, okText: 'Direct hit!', meta: `👹 Boss battle · ${'❤️'.repeat(boss.hearts)}${'🖤'.repeat(3 - boss.hearts)}`,
    sub: `Boss health: ${'█'.repeat(boss.words.length - boss.i)}${'░'.repeat(boss.i)}`,
    onAnswer: ok => { if (ok) { P(w).lastSeen = today(); S.stars += 10; return 'The boss staggers! +10 ⭐'; } boss.hearts--; boss.missed.push(w); return 'Ouch! You lost a heart.'; },
    next: () => { boss.i++; bossNext(); }
  };
  curQ = { w, stage: 3 }; qWrite(ctx);
}
function bossEnd(win) {
  const b = boss; boss = null;
  if (win) {
    S.stars += 50; S.bossReady = false;
    if (S.unlocked >= LIST.length) S.champion = true; else { S.batchStart = S.unlocked; S.unlocked = Math.min(LIST.length, S.unlocked + S.settings.batch); }
    save(); confetti(['🏆', '⭐', '🎉', '👹']);
    app.innerHTML = `<main class="center"><div class="gr">🏆</div><h1>Boss defeated!</h1><p>+50 ⭐</p><p class="mute">${S.champion ? 'You have tamed every gremlin!' : 'A new batch of gremlins has appeared.'}</p><button class="btn primary" id="hm">Meet the new gremlins</button></main>`;
  } else {
    b.missed.forEach(w => { const p = P(w); p.mastered = false; p.days = p.days.slice(0, 2); p.stage = 2; p.lastStageDay = today(); });
    S.bossReady = false; save();
    app.innerHTML = `<main class="center"><div class="gr">💥</div><h1>The boss got away!</h1><p class="mute">These gremlins need another day of training:</p><div class="reveal">${b.missed.map(w => `<span class="chip">${w.emoji} ${esc(w.word)}</span>`).join('')}</div><button class="btn primary" id="hm">Back to training</button></main>`;
  }
  $('#hm').onclick = () => { view = 'home'; render(); };
}

/* ---------- spelling lab: rule & homophone gremlins ---------- */
const pick = a => a[rnd(a.length)];
const yied = b => /[^aeiou]y$/.test(b) ? b.slice(0, -1) + 'ied' : b + 'ed';
const norm = s => String(s).trim().toLowerCase().replace(/[‘’`´]/g, "'");
const RULE_ADD_ED = 'Just add -ed', RULE_ADD_D = 'Just add -d', RULE_DBL = 'Double the last letter, add -ed', RULE_Y = 'Change y to i, add -ed';

const Y_CONS = ['cry', 'dry', 'try', 'fry', 'spy', 'carry', 'hurry', 'worry', 'copy', 'marry', 'bury', 'study', 'empty', 'deny', 'reply', 'apply', 'rely', 'supply', 'envy', 'multiply', 'tidy', 'pity'];
const Y_VOW = ['play', 'stay', 'enjoy', 'obey', 'destroy', 'delay', 'annoy', 'pray', 'spray', 'employ', 'sway'];
const ED = {
  plain: ['jump', 'walk', 'look', 'help', 'crash', 'laugh', 'rain', 'kick', 'wish', 'paint', 'climb', 'shout', 'visit', 'open', 'happen', 'enter', 'offer', 'order', 'listen', 'gather', 'answer', 'remember', 'garden', 'fix', 'mix', 'relax', 'snow', 'show', 'allow'],
  e: ['bake', 'smile', 'hope', 'dance', 'decide', 'arrive', 'change', 'chase', 'invite', 'like', 'rescue', 'believe', 'scare', 'wave', 'close', 'share', 'tape', 'race'],
  dbl: ['stop', 'hop', 'plan', 'drop', 'clap', 'grab', 'skip', 'rob', 'chat', 'beg', 'nod', 'shop', 'slip', 'trip', 'hug', 'jog', 'tap', 'wag', 'admit', 'prefer', 'occur', 'refer', 'regret'],
  ukl: ['travel', 'cancel', 'label', 'marvel', 'signal', 'quarrel', 'level', 'model'],
  y: ['cry', 'carry', 'hurry', 'worry', 'copy', 'study', 'reply', 'tidy', 'play', 'enjoy', 'stay', 'destroy']
};
const ED_NOTE = {
  visit: 'VIS-it: the beat is at the start, so don\'t double the t.', open: 'O-pen: the beat is at the start, so don\'t double the n.',
  happen: 'HAP-pen: the beat is at the start, so don\'t double the n.', enter: 'EN-ter: the beat is at the start, so don\'t double the r.',
  offer: 'OF-fer: the beat is at the start, so don\'t double the r.', order: 'OR-der: the beat is at the start, so don\'t double the r.',
  listen: 'LIS-ten: the beat is at the start, so don\'t double the n.', gather: 'GATH-er: the beat is at the start, so don\'t double the r.',
  answer: 'AN-swer: the beat is at the start, so don\'t double the r.', remember: 're-MEM-ber: the beat isn\'t on the end, so don\'t double the r.',
  garden: 'GAR-den: the beat is at the start, so don\'t double the n.',
  fix: 'Never double w, x or y.', mix: 'Never double w, x or y.', relax: 'Never double w, x or y.', snow: 'Never double w, x or y.', show: 'Never double w, x or y.', allow: 'Never double w, x or y.',
  admit: 'ad-MIT: the beat is on the end, so double the t.', prefer: 'pre-FER: the beat is on the end, so double the r.',
  occur: 'oc-CUR: the beat is on the end, so double the r.', refer: 're-FER: the beat is on the end, so double the r.', regret: 're-GRET: the beat is on the end, so double the t.'
};
function edForm(cat, b) { return cat === 'plain' ? b + 'ed' : cat === 'e' ? b + 'd' : cat === 'dbl' ? b + b.slice(-1) + 'ed' : cat === 'ukl' ? b + 'led' : yied(b); }
function edRule(cat, b) { return cat === 'plain' ? RULE_ADD_ED : cat === 'e' ? RULE_ADD_D : cat === 'dbl' || cat === 'ukl' ? RULE_DBL : /[^aeiou]y$/.test(b) ? RULE_Y : RULE_ADD_ED; }
function edExplain(cat, b) {
  const f = edForm(cat, b);
  if (cat === 'y') return yExplain(b);
  const base = { plain: 'Just add <b>-ed</b>.', e: `<b>${b}</b> already ends in <b>e</b>, so just add <b>-d</b>.`, dbl: `Short vowel + one consonant at the end, so double it: <b>${f}</b>.`, ukl: `In British spelling, an <b>l</b> after one vowel doubles: <b>${f}</b>.` }[cat];
  const extra = ED_NOTE[b] || (b === 'hope' ? 'Compare: hop → hopped (short o), hope → hoped (long o).' : b === 'hop' ? 'Compare: hope → hoped (long o), hop → hopped (short o).' : '');
  return base + (extra ? '<br>' + extra : '');
}
function yExplain(b) {
  const prev = b[b.length - 2];
  return /[^aeiou]y$/.test(b)
    ? `<b>${prev}</b>y: y comes after a consonant, so change <b>y</b> to <b>i</b> and add <b>-ed</b>: ${b} → <b>${yied(b)}</b>.`
    : `<b>${prev}</b>y: y comes after a vowel, so keep the y and just add <b>-ed</b>: ${b} → <b>${yied(b)}</b>.`;
}
function wrongEds(b, right) {
  const c = [b + 'ed', b + 'd', b + b.slice(-1) + 'ed', b.slice(0, -1) + 'ied', b.slice(0, -1) + 'ed', b.endsWith('e') ? b.slice(0, -1) + 'ed' : null, b.endsWith('e') ? b + 'ed' : null];
  return shuffle([...new Set(c.filter(x => x && x !== right && !(x.endsWith('ied') && !b.endsWith('y'))))]).slice(0, 2);
}

const CIOUS = [
  { w: 'spacious', root: 'space', clue: 'having lots of room' }, { w: 'gracious', root: 'grace', clue: 'kind and polite' },
  { w: 'vicious', root: 'vice', clue: 'fierce and cruel' }, { w: 'malicious', root: 'malice', clue: 'meaning to cause harm' },
  { w: 'suspicious', root: 'suspicion', clue: 'not trusting someone' }, { w: 'precious', clue: 'worth a lot; much loved' },
  { w: 'delicious', clue: 'tasting very good' }, { w: 'conscious', clue: 'awake and aware', note: 'Watch the <b>sc</b>: con-<b>sc</b>ious.' },
  { w: 'ferocious', clue: 'fierce and wild' }, { w: 'atrocious', clue: 'very bad' },
  { w: 'ambitious', root: 'ambition', clue: 'wanting to succeed' }, { w: 'cautious', root: 'caution', clue: 'careful to avoid danger' },
  { w: 'fictitious', root: 'fiction', clue: 'made up, not real' }, { w: 'infectious', root: 'infection', clue: 'easily spread' },
  { w: 'nutritious', root: 'nutrition', clue: 'full of goodness to eat' }, { w: 'superstitious', root: 'superstition', clue: 'believing in luck and omens' },
  { w: 'anxious', clue: 'worried', note: 'The odd one out: <b>anxious</b> ends in <b>-xious</b>.' }
];
const sufOf = w => w.endsWith('xious') ? '-xious' : w.endsWith('tious') ? '-tious' : '-cious';
function ciousExplain(it) {
  const s = sufOf(it.w), stem = it.w.slice(0, -5);
  let t = it.root
    ? (/ce$/.test(it.root) ? `<b>${it.root}</b> ends in <b>-ce</b>, so it's ${stem}<b>cious</b>.` : /cion$/.test(it.root) ? `<b>${it.root}</b> has a <b>c</b>, so it's ${stem}<b>cious</b>.` : `<b>${it.root}</b> ends in <b>-tion</b>, so it's ${stem}<b>tious</b>.`)
    : (s === '-xious' ? '' : `No root word to help with this one. Just learn it: ${stem}<b>${s.slice(1)}</b>.`);
  return t + (it.note ? (t ? '<br>' : '') + it.note : '');
}

const HOMO = {
  there: {
    words: ['there', 'their', "they're"],
    tips: { there: '<b>there</b> is a place. It has <b>here</b> inside it: t<b>here</b>.', their: '<b>their</b> means it belongs to them. It has <b>heir</b> inside it, and an heir owns things.', "they're": "<b>they're</b> = <b>they are</b>. The apostrophe takes the place of the missing <b>a</b>." },
    s: [['Put the box over ___.', 'there'], ['___ is a fox in the garden.', 'there'], ['Is anybody ___?', 'there'], ['___ were three cakes left.', 'there'], ['We left our bikes over ___ by the gate.', 'there'],
      ['The children grabbed ___ coats.', 'their'], ['The twins forgot ___ lunchboxes.', 'their'], ['Birds build ___ nests in spring.', 'their'], ['My neighbours painted ___ door red.', 'their'], ['The players cheered for ___ captain.', 'their'],
      ["___ going to the park after school.", "they're"], ["I think ___ late again.", "they're"], ["Look at those puppies. ___ so tiny!", "they're"], ["___ not allowed to run in the corridor.", "they're"], ["Ask them if ___ coming to the party.", "they're"]]
  },
  your: {
    words: ['your', "you're"],
    tips: { your: '<b>your</b> means it belongs to you.', "you're": "<b>you're</b> = <b>you are</b>. Say \"you are\" in the gap. If it makes sense, use <b>you're</b>." },
    s: [['Don\'t forget ___ coat.', 'your'], ['Is this ___ pencil case?', 'your'], ['Please wash ___ hands.', 'your'], ['___ brother is at the door.', 'your'], ['I like ___ new haircut.', 'your'], ['Tidy ___ bedroom before tea.', 'your'],
      ["___ going to love this book.", "you're"], ["I think ___ right.", "you're"], ["If ___ hungry, have an apple.", "you're"], ["___ the best goalkeeper in the team.", "you're"], ["Tell me when ___ ready.", "you're"], ["___ welcome to join us.", "you're"]]
  },
  of: {
    words: ['of', 'off'],
    tips: { of: '<b>of</b> sounds like "ov": a cup <b>of</b> tea, made <b>of</b> wood.', off: '<b>off</b> is the opposite of <b>on</b>. It sounds like "awf" and has a double <b>f</b>.' },
    s: [['Can I have a glass ___ water?', 'of'], ['She is the tallest ___ the three.', 'of'], ['A bunch ___ flowers sat on the table.', 'of'], ['The chair is made ___ wood.', 'of'], ['Most ___ the class went on the trip.', 'of'], ['I\'m tired ___ waiting.', 'of'],
      ['Please turn ___ the lights.', 'off'], ['The cat jumped ___ the wall.', 'off'], ['Take ___ your muddy boots.', 'off'], ['The rocket blasted ___ at noon.', 'off'], ['My hat blew ___ in the wind.', 'off'], ['He fell ___ his bike.', 'off']]
  },
  to: {
    words: ['to', 'too', 'two'],
    tips: { to: '<b>to</b> is for going somewhere or doing something: go <b>to</b> school, want <b>to</b> play.', too: '<b>too</b> means "also" or "more than enough". It has one <b>o</b> too many!', two: '<b>two</b> is the number 2. It starts with <b>tw</b>, like <b>tw</b>ins and <b>tw</b>elve.' },
    s: [['We walked ___ the shops.', 'to'], ['I want ___ go home.', 'to'], ['Give the book ___ me.', 'to'], ['My dog likes ___ chase balls.', 'to'],
      ['This soup is ___ hot.', 'too'], ['Can I come ___?', 'too'], ['There were ___ many people on the bus.', 'too'], ['I like apples and pears ___.', 'too'],
      ['I have ___ sisters.', 'two'], ['The film starts at ___ o\'clock.', 'two'], ['She ate ___ slices of pizza.', 'two'], ['A bicycle has ___ wheels.', 'two']]
  },
  its: {
    words: ['its', "it's"],
    tips: { its: '<b>its</b> means it belongs to it. Like <b>his</b> and <b>hers</b>, it has no apostrophe.', "it's": "<b>it's</b> = <b>it is</b> or <b>it has</b>. The apostrophe takes the place of the missing letters." },
    s: [['The dog wagged ___ tail.', 'its'], ['The tree lost ___ leaves.', 'its'], ['The school changed ___ uniform.', 'its'], ['Every bird has ___ own song.', 'its'], ['The rabbit hid in ___ burrow.', 'its'],
      ["___ raining again.", "it's"], ["I think ___ time for bed.", "it's"], ["___ been a long day.", "it's"], ["Look, ___ snowing!", "it's"], ["___ my turn next.", "it's"]]
  }
};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function homoQ(key, typed) {
  const h = HOMO[key], [sent, ans] = pick(h.s), start = sent.startsWith('___');
  const show = x => start ? cap(x) : x;
  const html = `<div class="sentence">${esc(sent).replace('___', '<span class="gap">?</span>')}</div>`;
  const filled = sent.replace('___', `<b>${esc(show(ans))}</b>`);
  return {
    kind: typed ? 'type' : 'choice', prompt: typed ? 'Type the missing word' : 'Which word fits?', html, answer: ans, options: h.words.map(show), shown: show(ans),
    explain: `${filled}<br>${h.tips[ans]}`, placeholder: 'Type the missing word'
  };
}
function yQ(level) {
  const b = rnd(10) < 7 ? pick(Y_CONS) : pick(Y_VOW), f = yied(b), r = rnd(10);
  if (r < 3 + level * 2) return { kind: 'type', prompt: 'Add <b>-ed</b>', html: `<div class="bigword">${b} + ed</div>`, answer: f, say: f, explain: yExplain(b) };
  return { kind: 'choice', prompt: `Which is the right spelling of <b>${b}</b> + ed?`, html: '', answer: f, options: shuffle([f, ...wrongEds(b, f)]), explain: yExplain(b) };
}
function edQ(level) {
  const cats = ['plain', 'e', 'e', 'dbl', 'dbl', 'dbl', 'ukl', 'y', 'plain'], cat = pick(cats), b = pick(ED[cat]), f = edForm(cat, b), r = rnd(10);
  const ex = edExplain(cat, b);
  if (r < 2) return { kind: 'choice', prompt: `How do you add <b>-ed</b> to <b>${b}</b>?`, html: '', answer: edRule(cat, b), options: [RULE_ADD_ED, RULE_ADD_D, RULE_DBL, RULE_Y], small: true, review: f, explain: `${b} → <b>${f}</b><br>${ex}` };
  if (r < 4 - level) return { kind: 'choice', prompt: `Which is the right spelling of <b>${b}</b> + ed?`, html: '', answer: f, options: shuffle([f, ...wrongEds(b, f)]), explain: ex };
  return { kind: 'type', prompt: 'Add <b>-ed</b>', html: `<div class="bigword">${b} + ed</div>`, answer: f, say: f, explain: ex };
}
function ciousQ(level) {
  const it = pick(CIOUS), stem = it.w.slice(0, -5), s = sufOf(it.w), r = rnd(10);
  const rootLine = it.root ? `<p class="center mute">Root word: <b>${it.root}</b></p>` : '';
  if (r < 6 - level * 2) return { kind: 'choice', prompt: `Which ending? <span class="mute">(${it.clue})</span>`, html: `<div class="bigword">${stem}______</div>${rootLine}`, answer: s, options: s === '-xious' ? ['-cious', '-tious', '-xious'] : ['-cious', '-tious'], review: it.w, explain: `<b>${it.w}</b><br>${ciousExplain(it)}`, say: it.w };
  return { kind: 'type', prompt: `Write the word that means <b>${it.clue}</b>`, html: `${rootLine}<p class="center mute">It ends in -cious, -tious or -xious.</p>`, answer: it.w, say: it.w, explain: ciousExplain(it), placeholder: 'Type the word' };
}

const PACKS = [
  { id: 'yied', group: 'Word endings', name: 'y → ied', emoji: '🦎', eg: 'cry → cried · play → played', gen: (lv) => yQ(lv),
    intro: '<p>When a word ends in <b>y</b>, look at the letter before it.</p><p><b>Consonant + y</b>: change the y to <b>i</b> and add <b>-ed</b>.<br>cry → cr<b>ied</b>, carry → carr<b>ied</b>, hurry → hurr<b>ied</b></p><p><b>Vowel + y</b>: keep the y and add <b>-ed</b>.<br>play → play<b>ed</b>, enjoy → enjoy<b>ed</b></p>' },
  { id: 'ed', group: 'Word endings', name: '-ed endings', emoji: '🐊', eg: 'hope → hoped · hop → hopped', gen: (lv) => edQ(lv),
    intro: '<p><b>Most words</b>: just add -ed. jump → jump<b>ed</b></p><p><b>Ends in e</b>: just add -d. bake → bake<b>d</b></p><p><b>Short vowel + one consonant</b>: double the last letter. stop → sto<b>pp</b>ed<br>For longer words, only double if the beat is on the end: ad-MIT → admi<b>tt</b>ed, but VIS-it → visi<b>t</b>ed.<br>Never double w, x or y: snow → snowed.</p><p><b>British l</b>: travel → trave<b>ll</b>ed</p><p><b>Consonant + y</b>: change y to i. cry → cr<b>ied</b></p>' },
  { id: 'cious', group: 'Word endings', name: '-cious & -tious', emoji: '🦑', eg: 'space → spacious · caution → cautious', gen: (lv) => ciousQ(lv),
    intro: '<p>Look for the <b>root word</b>.</p><p>Root ends in <b>-ce</b> → <b>-cious</b>: space → spa<b>cious</b>, grace → gra<b>cious</b>, malice → mali<b>cious</b></p><p>Root ends in <b>-tion</b> → <b>-tious</b>: caution → cau<b>tious</b>, ambition → ambi<b>tious</b></p><p>No root word? These just need learning: pre<b>cious</b>, deli<b>cious</b>, con<b>scious</b>, fero<b>cious</b>.</p><p>The odd one out: an<b>xious</b>.</p>' },
  { id: 'there', group: 'Homophones', name: 'there · their · they\'re', emoji: '🦉', eg: 'They\'re in their car over there.', gen: (lv) => homoQ('there', rnd(10) < 2 + lv * 2), intro: () => tipsIntro('there') },
  { id: 'your', group: 'Homophones', name: 'your · you\'re', emoji: '🦊', eg: 'You\'re wearing your hat.', gen: (lv) => homoQ('your', rnd(10) < 2 + lv * 2), intro: () => tipsIntro('your') },
  { id: 'of', group: 'Homophones', name: 'of · off', emoji: '🐸', eg: 'A box of toys fell off the shelf.', gen: (lv) => homoQ('of', rnd(10) < 2 + lv * 2), intro: () => tipsIntro('of') },
  { id: 'to', group: 'Homophones', name: 'to · too · two', emoji: '🐝', eg: 'Two of us went to the park too.', gen: (lv) => homoQ('to', rnd(10) < 2 + lv * 2), intro: () => tipsIntro('to') },
  { id: 'its', group: 'Homophones', name: 'its · it\'s', emoji: '🐢', eg: 'It\'s wagging its tail.', gen: (lv) => homoQ('its', rnd(10) < 2 + lv * 2), intro: () => tipsIntro('its') }
];
function tipsIntro(k) { return Object.values(HOMO[k].tips).map(t => `<p>${t}</p>`).join(''); }
const PK = id => PACKS.find(p => p.id === id);
const RP = id => { S.rules = S.rules || {}; return S.rules[id] || (S.rules[id] = { days: [], mastered: false, lastCredit: '', lastSeen: '', best: 0 }); };
const TRAIN_N = 8, TRAIN_PASS = 7, CHECK_N = 5, CHECK_PASS = 4, CHECK_GAP = 3;
const ruleDue = id => { const r = RP(id); return r.mastered && r.lastSeen && dayDiff(r.lastSeen, today()) >= CHECK_GAP; };
const rulesDue = () => PACKS.filter(p => ruleDue(p.id));
const rulePips = id => { const n = Math.min(3, RP(id).days.length); return '●'.repeat(n) + '○'.repeat(3 - n); };
function bumpStreak() { const t = today(), last = S.streak.last; if (last !== t) { S.streak.count = last && dayDiff(last, t) === 1 ? S.streak.count + 1 : 1; S.streak.last = t; } }

let lab = null;
function labView() {
  const t = today(), groups = [...new Set(PACKS.map(p => p.group))];
  const tamed = PACKS.filter(p => RP(p.id).mastered).length;
  const card = p => {
    const r = RP(p.id), due = ruleDue(p.id), doneToday = r.lastCredit === t;
    const status = due ? '<b style="color:var(--bad)">👻 Check-up due</b>' : r.mastered ? '<b style="color:var(--ok)">Tamed</b>' : doneToday ? 'Done for today ✔' : r.days.length ? `Day ${r.days.length} of 3` : 'New';
    return `<button class="pack" data-pack="${p.id}"><span class="pe">${p.emoji}</span><span class="pt"><b>${p.name}</b><span class="mute">${esc(p.eg)}</span><span class="ps"><span class="pips">${rulePips(p.id)}</span> ${status}</span></span></button>`;
  };
  shell(`<h1>🧪 Spelling Lab</h1><p class="sub">Each rule is a gremlin. Score ${TRAIN_PASS} out of ${TRAIN_N} on 3 different days to tame it. Tamed rules come back for check-ups.</p>
   <div class="row"><span class="chip">🔥 ${S.streak.count} day${S.streak.count === 1 ? '' : 's'}</span><span class="chip">⭐ ${S.stars}</span><span class="chip">🧪 ${tamed}/${PACKS.length} rules</span></div>
   ${groups.map(g => `<h3>${g}</h3>${PACKS.filter(p => p.group === g).map(card).join('')}`).join('')}`, 'lab');
  app.querySelectorAll('[data-pack]').forEach(b => b.onclick = () => packIntro(b.dataset.pack));
}
function packIntro(id) {
  const p = PK(id), r = RP(id), due = ruleDue(id), t = today();
  const intro = typeof p.intro === 'function' ? p.intro() : p.intro;
  const btn = due ? `<button class="btn primary" id="go">👻 Check-up (${CHECK_N} questions)</button>`
    : r.mastered ? `<button class="btn primary" id="go">Practise anyway</button>`
      : r.lastCredit === t ? `<button class="btn primary" id="go">Practise again</button><p class="center mute">Today's day is already ticked off. Come back tomorrow for the next one.</p>`
        : `<button class="btn primary" id="go">▶ Train (${TRAIN_N} questions)</button>`;
  app.innerHTML = `<main><div class="top"><button class="x" id="quit" aria-label="Back">←</button><div class="meta">${p.group}</div><div class="chip">⭐ ${S.stars}</div></div>
   <div class="gr">${p.emoji}</div><h2 class="center">${p.name}</h2><div class="pips center" style="font-size:18px">${rulePips(id)}</div>
   <div class="card rule">${intro}</div>${btn}</main>`;
  window.scrollTo(0, 0);
  $('#quit').onclick = () => { view = 'lab'; render(); };
  $('#go').onclick = () => startLab(id, due ? 'check' : (r.mastered || r.lastCredit === t) ? 'practice' : 'train');
}
function startLab(id, mode) {
  const r = RP(id), lv = Math.min(2, r.days.length), n = mode === 'check' ? CHECK_N : TRAIN_N, qs = [], seen = new Set();
  for (let i = 0, tries = 0; qs.length < n && tries < 200; tries++) { const q = PK(id).gen(mode === 'check' ? 2 : lv); const k = q.kind + q.prompt + q.html + q.answer; if (!seen.has(k) || tries > 100) { seen.add(k); qs.push(q); } }
  lab = { id, mode, qs, i: 0, score: 0, stars: 0, missed: [] };
  labQ();
}
function labQ() {
  const p = PK(lab.id), q = lab.qs[lab.i];
  const meta = `${p.name}<br>${lab.mode === 'check' ? '👻 Check-up · ' : lab.mode === 'practice' ? 'Practice · ' : ''}${lab.i + 1} of ${lab.qs.length}`;
  const body = q.kind === 'choice'
    ? `${q.html}<div class="opts${q.small ? ' small' : ''}">${q.options.map(o => `<button class="opt" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`
    : `${q.html}${q.say && canSpeak() ? `<div class="row" style="justify-content:center"><button class="btn small" id="hear">🔊 Hear it</button><button class="btn small ghost" id="slow">🐢 Slowly</button></div>` : ''}<input id="ans" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${q.placeholder || 'Type the word'}"><button class="btn primary" id="check">Check</button>`;
  app.innerHTML = `<main class="q"><div class="top"><button class="x" id="quit" aria-label="Quit">✕</button><div class="meta">${meta}</div><div class="chip">⭐ ${S.stars}</div></div>
   <div class="gr">${p.emoji}</div><h2 class="prompt">${q.prompt}</h2><div id="body">${body}</div><div id="fb"></div></main>`;
  window.scrollTo(0, 0);
  $('#quit').onclick = () => { try { speechSynthesis.cancel(); } catch (e) { } lab = null; view = 'lab'; render(); };
  if (q.kind === 'choice') {
    document.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      const ok = norm(b.dataset.v) === norm(q.answer);
      document.querySelectorAll('.opt').forEach(x => { if (norm(x.dataset.v) === norm(q.answer)) x.classList.add('right'); });
      if (!ok) b.classList.add('wrong');
      labAnswered(q, ok, null);
    });
  } else {
    if ($('#hear')) { $('#hear').onclick = () => speak(q.say); $('#slow').onclick = () => speak(q.say, true); }
    const go = () => { const v = norm($('#ans').value); if (!v) return; labAnswered(q, v === norm(q.answer), v); };
    $('#check').onclick = go; $('#ans').onkeydown = e => { if (e.key === 'Enter') go(); }; $('#ans').focus();
  }
}
function labAnswered(q, ok, typed) {
  beep(ok);
  if (ok) { lab.score++; lab.stars += 2; S.stars += 2; save(); } else lab.missed.push(q);
  const body = $('#body'); body.classList.add('dim'); body.querySelectorAll('input,button').forEach(e => e.disabled = true);
  const fb = $('#fb'), right = q.shown || q.answer;
  const next = () => { lab.i++; lab.i < lab.qs.length ? labQ() : labEnd(); };
  if (ok) {
    fb.innerHTML = `<div class="fb ok"><div class="big">✔ Correct! +2 ⭐</div><div class="note rulenote">${q.explain}</div><button class="btn primary" id="next">${lab.i + 1 < lab.qs.length ? 'Next →' : 'Finish'}</button></div>`;
    $('#next').onclick = next; $('#next').focus();
  } else {
    const d = typed ? diffHTML(norm(right), typed) : null;
    const isWord = q.kind === 'type' || !/\s/.test(right);
    fb.innerHTML = `<div class="fb bad"><div class="big">Not quite</div><div class="word">${d ? d.a : esc(right)}</div>${d ? `<div class="you">You wrote: ${d.b}</div>` : ''}<div class="note rulenote">${q.explain}</div>
     ${isWord && q.kind === 'type' ? `<label for="fix">Now type it correctly:</label><input id="fix" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">` : ''}<button class="btn primary" id="next" ${isWord && q.kind === 'type' ? 'disabled' : ''}>${lab.i + 1 < lab.qs.length ? 'Next →' : 'Finish'}</button></div>`;
    const fix = $('#fix'), nx = $('#next');
    nx.onclick = next;
    if (fix) { fix.oninput = () => { nx.disabled = norm(fix.value) !== norm(right); }; fix.onkeydown = e => { if (e.key === 'Enter' && !nx.disabled) next(); }; fix.focus(); } else nx.focus();
  }
  fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function labEnd() {
  const p = PK(lab.id), r = RP(lab.id), t = today(), L = lab; lab = null;
  let head = '', msg = '', icon = '🎉', fx = false;
  r.best = Math.max(r.best || 0, L.score);
  if (L.mode === 'train') {
    if (L.score >= TRAIN_PASS && r.lastCredit !== t) {
      r.lastCredit = t; r.days.push(t); S.stars += 10; L.stars += 10;
      if (r.days.length >= 3) { r.mastered = true; r.lastSeen = t; head = 'Rule tamed! 🎉'; msg = `${p.name} is tamed for good. It will come back for a check-up in a few days.`; fx = true; }
      else { head = `Day ${r.days.length} of 3 ✔`; msg = 'Brilliant! Come back tomorrow for the next day.'; }
    } else if (L.score >= TRAIN_PASS) { head = 'Well done!'; msg = 'Today is already ticked off.'; }
    else { icon = '💪'; head = 'Nearly!'; msg = `You need ${TRAIN_PASS} out of ${TRAIN_N} to tick off a day. Have another go!`; }
  } else if (L.mode === 'check') {
    if (L.score >= CHECK_PASS) { r.lastSeen = t; S.stars += 5; L.stars += 5; head = 'Still tamed! 👍'; msg = 'This rule has stuck.'; }
    else { r.mastered = false; r.days = r.days.slice(0, 2); r.lastCredit = ''; icon = '🏃'; head = 'It escaped!'; msg = 'Train it again on one more day to tame it again.'; }
  } else { head = 'Practice done!'; }
  if (L.mode !== 'practice') bumpStreak();
  save();
  const missed = [...new Map(L.missed.map(q => [q.review || q.shown || q.answer, q])).keys()];
  app.innerHTML = `<main class="center"><div class="gr">${icon}</div><h1>${head}</h1><p class="mute">${msg}</p>
   <div class="card"><div class="stat">${L.score} / ${L.qs.length}</div><div class="mute">+${L.stars} ⭐ · 🔥 ${S.streak.count}-day streak</div></div>
   ${missed.length ? `<div class="card"><b>Ones to look at again</b><div class="reveal">${missed.map(m => `<span class="chip">${esc(m)}</span>`).join('')}</div></div>` : ''}
   <button class="btn primary" id="again">${L.mode === 'train' && L.score < TRAIN_PASS ? 'Try again' : 'Back to the rule'}</button><button class="btn" id="hm">Spelling Lab</button></main>`;
  if (fx) confetti([p.emoji, '⭐', '🎉']);
  $('#again').onclick = () => L.mode === 'train' && L.score < TRAIN_PASS ? startLab(p.id, 'train') : packIntro(p.id);
  $('#hm').onclick = () => { view = 'lab'; render(); };
}

/* ---------- boot ---------- */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
load(); buildList(); updateBoss(); save(); render();
window.SG = { state: () => S, cur: () => curQ, list: () => LIST, lab: () => lab, packs: PACKS };
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { }));
})();
