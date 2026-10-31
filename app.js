/**
 * Automation Lead Cockpit v9 — Core Engine
 * Handles Navigation, State Persistence, Multiple View Modes,
 * Syntax Formatting, Timer Simulation, and Keyboard Shortcuts.
 */

/* State & Persistence */
let theme = localStorage.getItem('bank_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
let activeView = localStorage.getItem('bank_view') || 'split';
let activeStatus = 'all';
let activeCategory = localStorage.getItem('bank_cat') || 'all';
let query = '';
let selectedId = 0;

// Mastery Sets
let mastered = new Set(JSON.parse(localStorage.getItem('bank_mastered') || localStorage.getItem('bank_done') || '[]'));
let review = new Set(JSON.parse(localStorage.getItem('bank_review') || '[]'));
let starred = new Set(JSON.parse(localStorage.getItem('bank_starred') || localStorage.getItem('bank_bookmarks') || '[]'));

// Flashcard index
let fcIndex = 0;

// Simulator State
let simQuestion = null;
let simTimerSeconds = 120;
let simTimerInterval = null;

// Apply initial theme
document.documentElement.setAttribute('data-theme', theme);

/* Helper to calculate estimated read time */
function estimateReadTime(text) {
  const wordCount = (text || '').replace(/<[^>]*>/g, '').split(/\s+/).length;
  const mins = Math.max(1, Math.round(wordCount / 120));
  return `~${mins} min read`;
}

/* Helper to extract a 30-second Elevator Pitch */
function extractElevatorPitch(item) {
  // Check if answer has a lead tip or strong first paragraph
  const div = document.createElement('div');
  div.innerHTML = item.a;
  
  const tipEl = div.querySelector('.tip');
  if (tipEl) {
    const clone = tipEl.cloneNode(true);
    const b = clone.querySelector('b');
    if (b) b.remove();
    return clone.textContent.trim();
  }
  
  const pEl = div.querySelector('p');
  if (pEl) {
    return pEl.textContent.trim();
  }
  
  return item.q;
}

/* Format Code Blocks & Add Copy Buttons */
function formatCodeBlocks(container) {
  if (!container) return;
  container.querySelectorAll('pre code').forEach(codeEl => {
    if (codeEl.dataset.processed) return;
    codeEl.dataset.processed = "true";

    let raw = codeEl.innerText;
    let lang = "CODE";
    if (raw.includes("public class") || raw.includes("WebDriver") || raw.includes("ThreadLocal") || raw.includes("System.out")) lang = "JAVA";
    else if (raw.includes("import { test") || raw.includes("page.getByRole") || raw.includes("async ({ page })") || raw.includes("export default")) lang = "PLAYWRIGHT";
    else if (raw.includes("function ") || raw.includes("const ") || raw.includes("let ")) lang = "TYPESCRIPT";
    else if (raw.startsWith("{") || raw.startsWith("[") || raw.includes('"name":')) lang = "JSON";
    else if (raw.includes("Scenario:") || raw.includes("Given ")) lang = "GHERKIN";
    else if (raw.includes("SELECT ") || raw.includes("FROM ") || raw.includes("WHERE ")) lang = "SQL";
    else if (raw.includes("mvn ") || raw.includes("npm ") || raw.includes("pipeline {")) lang = "DEVOPS";

    const box = document.createElement('div');
    box.className = 'code-container';

    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `
      <span class="code-lang">${lang}</span>
      <button class="btn-copy">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy</span>
      </button>
    `;

    const pre = codeEl.parentElement;
    pre.parentNode.insertBefore(box, pre);
    box.appendChild(header);
    box.appendChild(pre);

    header.querySelector('.btn-copy').addEventListener('click', e => {
      navigator.clipboard.writeText(raw);
      const span = header.querySelector('.btn-copy span');
      span.innerText = 'Copied!';
      setTimeout(() => { span.innerText = 'Copy'; }, 1800);
    });
  });
}

/* Get Current Filtered Items */
function getFilteredItems() {
  const qStr = query.trim().toLowerCase();

  return Q.filter(item => {
    // Category Chip Filter
    if (activeCategory !== 'all' && item.c !== activeCategory) {
      return false;
    }

    // Search Query Filter
    if (qStr) {
      const matchQ = item.q.toLowerCase().includes(qStr);
      const matchA = item.a.toLowerCase().includes(qStr);
      const catObj = CATS[item.c];
      const matchCat = catObj && catObj.label.toLowerCase().includes(qStr);
      if (!matchQ && !matchA && !matchCat) return false;
    }

    // Status Filter
    if (activeStatus === 'mastered') {
      if (!mastered.has(item.id)) return false;
    } else if (activeStatus === 'review') {
      if (!review.has(item.id)) return false;
    } else if (activeStatus === 'starred') {
      if (!starred.has(item.id)) return false;
    }

    return true;
  });
}

/* Highlight Matching Text in Question */
function highlight(text, qStr) {
  if (!qStr.trim()) return text;
  const regex = new RegExp(`(${qStr.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark class="search-hl">$1</mark>');
}

/* Render Category Chips (Pure Skills) */
function renderCategoryChips() {
  const chipsBar = document.getElementById('category-chips');
  if (!chipsBar) return;
  const availableCats = Object.keys(CATS);

  // Count items per category
  const counts = {};
  Q.forEach(item => {
    counts[item.c] = (counts[item.c] || 0) + 1;
  });

  const total = Q.length;

  let html = `
    <button class="category-chip ${activeCategory === 'all' ? 'active' : ''}" data-cat="all">
      <span class="dot" style="--c-dot: var(--primary);"></span>
      <span>All Tracks</span>
      <b style="font-size:10.5px; opacity:0.8;">${total}</b>
    </button>
  `;

  availableCats.forEach(catKey => {
    const cat = CATS[catKey];
    if (!cat) return;
    const isAct = activeCategory === catKey;
    html += `
      <button class="category-chip ${isAct ? 'active' : ''}" data-cat="${catKey}" style="--c-dot: ${cat.color};">
        <span>${cat.icon}</span>
        <span>${cat.label}</span>
        <b style="font-size:10.5px; opacity:0.8;">${counts[catKey] || 0}</b>
      </button>
    `;
  });

  chipsBar.innerHTML = html;
}

/* Update Overall Readiness Metric */
function updateReadinessMetric() {
  const pct = Math.round((mastered.size / Q.length) * 100);
  document.getElementById('readiness-pct').textContent = `${pct}% Ready`;
}

/* ==========================================================================
   VIEW 1: SPLIT READER (MASTER-DETAIL)
   ========================================================================== */
function renderSplitReader(items) {
  const masterListEl = document.getElementById('master-list');
  const countEl = document.getElementById('master-count');

  countEl.textContent = `Showing ${items.length} Questions`;

  if (!items.length) {
    masterListEl.innerHTML = `<div class="empty-state">No questions found matching your filter criteria.</div>`;
    document.getElementById('detail-content').innerHTML = `
      <div class="empty-state" style="margin-top: 40px;">
        <p>No question selected. Adjust your search or filters to preview.</p>
      </div>`;
    return;
  }

  // Ensure selectedId is in the visible list
  const currentExists = items.some(it => it.id === selectedId);
  if (!currentExists) {
    selectedId = items[0].id;
  }

  // Render Master List
  let masterHtml = '';
  items.forEach((item, index) => {
    const cat = CATS[item.c] || { label: item.c, color: 'var(--primary)', icon: '📌' };
    const isSelected = item.id === selectedId;
    const isMastered = mastered.has(item.id);
    const isReview = review.has(item.id);
    const isStarred = starred.has(item.id);

    let statusClass = 'status-unseen';
    if (isMastered) statusClass = 'status-mastered';
    else if (isReview) statusClass = 'status-review';

    masterHtml += `
      <div class="master-item ${isSelected ? 'selected' : ''}" data-id="${item.id}" role="button" tabindex="0">
        <div class="master-item-meta">
          <span class="master-cat-tag" style="--c-tag: ${cat.color}">
            <span>${cat.icon}</span> <span>${cat.label}</span>
          </span>
          <div style="display:flex; align-items:center; gap:6px;">
            <button class="btn-star-icon ${isStarred ? 'starred' : ''}" data-id="${item.id}" title="Star Question">★</button>
            <span class="master-status-indicator ${statusClass}" title="${isMastered ? 'Mastered' : isReview ? 'Needs Review' : 'Unseen'}"></span>
          </div>
        </div>
        <div class="master-q-title">
          <span style="font-family:var(--font-mono); font-size:11px; opacity:0.6; margin-right:4px;">#${String(index + 1).padStart(2, '0')}</span>
          ${highlight(item.q, query)}
        </div>
      </div>
    `;
  });
  masterListEl.innerHTML = masterHtml;

  // Render Selected Detail Pane
  const activeItem = items.find(it => it.id === selectedId) || items[0];
  const activeIdx = items.findIndex(it => it.id === activeItem.id);
  const cat = CATS[activeItem.c] || { label: activeItem.c, color: 'var(--primary)', icon: '📌' };
  const readTime = estimateReadTime(activeItem.a);
  const elevatorPitch = extractElevatorPitch(activeItem);

  const isMastered = mastered.has(activeItem.id);
  const isReview = review.has(activeItem.id);
  const isStarred = starred.has(activeItem.id);

  // Meta header
  document.getElementById('detail-meta').innerHTML = `
    <span class="badge-version" style="color:${cat.color}; border-color:${cat.color}">
      ${cat.icon} ${cat.label}
    </span>
    <span style="font-size:11.5px; font-weight:600; color:var(--text-faint);">${readTime}</span>
  `;

  // Action header
  document.getElementById('detail-actions').innerHTML = `
    <button class="mastery-toggle-btn ${isMastered ? 'state-mastered' : ''}" id="btn-toggle-mastered" data-id="${activeItem.id}">
      ${isMastered ? '✓ Mastered' : 'Mark Mastered'}
    </button>
    <button class="mastery-toggle-btn ${isReview ? 'state-review' : ''}" id="btn-toggle-review" data-id="${activeItem.id}">
      ${isReview ? '⏳ Needs Review' : 'Review Later'}
    </button>
    <button class="btn-star-icon ${isStarred ? 'starred' : ''}" id="btn-detail-star" data-id="${activeItem.id}">★</button>
  `;

  // Detail content
  document.getElementById('detail-content').innerHTML = `
    <h2 class="detail-q-title">${highlight(activeItem.q, query)}</h2>

    <div class="elevator-pitch-box">
      <div class="elevator-pitch-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        30-Second Elevator Pitch (What to say out loud)
      </div>
      <div class="elevator-pitch-text">${elevatorPitch}</div>
    </div>

    <div class="a">
      ${activeItem.a}
    </div>
  `;

  // Detail footer index
  document.getElementById('detail-index').textContent = `Question ${activeIdx + 1} of ${items.length}`;

  formatCodeBlocks(document.getElementById('detail-content'));
}

/* ==========================================================================
   VIEW 2: ACCORDION STREAM
   ========================================================================== */
function renderStream(items) {
  const streamEl = document.getElementById('view-stream');
  if (!items.length) {
    streamEl.innerHTML = `<div class="empty-state">No questions found matching your filter criteria.</div>`;
    return;
  }

  let html = '';
  items.forEach((item, idx) => {
    const cat = CATS[item.c] || { label: item.c, color: 'var(--primary)', icon: '📌' };
    const isMastered = mastered.has(item.id);
    const isReview = review.has(item.id);
    const isStarred = starred.has(item.id);

    html += `
      <article class="card ${isMastered ? 'done' : ''}" data-id="${item.id}" style="--cc: ${cat.color}">
        <div class="card-header-row" role="button" tabindex="0">
          <div class="card-header-left">
            <span class="card-qnum">${String(idx + 1).padStart(2, '0')}</span>
            <div style="flex:1;">
              <div style="font-size:11px; font-weight:700; color:${cat.color}; margin-bottom:2px;">
                ${cat.icon} ${cat.label}
              </div>
              <h3 class="card-qtext">${highlight(item.q, query)}</h3>
            </div>
          </div>
          <div class="card-header-actions">
            <button class="btn-star-icon ${isStarred ? 'starred' : ''}" data-id="${item.id}" title="Star Question">★</button>
            <button class="mastery-toggle-btn ${isMastered ? 'state-mastered' : ''}" data-id="${item.id}" title="Toggle Mastered">
              ${isMastered ? '✓ Mastered' : 'Master'}
            </button>
            <svg class="caret-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>
          </div>
        </div>
        <div class="card-body-accordion">
          <div class="card-body-inner">
            <div class="card-content-area a">
              ${item.a}
            </div>
          </div>
        </div>
      </article>
    `;
  });

  streamEl.innerHTML = html;
  formatCodeBlocks(streamEl);
}

/* ==========================================================================
   VIEW 3: SPEED-RUN CHEAT SHEET
   ========================================================================== */
function renderCheatSheet(items) {
  const sheetEl = document.getElementById('view-sheet');
  if (!items.length) {
    sheetEl.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;">No questions found matching your filter criteria.</div>`;
    return;
  }

  let html = '';
  items.forEach(item => {
    const cat = CATS[item.c] || { label: item.c, color: 'var(--primary)', icon: '📌' };
    const pitch = extractElevatorPitch(item);
    const isMastered = mastered.has(item.id);

    html += `
      <div class="cheat-card" style="--cc: ${cat.color}">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:11px; font-weight:700; color:${cat.color};">${cat.icon} ${cat.label}</span>
            <span style="font-size:11px; font-weight:700; color:${isMastered ? 'var(--emerald)' : 'var(--text-faint)'};">
              ${isMastered ? '🟢 Ready' : '⚪ Review'}
            </span>
          </div>
          <h4 class="cheat-q">${item.q}</h4>
          <div class="cheat-takeaway">
            <b style="color:var(--text-primary); display:block; margin-bottom:4px; font-size:11px; text-transform:uppercase;">Quick Pitch:</b>
            ${pitch}
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; pt-2; border-top:1px solid var(--border);">
          <button class="btn-nav-step" onclick="jumpToSplitItem(${item.id})">Open Reader →</button>
          <button class="btn-star-icon ${starred.has(item.id) ? 'starred' : ''}" data-id="${item.id}">★</button>
        </div>
      </div>
    `;
  });

  sheetEl.innerHTML = html;
}

/* Jump to a specific question in Split Reader mode */
window.jumpToSplitItem = function(id) {
  selectedId = id;
  switchViewMode('split');
  renderSplitReader(getFilteredItems());
};

/* ==========================================================================
   VIEW 4: MOCK INTERVIEW SIMULATOR
   ========================================================================== */
function initSimulator() {
  const items = getFilteredItems();
  if (!items.length) return;

  simQuestion = items[Math.floor(Math.random() * items.length)];
  const cat = CATS[simQuestion.c] || { label: simQuestion.c, color: 'var(--primary)', icon: '📌' };

  const simBadge = document.getElementById('sim-badge');
  if (simBadge) {
    simBadge.textContent = `${cat.icon} ${cat.label} Practice Question`;
  }

  document.getElementById('sim-q-text').textContent = simQuestion.q;
  document.getElementById('sim-scratchpad').value = '';
  document.getElementById('sim-revealed-key').classList.remove('show');
  document.getElementById('sim-answer-body').innerHTML = simQuestion.a;
  formatCodeBlocks(document.getElementById('sim-answer-body'));

  // Reset timer
  resetSimTimer();
}

function resetSimTimer() {
  clearInterval(simTimerInterval);
  simTimerInterval = null;
  simTimerSeconds = 120;
  updateTimerUI();
  document.getElementById('sim-btn-timer').textContent = 'Start 2-Min Timer';
}

function updateTimerUI() {
  const mins = String(Math.floor(simTimerSeconds / 60)).padStart(2, '0');
  const secs = String(simTimerSeconds % 60).padStart(2, '0');
  document.getElementById('sim-timer-display').textContent = `${mins}:${secs}`;

  const progress = (120 - simTimerSeconds) / 120;
  const offset = 402 * progress;
  const fillEl = document.getElementById('sim-timer-fill');
  fillEl.style.strokeDashoffset = offset;

  if (simTimerSeconds <= 15) {
    fillEl.style.stroke = 'var(--rose)';
  } else if (simTimerSeconds <= 45) {
    fillEl.style.stroke = 'var(--amber)';
  } else {
    fillEl.style.stroke = 'var(--primary)';
  }
}

function toggleSimTimer() {
  const btn = document.getElementById('sim-btn-timer');
  if (simTimerInterval) {
    clearInterval(simTimerInterval);
    simTimerInterval = null;
    btn.textContent = 'Resume Timer';
  } else {
    btn.textContent = 'Pause Timer';
    simTimerInterval = setInterval(() => {
      simTimerSeconds--;
      updateTimerUI();
      if (simTimerSeconds <= 0) {
        clearInterval(simTimerInterval);
        simTimerInterval = null;
        btn.textContent = "Time's Up!";
        document.getElementById('sim-revealed-key').classList.add('show');
      }
    }, 1000);
  }
}

/* ==========================================================================
   VIEW SWITCHER CONTROLLER
   ========================================================================== */
function switchViewMode(mode) {
  activeView = mode;
  localStorage.setItem('bank_view', mode);

  ['split', 'stream', 'sheet', 'mock'].forEach(m => {
    const el = document.getElementById(`view-${m}`);
    const btn = document.getElementById(`btn-mode-${m}`);
    if (el) el.style.display = m === mode ? '' : 'none';
    if (btn) btn.classList.toggle('active', m === mode);
  });

  const expandBtn = document.getElementById('btn-expand-all');
  if (expandBtn) expandBtn.style.display = mode === 'stream' ? '' : 'none';

  renderCurrentView();
}

/* Master Render Dispatcher */
function renderCurrentView() {
  const items = getFilteredItems();

  if (activeView === 'split') {
    renderSplitReader(items);
  } else if (activeView === 'stream') {
    renderStream(items);
  } else if (activeView === 'sheet') {
    renderCheatSheet(items);
  } else if (activeView === 'mock') {
    if (!simQuestion) initSimulator();
  }

  updateReadinessMetric();
}

/* ==========================================================================
   FLASHCARD PRACTICE MODAL
   ========================================================================== */
const fcModal = document.getElementById('flashcard-modal');
const fcQ = document.getElementById('fc-q');
const fcAns = document.getElementById('fc-answer');
const fcReveal = document.getElementById('fc-reveal');

function openFlashcard() {
  const items = getFilteredItems();
  if (!items.length) return alert("No questions available under current filters to practice!");
  fcIndex = 0;
  showFlashcard(items);
  fcModal.classList.add('active');
}

function showFlashcard(items) {
  const item = items[fcIndex];
  const cat = CATS[item.c] || { label: item.c };
  document.getElementById('fc-track').textContent = cat.label;
  document.getElementById('fc-counter').textContent = `Question ${fcIndex + 1} of ${items.length}`;
  fcQ.textContent = item.q;
  fcAns.innerHTML = item.a;
  fcAns.classList.remove('show');
  fcReveal.style.display = 'block';

  document.getElementById('fc-star').textContent = starred.has(item.id) ? '★ Starred' : '☆ Star';
  document.getElementById('fc-mark').textContent = mastered.has(item.id) ? '✓ Mastered' : 'Mark Mastered';
  formatCodeBlocks(fcAns);
}

/* ==========================================================================
   EVENT LISTENERS & BINDINGS
   ========================================================================== */

// Theme toggle
document.getElementById('btn-theme').addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('bank_theme', theme);
});

// View mode switcher buttons
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchViewMode(btn.dataset.mode);
  });
});

// Search input
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

searchInput.addEventListener('input', e => {
  query = e.target.value;
  searchClear.style.display = query ? 'block' : 'none';
  renderCurrentView();
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  query = '';
  searchClear.style.display = 'none';
  renderCurrentView();
});

// Status filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeStatus = btn.dataset.status;
    localStorage.setItem('bank_status', activeStatus);
    renderCurrentView();
  });
});

// Category chips delegation
document.getElementById('category-chips').addEventListener('click', e => {
  const chip = e.target.closest('.category-chip');
  if (!chip) return;
  activeCategory = chip.dataset.cat;
  renderCategoryChips();
  renderCurrentView();
});

// Split Reader clicks (Master List item selection & Star)
document.getElementById('master-list').addEventListener('click', e => {
  const starBtn = e.target.closest('.btn-star-icon');
  if (starBtn) {
    e.stopPropagation();
    const id = +starBtn.dataset.id;
    starred.has(id) ? starred.delete(id) : starred.add(id);
    localStorage.setItem('bank_starred', JSON.stringify([...starred]));
    renderCurrentView();
    return;
  }

  const itemEl = e.target.closest('.master-item');
  if (itemEl) {
    selectedId = +itemEl.dataset.id;
    renderSplitReader(getFilteredItems());
  }
});

// Detail Stage clicks (Mastered, Review, Star)
document.getElementById('detail-actions').addEventListener('click', e => {
  const id = selectedId;
  if (e.target.closest('#btn-toggle-mastered')) {
    if (mastered.has(id)) {
      mastered.delete(id);
    } else {
      mastered.add(id);
      review.delete(id);
    }
    localStorage.setItem('bank_mastered', JSON.stringify([...mastered]));
    localStorage.setItem('bank_review', JSON.stringify([...review]));
    renderCurrentView();
    return;
  }

  if (e.target.closest('#btn-toggle-review')) {
    if (review.has(id)) {
      review.delete(id);
    } else {
      review.add(id);
      mastered.delete(id);
    }
    localStorage.setItem('bank_mastered', JSON.stringify([...mastered]));
    localStorage.setItem('bank_review', JSON.stringify([...review]));
    renderCurrentView();
    return;
  }

  if (e.target.closest('#btn-detail-star')) {
    starred.has(id) ? starred.delete(id) : starred.add(id);
    localStorage.setItem('bank_starred', JSON.stringify([...starred]));
    renderCurrentView();
    return;
  }
});

// Detail Prev/Next navigation buttons
document.getElementById('detail-prev').addEventListener('click', () => {
  const items = getFilteredItems();
  const idx = items.findIndex(it => it.id === selectedId);
  if (idx > 0) {
    selectedId = items[idx - 1].id;
    renderSplitReader(items);
  }
});

document.getElementById('detail-next').addEventListener('click', () => {
  const items = getFilteredItems();
  const idx = items.findIndex(it => it.id === selectedId);
  if (idx < items.length - 1) {
    selectedId = items[idx + 1].id;
    renderSplitReader(items);
  }
});

// Accordion stream toggle & actions
document.getElementById('view-stream').addEventListener('click', e => {
  const card = e.target.closest('.card');
  if (!card) return;
  const id = +card.dataset.id;

  if (e.target.closest('.btn-star-icon')) {
    e.stopPropagation();
    starred.has(id) ? starred.delete(id) : starred.add(id);
    localStorage.setItem('bank_starred', JSON.stringify([...starred]));
    renderStream(getFilteredItems());
    return;
  }

  if (e.target.closest('.mastery-toggle-btn')) {
    e.stopPropagation();
    mastered.has(id) ? mastered.delete(id) : mastered.add(id);
    localStorage.setItem('bank_mastered', JSON.stringify([...mastered]));
    renderStream(getFilteredItems());
    return;
  }

  if (e.target.closest('.card-header-row')) {
    card.classList.toggle('open');
  }
});

// Random Question Jump button
document.getElementById('btn-random-pick').addEventListener('click', () => {
  const items = getFilteredItems();
  if (!items.length) return;
  const randomItem = items[Math.floor(Math.random() * items.length)];
  selectedId = randomItem.id;
  if (activeView !== 'split') switchViewMode('split');
  else renderSplitReader(items);
});

// Expand/Collapse in Stream mode
let allExpanded = false;
document.getElementById('btn-expand-all').addEventListener('click', () => {
  allExpanded = !allExpanded;
  document.querySelectorAll('#view-stream .card').forEach(c => c.classList.toggle('open', allExpanded));
  document.getElementById('btn-expand-all').querySelector('span').textContent = allExpanded ? 'Collapse All' : 'Expand All';
});

// Simulator Controls
document.getElementById('sim-btn-timer').addEventListener('click', toggleSimTimer);
document.getElementById('sim-btn-reveal').addEventListener('click', () => {
  document.getElementById('sim-revealed-key').classList.add('show');
});
document.getElementById('sim-btn-next').addEventListener('click', initSimulator);

document.getElementById('sim-rate-review').addEventListener('click', () => {
  if (simQuestion) {
    review.add(simQuestion.id);
    mastered.delete(simQuestion.id);
    localStorage.setItem('bank_review', JSON.stringify([...review]));
    localStorage.setItem('bank_mastered', JSON.stringify([...mastered]));
    updateReadinessMetric();
    initSimulator();
  }
});

document.getElementById('sim-rate-mastered').addEventListener('click', () => {
  if (simQuestion) {
    mastered.add(simQuestion.id);
    review.delete(simQuestion.id);
    localStorage.setItem('bank_mastered', JSON.stringify([...mastered]));
    localStorage.setItem('bank_review', JSON.stringify([...review]));
    updateReadinessMetric();
    initSimulator();
  }
});

// Flashcard Modal triggers
document.getElementById('btn-flashcard').addEventListener('click', openFlashcard);
document.getElementById('fc-close').addEventListener('click', () => fcModal.classList.remove('active'));
fcReveal.addEventListener('click', () => {
  fcAns.classList.add('show');
  fcReveal.style.display = 'none';
});

document.getElementById('fc-next').addEventListener('click', () => {
  const items = getFilteredItems();
  fcIndex = (fcIndex + 1) % items.length;
  showFlashcard(items);
});

document.getElementById('fc-prev').addEventListener('click', () => {
  const items = getFilteredItems();
  fcIndex = (fcIndex - 1 + items.length) % items.length;
  showFlashcard(items);
});

document.getElementById('fc-star').addEventListener('click', () => {
  const items = getFilteredItems();
  const item = items[fcIndex];
  starred.has(item.id) ? starred.delete(item.id) : starred.add(item.id);
  localStorage.setItem('bank_starred', JSON.stringify([...starred]));
  showFlashcard(items);
  renderCurrentView();
});

document.getElementById('fc-mark').addEventListener('click', () => {
  const items = getFilteredItems();
  const item = items[fcIndex];
  mastered.has(item.id) ? mastered.delete(item.id) : mastered.add(item.id);
  localStorage.setItem('bank_mastered', JSON.stringify([...mastered]));
  showFlashcard(items);
  renderCurrentView();
});

// Keyboard Navigation
window.addEventListener('keydown', e => {
  // Global search shortcut
  if (e.key === '/' && document.activeElement !== searchInput && !fcModal.classList.contains('active')) {
    e.preventDefault();
    searchInput.focus();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
    return;
  }
  if (e.key === 'Escape') {
    if (fcModal.classList.contains('active')) {
      fcModal.classList.remove('active');
    } else if (document.activeElement === searchInput) {
      searchInput.blur();
    }
    return;
  }

  // Flashcard Spacebar
  if (fcModal.classList.contains('active')) {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      if (fcReveal.style.display !== 'none') {
        fcAns.classList.add('show');
        fcReveal.style.display = 'none';
      }
    } else if (e.key === 'ArrowRight') {
      document.getElementById('fc-next').click();
    } else if (e.key === 'ArrowLeft') {
      document.getElementById('fc-prev').click();
    }
    return;
  }

  // Split Reader Keyboard Navigation (Arrow keys or J / K)
  if (activeView === 'split' && document.activeElement !== searchInput && document.activeElement.tagName !== 'TEXTAREA') {
    const items = getFilteredItems();
    const idx = items.findIndex(it => it.id === selectedId);

    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      if (idx < items.length - 1) {
        selectedId = items[idx + 1].id;
        renderSplitReader(items);
        // Scroll item into view
        const target = document.querySelector(`.master-item[data-id="${selectedId}"]`);
        if (target) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      if (idx > 0) {
        selectedId = items[idx - 1].id;
        renderSplitReader(items);
        const target = document.querySelector(`.master-item[data-id="${selectedId}"]`);
        if (target) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    } else if (e.key === 'm') {
      // Toggle mastered shortcut
      e.preventDefault();
      document.getElementById('btn-toggle-mastered')?.click();
    } else if (e.key === 's') {
      // Toggle star shortcut
      e.preventDefault();
      document.getElementById('btn-detail-star')?.click();
    }
  }
});

/* ==========================================================================
   INITIALIZE APPLICATION
   ========================================================================== */
function init() {
  // Assign stable sequential IDs
  Q.forEach((item, i) => { item.id = i; });

  // Render skill category chips
  renderCategoryChips();

  // Restore status filter state
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === activeStatus);
  });

  // Launch initial view mode
  switchViewMode(activeView);
}

// Start app
init();
