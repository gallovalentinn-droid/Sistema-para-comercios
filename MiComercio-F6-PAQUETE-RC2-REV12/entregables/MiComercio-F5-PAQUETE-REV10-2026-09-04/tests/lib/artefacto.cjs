// Resolución única del artefacto bajo prueba.
//
// Todas las suites deben validar el mismo HTML F5 que se entrega. Centralizar
// el nombre y la ubicación evita que una prueba apunte a un baseline anterior
// o a un archivo que no viaja dentro del ZIP.

const fs = require('node:fs');
const path = require('node:path');

const ARTIFACT_NAME = 'MiComercio-F5-PRUEBA.html';
const ARTIFACT_PATH = path.resolve(__dirname, '..', '..', 'entregables', ARTIFACT_NAME);

function artifactPath() {
  if (!fs.existsSync(ARTIFACT_PATH)) {
    throw new Error(
      `F5_ARTEFACTO_AUSENTE: se esperaba ${ARTIFACT_PATH}. ` +
      'El paquete debe incluir entregables/' + ARTIFACT_NAME + '.'
    );
  }
  return ARTIFACT_PATH;
}

function readArtifact() {
  return fs.readFileSync(artifactPath(), 'utf8');
}

function extractBlock(startMarker, endMarker) {
  const html = readArtifact();
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start === -1) throw new Error(`F5_MARCADOR_AUSENTE: ${startMarker}`);
  if (end <= start) throw new Error(`F5_BLOQUE_INCOMPLETO: ${startMarker}`);
  return html.slice(start + startMarker.length, end);
}

// Los marcadores son recursos de prueba, no fronteras de módulo. Cuando un
// bloque depende de otro deben evaluarse juntos, como ocurre en el script real.
function composeBlocks(markers) {
  return markers
    .map(([startMarker, endMarker]) => extractBlock(startMarker, endMarker))
    .join('\n');
}

module.exports = { ARTIFACT_NAME, artifactPath, readArtifact, extractBlock, composeBlocks };
