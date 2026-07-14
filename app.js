/* ============================================
   KIIT CSE 3rd Semester Section Finder
   Main Application Logic
   ============================================ */

(function () {
  'use strict';

  // ---- Initialize PDF.js worker immediately ----
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // ---- Configuration ----
  const CONFIG = {
    PDF_BASE: 'pdfs/',
    STUDENTS_PATH: 'students.json',
    SEARCH_DEBOUNCE: 200,
    MAX_SUGGESTIONS: 8,
    MAX_RECENT: 5,
    TOAST_DURATION: 3000,
    PDF_DEFAULT_SCALE: 1.5,
    PDF_MIN_SCALE: 0.5,
    PDF_MAX_SCALE: 3.0,
    PDF_SCALE_STEP: 0.25,
  };

  function getPdfUrl(sectionName) {
    return `${CONFIG.PDF_BASE}${sectionName}_Student_List.pdf`;
  }

  function getAbsolutePdfUrl(sectionName) {
    return new URL(getPdfUrl(sectionName), window.location.href).href;
  }

  // ---- State ----
  const state = {
    students: [],
    sections: [],
    favorites: new Set(),
    recent: [],
    currentFilter: 'all',
    searchQuery: '',
    pdfDoc: null,
    pdfCurrentPage: 1,
    pdfTotalPages: 0,
    pdfScale: CONFIG.PDF_DEFAULT_SCALE,
    pdfCurrentSection: '',
    isModalOpen: false,
    isShortcutsOpen: false,
    suggestionsIndex: -1,
  };

  const dom = {
    searchInput: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),
    searchSuggestions: document.getElementById('searchSuggestions'),
    sectionsGrid: document.getElementById('sectionsGrid'),
    sectionsHeader: document.getElementById('sectionsHeader'),
    sectionsCount: document.getElementById('sectionsCount'),
    studentResults: document.getElementById('studentResults'),
    noResults: document.getElementById('noResults'),
    favoritesSection: document.getElementById('favoritesSection'),
    favoritesGrid: document.getElementById('favoritesGrid'),
    recentSection: document.getElementById('recentSection'),
    recentGrid: document.getElementById('recentGrid'),
    quickJump: document.getElementById('quickJump'),
    pdfOverlay: document.getElementById('pdfOverlay'),
    pdfModal: document.getElementById('pdfModal'),
    pdfTitle: document.getElementById('pdfTitle'),
    pdfPageInfo: document.getElementById('pdfPageInfo'),
    pdfViewerContainer: document.getElementById('pdfViewerContainer'),
    pdfCanvasWrapper: document.getElementById('pdfCanvasWrapper'),
    pdfLoading: document.getElementById('pdfLoading'),
    pdfProgressFill: document.getElementById('pdfProgressFill'),
    pdfPrev: document.getElementById('pdfPrev'),
    pdfNext: document.getElementById('pdfNext'),
    pdfZoomIn: document.getElementById('pdfZoomIn'),
    pdfZoomOut: document.getElementById('pdfZoomOut'),
    pdfDownload: document.getElementById('pdfDownload'),
    pdfPrint: document.getElementById('pdfPrint'),
    pdfFullscreen: document.getElementById('pdfFullscreen'),
    pdfClose: document.getElementById('pdfClose'),
    shortcutsBtn: document.getElementById('shortcutsBtn'),
    shortcutsOverlay: document.getElementById('shortcutsOverlay'),
    shortcutsModal: document.getElementById('shortcutsModal'),
    shortcutsClose: document.getElementById('shortcutsClose'),
    themeToggle: document.getElementById('themeToggle'),
    scrollTop: document.getElementById('scrollTop'),
    toastContainer: document.getElementById('toastContainer'),
    totalStudents: document.getElementById('totalStudents'),
    totalSections: document.getElementById('totalSections'),
    totalPdfs: document.getElementById('totalPdfs'),
    footerShortcuts: document.getElementById('footerShortcuts'),
  };

  // ============================================
  // INITIALIZATION
  // ============================================

  async function init() {
    initTheme();
    loadFavorites();
    loadRecent();
    await loadStudents();
    buildSections();
    renderSections();
    renderFavorites();
    renderRecent();
    bindEvents();
    animateStats();
  }

  async function loadStudents() {
    try {
      const response = await fetch(CONFIG.STUDENTS_PATH);
      if (!response.ok) throw new Error('Failed to load student data');
      state.students = await response.json();
    } catch (err) {
      console.error('Error loading students:', err);
      showToast('Failed to load student database', 'error');
      state.students = [];
    }
  }

  function buildSections() {
    const sectionMap = {};
    state.students.forEach(s => {
      if (!sectionMap[s.section]) sectionMap[s.section] = 0;
      sectionMap[s.section]++;
    });

    state.sections = [];
    for (let i = 1; i <= 49; i++) {
      const name = `CS${i}`;
      state.sections.push({
        name,
        count: sectionMap[name] || 0,
        pdfUrl: getPdfUrl(name),
        pdfFilename: `${name}_Student_List.pdf`,
      });
    }

    dom.totalSections.textContent = state.sections.length;
    dom.totalStudents.textContent = state.students.length.toLocaleString();
    dom.totalPdfs.textContent = state.sections.length;
  }

  // ============================================
  // THEME
  // ============================================

  function initTheme() {
    const saved = localStorage.getItem('kiit-theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('kiit-theme', next);
    showToast(`${next === 'dark' ? '🌙 Dark' : '☀️ Light'} mode enabled`, 'info');
  }

  // ============================================
  // FAVORITES & RECENT
  // ============================================

  function loadFavorites() {
    try {
      const saved = JSON.parse(localStorage.getItem('kiit-favorites') || '[]');
      state.favorites = new Set(saved);
    } catch { state.favorites = new Set(); }
  }

  function saveFavorites() {
    localStorage.setItem('kiit-favorites', JSON.stringify([...state.favorites]));
  }

  function toggleFavorite(section) {
    if (state.favorites.has(section)) {
      state.favorites.delete(section);
      showToast(`${section} removed from favorites`, 'info');
    } else {
      state.favorites.add(section);
      showToast(`⭐ ${section} added to favorites`, 'success');
    }
    saveFavorites();
    renderFavorites();
    updateCardFavoriteState(section);
  }

  function updateCardFavoriteState(section) {
    const card = document.querySelector(`.section-card[data-section="${section}"]`);
    if (!card) return;
    const btn = card.querySelector('.card-favorite');
    if (state.favorites.has(section)) {
      card.classList.add('favorite');
      btn.classList.add('active');
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    } else {
      card.classList.remove('favorite');
      btn.classList.remove('active');
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    }
  }

  function renderFavorites() {
    if (state.favorites.size === 0) {
      dom.favoritesSection.classList.remove('visible');
      return;
    }
    dom.favoritesSection.classList.add('visible');
    dom.favoritesGrid.innerHTML = [...state.favorites]
      .sort((a, b) => parseInt(a.replace('CS', ''), 10) - parseInt(b.replace('CS', ''), 10))
      .map(sec => `<button class="favorite-chip" data-section="${sec}" title="Open ${sec}">⭐ ${sec}</button>`)
      .join('');
  }

  function loadRecent() {
    try { state.recent = JSON.parse(localStorage.getItem('kiit-recent') || '[]'); }
    catch { state.recent = []; }
  }

  function addRecent(section) {
    state.recent = state.recent.filter(s => s !== section);
    state.recent.unshift(section);
    if (state.recent.length > CONFIG.MAX_RECENT) state.recent = state.recent.slice(0, CONFIG.MAX_RECENT);
    localStorage.setItem('kiit-recent', JSON.stringify(state.recent));
    renderRecent();
  }

  function renderRecent() {
    if (state.recent.length === 0) { dom.recentSection.classList.remove('visible'); return; }
    dom.recentSection.classList.add('visible');
    dom.recentGrid.innerHTML = state.recent.map(sec =>
      `<button class="recent-chip" data-section="${sec}" title="Open ${sec}">🕐 ${sec}</button>`
    ).join('');
  }

  // ============================================
  // STATS ANIMATION
  // ============================================

  function animateStats() {
    document.querySelectorAll('.hero-stat .number').forEach(el => {
      const target = parseInt(el.textContent.replace(/,/g, ''), 10);
      let current = 0;
      const step = Math.ceil(target / 40);
      const timer = setInterval(() => {
        current += step;
        if (current >= target) { current = target; clearInterval(timer); }
        el.textContent = current.toLocaleString();
      }, 30);
    });
  }

  // ============================================
  // SECTION CARDS
  // ============================================

  function renderSections(filter = 'all') {
    let sections = state.sections;

    if (filter !== 'all') {
      const [start, end] = filter.split('-').map(Number);
      sections = sections.filter(s => {
        const n = parseInt(s.name.replace('CS', ''), 10);
        return n >= start && n <= end;
      });
    }

    dom.sectionsCount.textContent = `${sections.length} section${sections.length !== 1 ? 's' : ''}`;

    if (!sections.length) {
      dom.sectionsGrid.innerHTML = '';
      dom.noResults.style.display = 'block';
      return;
    }

    dom.noResults.style.display = 'none';
    dom.sectionsGrid.innerHTML = sections.map((sec, i) => {
      const isFav = state.favorites.has(sec.name);
      return `
        <div class="section-card ${isFav ? 'favorite' : ''}" data-section="${sec.name}" style="animation-delay:${Math.min(i * 0.03, 0.5)}s">
          <div class="card-top">
            <span class="card-section-name">${sec.name}</span>
            <button class="card-favorite ${isFav ? 'active' : ''}" data-section="${sec.name}" title="Toggle Favorite">
              <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${isFav ? '1' : '2'}">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          </div>
          <div class="card-student-count">${sec.count} Students</div>
          <div class="card-actions">
            <button class="card-btn btn-preview" data-section="${sec.name}" title="Preview PDF">Preview</button>
            <button class="card-btn btn-download" data-section="${sec.name}" title="Download PDF">Download</button>
            <button class="card-btn btn-share" data-section="${sec.name}" title="Share PDF">Share</button>
          </div>
        </div>`;
    }).join('');
  }

  // ============================================
  // SEARCH
  // ============================================

  let searchTimeout = null;

  function handleSearch(query) {
    state.searchQuery = query.trim();
    const q = state.searchQuery.toLowerCase();
    dom.searchClear.classList.toggle('visible', q.length > 0);
    if (!q) { clearSearch(); return; }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(q), CONFIG.SEARCH_DEBOUNCE);
  }

  function performSearch(q) {
    const sectionMatches = state.sections.filter(sec => sec.name.toLowerCase().includes(q));
    const studentMatches = state.students.filter(s =>
      s.name.toLowerCase().includes(q) || s.roll.toLowerCase().includes(q)
    );

    showSuggestions(q, sectionMatches, studentMatches);

    const matchedSectionNames = new Set([
      ...sectionMatches.map(s => s.name),
      ...studentMatches.map(s => s.section),
    ]);

    if (studentMatches.length > 0 && sectionMatches.length === 0) {
      showStudentResults(studentMatches.slice(0, 20));
    } else {
      dom.studentResults.style.display = 'none';
    }

    if (matchedSectionNames.size > 0) {
      dom.noResults.style.display = 'none';
      dom.sectionsGrid.style.display = '';
      dom.sectionsHeader.style.display = '';
      document.querySelectorAll('.section-card').forEach(card => {
        const section = card.getAttribute('data-section');
        if (matchedSectionNames.has(section)) {
          card.style.display = '';
          card.style.animation = 'fadeInUp 0.3s ease-out both';
        } else {
          card.style.display = 'none';
        }
      });
      dom.sectionsCount.textContent = `${matchedSectionNames.size} section${matchedSectionNames.size !== 1 ? 's' : ''} found`;
    } else {
      dom.sectionsGrid.style.display = 'none';
      dom.sectionsHeader.style.display = 'none';
      dom.noResults.style.display = 'block';
    }
  }

  function clearSearch() {
    state.searchQuery = '';
    dom.searchInput.value = '';
    dom.searchClear.classList.remove('visible');
    dom.searchSuggestions.classList.remove('active');
    dom.studentResults.style.display = 'none';
    dom.noResults.style.display = 'none';
    dom.sectionsGrid.style.display = '';
    dom.sectionsHeader.style.display = '';
    document.querySelectorAll('.section-card').forEach(card => { card.style.display = ''; });
    document.querySelectorAll('#quickJump .filter-chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.range === 'all');
    });
    state.currentFilter = 'all';
    dom.sectionsCount.textContent = `${state.sections.length} sections`;
  }

  function showSuggestions(q, sectionMatches, studentMatches) {
    const suggestions = [];
    sectionMatches.slice(0, 3).forEach(sec => {
      suggestions.push({ type: 'section', name: sec.name, meta: `${sec.count} students`, section: sec.name });
    });
    studentMatches.slice(0, CONFIG.MAX_SUGGESTIONS - suggestions.length).forEach(s => {
      suggestions.push({ type: 'student', name: s.name, meta: `Roll: ${s.roll} · ${s.section}`, section: s.section });
    });

    if (suggestions.length === 0) { dom.searchSuggestions.classList.remove('active'); return; }

    state.suggestionsIndex = -1;
    dom.searchSuggestions.innerHTML = suggestions.map((s, i) => `
      <div class="suggestion-item" data-index="${i}" data-section="${s.section}" data-type="${s.type}" data-name="${s.name}">
        <div class="suggestion-icon ${s.type}">
          ${s.type === 'section'
            ? s.name.replace('CS', '')
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
          }
        </div>
        <div class="suggestion-info">
          <div class="suggestion-name">${highlightMatch(s.name, q)}</div>
          <div class="suggestion-meta">${s.meta}</div>
        </div>
      </div>
    `).join('');
    dom.searchSuggestions.classList.add('active');
  }

  function highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return `${text.slice(0, idx)}<mark>${text.slice(idx, idx + query.length)}</mark>${text.slice(idx + query.length)}`;
  }

  function showStudentResults(students) {
    dom.studentResults.style.display = 'block';
    dom.studentResults.innerHTML = students.map((s, i) => `
      <div class="student-card" style="animation-delay: ${i * 0.05}s">
        <div class="student-avatar">${getInitials(s.name)}</div>
        <div class="student-info">
          <div class="student-name">${s.name}</div>
          <div class="student-details">
            <span><span class="label">Roll:</span> ${s.roll}</span>
            <span><span class="label">Section:</span> <span class="student-section-badge">${s.section}</span></span>
          </div>
        </div>
        <div class="student-action">
          <button class="btn-open-section" data-section="${s.section}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            Open Section PDF
          </button>
        </div>
      </div>
    `).join('');
  }

  function getInitials(name) {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  // ============================================
  // PDF VIEWER
  // ============================================

  async function openPdfViewer(sectionName) {
    state.isModalOpen = true;
    state.pdfCurrentSection = sectionName;
    state.pdfCurrentPage = 1;
    state.pdfScale = CONFIG.PDF_DEFAULT_SCALE;
    addRecent(sectionName);

    dom.pdfOverlay.classList.add('active');
    dom.pdfModal.classList.add('active');
    dom.pdfTitle.textContent = `${sectionName} Student List`;
    dom.pdfLoading.style.display = 'flex';
    dom.pdfCanvasWrapper.style.display = 'none';
    dom.pdfProgressFill.style.width = '0%';
    document.body.style.overflow = 'hidden';

    try {
      if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js library not loaded');

      const pdfUrl = getAbsolutePdfUrl(sectionName);
      console.log('Loading PDF from:', pdfUrl);

      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      loadingTask.onProgress = (p) => {
        if (p.total > 0) dom.pdfProgressFill.style.width = `${(p.loaded / p.total) * 100}%`;
      };
      state.pdfDoc = await loadingTask.promise;
      state.pdfTotalPages = state.pdfDoc.numPages;
      dom.pdfProgressFill.style.width = '100%';
      await renderAllPages();
      dom.pdfLoading.style.display = 'none';
      dom.pdfCanvasWrapper.style.display = 'flex';
      updatePageInfo();
    } catch (err) {
      console.error('PDF load error:', err);
      showToast('Failed to load PDF. Please try downloading instead.', 'error');
      closePdfViewer();
    }
  }

  async function renderAllPages() {
    dom.pdfCanvasWrapper.innerHTML = '';
    for (let i = 1; i <= state.pdfTotalPages; i++) {
      const page = await state.pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: state.pdfScale });
      const canvas = document.createElement('canvas');
      canvas.id = `pdf-page-${i}`;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      dom.pdfCanvasWrapper.appendChild(canvas);
    }
  }

  async function rerenderPages() {
    if (!state.pdfDoc) return;
    await renderAllPages();
  }

  function updatePageInfo() {
    dom.pdfPageInfo.textContent = `Page ${state.pdfCurrentPage} / ${state.pdfTotalPages}`;
  }

  function pdfPrevPage() {
    if (state.pdfCurrentPage <= 1) return;
    state.pdfCurrentPage--;
    scrollToPage(state.pdfCurrentPage);
    updatePageInfo();
  }

  function pdfNextPage() {
    if (state.pdfCurrentPage >= state.pdfTotalPages) return;
    state.pdfCurrentPage++;
    scrollToPage(state.pdfCurrentPage);
    updatePageInfo();
  }

  function scrollToPage(pageNum) {
    const canvas = document.getElementById(`pdf-page-${pageNum}`);
    if (canvas) canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function pdfZoomIn() {
    if (state.pdfScale >= CONFIG.PDF_MAX_SCALE) return;
    state.pdfScale += CONFIG.PDF_SCALE_STEP;
    rerenderPages();
    showToast(`Zoom: ${Math.round(state.pdfScale * 100)}%`, 'info');
  }

  function pdfZoomOut() {
    if (state.pdfScale <= CONFIG.PDF_MIN_SCALE) return;
    state.pdfScale -= CONFIG.PDF_SCALE_STEP;
    rerenderPages();
    showToast(`Zoom: ${Math.round(state.pdfScale * 100)}%`, 'info');
  }

  function closePdfViewer() {
    state.isModalOpen = false;
    dom.pdfOverlay.classList.remove('active');
    dom.pdfModal.classList.remove('active');
    document.body.style.overflow = '';
    state.pdfDoc = null;
    dom.pdfCanvasWrapper.innerHTML = '';
  }

  function downloadPdf(sectionName) {
    const url = getAbsolutePdfUrl(sectionName);
    const filename = `${sectionName}_Student_List.pdf`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`📥 Downloading ${filename}`, 'success');
  }

  function pdfPrint() {
    if (!state.pdfCurrentSection) return;
    const url = getAbsolutePdfUrl(state.pdfCurrentSection);
    const w = window.open(url, '_blank');
    if (w) w.addEventListener('load', () => w.print());
  }

  function pdfFullscreen() {
    const el = dom.pdfModal;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
  }

  // ============================================
  // SHARE
  // ============================================

  async function sharePdf(sectionName) {
    const shareUrl = getAbsolutePdfUrl(sectionName);
    const shareData = {
      title: `KIIT CSE ${sectionName} Student List`,
      text: `Check out the student list for ${sectionName}`,
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        showToast(`📤 ${sectionName} shared successfully!`, 'success');
      } catch (err) {
        if (err.name !== 'AbortError') fallbackShare(shareUrl, sectionName);
      }
    } else {
      fallbackShare(shareUrl, sectionName);
    }
  }

  function fallbackShare(url, sectionName) {
    navigator.clipboard.writeText(url)
      .then(() => showToast(`📋 Link for ${sectionName} copied to clipboard!`, 'success'))
      .catch(() => showToast('Failed to copy link', 'error'));
  }

  // ============================================
  // TOAST NOTIFICATIONS
  // ============================================

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, CONFIG.TOAST_DURATION);
  }

  // ============================================
  // SHORTCUTS & KEYBOARD
  // ============================================

  function toggleShortcutsModal(show) {
    state.isShortcutsOpen = show;
    dom.shortcutsOverlay.classList.toggle('active', show);
    dom.shortcutsModal.classList.toggle('active', show);
  }

  function handleKeyboard(e) {
    if (state.isModalOpen) {
      if (e.key === 'Escape') closePdfViewer();
      if (e.key === 'ArrowLeft') pdfPrevPage();
      if (e.key === 'ArrowRight') pdfNextPage();
      if (e.key === '+' || e.key === '=') pdfZoomIn();
      if (e.key === '-') pdfZoomOut();
      return;
    }
    if (state.isShortcutsOpen) {
      if (e.key === 'Escape') toggleShortcutsModal(false);
      return;
    }
    if (document.activeElement === dom.searchInput && e.key !== 'Escape') return;
    if (e.key === '/') { e.preventDefault(); dom.searchInput.focus(); }
    if (e.key === 'd' || e.key === 'D') toggleTheme();
    if (e.key === '?') toggleShortcutsModal(true);
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); dom.searchInput.focus(); }
  }

  // ============================================
  // EVENT BINDING
  // ============================================

  function bindEvents() {
    // Section card actions — use data-section for everything
    dom.sectionsGrid.addEventListener('click', (e) => {
      const previewBtn = e.target.closest('.btn-preview');
      if (previewBtn) { openPdfViewer(previewBtn.dataset.section); return; }

      const downloadBtn = e.target.closest('.btn-download');
      if (downloadBtn) { downloadPdf(downloadBtn.dataset.section); return; }

      const shareBtn = e.target.closest('.btn-share');
      if (shareBtn) { sharePdf(shareBtn.dataset.section); return; }

      const favBtn = e.target.closest('.card-favorite');
      if (favBtn) { toggleFavorite(favBtn.dataset.section); return; }
    });

    // Student results — open section button
    dom.studentResults.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-open-section');
      if (btn) openPdfViewer(btn.dataset.section);
    });

    // PDF modal controls
    dom.pdfPrev.addEventListener('click', pdfPrevPage);
    dom.pdfNext.addEventListener('click', pdfNextPage);
    dom.pdfZoomIn.addEventListener('click', pdfZoomIn);
    dom.pdfZoomOut.addEventListener('click', pdfZoomOut);
    dom.pdfClose.addEventListener('click', closePdfViewer);
    dom.pdfOverlay.addEventListener('click', closePdfViewer);
    dom.pdfFullscreen.addEventListener('click', pdfFullscreen);
    dom.pdfPrint.addEventListener('click', pdfPrint);
    dom.pdfDownload.addEventListener('click', () => {
      if (state.pdfCurrentSection) downloadPdf(state.pdfCurrentSection);
    });

    // Favorites & Recent chips
    dom.favoritesGrid.addEventListener('click', (e) => {
      const chip = e.target.closest('.favorite-chip');
      if (chip) openPdfViewer(chip.dataset.section);
    });
    dom.recentGrid.addEventListener('click', (e) => {
      const chip = e.target.closest('.recent-chip');
      if (chip) openPdfViewer(chip.dataset.section);
    });

    // Search
    dom.searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
    dom.searchClear.addEventListener('click', clearSearch);
    dom.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { clearSearch(); dom.searchInput.blur(); }
    });
    dom.searchSuggestions.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (item) {
        openPdfViewer(item.dataset.section);
        clearSearch();
      }
    });

    // Quick jump filter
    dom.quickJump.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      document.querySelectorAll('#quickJump .filter-chip').forEach(b => b.classList.remove('active'));
      chip.classList.add('active');
      state.currentFilter = chip.dataset.range;
      renderSections(state.currentFilter);
    });

    // Theme & shortcuts
    dom.themeToggle.addEventListener('click', toggleTheme);
    dom.shortcutsBtn.addEventListener('click', () => toggleShortcutsModal(true));
    dom.shortcutsClose.addEventListener('click', () => toggleShortcutsModal(false));
    dom.shortcutsOverlay.addEventListener('click', () => toggleShortcutsModal(false));
    dom.footerShortcuts.addEventListener('click', (e) => { e.preventDefault(); toggleShortcutsModal(true); });

    // Scroll to top
    window.addEventListener('scroll', () => {
      dom.scrollTop.classList.toggle('visible', window.scrollY > 400);
    });
    dom.scrollTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', handleKeyboard);
  }

  // Start the app
  init();
})();
