export function validVersion(version) {
  return typeof version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version);
}
export function validRelease(data) {
  return data && data.name === 'model-orchestrator' && validVersion(data.version);
}

export async function refreshRelease(documentRef = document, fetcher = fetch) {
  const status = documentRef.querySelector('[data-release-status]');
  if (!status) return;
  try {
    const response = await fetcher('https://registry.npmjs.org/model-orchestrator/latest', {signal: AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error('Registry unavailable');
    const data = await response.json();
    if (!validRelease(data)) throw new Error('Invalid release metadata');
    documentRef.querySelectorAll('[data-version]').forEach(element => { element.textContent = `v${data.version}`; });
    const releases = [...documentRef.querySelectorAll('[data-release]')];
    const matching = releases.find(element => element.dataset.release === data.version);
    releases.forEach(element => { element.hidden = element !== matching; });
    status.textContent = matching ? 'Latest published version, checked with npm.' : 'Latest published version. Release notes are available on GitHub while this page updates.';
  } catch {
    status.textContent = 'npm could not be reached. Showing the last verified published version.';
  }
}
