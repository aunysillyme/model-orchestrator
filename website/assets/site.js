
const exampleText={build:'“Build the new settings page.”',plan:'“Design the authentication system.”',bulk:'“Rename these files consistently.”'};
document.querySelectorAll('[data-task]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-task]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('[data-role]').forEach(box=>box.classList.toggle('selected',box.dataset.role===button.dataset.task));document.querySelector('#task-text').textContent=exampleText[button.dataset.task];}));
document.querySelector('.copy')?.addEventListener('click',async function(){try{await navigator.clipboard.writeText('npx model-orchestrator');this.textContent='✓';document.querySelector('#copy-status').textContent='Copied npx model-orchestrator';setTimeout(()=>this.textContent='⧉',1800)}catch{document.querySelector('#copy-status').textContent='Select and copy the command manually.'}});
document.querySelectorAll('.side-links a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.side-links a').forEach(x=>x.classList.remove('active'));a.classList.add('active')}));


import {setupTrailer} from './trailer.js';
import {refreshRelease} from './releases.js';
setupTrailer(document.querySelector('#trailer video'));
refreshRelease();
document.querySelectorAll('.mobile-nav a').forEach(link => link.addEventListener('click', () => { link.closest('details').open = false; }));
