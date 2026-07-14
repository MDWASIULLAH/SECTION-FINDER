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

  // ---- Auto-detect base path ----
  // Works whether served from root, /public/, or any subdirectory
  const BASE_PATH = (() => {
    // Get the directory of the current page
    const path = window.location.pathname;
    const dir = path.substring(0, path.lastIndexOf('/') + 1);
    return dir;
  })();

  // ---- Configuration ----
  const CONFIG = {
    PDF_PATH: BASE_PATH + 'pdfs/',
    STUDENTS_PATH: BASE_PATH + 'students.json',
    SEARCH_DEBOUNCE: 200,
    MAX_SUGGESTIONS: 8,
    MAX_RECENT: 5,
    TOAST_DURATION: 3000,
    PDF_DEFAULT_SCALE: 1.5,
    PDF_MIN_SCALE: 0.5,
    PDF_MAX_SCALE: 3.0,
    PDF_SCALE_STEP: 0.25,
  };

  // ---- State ----
  const state = {
    students: [],
    sections: [],            // Array of { name, count, pdfUrl }
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

  // ---- DOM References ----
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
    // PDF Modal
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
    // Shortcuts
    shortcutsBtn: document.getElementById('shortcutsBtn'),
    shortcutsOverlay: document.getElementById('shortcutsOverlay'),
    shortcutsModal: document.getElementById('shortcutsModal'),
    shortcutsClose: document.getElementById('shortcutsClose'),
    // Theme
    themeToggle: document.getElementById('themeToggle'),
    // Scroll top
    scrollTop: document.getElementById('scrollTop'),
    // Toast
    toastContainer: document.getElementById('toastContainer'),
    // Stats
    totalStudents: document.getElementById('totalStudents'),
    totalSections: document.getElementById('totalSections'),
    totalPdfs: document.getElementById('totalPdfs'),
    // Footer
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

  // ---- Load student data ----
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

  // ---- Build sections from student data ----
  function buildSections() {
    const sectionMap = {};
    state.students.forEach(s => {
      if (!sectionMap[s.section]) {
        sectionMap[s.section] = 0;
      }
      sectionMap[s.section]++;
    });

    // Generate sections CS1 to CS49
    state.sections = [];
    for (let i = 1; i <= 49; i++) {
      const name = `CS${i}`;
      state.sections.push({
        name: name,
        count: sectionMap[name] || 0,
        pdfUrl: `${CONFIG.PDF_PATH}${name}_Student_List.pdf`,
        pdfFilename: `${name}_Student_List.pdf`,
      });
    }

    // Update stats
    dom.totalSections.textContent = state.sections.length;
    dom.totalStudents.textContent = state.students.length.toLocaleString();
    dom.totalPdfs.textContent = state.sections.length;
  }

  // ---- Animate stats counter ----
  function animateStats() {
    document.querySelectorAll('.hero-stat .number').forEach(el => {
      const target = parseInt(el.textContent.replace(/,/g, ''), 10);
      let current = 0;
      const step = Math.ceil(target / 40);
      const timer = setInterval(() => {
        current += step;
        if (current >= target) {
          current = target;
          clearInterval(timer);
        }
        el.textContent = current.toLocaleString();
      }, 30);
    });
  }

  // ============================================
  // THEME
  // ============================================

  function initTheme() {
    const saved = localStorage.getItem('kiit-theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      // Detect system preference
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
    } catch {
      state.favorites = new Set();
    }
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
      .sort((a, b) => {
        const numA = parseInt(a.replace('CS', ''), 10);
        const numB = parseInt(b.replace('CS', ''), 10);
        return numA - numB;
      })
      .map(sec => `
        <button class="favorite-chip" data-section="${sec}" title="Open ${sec}">
          ⭐ ${sec}
        </button>
      `).join('');
  }

  function loadRecent() {
    try {
      state.recent = JSON.parse(localStorage.getItem('kiit-recent') || '[]');
    } catch {
      state.recent = [];
    }
  }

  function addRecent(section) {
    state.recent = state.recent.filter(s => s !== section);
    state.recent.unshift(section);
    if (state.recent.length > CONFIG.MAX_RECENT) {
      state.recent = state.recent.slice(0, CONFIG.MAX_RECENT);
    }
    localStorage.setItem('kiit-recent', JSON.stringify(state.recent));
    renderRecent();
  }

  function renderRecent() {
    if (state.recent.length === 0) {
      dom.recentSection.classList.remove('visible');
      return;
    }
    dom.recentSection.classList.add('visible');
    dom.recentGrid.innerHTML = state.recent.map(sec => `
      <button class="recent-chip" data-section="${sec}" title="Open ${sec}">
        🕐 ${sec}
      </button>
    `).join('');
  }

  // ============================================
  // SECTION CARDS
  // ============================================

  function renderSections(filter = 'all') {
    let sections = state.sections;

    // Apply range filter
    if (filter !== 'all') {
      const [start, end] = filter.split('-').map(Number);
      sections = sections.filter(s => {
        const num = parseInt(s.name.replace('CS', ''), 10);
        return num >= start && num <= end;
      });
    }

    dom.sectionsCount.textContent = `${sections.length} section${sections.length !== 1 ? 's' : ''}`;

    if (sections.length === 0) {
      dom.sectionsGrid.innerHTML = '';
      dom.noResults.style.display = 'block';
      return;
    }

    dom.noResults.style.display = 'none';
    dom.sectionsGrid.innerHTML = sections.map((sec, i) => {
      const isFav = state.favorites.has(sec.name);
      return `
        <div class="section-card ${isFav ? 'favorite' : ''}" data-section="${sec.name}" style="animation-delay: ${Math.min(i * 0.03, 0.5)}s">
          <div class="card-top">
            <span class="card-section-name">${sec.name}</span>
            <button class="card-favorite ${isFav ? 'active' : ''}" data-section="${sec.name}" title="Toggle Favorite">
              <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${isFav ? '1' : '2'}">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          </div>
          <div class="card-student-count">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            ${sec.count} Students
          </div>
          <div class="card-actions">
            <button class="card-btn btn-preview" data-pdf="${sec.pdfUrl}" data-name="${sec.name}" title="Preview PDF">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              Preview
            </button>
            <button class="card-btn btn-download" data-pdf="${sec.pdfUrl}" data-filename="${sec.pdfFilename}" title="Download PDF">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </button>
            <button class="card-btn btn-share" data-section="${sec.name}" data-pdf="${sec.pdfUrl}" title="Share PDF">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              Share
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ============================================
  // SEARCH
  // ============================================

  let searchTimeout = null;

  function handleSearch(query) {
    state.searchQuery = query.trim();
    const q = state.searchQuery.toLowerCase();

    // Toggle clear button
    dom.searchClear.classList.toggle('visible', q.length > 0);

    if (!q) {
      clearSearch();
      return;
    }

    // Debounced search
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(q), CONFIG.SEARCH_DEBOUNCE);
  }

  function performSearch(q) {
    // Search sections
    const sectionMatches = state.sections.filter(sec =>
      sec.name.toLowerCase().includes(q)
    );

    // Search students
    const studentMatches = state.students.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.roll.toLowerCase().includes(q)
    );

    // Show suggestions
    showSuggestions(q, sectionMatches, studentMatches);

    // Determine what to show
    const matchedSectionNames = new Set([
      ...sectionMatches.map(s => s.name),
      ...studentMatches.map(s => s.section),
    ]);

    // Show student results if name/roll search
    if (studentMatches.length > 0 && sectionMatches.length === 0) {
      showStudentResults(studentMatches.slice(0, 20));
    } else {
      dom.studentResults.style.display = 'none';
    }

    // Filter section cards
    if (matchedSectionNames.size > 0) {
      dom.noResults.style.display = 'none';
      dom.sectionsGrid.style.display = '';
      dom.sectionsHeader.style.display = '';
      
      // Highlight matching cards
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

    // Show all cards
    document.querySelectorAll('.section-card').forEach(card => {
      card.style.display = '';
    });

    // Reset quick jump
    document.querySelectorAll('#quickJump .filter-chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.range === 'all');
    });
    state.currentFilter = 'all';
    dom.sectionsCount.textContent = `${state.sections.length} sections`;
  }

  function showSuggestions(q, sectionMatches, studentMatches) {
    const suggestions = [];

    // Add section suggestions
    sectionMatches.slice(0, 3).forEach(sec => {
      suggestions.push({
        type: 'section',
        name: sec.name,
        meta: `${sec.count} students`,
        section: sec.name,
      });
    });

    // Add student suggestions
    studentMatches.slice(0, CONFIG.MAX_SUGGESTIONS - suggestions.length).forEach(s => {
      suggestions.push({
        type: 'student',
        name: s.name,
        meta: `Roll: ${s.roll} · ${s.section}`,
        section: s.section,
      });
    });

    if (suggestions.length === 0) {
      dom.searchSuggestions.classList.remove('active');
      return;
    }

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
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);
    return `${before}<mark>${match}</mark>${after}`;
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
          <button class="btn-open-section" data-pdf="${CONFIG.PDF_PATH}${s.section}_Student_List.pdf" data-name="${s.section}">
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

  async function openPdfViewer(pdfUrl, sectionName) {
    state.isModalOpen = true;
    state.pdfCurrentSection = sectionName;
    state.pdfCurrentPage = 1;
    state.pdfScale = CONFIG.PDF_DEFAULT_SCALE;
    addRecent(sectionName);

    // Show modal
    dom.pdfOverlay.classList.add('active');
    dom.pdfModal.classList.add('active');
    dom.pdfTitle.textContent = `${sectionName} Student List`;
    dom.pdfLoading.style.display = 'flex';
    dom.pdfCanvasWrapper.style.display = 'none';
    dom.pdfProgressFill.style.width = '0%';
    document.body.style.overflow = 'hidden';

    try {
      // Ensure PDF.js worker is set
      if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js library not loaded');
      }

      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      loadingTask.onProgress = (progress) => {
        if (progress.total > 0) {
          const pct = (progress.loaded / progress.total) * 100;
          dom.pdfProgressFill.style.width = `${pct}%`;
        }
      };

      state.pdfDoc = await loadingTask.promise;
      state.pdfTotalPages = state.pdfDoc.numPages;
      dom.pdfProgressFill.style.width = '100%';

      // Render all pages
      await renderAllPages();

      dom.pdfLoading.style.display = 'none';
      dom.pdfCanvasWrapper.style.display = 'flex';
      updatePageInfo();

    } catch (err) {
      console.error('PDF load error:', err, 'URL:', pdfUrl);
      showToast(`Failed to load PDF: ${err.message || 'Unknown error'}`, 'error');
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
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      
      dom.pdfCanvasWrapper.appendChild(canvas);
    }
  }

  async function rerenderPages() {
    if (!state.pdfDoc) return;
    dom.pdfCanvasWrapper.innerHTML = '';
    for (let i = 1; i <= state.pdfTotalPages; i++) {
      const page = await state.pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: state.pdfScale });

      const canvas = document.createElement('canvas');
      canvas.id = `pdf-page-${i}`;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;

      dom.pdfCanvasWrapper.appendChild(canvas);
    }
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
    if (canvas) {
      canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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

  function downloadPdf(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    showToast(`📥 Downloading ${filename}`, 'success');
  }

  function pdfPrint() {
    if (!state.pdfCurrentSection) return;
    const url = `${CONFIG.PDF_PATH}${state.pdfCurrentSection}_Student_List.pdf`;
    const printWindow = window.open(url, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      });
    }
  }

  function pdfFullscreen() {
    const el = dom.pdfModal;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (el.requestFullscreen) {
      el.requestFullscreen();
    }
  }

  // ============================================
  // SHARE
  // ============================================

  async function sharePdf(sectionName, pdfUrl) {
    const shareData = {
      title: `KIIT CSE ${sectionName} Student List`,
      text: `Check out the student list for ${sectionName} - KIIT CSE 3rd Semester`,
      url: window.location.href.split('?')[0] + `?section=${sectionName}`,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        showToast(`📤 ${sectionName} shared successfully!`, 'success');
      } catch (err) {
        if (err.name !== 'AbortError') {
          fallbackShare(shareData.url, sectionName);
        }
      }
    } else {
      fallbackShare(shareData.url, sectionName);
    }
  }

  function fallbackShare(url, sectionName) {
    navigator.clipboard.writeText(url).then(() => {
      showToast(`📋 Link for ${sectionName} copied to clipboard!`, 'success');
    }).catch(() => {
      showToast('Failed to copy link', 'error');
    });
  }

  // ============================================
  // TOAST NOTIFICATIONS
  // ============================================

  function showToast(message, type = 'info') {
    const iconMap = {
      success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `${iconMap[type] || iconMap.info}<span>${message}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, CONFIG.TOAST_DURATION);
  }

  // ============================================
  // SCROLL TO TOP
  // ============================================

  function handleScroll() {
    const scrollY = window.scrollY;
    dom.scrollTop.classList.toggle('visible', scrollY > 400);
  }

  // ============================================
  // KEYBOARD SHORTCUTS
  // ============================================

  function toggleShortcutsModal(show) {
    state.isShortcutsOpen = show;
    dom.shortcutsOverlay.classList.toggle('active', show);
    dom.shortcutsModal.classList.toggle('active', show);
  }

  function handleKeyboard(e) {
    // When PDF viewer is open
    if (state.isModalOpen) {
      switch (e.key) {
        case 'Escape':
          closePdfViewer();
          break;
        case 'ArrowLeft':
          pdfPrevPage();
          break;
        case 'ArrowRight':
          pdfNextPage();
          break;
        case '+':
        case '=':
          pdfZoomIn();
          break;
        case '-':
          pdfZoomOut();
          break;
      }
      return;
    }

    // When shortcuts modal is open
    if (state.isShortcutsOpen) {
      if (e.key === 'Escape') toggleShortcutsModal(false);
      return;
    }

    // Global shortcuts - skip if user is typing in input
    if (document.activeElement === dom.searchInput && e.key !== 'Escape') return;

    switch (e.key) {
      case '/':
        e.preventDefault();
        dom.searchInput.focus();
        break;
      case 'Escape':
        if (state.searchQuery) {
          clearSearch();
          dom.searchInput.blur();
        }
        break;
      case 'd':
      case 'D':
        toggleTheme();
        break;
      case '?':
        toggleShortcutsModal(true);
        break;
      case 't':
      case 'T':
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
    }

    // Ctrl+K
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      dom.searchInput.focus();
    }
  }

  // ============================================
  // URL HANDLING
  // ============================================

  function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const section = params.get('section');
    if (section) {
      const sec = state.sections.find(s => s.name.toLowerCase() === section.toLowerCase());
      if (sec) {
        setTimeout(() => openPdfViewer(sec.pdfUrl, sec.name), 500);
      }
    }
  }

  // ============================================
  // EVENT BINDING
  // ============================================

  function bindEvents() {
    // Search
    dom.searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
    dom.searchClear.addEventListener('click', () => {
      clearSearch();
      dom.searchInput.focus();
    });

    // Search suggestions keyboard navigation
    dom.searchInput.addEventListener('keydown', (e) => {
      const items = dom.searchSuggestions.querySelectorAll('.suggestion-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.suggestionsIndex = Math.min(state.suggestionsIndex + 1, items.length - 1);
        updateSuggestionHighlight(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.suggestionsIndex = Math.max(state.suggestionsIndex - 1, -1);
        updateSuggestionHighlight(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (state.suggestionsIndex >= 0 && items[state.suggestionsIndex]) {
          items[state.suggestionsIndex].click();
        }
      } else if (e.key === 'Escape') {
        dom.searchSuggestions.classList.remove('active');
        dom.searchInput.blur();
      }
    });

    // Search suggestions click
    dom.searchSuggestions.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;
      const section = item.dataset.section;
      const type = item.dataset.type;
      dom.searchSuggestions.classList.remove('active');

      if (type === 'section') {
        dom.searchInput.value = section;
        handleSearch(section);
      } else {
        // Open the section PDF for student
        const sec = state.sections.find(s => s.name === section);
        if (sec) openPdfViewer(sec.pdfUrl, sec.name);
      }
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        dom.searchSuggestions.classList.remove('active');
      }
    });

    // Quick jump filters
    dom.quickJump.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      const range = chip.dataset.range;
      state.currentFilter = range;

      // Clear search first
      clearSearch();

      // Update active state
      dom.quickJump.querySelectorAll('.filter-chip').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.range === range)
      );

      renderSections(range);
    });

    // Section cards delegation
    dom.sectionsGrid.addEventListener('click', (e) => {
      // Preview
      const previewBtn = e.target.closest('.btn-preview');
      if (previewBtn) {
        openPdfViewer(previewBtn.dataset.pdf, previewBtn.dataset.name);
        return;
      }

      // Download
      const downloadBtn = e.target.closest('.btn-download');
      if (downloadBtn) {
        downloadPdf(downloadBtn.dataset.pdf, downloadBtn.dataset.filename);
        return;
      }

      // Share
      const shareBtn = e.target.closest('.btn-share');
      if (shareBtn) {
        sharePdf(shareBtn.dataset.section, shareBtn.dataset.pdf);
        return;
      }

      // Favorite
      const favBtn = e.target.closest('.card-favorite');
      if (favBtn) {
        toggleFavorite(favBtn.dataset.section);
        return;
      }
    });

    // Student results delegation
    dom.studentResults.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-open-section');
      if (btn) {
        openPdfViewer(btn.dataset.pdf, btn.dataset.name);
      }
    });

    // Favorites delegation
    dom.favoritesGrid.addEventListener('click', (e) => {
      const chip = e.target.closest('.favorite-chip');
      if (chip) {
        const sec = state.sections.find(s => s.name === chip.dataset.section);
        if (sec) openPdfViewer(sec.pdfUrl, sec.name);
      }
    });

    // Recent delegation
    dom.recentGrid.addEventListener('click', (e) => {
      const chip = e.target.closest('.recent-chip');
      if (chip) {
        const sec = state.sections.find(s => s.name === chip.dataset.section);
        if (sec) openPdfViewer(sec.pdfUrl, sec.name);
      }
    });

    // PDF controls
    dom.pdfPrev.addEventListener('click', pdfPrevPage);
    dom.pdfNext.addEventListener('click', pdfNextPage);
    dom.pdfZoomIn.addEventListener('click', pdfZoomIn);
    dom.pdfZoomOut.addEventListener('click', pdfZoomOut);
    dom.pdfClose.addEventListener('click', closePdfViewer);
    dom.pdfOverlay.addEventListener('click', closePdfViewer);
    dom.pdfFullscreen.addEventListener('click', pdfFullscreen);
    dom.pdfPrint.addEventListener('click', pdfPrint);
    dom.pdfDownload.addEventListener('click', () => {
      if (state.pdfCurrentSection) {
        downloadPdf(
          `${CONFIG.PDF_PATH}${state.pdfCurrentSection}_Student_List.pdf`,
          `${state.pdfCurrentSection}_Student_List.pdf`
        );
      }
    });

    // Track scroll position in PDF viewer for page info
    dom.pdfViewerContainer.addEventListener('scroll', () => {
      if (!state.pdfDoc) return;
      const container = dom.pdfViewerContainer;
      const scrollTop = container.scrollTop;
      
      for (let i = 1; i <= state.pdfTotalPages; i++) {
        const canvas = document.getElementById(`pdf-page-${i}`);
        if (!canvas) continue;
        const canvasTop = canvas.offsetTop - container.offsetTop;
        const canvasBottom = canvasTop + canvas.height;
        if (scrollTop >= canvasTop - 50 && scrollTop < canvasBottom) {
          if (state.pdfCurrentPage !== i) {
            state.pdfCurrentPage = i;
            updatePageInfo();
          }
          break;
        }
      }
    });

    // Theme toggle
    dom.themeToggle.addEventListener('click', toggleTheme);

    // Shortcuts
    dom.shortcutsBtn.addEventListener('click', () => toggleShortcutsModal(true));
    dom.shortcutsClose.addEventListener('click', () => toggleShortcutsModal(false));
    dom.shortcutsOverlay.addEventListener('click', () => toggleShortcutsModal(false));
    dom.footerShortcuts.addEventListener('click', (e) => {
      e.preventDefault();
      toggleShortcutsModal(true);
    });

    // Scroll to top
    dom.scrollTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Global listeners
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('keydown', handleKeyboard);

    // URL params
    handleUrlParams();
  }

  function updateSuggestionHighlight(items) {
    items.forEach((item, i) => {
      item.classList.toggle('active', i === state.suggestionsIndex);
    });
    if (state.suggestionsIndex >= 0 && items[state.suggestionsIndex]) {
      items[state.suggestionsIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  // ---- Launch ----
  init();

})();
