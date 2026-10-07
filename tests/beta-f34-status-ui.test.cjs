const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.resolve(__dirname, '../beta/index.html');

test('la beta no monta el indicador técnico F3.4 en la interfaz', () => {
  const source = fs.readFileSync(htmlPath, 'utf8');

  assert.match(source, /const F34_UI_VISIBLE\s*=\s*false\s*;/);
  assert.match(source, /function f34UIEnsure\(\)\{if\(!F34_UI_VISIBLE\|\|typeof document===['"]undefined['"]\)return;/);
  assert.match(source, /async function f34UIActualizar\(\)\{if\(!F34_UI_VISIBLE\|\|typeof document===['"]undefined['"]\)return;/);
  assert.match(source, /async function f34UIRenderPanel\(\)\{if\(!F34_UI_VISIBLE\|\|typeof document===['"]undefined['"]\)return;/);
  assert.match(source, /function f34UIInstalar\(\)\{if\(!F34_UI_VISIBLE\|\|f34UiInstalled\|\|typeof document===['"]undefined['"]\)return;/);
});
