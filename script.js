"use strict";

/* ==========================================================================
   MONSIEUR WHITE — logique du jeu
   Tout tourne en local (pass & play sur un seul téléphone), aucun backend.
   ========================================================================== */

/* ---------- Banque de mots liés (mot commun / mot de l'imposteur) ---------- */
const WORD_PAIRS = [
  ["Plage", "Piscine"], ["Café", "Thé"], ["Pizza", "Pâtes"],
  ["Lion", "Tigre"], ["Chien", "Loup"], ["Hôpital", "Clinique"],
  ["Voiture", "Moto"], ["Guitare", "Violon"], ["Neige", "Pluie"],
  ["Pomme", "Poire"], ["Professeur", "Instituteur"], ["Avion", "Hélicoptère"],
  ["Roi", "Président"], ["Pirate", "Corsaire"], ["Vampire", "Zombie"],
  ["Football", "Rugby"], ["Téléphone", "Ordinateur"], ["Bibliothèque", "Librairie"],
  ["Chocolat", "Bonbon"], ["Été", "Printemps"], ["Mer", "Océan"],
  ["Acteur", "Chanteur"], ["Policier", "Gendarme"], ["Château", "Palais"],
  ["Robot", "Extraterrestre"], ["Sorcière", "Magicien"], ["Train", "Métro"],
  ["Boulanger", "Pâtissier"], ["Requin", "Dauphin"], ["Montagne", "Colline"],
  ["Peintre", "Sculpteur"], ["Fantôme", "Squelette"], ["Casino", "Cirque"],
  ["Facteur", "Livreur"], ["Karaté", "Judo"], ["Whisky", "Vin"],
  ["Tornade", "Ouragan"], ["Fromage", "Yaourt"], ["Piano", "Orgue"],
  ["Camping", "Randonnée"]
];

/* ---------- État global de la partie ---------- */
const state = {
  players: [],       // [{ name }]
  mode: null,        // 'white' | 'imposteur'
  roles: [],         // [{ name, role: 'civil'|'white'|'imposteur', word, eliminated, seen }]
  civilWord: "",
  specialWord: "",   // mot de l'imposteur (inutilisé en mode white)
  round: 1,
  revealOrder: [],
  revealIndex: 0,
  votersOrder: [],
  voteIndex: 0,
  voteCounts: {},    // index -> nb de votes
  candidateIndices: null, // si non-null, restreint le vote à ces index (cas d'égalité)
  eliminatedIndex: null,
  dossierNumber: ""
};

/* ---------- Utilitaires ---------- */
function $(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
  window.scrollTo(0, 0);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalize(str) {
  return str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function newDossierNumber() {
  return "AFFAIRE N° " + Math.floor(1000 + Math.random() * 9000);
}

function remainingIndices() {
  const out = [];
  state.roles.forEach((r, i) => { if (!r.eliminated) out.push(i); });
  return out;
}

/* ==========================================================================
   ÉCRAN ACCUEIL
   ========================================================================== */
$("btn-start").addEventListener("click", () => {
  state.dossierNumber = newDossierNumber();
  $("dossierNumber").textContent = state.dossierNumber;
  showScreen("screen-players");
});

/* ==========================================================================
   ÉCRAN JOUEURS
   ========================================================================== */
const MAX_PLAYERS = 10;
const MIN_PLAYERS = 3;

function renderPlayerList() {
  const ul = $("player-list");
  ul.innerHTML = "";
  state.players.forEach((p, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="tag-num">${String(i + 1).padStart(2, "0")}</span>
      <span class="tag-name"></span>
      <button type="button" class="tag-remove" aria-label="Retirer ${p.name}">×</button>
    `;
    li.querySelector(".tag-name").textContent = p.name;
    li.querySelector(".tag-remove").addEventListener("click", () => {
      state.players.splice(i, 1);
      renderPlayerList();
    });
    ul.appendChild(li);
  });
  $("player-counter").textContent = `${state.players.length} / ${MAX_PLAYERS} joueurs`;
  $("btn-to-mode").disabled = state.players.length < MIN_PLAYERS;
  $("btn-add-player").disabled = state.players.length >= MAX_PLAYERS;
}

$("player-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("player-name-input");
  const errorEl = $("player-error");
  errorEl.textContent = "";

  const name = input.value.trim();
  if (!name) return;

  if (state.players.length >= MAX_PLAYERS) {
    errorEl.textContent = "Vous ne pouvez pas dépasser 10 joueurs.";
    return;
  }
  const exists = state.players.some(p => normalize(p.name) === normalize(name));
  if (exists) {
    errorEl.textContent = "Ce prénom est déjà pris. Choisissez-en un autre.";
    return;
  }

  state.players.push({ name });
  input.value = "";
  input.focus();
  renderPlayerList();
});

$("btn-to-mode").addEventListener("click", () => {
  $("mode-grid").querySelectorAll(".mode-card").forEach(c => c.classList.remove("selected"));
  state.mode = null;
  $("btn-launch").disabled = true;
  showScreen("screen-mode");
});

/* ==========================================================================
   ÉCRAN MODE
   ========================================================================== */
document.querySelectorAll(".mode-card").forEach(card => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".mode-card").forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");
    state.mode = card.dataset.mode;
    $("btn-launch").disabled = false;
  });
});

$("btn-launch").addEventListener("click", () => {
  setupRoles();
  startRevealPhase();
});

/* ==========================================================================
   ATTRIBUTION DES RÔLES
   ========================================================================== */
function setupRoles() {
  const pair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
  state.civilWord = pair[0];
  state.specialWord = pair[1];

  const order = shuffle(state.players.map((_, i) => i));
  const specialIndex = order[0];

  state.roles = state.players.map((p, i) => {
    const isSpecial = i === specialIndex;
    if (isSpecial) {
      return {
        name: p.name,
        role: state.mode === "white" ? "white" : "imposteur",
        word: state.mode === "white" ? null : state.specialWord,
        eliminated: false
      };
    }
    return { name: p.name, role: "civil", word: state.civilWord, eliminated: false };
  });

  state.round = 1;
}

/* ==========================================================================
   ÉCRAN RÉVÉLATION DES RÔLES
   ========================================================================== */
function startRevealPhase() {
  state.revealOrder = state.roles.map((_, i) => i);
  state.revealIndex = 0;
  renderRevealDots();
  renderRevealCurrent();
  showScreen("screen-reveal");
}

function renderRevealDots() {
  const wrap = $("reveal-dots");
  wrap.innerHTML = "";
  state.revealOrder.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.className = "dot" + (i < state.revealIndex ? " done" : i === state.revealIndex ? " current" : "");
    wrap.appendChild(dot);
  });
}

function renderRevealCurrent() {
  const idx = state.revealOrder[state.revealIndex];
  const r = state.roles[idx];
  $("reveal-name").textContent = r.name;

  const back = $("reveal-back");
  if (r.role === "white") {
    back.innerHTML = `
      <span class="role-label">Rôle secret</span>
      <span class="role-word">MONSIEUR WHITE</span>
      <span class="role-note">Tu n'as aucun mot. Écoute bien les indices des autres, fonds-toi dans le groupe et tente de deviner le mot commun.</span>
    `;
  } else if (r.role === "imposteur") {
    back.innerHTML = `
      <span class="role-label">Ton mot</span>
      <span class="role-word">${r.word}</span>
      <span class="role-note">Attention : ce n'est pas le même mot que les autres. Reste discret, personne ne doit deviner que ton mot diffère.</span>
    `;
  } else {
    back.innerHTML = `
      <span class="role-label">Ton mot</span>
      <span class="role-word">${r.word}</span>
      <span class="role-note">Donne des indices liés à ce mot sans jamais le prononcer, et repère qui n'a pas vraiment ce mot.</span>
    `;
  }

  const card = $("reveal-card");
  card.classList.remove("flipped");
  $("btn-hide-card").classList.add("hidden");
  $("btn-next-reveal").classList.add("hidden");
  $("btn-start-round").classList.add("hidden");
}

$("reveal-card").addEventListener("click", () => {
  const card = $("reveal-card");
  if (!card.classList.contains("flipped")) {
    card.classList.add("flipped");
    $("btn-hide-card").classList.remove("hidden");
  }
});

$("btn-hide-card").addEventListener("click", () => {
  $("reveal-card").classList.remove("flipped");
  $("btn-hide-card").classList.add("hidden");

  const isLast = state.revealIndex === state.revealOrder.length - 1;
  if (isLast) {
    $("btn-start-round").classList.remove("hidden");
  } else {
    $("btn-next-reveal").classList.remove("hidden");
  }
});

$("btn-next-reveal").addEventListener("click", () => {
  state.revealIndex++;
  renderRevealDots();
  renderRevealCurrent();
});

$("btn-start-round").addEventListener("click", () => {
  startDiscussionPhase();
});

/* ==========================================================================
   ÉCRAN DISCUSSION
   ========================================================================== */
function startDiscussionPhase() {
  $("round-label").textContent = `Manche ${state.round}`;
  $("discussion-rule").textContent =
    state.mode === "white"
      ? "Un joueur n'a pas de mot du tout. Écoutez attentivement, il risque de rester vague."
      : "Un joueur a un mot légèrement différent. Écoutez attentivement les indices trop précis... ou trop flous.";

  const ol = $("speak-order");
  ol.innerHTML = "";
  const order = shuffle(remainingIndices());
  order.forEach(i => {
    const li = document.createElement("li");
    li.textContent = state.roles[i].name;
    ol.appendChild(li);
  });

  showScreen("screen-discussion");
}

$("btn-to-vote").addEventListener("click", () => {
  startVotePhase(remainingIndices());
});

/* ==========================================================================
   ÉCRAN VOTE
   ========================================================================== */
function startVotePhase(candidateIndices) {
  state.candidateIndices = candidateIndices;
  state.votersOrder = shuffle(remainingIndices());
  state.voteIndex = 0;
  state.voteCounts = {};
  candidateIndices.forEach(i => state.voteCounts[i] = 0);
  renderVoteCurrent();
  showScreen("screen-vote");
}

function renderVoteCurrent() {
  const voterIdx = state.votersOrder[state.voteIndex];
  $("voter-name").textContent = state.roles[voterIdx].name;

  const grid = $("vote-grid");
  grid.innerHTML = "";
  state.candidateIndices
    .filter(i => i !== voterIdx)
    .forEach(i => {
      const btn = document.createElement("button");
      btn.className = "vote-option";
      btn.textContent = state.roles[i].name;
      btn.addEventListener("click", () => castVote(i));
      grid.appendChild(btn);
    });
}

function castVote(targetIndex) {
  state.voteCounts[targetIndex]++;
  state.voteIndex++;
  if (state.voteIndex < state.votersOrder.length) {
    renderVoteCurrent();
  } else {
    resolveVote();
  }
}

/* ==========================================================================
   RÉSULTAT DU VOTE
   ========================================================================== */
function resolveVote() {
  const entries = Object.entries(state.voteCounts).map(([idx, count]) => ({ idx: Number(idx), count }));
  const maxCount = Math.max(...entries.map(e => e.count));
  const winners = entries.filter(e => e.count === maxCount);

  renderTally(entries, maxCount);

  if (winners.length > 1) {
    // Égalité : on revote uniquement entre les joueurs à égalité.
    $("vote-result-title").textContent = "Égalité !";
    $("eliminated-card").classList.add("hidden");
    $("btn-after-elimination").textContent = "Départager le vote";
    $("btn-after-elimination").classList.remove("hidden");
    $("btn-after-elimination").onclick = () => startVotePhase(winners.map(w => w.idx));
    showScreen("screen-vote-result");
    return;
  }

  const eliminatedIdx = winners[0].idx;
  state.eliminatedIndex = eliminatedIdx;
  state.roles[eliminatedIdx].eliminated = true;

  $("vote-result-title").textContent = "Résultat du vote";
  showEliminatedCard(eliminatedIdx);
  showScreen("screen-vote-result");
}

function renderTally(entries, maxCount) {
  const list = $("tally-list");
  list.innerHTML = "";
  entries
    .sort((a, b) => b.count - a.count)
    .forEach(e => {
      const row = document.createElement("div");
      row.className = "tally-row";
      const pct = maxCount === 0 ? 0 : Math.round((e.count / maxCount) * 100);
      row.innerHTML = `
        <span class="tally-name"></span>
        <span class="tally-bar-track"><span class="tally-bar-fill" style="width:${pct}%"></span></span>
        <span class="tally-count">${e.count}</span>
      `;
      row.querySelector(".tally-name").textContent = state.roles[e.idx].name;
      list.appendChild(row);
    });
}

function showEliminatedCard(idx) {
  const r = state.roles[idx];
  const card = $("eliminated-card");
  card.classList.remove("hidden");

  let roleText;
  if (r.role === "white") roleText = "Monsieur White";
  else if (r.role === "imposteur") roleText = "L'Imposteur";
  else roleText = "Un Civil";

  card.innerHTML = `
    <p class="stamp-title">Éliminé</p>
    <p class="stamp-sub"><strong>${r.name}</strong> était&nbsp;: ${roleText}</p>
  `;

  const btn = $("btn-after-elimination");
  btn.classList.remove("hidden");
  btn.textContent = "Continuer";
  btn.onclick = () => afterElimination(idx);
}

function afterElimination(idx) {
  const r = state.roles[idx];
  const remaining = remainingIndices();

  // Le rôle spécial est éliminé : soit il tente sa chance (White), soit les civils gagnent (Imposteur).
  if (r.role === "white") {
    showGuessScreen();
    return;
  }
  if (r.role === "imposteur") {
    endGame("civils", "Les civils ont démasqué l'imposteur.");
    return;
  }

  // Un civil a été éliminé par erreur.
  if (remaining.length <= 2) {
    endGame("special", "Il ne reste plus assez de civils pour l'emporter.");
    return;
  }

  state.round++;
  startDiscussionPhase();
}

/* ==========================================================================
   DEVINETTE DE MONSIEUR WHITE
   ========================================================================== */
function showGuessScreen() {
  $("guess-hint").textContent =
    "Monsieur White a été démasqué. Il a droit à une dernière tentative : deviner le mot commun.";
  $("guess-input").value = "";
  showScreen("screen-guess");
  setTimeout(() => $("guess-input").focus(), 300);
}

$("btn-submit-guess").addEventListener("click", submitGuess);
$("guess-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitGuess();
});

function submitGuess() {
  const guess = $("guess-input").value;
  if (normalize(guess) === normalize(state.civilWord)) {
    endGame("white", `Monsieur White a deviné le mot "${state.civilWord}" et s'échappe !`);
  } else {
    endGame("civils", `Monsieur White a proposé "${guess || "—"}". Le mot était "${state.civilWord}".`);
  }
}

/* ==========================================================================
   ÉCRAN FIN
   ========================================================================== */
function endGame(winner, summary) {
  const stamp = $("end-stamp");
  stamp.classList.toggle("win", winner === "civils");

  let title;
  if (winner === "civils") title = "Les civils l'emportent";
  else if (winner === "white") title = "Monsieur White s'échappe";
  else title = state.mode === "white" ? "Monsieur White l'emporte" : "L'imposteur l'emporte";

  stamp.innerHTML = `<p class="stamp-title">${title}</p>`;
  $("end-title").textContent = "Affaire classée";
  $("end-summary").textContent = summary;

  const recap = $("recap-list");
  recap.innerHTML = "";
  state.roles.forEach(r => {
    let roleText;
    if (r.role === "white") roleText = "Monsieur White";
    else if (r.role === "imposteur") roleText = "Imposteur";
    else roleText = "Civil";
    const row = document.createElement("div");
    row.className = "recap-row";
    row.innerHTML = `<span></span><span></span>`;
    row.children[0].textContent = r.name;
    row.children[1].textContent = roleText + (r.role !== "white" ? ` — ${r.word}` : "");
    recap.appendChild(row);
  });

  showScreen("screen-end");
}

$("btn-replay-same").addEventListener("click", () => {
  state.dossierNumber = newDossierNumber();
  $("dossierNumber").textContent = state.dossierNumber;
  $("mode-grid").querySelectorAll(".mode-card").forEach(c => c.classList.remove("selected"));
  state.mode = null;
  $("btn-launch").disabled = true;
  showScreen("screen-mode");
});

$("btn-new-game").addEventListener("click", () => {
  state.players = [];
  state.roles = [];
  renderPlayerList();
  $("player-name-input").value = "";
  $("player-error").textContent = "";
  state.dossierNumber = newDossierNumber();
  $("dossierNumber").textContent = state.dossierNumber;
  showScreen("screen-players");
});

/* ---------- Initialisation ---------- */
renderPlayerList();
