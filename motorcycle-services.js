// Standalone motorcycle service catalog for the master Services screen.
import {getApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {doc,getFirestore,onSnapshot,setDoc} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const db = getFirestore(getApp());
const configRef = doc(db, 'config', 'app');
let catalog = [];
let activeView = 'cars';
let configReady = false;
let renderQueued = false;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function seedFromServices(services = []) {
  return services.filter((service) => service.group === 'pacote').map((service) => ({
    id: service.id,
    name: service.name,
    price: service.price?.moto ?? '',
    items: Array.isArray(service.items) ? [...service.items] : [],
  }));
}

function packageCard(item) {
  const price = item.price === '' || item.price == null ? '' : escapeHtml(item.price);
  return `<article class="card moto-package" data-moto-package="${escapeHtml(item.id)}">
    <label class="f">Nome do pacote<input data-moto-field="name" value="${escapeHtml(item.name)}" placeholder="Ex.: Completa"></label>
    <label class="f">Serviços incluídos<textarea data-moto-field="items" rows="4" placeholder="Informe um serviço por linha">${escapeHtml((item.items || []).join('\n'))}</textarea></label>
    <label class="f">Valor para motos (R$)<input data-moto-field="price" type="number" min="0" step="0.01" inputmode="decimal" value="${price}" placeholder="Ex.: 80,00"></label>
    <button class="btn pri" type="button" data-moto-action="save" data-moto-id="${escapeHtml(item.id)}">Salvar pacote</button>
    <button class="link center" type="button" data-moto-action="remove" data-moto-id="${escapeHtml(item.id)}">Remover pacote</button>
  </article>`;
}

function renderPanel(panel) {
  if (!configReady) {
    panel.innerHTML = '<p class="muted">Carregando os pacotes para motos…</p>';
    return;
  }
  panel.innerHTML = `<p class="muted">Cadastre o valor e os serviços de cada pacote. Estas opções são exclusivas para motos e não usam portes de veículo.</p>
    <div class="stack">${catalog.map(packageCard).join('') || '<p class="muted">Nenhum pacote cadastrado para motos.</p>'}</div>
    <button class="btn ghost" type="button" data-moto-action="add">Adicionar pacote para motos</button>
    <p class="err" data-moto-error hidden></p>`;
}

function setView(page, tabs, panel, view) {
  activeView = view;
  const isMotos = view === 'motos';
  tabs.querySelectorAll('button').forEach((button) => {
    const selected = button.dataset.motoView === view;
    button.classList.toggle('on', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  panel.hidden = !isMotos;
  page.querySelectorAll(':scope > section:not(.moto-services-panel)').forEach((section) => { section.hidden = isMotos; });
  const newButton = page.querySelector('.head .btn');
  if (newButton) newButton.hidden = isMotos;
  if (isMotos) renderPanel(panel);
}

function mount() {
  const app = document.getElementById('app');
  const page = app?.querySelector('main.page');
  const header = page?.querySelector(':scope > .head');
  if (!page || !header || header.querySelector('h1')?.textContent.trim() !== 'Serviços') return;

  let tabs = page.querySelector('.moto-services-tabs');
  let panel = page.querySelector('.moto-services-panel');
  if (!tabs) {
    tabs = document.createElement('div');
    tabs.className = 'seg wide moto-services-tabs';
    tabs.innerHTML = '<button type="button" data-moto-view="cars">Serviços para carros</button><button type="button" data-moto-view="motos">Serviços para Motos</button>';
    panel = document.createElement('section');
    panel.className = 'moto-services-panel';
    panel.hidden = true;
    header.after(tabs, panel);
  }
  setView(page, tabs, panel, activeView);
}

async function persist() {
  await setDoc(configRef, { motoCatalog: catalog }, { merge: true });
}

function packageForm(button) {
  const card = button.closest('[data-moto-package]');
  if (!card) return null;
  return {
    id: card.dataset.motoPackage,
    name: card.querySelector('[data-moto-field="name"]').value.trim(),
    items: card.querySelector('[data-moto-field="items"]').value.split('\n').map((item) => item.trim()).filter(Boolean),
    price: card.querySelector('[data-moto-field="price"]').value === '' ? null : Number(card.querySelector('[data-moto-field="price"]').value),
  };
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
  const error = panel?.querySelector('[data-moto-error]');
  if (error) error.hidden = true;

  if (button.dataset.motoAction === 'add') {
    catalog.push({ id: `moto-${Date.now()}`, name: '', price: '', items: [] });
    renderPanel(panel);
    return;
  }

  if (button.dataset.motoAction === 'remove') {
    catalog = catalog.filter((item) => item.id !== button.dataset.motoId);
    try { await persist(); renderPanel(panel); }
    catch (exception) { if (error) { error.textContent = 'Não foi possível salvar. Tente novamente.'; error.hidden = false; } console.error(exception); }
    return;
  }

  if (button.dataset.motoAction === 'save') {
    const updated = packageForm(button);
    if (!updated?.name) {
      if (error) { error.textContent = 'Informe o nome do pacote.'; error.hidden = false; }
      return;
    }
    catalog = catalog.map((item) => item.id === updated.id ? updated : item);
    button.disabled = true;
    try {
      await persist();
      button.textContent = 'Pacote salvo';
      setTimeout(() => { if (button.isConnected) { button.textContent = 'Salvar pacote'; button.disabled = false; } }, 1400);
    } catch (exception) {
      button.disabled = false;
      if (error) { error.textContent = 'Não foi possível salvar. Confira a conexão e tente novamente.'; error.hidden = false; }
      console.error(exception);
    }
  }
});

const observer = new MutationObserver(() => {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => { renderQueued = false; mount(); });
});
observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });

onSnapshot(configRef, (snapshot) => {
  if (!snapshot.exists()) return;
  const data = snapshot.data();
  if (Array.isArray(data.motoCatalog)) catalog = data.motoCatalog;
  else catalog = seedFromServices(data.services || []);
  configReady = true;
  const panel = document.querySelector('.moto-services-panel');
  if (panel && activeView === 'motos' && !panel.querySelector('input:focus, textarea:focus')) renderPanel(panel);
}, (error) => console.error('Não foi possível carregar os serviços para motos:', error));

mount();
