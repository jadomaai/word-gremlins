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
const defaults = () => ({ v: 1, settings: { batch: 6, speak: true, rate: 0.85, sound: true, custom: '' }, unlocked: 6, batchStart: 0, bossReady: false, champion: false, words: {}, streak: { last: '', count: 0 }, stars: 0 });
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
const active = () => unlockedWords().filter(w => !P(w).mastered);
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
  app.innerHTML = `<main>${inner}</main><nav class="tabs">${[['home', '🎮 Play'], ['shelf', '🏆 Shelf'], ['settings', '⚙️ Settings']].map(([k, l]) => `<button data-go="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</nav>`;
  app.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { view = b.dataset.go; render(); });
}
function render() { ({ home, shelf, settings })[view](); window.scrollTo(0, 0); }
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
  if (S.champion) cta = `<div class="card center"><div class="stat">🏆</div><h2>You tamed every gremlin!</h2><p class="mute">Add your own words in Settings, or keep sharp with some practice.</p></div><button class="btn primary" data-a="practice">Practice mix</button>`;
  else if (S.bossReady) cta = `<button class="btn boss" data-a="boss">⚔️ Boss battle!</button><p class="center mute">All ${tiles.length} gremlins are tamed. Beat the boss to unlock the next batch.</p>`;
  else if (todo > 0) cta = `<button class="btn primary" data-a="daily">▶ Today's training (${todo} gremlin${todo > 1 ? 's' : ''})</button>`;
  else cta = `<div class="card center"><div class="stat">✔</div><b>Today's training is done!</b><p class="mute">Come back tomorrow. Each gremlin needs to be spelled correctly on 3 different days.</p></div><button class="btn" data-a="practice">Extra practice</button>`;
  shell(`<div class="row sp"><h1>Word Gremlins</h1></div>
   <div class="row"><span class="chip">🔥 ${S.streak.count} day${S.streak.count === 1 ? '' : 's'}</span><span class="chip">⭐ ${S.stars}</span><span class="chip">🏆 ${m}/${total}</span></div>
   <div class="card"><div class="bar"><i style="width:${total ? Math.round(100 * m / total) : 0}%"></i></div><p class="sub" style="margin:8px 0 0">${m} of ${total} words mastered</p></div>
   <h3>This batch</h3><div class="grid">${tiles.map(gremlinTile).join('')}</div>
   <p class="mute center" style="margin:8px 0 0">●●● = 3 days correct = tamed</p>
   ${cta}
   <details class="card"><summary>How it works</summary>
    <p>Each gremlin is a word. Train it through four rounds: <b>peek &amp; build</b>, <b>ghost letters</b>, <b>spot the saboteur</b>, and <b>listen &amp; write</b>.</p>
    <p>Spell it right from memory on <b>3 different days</b> and it's tamed. Tame the whole batch, beat the boss, and the next batch unlocks. Tamed gremlins sometimes ambush you later to check you still know them!</p></details>`, 'home');
  app.querySelectorAll('[data-a]').forEach(b => b.onclick = () => ({ daily: () => startSession('daily'), practice: () => startSession('practice'), boss: startBoss })[b.dataset.a]());
}

/* ---------- shelf ---------- */
function shelf() {
  shell(`<h1>Trophy shelf</h1><p class="sub">${masteredCount()} of ${LIST.length} gremlins tamed. Tap a tamed one to hear it.</p>
   <div class="grid shelf">${LIST.map((w, i) => { const p = P(w); return p.mastered ? `<div class="gremlin" data-say="${esc(w.word)}"><div class="e">${w.emoji}</div><div class="n">${esc(w.word)}</div></div>` : `<div class="gremlin"><div class="e egg">${i < S.unlocked ? w.emoji : '🥚'}</div><div class="n"><span class="q">?</span></div></div>`; }).join('')}</div>`, 'shelf');
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
  $('#testVoice').onclick = () => speak('necessary');
  if ($('#inst')) $('#inst').onclick = () => installEvt.prompt();
  $('#saveList').onclick = () => { s.custom = $('#custom').value; resetBatches(); save(); view = 'home'; render(); };
  $('#builtin').onclick = () => { s.custom = ''; resetBatches(); save(); view = 'home'; render(); };
  $('#copyB').onclick = () => { $('#backup').select(); try { navigator.clipboard.writeText($('#backup').value); } catch (e) { document.execCommand('copy'); } };
  $('#restoreB').onclick = () => { try { const o = JSON.parse($('#backup').value); if (!o || !o.words || !o.settings) throw 0; S = Object.assign(defaults(), o); buildList(); updateBoss(); save(); view = 'home'; render(); } catch (e) { alert('That backup code did not look right.'); } };
  $('#reset').onclick = () => { if (confirm('Erase all progress on this device?')) { const keep = S.settings; S = defaults(); S.settings = keep; buildList(); save(); view = 'home'; render(); } };
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
function pickAmbush() {
  const t = today();
  return shuffle(LIST.filter(w => { const p = P(w); return p.mastered && p.lastSeen !== t && p.days[p.days.length - 1] !== t && (!p.lastSeen || dayDiff(p.lastSeen, t) >= 2); })).slice(0, 2);
}
function startSession(mode) {
  const t = today(); let queue, amb = [];
  if (mode === 'daily') { queue = shuffle(active().filter(w => P(w).lastCredit !== t)); queue.forEach(newDayPrep); if (!S.bossReady) amb = pickAmbush(); }
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
    if (ok) { p.lastSeen = t; stars = 5; msg = 'Still tamed! +5 ⭐'; }
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
  if (sess.ans > 0 && sess.mode === 'daily') { const last = S.streak.last; if (last !== t) { S.streak.count = last && dayDiff(last, t) === 1 ? S.streak.count + 1 : 1; S.streak.last = t; } }
  updateBoss(); save();
  const chips = l => `<div class="reveal">${l.map(w => `<span class="chip">${w.emoji} ${esc(w.word)}</span>`).join('')}</div>`;
  if (sess.ans === 0) { app.innerHTML = `<main class="center"><div class="gr">😴</div><h2>Nothing to train right now</h2><p class="mute">Come back tomorrow, or try some extra practice.</p><button class="btn primary" id="hm">Back</button></main>`; $('#hm').onclick = () => { view = 'home'; render(); }; sess = null; return; }
  app.innerHTML = `<main class="center"><div class="gr">🎉</div><h1>${sess.mode === 'practice' ? 'Practice done!' : 'Training complete!'}</h1>
   <div class="card"><div class="stat">+${st.stars} ⭐</div><div class="mute">🔥 ${S.streak.count}-day streak</div></div>
   ${st.mastered.length ? `<div class="card"><b>Tamed today!</b>${chips(st.mastered)}</div>` : ''}
   ${st.credited.length && !st.mastered.length ? `<div class="card"><b>${st.credited.length} word${st.credited.length > 1 ? 's' : ''} got a day ticked off</b></div>` : ''}
   ${st.escaped.length ? `<div class="card"><b>Escaped gremlins</b> (back in training)${chips(st.escaped)}</div>` : ''}
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

/* ---------- boot ---------- */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
load(); buildList(); updateBoss(); save(); render();
window.SG = { state: () => S, cur: () => curQ, list: () => LIST };
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { }));
})();
