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
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);

    // Operação de escrita via GET (evita problemas de CORS com preflight)
    if (e.parameter && e.parameter.action === 'write') {
      const row   = Number(e.parameter.row);
      const value = e.parameter.value;

      if (!row || row < 2) {
        return jsonResponse({ ok: false, error: 'Linha inválida' });
      }

      sheet.getRange(row, 16).setValue(value); // coluna P = índice 16
      return jsonResponse({ ok: true });
    }

    // Leitura de todos os dados
    const data = sheet.getDataRange().getValues();
    return jsonResponse({ ok: true, data: data });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
