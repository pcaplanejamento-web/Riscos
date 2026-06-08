// ─────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO
// ─────────────────────────────────────────────────────────────────
const SHEET_ID        = '15oK4dL7RcFp8hTqIFASH0dQdTvVqsweF-w3D6CDCS6w';
const SHEET_NAME      = 'GERALDADOS';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyEOJ-VMFPBMd0nQDoLiTjHDu6nbOpfokr_qjp8okJGwR-YrqGWAp6v_8YsFfQy8oFh/exec';

// Índices das colunas (0-based)
const COL_B_INDEX = 1;   // LOCAL
const COL_P_INDEX = 15;  // QUANTIDADE UTILIZADA (editável)
const PAGE_SIZE   = 100;

// Tamanho de cada lote de busca. A API gviz tem limite de linhas por requisição,
// então buscamos em paralelo para carregar todas as ~18.900 linhas rapidamente.
const BATCH_SIZE  = 2000;
const MAX_ROWS    = 22000; // teto seguro acima do total real

// Estado
let headers      = [];
let allRows      = [];
let filteredRows = [];
let currentPage  = 0;

// DOM
const loadingEl      = document.getElementById('loading');
const loadingMsg     = loadingEl.querySelector('p');
const errorEl        = document.getElementById('error-msg');
const errorTextEl    = document.getElementById('error-text');
const tableContainer = document.getElementById('table-container');
const tableHead      = document.getElementById('table-head');
const tableBody      = document.getElementById('table-body');
const filterLocal    = document.getElementById('filter-local');
const searchInput    = document.getElementById('search');
const clearSearchBtn = document.getElementById('btn-clear-search');
const rowCountEl     = document.getElementById('row-count');
const btnPrev        = document.getElementById('btn-prev');
const btnNext        = document.getElementById('btn-next');
const pageInfoEl     = document.getElementById('page-info');
const toastEl        = document.getElementById('toast');
const btnRetry       = document.getElementById('btn-retry');

// ─── Busca de dados via Google Visualization API ───────────────────
//
// A API gviz/tq tem CORS correto para planilhas compartilhadas.
// Como ela limita linhas por requisição, buscamos em PARALELO por
// lotes de BATCH_SIZE linhas, usando SELECT * LIMIT x OFFSET y.
// ─────────────────────────────────────────────────────────────────

function gvizUrl(limit, offset) {
  const tq = encodeURIComponent(`SELECT * LIMIT ${limit} OFFSET ${offset}`);
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
         `?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}&tq=${tq}`;
}

function parseGvizText(text) {
  const jsonStr = text
    .replace(/^\/\*[\s\S]*?\*\/\s*/, '')
    .replace(/^google\.visualization\.Query\.setResponse\(/, '')
    .replace(/\);\s*$/, '');

  const gviz = JSON.parse(jsonStr);

  if (gviz.status !== 'ok') {
    const msg = (gviz.errors && gviz.errors[0]) ? gviz.errors[0].message : 'Erro na API';
    throw new Error(msg);
  }

  const cols = gviz.table.cols.map((c, i) => (c.label && c.label.trim()) ? c.label.trim() : `Col ${i + 1}`);
  const rows = (gviz.table.rows || []).map(r => {
    const cells = r.c || [];
    return cols.map((_, i) => {
      const cell = cells[i];
      if (!cell || cell.v === null || cell.v === undefined) return '';
      if (typeof cell.v === 'string' && cell.v.startsWith('Date(')) {
        const parts = cell.v.replace('Date(', '').replace(')', '').split(',').map(Number);
        return new Date(parts[0], parts[1], parts[2]).toLocaleDateString('pt-BR');
      }
      return cell.v;
    });
  });

  return { cols, rows };
}

async function fetchBatch(offset) {
  const res  = await fetch(gvizUrl(BATCH_SIZE, offset));
  const text = await res.text();
  return parseGvizText(text);
}

async function fetchAllRows() {
  const numBatches = Math.ceil(MAX_ROWS / BATCH_SIZE);
  loadingMsg.textContent = 'Carregando dados da planilha…';

  // Dispara todos os lotes em paralelo
  const promises = Array.from({ length: numBatches }, (_, i) =>
    fetchBatch(i * BATCH_SIZE).catch(() => ({ cols: [], rows: [] }))
  );

  const results = await Promise.all(promises);

  // Cabeçalhos vêm do primeiro lote
  headers = results[0].cols;

  // Monta allRows combinando todos os lotes em ordem
  const combined = [];
  for (let i = 0; i < results.length; i++) {
    const { rows } = results[i];
    if (rows.length === 0) break; // lote vazio = chegamos ao fim
    const offset = i * BATCH_SIZE;
    rows.forEach((row, j) => {
      combined.push({ data: row, sheetRow: offset + j + 2 }); // +2: header=linha1
    });
    if (rows.length < BATCH_SIZE) break; // último lote parcial = fim
  }

  return combined;
}

// ─── Init ─────────────────────────────────────────────────────────

async function init() {
  showLoading();
  try {
    allRows = await fetchAllRows();
    buildHeader();
    buildLocalFilter();
    applyFilters();
    loadingEl.classList.add('hidden');
    tableContainer.classList.remove('hidden');
  } catch (err) {
    loadingEl.classList.add('hidden');
    errorTextEl.textContent = `Erro ao carregar dados: ${err.message}`;
    errorEl.classList.remove('hidden');
  }
}

function showLoading() {
  errorEl.classList.add('hidden');
  tableContainer.classList.add('hidden');
  loadingEl.classList.remove('hidden');
}

// ─── Cabeçalho ────────────────────────────────────────────────────

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

// ─── Dropdown LOCAL ───────────────────────────────────────────────

function buildLocalFilter() {
  const seen = new Set();
  allRows.forEach(item => {
    const val = item.data[COL_B_INDEX];
    if (val !== '' && val !== null && val !== undefined) seen.add(String(val));
  });
  [...seen].sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(local => {
    const opt       = document.createElement('option');
    opt.value       = local;
    opt.textContent = local;
    filterLocal.appendChild(opt);
  });
}

// ─── Filtros e busca ──────────────────────────────────────────────

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

// ─── Renderizar página ────────────────────────────────────────────

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
        const display = String(cell ?? '');
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

// ─── Formatação ───────────────────────────────────────────────────

function formatCell(cell) {
  if (cell === null || cell === undefined || cell === '') return '';
  if (typeof cell === 'number') return cell.toLocaleString('pt-BR');
  return String(cell);
}

// ─── Edição inline — coluna P ─────────────────────────────────────

function handleColPClick(e) {
  const td = e.currentTarget;
  if (td.querySelector('input')) return;

  const previousValue = td.classList.contains('edited-cell') ? td.textContent : '';
  const sheetRow      = Number(td.dataset.sheetRow);

  const input     = document.createElement('input');
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
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); commit(true); }
    if (ev.key === 'Escape') { commit(false); }
  });
}

// ─── Escrita via Apps Script (JSONP) ─────────────────────────────

function fetchJsonp(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const cbName = '__pca' + Date.now();
    const script = document.createElement('script');
    let done     = false;

    const cleanup = () => {
      done = true;
      delete window[cbName];
      if (script.parentNode) script.remove();
    };

    const timer = setTimeout(() => {
      if (!done) { cleanup(); reject(new Error('Tempo limite ao salvar')); }
    }, timeoutMs);

    window[cbName] = data => { clearTimeout(timer); cleanup(); resolve(data); };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('Erro ao salvar — verifique o deploy do Apps Script'));
    };

    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cbName;
    document.head.appendChild(script);
  });
}

async function saveToSheet(sheetRow, value) {
  try {
    const url  = `${APPS_SCRIPT_URL}?action=write&row=${sheetRow}&value=${encodeURIComponent(value)}`;
    const json = await fetchJsonp(url);
    if (json && json.ok) {
      showToast('Salvo na planilha ✓', 'success');
    } else {
      showToast(`Erro: ${json && json.error ? json.error : 'resposta inválida'}`, 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── Toast ────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(msg, type = '') {
  toastEl.textContent   = msg;
  toastEl.className     = `toast ${type}`;
  toastEl.style.opacity = '1';
  toastEl.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.style.opacity = '0';
    setTimeout(() => toastEl.classList.add('hidden'), 350);
  }, 3000);
}

// ─── Eventos ──────────────────────────────────────────────────────

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

// ─── Início ───────────────────────────────────────────────────────

init();
