# Word Gremlins

A spelling-practice PWA. Each word is a "gremlin". Train it through four rounds
(peek & build, ghost letters, spot the saboteur, listen & write). Spell it right
from memory on **3 different days** and it's tamed. Tame a whole batch, beat the
boss, and the next batch unlocks. Tamed words ambush you later to check you still
know them.

**Flashcard words** (Settings): type, paste or upload words already learned with
flashcards. They count as tamed and join the daily check-ups.

**Spelling Lab** (🧪 Lab tab): rule gremlins for word endings (y → ied, -ed endings,
-cious/-tious) and homophones (there/their/they're, your/you're, of/off, to/too/two,
its/it's). Score 7/8 on 3 different days to tame a rule; tamed rules get check-ups.

**Sentences** (✨ tab): Sentence Glow-Up, built in. Each sentence offers 3 gremlin challenges (shown by meaning and sound, never spelling). Gremlin words spelled right earn bonus stars, and a tamed word used correctly counts as a check-up. -ed and -cious/-tious words are checked against the Lab rules.

Plain HTML/CSS/JS. No build step, no dependencies. Works offline once installed.

## Put it on GitHub Pages

1. Create a new GitHub repository (public, e.g. `word-gremlins`).
2. Upload everything in this folder to the repository root (`index.html` must be at the top level).
3. Repository **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder = `/ (root)`. Save.
4. After a minute your app is live at `https://<your-username>.github.io/word-gremlins/`.

## Install on a device

- **iPhone / iPad:** open the link in Safari → Share → *Add to Home Screen*.
- **Android:** open in Chrome → menu → *Install app* (or *Add to Home screen*).
- **Windows / Mac / Chromebook:** open in Chrome or Edge → click the install icon in the address bar.

## Notes

- Progress is stored on each device (localStorage). To move it: Settings → *Copy backup*, then paste on the other device and tap *Restore*.
- Use your own words: Settings → *Your own word list*. Optional `[brackets]` mark tricky letters, `|text` adds a hint.
- Updating: change the files, and bump `CACHE` in `sw.js` (currently `wordgremlins-v3`) so installed copies refresh.
- Tip: switch off predictive text/autocorrect on the keyboard for best results (the app asks the browser not to offer suggestions, but some keyboards ignore that).
