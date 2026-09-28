// Advisory inputs share the installer's catalog pins; compatibility versions are not install pins.
import { AIS, TOOLS, IMAGES, PROVIDERS } from '../src/catalog.js';

export function catalogInventory({ ais = AIS, tools = TOOLS, images = IMAGES, providers = PROVIDERS } = {}) {
  const targets = [];
  const exclusions = [];
  function packageTarget(source, ecosystem, name, version, extras = []) {
    targets.push({ kind: 'package', source, ecosystem: ecosystem || null, package: name || null,
      pinnedVersion: version || null, extras, coverage: 'direct-package' });
    exclusions.push({ source, package: name || null, coverage: 'transitive-dependencies',
      reason: 'No resolved dependency lockfile is declared for this external installation.' });
    if (extras.length) exclusions.push({ source, package: name, extras, coverage: 'optional-extras',
      reason: 'The base package is queried; dependencies selected by these extras are unresolved.' });
  }
  for (const ai of ais) {
    if (ai.install?.npm) packageTarget(`AIS:${ai.id}`, 'npm', ai.install.npm, ai.install.pin);
    else if (ai.install?.pin) packageTarget(`AIS:${ai.id}`, ai.install.advisory?.ecosystem,
      ai.install.advisory?.package, ai.install.pin);
    else exclusions.push({ source: `AIS:${ai.id}`, input: ai.install?.script || ai.install?.url || null,
      coverage: ai.facts?.kind === 'chat' ? 'remote-service' : 'unpinned-installation',
      reason: ai.install?.script ? 'Vendor installer script has no immutable package pin.'
        : 'Download, package-manager, or remote service input has no exact installation pin.' });
  }
  for (const tool of tools) packageTarget(`TOOLS:${tool.id}`, tool.advisory?.ecosystem,
    tool.advisory?.package, tool.pin, tool.advisory?.extras || []);
  for (const [id, reference] of Object.entries(images)) targets.push({ kind: 'container',
    source: `IMAGES:${id}`, ecosystem: 'container', package: reference,
    pinnedVersion: reference, coverage: 'image-os-and-language-packages' });
  for (const provider of providers) exclusions.push({ source: `PROVIDERS:${provider.id}`,
    coverage: 'remote-service', reason: 'Hosted model services have no locally pinned executable package.' });
  return { targets, exclusions };
}
