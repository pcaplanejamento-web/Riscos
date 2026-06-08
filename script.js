// ─────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO — substitua pela URL gerada ao implantar o Apps Script
// ─────────────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyEOJ-VMFPBMd0nQDoLiTjHDu6nbOpfokr_qjp8okJGwR-YrqGWAp6v_8YsFfQy8oFh/exec';

// Índices das colunas (0-based)
const COL_B_INDEX = 1;   // LOCAL
const COL_P_INDEX = 15;  // QUANTIDADE UTILIZADA (editável)
const PAGE_SIZE   = 100;

// Estado
let headers      = [];
let allRows      = []; // [{ data: [...], sheetRow: N }, ...]
let filteredRows = [];
let currentPage  = 0;

// DOM
const loadingEl       = document.getElementById('loading');
const errorEl         = document.getElementById('error-msg');
const errorTextEl     = document.getElementById('error-text');
const notConfiguredEl = document.getElementById('not-configured');
const tableContainer  = document.getElementById('table-container');
const tableHead       = document.getElementById('table-head');
const tableBody       = document.getElementById('table-body');
const filterLocal     = document.getElementById('filter-local');
const searchInput     = document.getElementById('search');
const clearSearchBtn  = document.getElementById('btn-clear-search');
const rowCountEl      = document.getElementById('row-count');
const btnPrev         = document.getElementById('btn-prev');
const btnNext         = document.getElementById('btn-next');
const pageInfoEl      = document.getElementById('page-info');
const toastEl         = document.getElementById('toast');
const btnRetry        = document.getElementById('btn-retry');

// ─── JSONP (contorna CORS do Apps Script) ─────────────────────────

function fetchJsonp(url, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const cbName = '__pca' + Date.now();
    const script = document.createElement('script');
    let done = false;

    const cleanup = () => {
      done = true;
      delete window[cbName];
      if (script.parentNode) script.remove();
    };

    const timer = setTimeout(() => {
      if (!done) {
        cleanup();
        reject(new Error('Tempo limite (45s). O Apps Script demorou demais ou não está respondendo.'));
      }
    }, timeoutMs);

    window[cbName] = (data) => {
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(
        'O Apps Script rejeitou a requisição. ' +
        'Verifique se o código foi atualizado com a função respond() e reimplantado com "Nova versão".'
      ));
    };

    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cbName;
    document.head.appendChild(script);
  });
}

// ─── Init ─────────────────────────────────────────────────────────

async function init() {
  if (APPS_SCRIPT_URL === 'COLE_AQUI_A_URL_DO_APPS_SCRIPT') {
    loadingEl.classList.add('hidden');
    notConfiguredEl.classList.remove('hidden');
    return;
  }

  showLoading();

  try {
    const json = await fetchJsonp(APPS_SCRIPT_URL);

    if (!json.ok) throw new Error(json.error || 'Resposta inválida do servidor');

    const [headerRow, ...dataRows] = json.data;
    headers = headerRow.map((h, i) => (h !== '' && h !== null) ? String(h) : `Col ${i + 1}`);
    allRows = dataRows.map((row, idx) => ({ data: row, sheetRow: idx + 2 }));

    buildHeader();
    buildLocalFilter();
    applyFilters();

    loadingEl.classList.add('hidden');
    tableContainer.classList.remove('hidden');

  } catch (err) {
    loadingEl.classList.add('hidden');
    errorTextEl.textContent = `Não foi possível carregar os dados: ${err.message}`;
    errorEl.classList.remove('hidden');
  }
}

function showLoading() {
  errorEl.classList.add('hidden');
  notConfiguredEl.classList.add('hidden');
  tableContainer.classList.add('hidden');
  loadingEl.classList.remove('hidden');
}

// ─── Header ───────────────────────────────────────────────────────

function buildHeader() {
  tableHead.innerHTML = '';
  const tr = document.createElement('tr');
  headers.forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (i === COL_P_INDEX) th.classList.add('col-p-header');
    tr.appendChild(th);
  });
  tableHead.appendChild(tr);
}

// ─── Filter dropdown ──────────────────────────────────────────────

function buildLocalFilter() {
  const seen = new Set();
  allRows.forEach(item => {
    const val = item.data[COL_B_INDEX];
    if (val !== null && val !== undefined && val !== '') seen.add(String(val));
  });

  const locals = [...seen].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  locals.forEach(local => {
    const opt = document.createElement('option');
    opt.value   = local;
    opt.textContent = local;
    filterLocal.appendChild(opt);
  });
}

// ─── Filters & search ─────────────────────────────────────────────

function applyFilters() {
  const selectedLocal = filterLocal.value;
  const searchTerm    = searchInput.value.toLowerCase().trim();

  clearSearchBtn.hidden = searchTerm === '';

  filteredRows = allRows.filter(item => {
    const localMatch  = !selectedLocal || String(item.data[COL_B_INDEX]) === selectedLocal;
    const searchMatch = !searchTerm   || item.data.some(cell =>
      String(cell ?? '').toLowerCase().includes(searchTerm)
    );
    return localMatch && searchMatch;
  });

  currentPage = 0;
  renderPage();
}

// ─── Render page ──────────────────────────────────────────────────

function renderPage() {
  const total      = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start      = currentPage * PAGE_SIZE;
  const pageRows   = filteredRows.slice(start, start + PAGE_SIZE);

  tableBody.innerHTML = '';

  pageRows.forEach(item => {
    const tr = document.createElement('tr');
    item.data.forEach((cell, colIdx) => {
      const td = document.createElement('td');

      if (colIdx === COL_P_INDEX) {
        td.classList.add('col-p');
        td.dataset.sheetRow = item.sheetRow;
        const display = formatCell(cell);
        if (display !== '') {
          td.textContent = display;
          td.classList.add('edited-cell');
        }
        td.addEventListener('click', handleColPClick);
      } else {
        td.textContent = formatCell(cell);
      }

      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });

  rowCountEl.textContent = `${total.toLocaleString('pt-BR')} itens`;
  pageInfoEl.textContent = `Página ${currentPage + 1} de ${totalPages}`;
  btnPrev.disabled = currentPage === 0;
  btnNext.disabled = currentPage >= totalPages - 1;
}

// ─── Cell formatter ───────────────────────────────────────────────

function formatCell(cell) {
  if (cell === null || cell === undefined || cell === '') return '';
  if (typeof cell === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(cell)) {
    try { return new Date(cell).toLocaleDateString('pt-BR'); } catch (_) {}
  }
  if (typeof cell === 'number') return cell.toLocaleString('pt-BR');
  return String(cell);
}

// ─── Inline edit (column P) ───────────────────────────────────────

function handleColPClick(e) {
  const td = e.currentTarget;
  if (td.querySelector('input')) return; // already editing

  const previousValue = td.classList.contains('edited-cell') ? td.textContent : '';
  const sheetRow      = Number(td.dataset.sheetRow);

  const input = document.createElement('input');
  input.type      = 'text';
  input.value     = previousValue;
  input.className = 'inline-input';

  td.innerHTML = '';
  td.classList.remove('edited-cell');
  td.appendChild(input);
  input.focus();
  input.select();

  let committed = false;

  const commit = (shouldSave) => {
    if (committed) return;
    committed = true;

    const newValue = input.value.trim();
    td.innerHTML   = '';

    if (shouldSave && newValue !== '') {
      td.textContent = newValue;
      td.classList.add('edited-cell');
      saveToSheet(sheetRow, newValue);
    } else {
      if (previousValue !== '') {
        td.textContent = previousValue;
        td.classList.add('edited-cell');
      }
    }
  };

  input.addEventListener('blur',    () => commit(true));
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter')  { ev.preventDefault(); commit(true); }
    if (ev.key === 'Escape') { commit(false); }
  });
}

// ─── Save to sheet ────────────────────────────────────────────────

async function saveToSheet(sheetRow, value) {
  try {
    const url  = `${APPS_SCRIPT_URL}?action=write&row=${sheetRow}&value=${encodeURIComponent(value)}`;
    const json = await fetchJsonp(url);

    if (json.ok) {
      showToast('Salvo na planilha ✓', 'success');
    } else {
      showToast(`Erro ao salvar: ${json.error || 'desconhecido'}`, 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao salvar', 'error');
  }
}

// ─── Toast ────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(msg, type = '') {
  toastEl.textContent   = msg;
  toastEl.className     = `toast ${type}`;
  toastEl.style.opacity = '1';

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.style.opacity = '0';
    setTimeout(() => toastEl.classList.add('hidden'), 350);
  }, 3000);
}

// ─── Event listeners ──────────────────────────────────────────────

filterLocal.addEventListener('change', applyFilters);
searchInput.addEventListener('input',  applyFilters);

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  applyFilters();
  searchInput.focus();
});

btnPrev.addEventListener('click', () => {
  if (currentPage > 0) { currentPage--; renderPage(); scrollToTop(); }
});

btnNext.addEventListener('click', () => {
  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  if (currentPage < totalPages - 1) { currentPage++; renderPage(); scrollToTop(); }
});

btnRetry.addEventListener('click', init);

function scrollToTop() {
  document.getElementById('table-wrapper').scrollTop = 0;
}

// ─── Start ────────────────────────────────────────────────────────

init();
