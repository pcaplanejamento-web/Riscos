// ─────────────────────────────────────────────────────────────────
// PCA 2026 — Apps Script Web App
//
// Como implantar:
//   1. Abra a planilha Google Sheets
//   2. Extensões → Apps Script
//   3. Cole este código, salve
//   4. Implantar → Novo implante
//      - Tipo: Aplicativo Web
//      - Executar como: Eu (sua conta)
//      - Quem pode acessar: Qualquer pessoa
//   5. Copie a URL gerada e cole em script.js → APPS_SCRIPT_URL
// ─────────────────────────────────────────────────────────────────

const SHEET_ID   = '15oK4dL7RcFp8hTqIFASH0dQdTvVqsweF-w3D6CDCS6w';
const SHEET_NAME = 'GERALDADOS';

function doGet(e) {
  const callback = e.parameter ? e.parameter.callback : null;

  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);

    if (e.parameter && e.parameter.action === 'write') {
      const row   = Number(e.parameter.row);
      const value = e.parameter.value;

      if (!row || row < 2) {
        return respond({ ok: false, error: 'Linha inválida' }, callback);
      }

      sheet.getRange(row, 16).setValue(value); // coluna P = índice 16
      return respond({ ok: true }, callback);
    }

    const data = sheet.getDataRange().getValues();
    return respond({ ok: true, data: data }, callback);

  } catch (err) {
    return respond({ ok: false, error: err.message }, callback);
  }
}

// Suporta tanto JSON puro quanto JSONP (para evitar CORS do navegador)
function respond(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
