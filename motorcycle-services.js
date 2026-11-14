// Motorcycle-only package editor on the master Services screen.
import {getApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {doc,getFirestore,onSnapshot,setDoc} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const db = getFirestore(getApp());
// Separate document prevents normal app config saves from overwriting this catalog.
const catalogRef = doc(db, 'config', 'motorcycle-services');
const INITIAL_PACKAGES = [
  {
    id: 'moto-lavagem-essencial',
    name: 'Lavagem Essencial',
    items: ['Lavagem', 'Secagem'],
    price: 30,
  },
  {
    id: 'moto-lavagem-tecnica-enceramento-completa',
    name: 'Lavagem Técnica com Enceramento Completo',
    items: [
      'Lavagem técnica detalhada completa',
      'Limpeza das rodas e do motor',
      'Enceramento do tanque',
      'Restauração dos plásticos e das borrachas',
    ],
    price: 250,
  },
  {
    id: 'moto-lavagem-tecnica-enceramento',
    name: 'Lavagem Técnica com Enceramento',
    items: [
      'Lavagem',
      'Limpeza das rodas e do motor',
      'Enceramento do tanque',
    ],
    price: 50,
  },
];
let packages = INITIAL_PACKAGES.map((item) => ({ ...item, items: [...item.items] }));
let activeView = 'cars';
let ready = false;
let renderQueued = false;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function packageCard(item) {
  const price = item.price == null ? '' : esc(item.price);
  return `<article class="card moto-package" data-moto-package="${esc(item.id)}">
    <label class="f">Nome do pacote<input data-moto-field="name" value="${esc(item.name)}" placeholder="Ex.: Lavagem completa"></label>
    <label class="f">Serviços incluídos<textarea data-moto-field="items" rows="4" placeholder="Informe um serviço por linha">${esc((item.items || []).join('\n'))}</textarea></label>
    <label class="f">Valor para motos (R$)<input data-moto-field="price" type="number" min="0" step="0.01" inputmode="decimal" value="${price}" placeholder="Ex.: 80,00"></label>
    <button class="btn pri" type="button" data-moto-action="save" data-moto-id="${esc(item.id)}">Salvar pacote</button>
    <button class="link center" type="button" data-moto-action="remove" data-moto-id="${esc(item.id)}">Remover pacote</button>
  </article>`;
}

function renderPanel(panel) {
  if (!panel) return;
  if (!ready) {
    panel.innerHTML = '<p class="muted">Carregando os pacotes para motos…</p>';
    return;
  }
  panel.innerHTML = `<p class="muted">Os valores são apresentados como “A partir de”. O preço final é confirmado após avaliar a moto. Não há diferenciação por porte.</p>
    <div class="stack">${packages.map(packageCard).join('') || '<p class="muted">Nenhum pacote cadastrado para motos.</p>'}</div>
    <button class="btn ghost" type="button" data-moto-action="add">Adicionar pacote para motos</button>
    <p class="err" data-moto-error hidden></p>`;
}

function setView(page, tabs, panel, view) {
  if (!page || !tabs || !panel) return;
  activeView = view;
  const motorcycles = view === 'motos';
  tabs.querySelectorAll('[data-moto-view]').forEach((button) => {
    const selected = button.dataset.motoView === view;
    button.classList.toggle('on', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  panel.hidden = !motorcycles;
  page.querySelectorAll(':scope > section:not(.moto-services-panel)').forEach((section) => { section.hidden = motorcycles; });
  const newServiceButton = page.querySelector('.head .btn');
  if (newServiceButton) newServiceButton.hidden = motorcycles;
  if (motorcycles) renderPanel(panel);
}

function mount() {
  const app = document.getElementById('app');
  const page = app?.querySelector('main.page');
  const header = page?.querySelector(':scope > .head');
  if (!page || !header || header.querySelector('h1')?.textContent.trim() !== 'Serviços') return;

  let tabs = page.querySelector('.moto-services-tabs');
  let panel = page.querySelector('.moto-services-panel');
  if (!tabs || !panel) {
    tabs = document.createElement('div');
    tabs.className = 'seg wide moto-services-tabs';
    tabs.innerHTML = '<button type="button" data-moto-view="cars" aria-pressed="false">Serviços para carros</button><button type="button" data-moto-view="motos" aria-pressed="false">Serviços para Motos</button>';
    panel = document.createElement('section');
    panel.className = 'moto-services-panel';
    panel.hidden = true;
    header.after(tabs, panel);
  }
  setView(page, tabs, panel, activeView);
}

async function persist() {
  await setDoc(catalogRef, { packages }, { merge: true });
}

function readPackage(button) {
  const card = button.closest('[data-moto-package]');
  if (!card) return null;
  const priceText = card.querySelector('[data-moto-field="price"]').value;
  return {
    id: card.dataset.motoPackage,
    name: card.querySelector('[data-moto-field="name"]').value.trim(),
    items: card.querySelector('[data-moto-field="items"]').value.split('\n').map((item) => item.trim()).filter(Boolean),
    price: priceText === '' ? null : Number(priceText),
  };
}

function showError(panel, message) {
  const error = panel?.querySelector('[data-moto-error]');
  if (error) { error.textContent = message; error.hidden = false; }
}

document.addEventListener('click', async (event) => {
  const viewButton = event.target.closest('[data-moto-view]');
  if (viewButton) {
    const page = viewButton.closest('main.page');
    setView(page, page.querySelector('.moto-services-tabs'), page.querySelector('.moto-services-panel'), viewButton.dataset.motoView);
    return;
  }

  const button = event.target.closest('[data-moto-action]');
  if (!button) return;
  const panel = button.closest('.moto-services-panel');
  if (button.dataset.motoAction === 'add') {
    packages.push({ id: `moto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: '', items: [], price: null });
    renderPanel(panel);
    panel.querySelector(`[data-moto-package="${CSS.escape(packages.at(-1).id)}"] [data-moto-field="name"]`)?.focus();
    return;
  }

  if (button.dataset.motoAction === 'remove') {
    const id = button.dataset.motoId;
    if (!window.confirm('Remover este pacote para motos?')) return;
    const previous = packages;
    packages = packages.filter((item) => item.id !== id);
    button.disabled = true;
    try { await persist(); renderPanel(panel); }
    catch (error) { packages = previous; button.disabled = false; showError(panel, 'Não foi possível remover o pacote. Confira a conexão e tente novamente.'); console.error(error); }
    return;
  }

  if (button.dataset.motoAction === 'save') {
    const updated = readPackage(button);
    if (!updated?.name) { showError(panel, 'Informe o nome do pacote.'); return; }
    const previous = packages;
    packages = packages.map((item) => item.id === updated.id ? updated : item);
    button.disabled = true;
    try {
      await persist();
      button.textContent = 'Pacote salvo';
      setTimeout(() => { if (button.isConnected) { button.textContent = 'Salvar pacote'; button.disabled = false; } }, 1400);
    } catch (error) { packages = previous; button.disabled = false; showError(panel, 'Não foi possível salvar. Confira a conexão e tente novamente.'); console.error(error); }
  }
});

const app = document.getElementById('app');
const observer = new MutationObserver(() => {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => { renderQueued = false; mount(); });
});
observer.observe(app || document.body, { childList: true, subtree: true });

onSnapshot(catalogRef, (snapshot) => {
  // Preserve the provided defaults if no catalog has been saved yet. The first
  // package save writes all three defaults to Firestore.
  if (snapshot.exists() && Array.isArray(snapshot.data().packages)) packages = snapshot.data().packages;
  ready = true;
  const panel = document.querySelector('.moto-services-panel');
  if (panel && activeView === 'motos' && !panel.querySelector('input:focus, textarea:focus')) renderPanel(panel);
}, (error) => {
  ready = true;
  console.error('Não foi possível carregar os pacotes para motos:', error);
  showError(document.querySelector('.moto-services-panel'), 'Não foi possível carregar os pacotes. Verifique sua conexão e suas permissões.');
});

mount();
