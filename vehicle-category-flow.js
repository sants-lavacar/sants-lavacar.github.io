// Category-based vehicle catalog, starting prices, and one-vehicle-per-booking flow.
import {getApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,onSnapshot,getDoc,setDoc,runTransaction,collection} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const categoryRef = doc(db, 'config', 'vehicle-categories');
const appConfigRef = doc(db, 'config', 'app');
const CATEGORIES = [
  { id: 'hatch', name: 'Carro hatch', legacy: 'p' },
  { id: 'sedan', name: 'Carro sedã', legacy: 'm' },
  { id: 'suv', name: 'Carro SUV', legacy: 'g' },
  { id: 'caminhonete', name: 'Caminhonete', legacy: 'gg' },
  { id: 'van', name: 'Van', legacy: 'gg' },
  { id: 'utilitarios', name: 'Utilitários', legacy: 'g' },
  { id: 'moto', name: 'Moto', legacy: 'moto' },
];
const BUSINESS_EMAILS = ['santslavacar@gmail.com', 'geovanesantosx1999@gmail.com'];
let services = [];
let hours = [];
let boxes = 1;
let userProfile = { vehicles: [] };
let mode = null;
let flow = null;
let ready = false;
let mountQueued = false;
let busy = [];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const cat = (id) => CATEGORIES.find((x) => x.id === id) || CATEGORIES[0];
const legacyKey = (id) => cat(id).legacy;
const money = (value) => value == null || value === '' ? 'Consulte' : `A partir de R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const categoryFromVehicle = (v) => v?.category || (v?.type === 'moto' ? 'moto' : '');
const oldKeyForCategory = (category) => legacyKey(category);
const fDate = (iso) => { const [y,m,d] = iso.split('-').map(Number); return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`; };
const fTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`;

function normalizeService(service) {
  const prices = { ...(service.startingPrices || {}) };
  const durations = { ...(service.durations || {}) };
  for (const c of CATEGORIES) {
    if (prices[c.id] == null) prices[c.id] = service.price?.[c.legacy] ?? null;
    if (durations[c.id] == null) durations[c.id] = service.min?.[c.legacy] ?? null;
  }
  return {
    id: service.id || uid(), name: service.name || '', group: service.group === 'pacote' ? 'pacote' : 'extra',
    tier: service.tier || 'sky', icon: service.icon || 'spark', active: service.active !== false,
    items: Array.isArray(service.items) ? service.items : [], startingPrices: prices, durations,
  };
}
function priceOf(service, category) { return service.startingPrices?.[category] ?? null; }
function durationOf(service, category) { return Number(service.durations?.[category]) || 60; }
function currentUserIsBusiness() { return BUSINESS_EMAILS.includes((auth.currentUser?.email || '').toLowerCase()) && !!auth.currentUser?.emailVerified; }
function saveServices(next) {
  return setDoc(categoryRef, { categories: CATEGORIES, services: next }, { merge: true });
}
function seedServices(raw) {
  return (raw || []).map(normalizeService);
}
function escapeAttr(v) { return esc(v); }

function adminServiceCard(s) {
  return `<article class="card category-service" data-category-service="${escapeAttr(s.id)}">
    <label class="f">Nome do serviço<input data-field="name" value="${escapeAttr(s.name)}"></label>
    <label class="f">Tipo<select data-field="group"><option value="pacote" ${s.group === 'pacote' ? 'selected' : ''}>Pacote</option><option value="extra" ${s.group === 'extra' ? 'selected' : ''}>Serviço adicional</option></select></label>
    <label class="f">Serviços incluídos (um por linha)<textarea data-field="items" rows="3">${esc((s.items || []).join('\n'))}</textarea></label>
    <div class="category-prices"><b>Preço inicial e tempo estimado por categoria</b>${CATEGORIES.map((c) => `<div class="category-price-row"><strong>${c.name}</strong><label class="f">A partir de (R$)<input data-price="${c.id}" type="number" min="0" step="0.01" value="${s.startingPrices?.[c.id] ?? ''}" placeholder="Sem preço"></label><label class="f">Minutos estimados<input data-duration="${c.id}" type="number" min="1" step="1" value="${s.durations?.[c.id] ?? ''}" placeholder="60"></label></div>`).join('')}</div>
    <label class="chk flat"><input data-field="active" type="checkbox" ${s.active ? 'checked' : ''}><span class="grow">Mostrar aos clientes</span></label>
    <button class="btn pri" type="button" data-category-action="save" data-id="${escapeAttr(s.id)}">Salvar alterações</button>
    <button class="link center" type="button" data-category-action="remove" data-id="${escapeAttr(s.id)}">Remover serviço</button>
  </article>`;
}
function adminPanel() {
  return `<section class="category-admin"><p class="muted">Os valores são apresentados como “A partir de”. O preço final é confirmado após avaliação do veículo. Motos são uma categoria única.</p>
  <div class="stack">${services.map(adminServiceCard).join('') || '<p class="muted">Nenhum serviço cadastrado.</p>'}</div>
  <button class="btn ghost" type="button" data-category-action="add">Adicionar serviço ou pacote</button><p class="err" data-category-error hidden></p></section>`;
}
function serviceCard(s, selected) {
  const price = priceOf(s, flow.category);
  return `<button type="button" class="pick ${selected ? 'on' : ''}" data-flow="toggle-service" data-id="${escapeAttr(s.id)}" aria-pressed="${selected}">
  <article class="pkg t-${escapeAttr(s.tier)}"><div class="pkg-i"><span>${s.group === 'pacote' ? '★' : '+'}</span></div><div class="pkg-b"><strong class="xname">${esc(s.name)}</strong>
  ${s.items?.length ? `<ul>${s.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<div class="pkg-m"><span>A partir de</span><b>${money(price)}</b></div></div></article></button>`;
}
function customerServices() {
  const selected = new Set(flow.items);
  const available = services.filter((s) => s.active && priceOf(s, flow.category) != null);
  return `<h2>Pacotes</h2><div class="stack">${available.filter((s) => s.group === 'pacote').map((s) => serviceCard(s, selected.has(s.id))).join('') || '<p class="muted">Ainda não há pacotes para esta categoria. Fale conosco pelo WhatsApp.</p>'}</div>
  <h2 class="mt">Serviços adicionais</h2><div class="stack">${available.filter((s) => s.group === 'extra').map((s) => serviceCard(s, selected.has(s.id))).join('') || '<p class="muted">Nenhum serviço adicional disponível.</p>'}</div>`;
}
function vehicleLabel(v) { return [v.name || v.model || v.brand, v.year, v.color, v.plate].filter(Boolean).join(' · '); }
function compatibleVehicles() { return (userProfile.vehicles || []).filter((v) => categoryFromVehicle(v) === flow.category); }
function vehicleStep() {
  const matches = compatibleVehicles();
  const chosen = matches.find((v) => v.id === flow.vehicleId);
  return `<header class="head"><div><h1>Escolha seu veículo</h1><p>${cat(flow.category).name} · cada pedido é para um veículo</p></div></header>
    ${matches.length ? `<div class="stack">${matches.map((v) => `<label class="chk"><input type="radio" name="category-vehicle" data-flow="select-vehicle" value="${escapeAttr(v.id)}" ${flow.vehicleId === v.id ? 'checked' : ''}><span class="grow"><b>${esc(vehicleLabel(v))}</b><small>${cat(flow.category).name}</small></span></label>`).join('')}</div>` : `<p class="muted">Você ainda não cadastrou um veículo nesta categoria.</p>`}
    <button type="button" class="btn ghost" data-flow="show-new-vehicle">Cadastrar outro veículo</button>
    ${flow.showNewVehicle ? `<div class="card stack"><label class="f">Nome do veículo<input data-flow-field="vehicleName" value="${esc(flow.newVehicle.name)}" placeholder="Ex.: Honda Civic, Ford Transit, Yamaha Fazer"></label>
      <label class="f">Categoria<select data-flow-field="category">${CATEGORIES.map((c) => `<option value="${c.id}" ${flow.newVehicle.category === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label>
      <div class="two"><label class="f">Ano (opcional)<input data-flow-field="year" inputmode="numeric" maxlength="4" value="${esc(flow.newVehicle.year)}"></label><label class="f">Cor (opcional)<input data-flow-field="color" value="${esc(flow.newVehicle.color)}"></label></div>
      <label class="f">Placa (opcional)<input data-flow-field="plate" maxlength="8" value="${esc(flow.newVehicle.plate)}"></label>
      <button type="button" class="btn pri" data-flow="save-vehicle">Salvar e selecionar veículo</button></div>` : ''}
    ${chosen ? `<button type="button" class="btn pri" data-flow="continue-services">Continuar para os serviços</button>` : ''}
    ${flow.error ? `<p class="err" role="alert">${esc(flow.error)}</p>` : ''}`;
}
function serviceStep() {
  const vehicle = compatibleVehicles().find((v) => v.id === flow.vehicleId);
  return `<header class="head"><div><h1>Serviços para ${esc(vehicleLabel(vehicle))}</h1><p>Os valores exibidos são iniciais. O preço final é confirmado após avaliação.</p></div></header>
  ${customerServices()}${flow.error ? `<p class="err" role="alert">${esc(flow.error)}</p>` : ''}
  <div class="foot"><button type="button" class="btn pri" data-flow="continue-date" ${flow.items.length ? '' : 'disabled'}>Escolher dia e horário</button><button type="button" class="btn ghost" data-flow="back-vehicle">Voltar</button></div>`;
}
function findSlotDate(date, minutes) {
  const day = new Date(`${date}T12:00:00`).getDay();
  const schedule = hours[day];
  if (!schedule?.on || !minutes) return [];
  const now = new Date();
  const nowMinutes = date === new Date().toISOString().slice(0, 10) ? now.getHours() * 60 + now.getMinutes() : -1;
  const result = [];
  for (let start = schedule.open; start + minutes <= schedule.close; start += 30) {
    if (start <= nowMinutes) continue;
    let fits = true;
    for (let t = start; t < start + minutes; t += 15) {
      if (busy.filter((b) => b.date === date && b.start < t + 15 && b.start + b.minutes > t).length >= boxes) { fits = false; break; }
      if ((schedule.blocks || []).some((b) => b.from < t + 15 && b.to > t)) { fits = false; break; }
    }
    if (fits) result.push(start);
  }
  return result;
}
function selectedDuration() {
  return flow.items.reduce((sum, id) => sum + durationOf(services.find((s) => s.id === id), flow.category), 0);
}
function dateStep() {
  const minutes = selectedDuration();
  const options = flow.date ? findSlotDate(flow.date, minutes) : [];
  const dates = [];
  for (let i = 0; i < 21; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (hours[d.getDay()]?.on) dates.push(value);
  }
  const starts = options.map((t) => `<button type="button" class="${flow.start === t ? 'on' : ''}" data-flow="select-time" data-value="${t}">${fTime(t)}<small>até ${fTime(t + minutes)}</small></button>`).join('');
  return `<header class="head"><div><h1>Dia e horário</h1><p>Tempo estimado: ${minutes} min</p></div></header>
    <div class="days">${dates.map((d) => `<button type="button" class="${flow.date === d ? 'on' : ''}" data-flow="select-date" data-value="${d}">${fDate(d)}</button>`).join('')}</div>
    ${starts ? `<div class="slots">${starts}</div>` : '<p class="muted">Selecione um dia com horários disponíveis.</p>'}
    ${flow.error ? `<p class="err" role="alert">${esc(flow.error)}</p>` : ''}
    <div class="foot"><button type="button" class="btn pri" data-flow="review" ${flow.start == null ? 'disabled' : ''}>Revisar pedido</button><button type="button" class="btn ghost" data-flow="back-services">Voltar</button></div>`;
}
function reviewStep() {
  const vehicle = compatibleVehicles().find((v) => v.id === flow.vehicleId);
  const minutes = selectedDuration();
  const total = flow.items.reduce((sum, id) => sum + (Number(priceOf(services.find((s) => s.id === id), flow.category)) || 0), 0);
  return `<header class="head"><div><h1>Revise seu pedido</h1><p>O preço final será confirmado após avaliação.</p></div></header>
    <dl class="dl card"><div><dt>Veículo</dt><dd>${esc(vehicleLabel(vehicle))}</dd></div><div><dt>Categoria</dt><dd>${cat(flow.category).name}</dd></div><div><dt>Data e horário</dt><dd>${fDate(flow.date)} às ${fTime(flow.start)}</dd></div><div><dt>Tempo estimado</dt><dd>${minutes} min</dd></div></dl>
    <section><h2>Serviços</h2>${flow.items.map((id) => { const s = services.find((x) => x.id === id); return `<div class="row card"><div class="grow"><b>${esc(s?.name)}</b><small>${money(priceOf(s, flow.category))}</small></div></div>`; }).join('')}</section>
    <p class="note">Os valores são “a partir de”; o preço final será combinado após avaliação do veículo.</p>
    ${flow.error ? `<p class="err" role="alert">${esc(flow.error)}</p>` : ''}
    <div class="foot"><button type="button" class="btn pri" data-flow="submit">Enviar pedido · ${money(total)}</button><button type="button" class="btn ghost" data-flow="back-date">Voltar</button></div>`;
}
function renderFlow() {
  const main = document.querySelector('#app main.page');
  if (!main || !flow) return;
  main.dataset.categoryFlow = mode;
  main.innerHTML = `<button type="button" class="link" data-flow="exit">← Voltar ao aplicativo</button>${flow.step === 'vehicle' ? vehicleStep() : flow.step === 'services' ? serviceStep() : flow.step === 'date' ? dateStep() : reviewStep()}`;
}
function openFlow(category) {
  mode = 'booking';
  flow = { category, step: 'vehicle', vehicleId: '', items: [], date: '', start: null, showNewVehicle: false, newVehicle: { name: '', category, year: '', color: '', plate: '' }, error: '' };
  renderFlow();
}
function showServiceAdmin() {
  mode = 'services';
  const main = document.querySelector('#app main.page');
  if (!main) return;
  main.dataset.categoryFlow = 'services';
  main.innerHTML = `<header class="head"><div><h1>Serviços e preços iniciais</h1><p>Cadastre valores “a partir de” para cada categoria. O preço final será confirmado depois da avaliação.</p></div></header>
    ${currentUserIsBusiness() ? adminPanel() : `<p class="muted">Consulte os valores iniciais dos serviços. O preço final depende da avaliação do veículo.</p>${customerServices()}`}
    <button class="btn ghost" type="button" data-flow="exit">Voltar ao aplicativo</button>`;
}
function restoreApp() {
  mode = null; flow = null;
  const main = document.querySelector('#app main.page');
  if (main) delete main.dataset.categoryFlow;
  document.dispatchEvent(new CustomEvent('category-flow-exit'));
  location.reload();
}

// Capture before the app's own delegated tab handler so its old porte-based wizard is bypassed.
document.addEventListener('click', async (event) => {
  const nav = event.target.closest('#app nav [data-a="tab"]');
  if (nav && (nav.dataset.v === 'agendar' || nav.dataset.v === 'servicos')) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (nav.dataset.v === 'agendar') openFlow('hatch'); else showServiceAdmin();
    return;
  }
  if (mode && nav && !['agendar', 'servicos'].includes(nav.dataset.v)) {
    mode = null; flow = null;
    return;
  }
  const action = event.target.closest('[data-flow]');
  if (!action) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const act = action.dataset.flow;
  if (act === 'exit') { restoreApp(); return; }
  if (!flow && mode !== 'services') return;

  if (act === 'show-new-vehicle') { flow.showNewVehicle = true; renderFlow(); return; }
  if (act === 'save-vehicle') {
    const nv = flow.newVehicle;
    if (!nv.name.trim()) { flow.error = 'Informe o nome do veículo.'; renderFlow(); return; }
    const category = cat(nv.category);
    const vehicle = { id: uid(), type: category.id === 'moto' ? 'moto' : 'carro', category: category.id, categoryName: category.name, brand: category.name, model: nv.name.trim(), name: nv.name.trim(), size: category.legacy, year: nv.year.trim(), color: nv.color.trim(), plate: nv.plate.trim().toUpperCase() };
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid), { vehicles: [...(userProfile.vehicles || []), vehicle] }, { merge: true });
      userProfile.vehicles = [...(userProfile.vehicles || []), vehicle];
      flow.category = category.id; flow.vehicleId = vehicle.id; flow.showNewVehicle = false; flow.error = '';
      renderFlow();
    } catch (error) { flow.error = 'Não foi possível salvar o veículo. Tente novamente.'; renderFlow(); console.error(error); }
    return;
  }
  if (act === 'select-vehicle') { flow.vehicleId = action.value; flow.error = ''; return; }
  if (act === 'continue-services') { flow.step = 'services'; flow.items = []; flow.error = ''; renderFlow(); return; }
  if (act === 'toggle-service') {
    const id = action.dataset.id;
    const s = services.find((x) => x.id === id);
    if (s.group === 'pacote') {
      const extras = flow.items.filter((itemId) => services.find((x) => x.id === itemId)?.group === 'extra');
      flow.items = flow.items.includes(id) ? extras : [id, ...extras];
    } else flow.items = flow.items.includes(id) ? flow.items.filter((x) => x !== id) : [...flow.items, id];
    flow.error = ''; renderFlow(); return;
  }
  if (act === 'continue-date') { if (!flow.items.length) { flow.error = 'Selecione pelo menos um pacote ou serviço adicional.'; renderFlow(); return; } flow.step = 'date'; flow.error = ''; renderFlow(); return; }
  if (act === 'back-vehicle') { flow.step = 'vehicle'; renderFlow(); return; }
  if (act === 'back-services') { flow.step = 'services'; renderFlow(); return; }
  if (act === 'back-date') { flow.step = 'date'; renderFlow(); return; }
  if (act === 'select-date') { flow.date = action.dataset.value; flow.start = null; renderFlow(); return; }
  if (act === 'select-time') { flow.start = Number(action.dataset.value); renderFlow(); return; }
  if (act === 'review') { if (flow.start == null) { flow.error = 'Escolha um horário disponível.'; renderFlow(); return; } flow.step = 'review'; flow.error = ''; renderFlow(); return; }
  if (act === 'submit') { await submitBooking(); return; }

  const adminAction = action.dataset.categoryAction;
  if (adminAction === 'add') { services.push(normalizeService({ id: uid(), name: '', group: 'extra', items: [], active: true })); showServiceAdmin(); return; }
  if (adminAction === 'save' || adminAction === 'remove') await adminServiceAction(action);
}, true);

// Keep the app's Firebase snapshots while the standalone flow is open, but avoid rendering over it.
const originalRenderObserver = new MutationObserver(() => {
  if (mode && !document.querySelector(`#app main.page[data-category-flow="${mode}"]`)) {
    if (mode === 'services') showServiceAdmin(); else renderFlow();
  }
});
originalRenderObserver.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });

document.addEventListener('input', (event) => {
  const target = event.target;
  if (!target.matches('[data-flow-field]') || !flow) return;
  const field = target.dataset.flowField;
  if (field === 'category') {
    flow.newVehicle.category = target.value;
    flow.category = target.value;
    flow.vehicleId = '';
  } else flow.newVehicle[field] = target.value;
});

async function adminServiceAction(button) {
  const card = button.closest('[data-category-service]');
  if (!card) return;
  const id = card.dataset.categoryService;
  const previous = services;
  if (button.dataset.categoryAction === 'remove') services = services.filter((s) => s.id !== id);
  else {
    const service = services.find((s) => s.id === id);
    service.name = card.querySelector('[data-field="name"]').value.trim();
    service.group = card.querySelector('[data-field="group"]').value;
    service.items = card.querySelector('[data-field="items"]').value.split('\n').map((x) => x.trim()).filter(Boolean);
    service.active = card.querySelector('[data-field="active"]').checked;
    service.startingPrices = Object.fromEntries(CATEGORIES.map((c) => [c.id, card.querySelector(`[data-price="${c.id}"]`).value === '' ? null : Number(card.querySelector(`[data-price="${c.id}"]`).value)]));
    service.durations = Object.fromEntries(CATEGORIES.map((c) => [c.id, Number(card.querySelector(`[data-duration="${c.id}"]`).value) || 60]));
    if (!service.name) { showError(document.querySelector('.category-admin'), 'Informe o nome do serviço.'); return; }
  }
  button.disabled = true;
  try { await saveServices(services); showServiceAdmin(); }
  catch (error) { services = previous; button.disabled = false; showError(document.querySelector('.category-admin'), 'Não foi possível salvar. Verifique a conexão e as permissões.'); console.error(error); }
}

async function submitBooking() {
  const vehicle = userProfile.vehicles.find((v) => v.id === flow.vehicleId);
  if (!vehicle || !flow.items.length || flow.start == null) { flow.error = 'Confira o veículo, os serviços e o horário.'; renderFlow(); return; }
  const minutes = selectedDuration();
  const user = auth.currentUser;
  const bookingId = doc(collection(db, 'bookings')).id;
  const totalStarting = flow.items.reduce((sum, id) => sum + (Number(priceOf(services.find((s) => s.id === id), flow.category)) || 0), 0);
  const booking = { clientId: user.uid, clientName: userProfile.name || user.displayName || '', phone: userProfile.phone || '', email: user.email || '', vehicle: JSON.parse(JSON.stringify(vehicle)), items: [...flow.items], price: null, startingPrice: totalStarting, category: flow.category, date: flow.date, start: flow.start, minutes, estMinutes: minutes, status: 'pendente', note: 'Valor inicial estimado; preço final após avaliação do veículo.', createdAt: Date.now() };
  try {
    await runTransaction(db, async (tx) => {
      const dayRef = doc(db, 'days', flow.date);
      const daySnap = await tx.get(dayRef);
      const items = daySnap.exists() ? daySnap.data().items || {} : {};
      const dayBusy = Object.entries(items).map(([id, item]) => ({ id, date: flow.date, ...item }));
      const previousBusy = busy;
      busy = busy.filter((x) => x.date !== flow.date).concat(dayBusy);
      if (!findSlotDate(flow.date, minutes).includes(flow.start)) { busy = previousBusy; throw new Error('slot-taken'); }
      tx.set(dayRef, { date: flow.date, lastKey: bookingId, items: { [bookingId]: { start: flow.start, minutes, uid: user.uid } } }, { merge: true });
      tx.set(doc(db, 'bookings', bookingId), booking);
    });
    flow.step = 'done'; flow.booking = booking; renderFlow();
  } catch (error) {
    flow.error = error.message === 'slot-taken' ? 'Esse horário acabou de ser ocupado. Escolha outro.' : 'Não foi possível enviar o pedido. Tente novamente.';
    if (error.message === 'slot-taken') { flow.step = 'date'; flow.start = null; }
    renderFlow(); console.error(error);
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) { userProfile = { vehicles: [] }; return; }
  onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
    if (snapshot.exists()) userProfile = { ...userProfile, ...snapshot.data(), vehicles: snapshot.data().vehicles || [] };
    if (mode === 'booking' && flow?.step === 'vehicle') renderFlow();
  }, console.error);
});
onSnapshot(doc(db, 'config', 'app'), (snapshot) => {
  if (!snapshot.exists()) return;
  const data = snapshot.data(); hours = data.hours || []; boxes = data.boxes || 1;
  if (!ready) {
    services = seedServices(data.services || []);
    ready = true;
    if (mode === 'services') showServiceAdmin();
  }
}, console.error);
onSnapshot(categoryRef, (snapshot) => {
  if (snapshot.exists() && Array.isArray(snapshot.data().services)) services = snapshot.data().services.map(normalizeService);
  else if (!services.length) services = seedServices([]);
  ready = true;
  if (mode === 'services') showServiceAdmin();
  if (mode === 'booking' && flow?.step === 'services') renderFlow();
}, (error) => console.error('Category catalog read failed:', error));
onSnapshot(collection(db, 'days'), (snapshot) => {
  busy = snapshot.docs.flatMap((item) => { const day = item.data(); return (day.date >= new Date().toISOString().slice(0, 10)) ? Object.entries(day.items || {}).map(([id, value]) => ({ id, date: day.date, ...value })) : []; });
  if (mode === 'booking' && flow?.step === 'date') renderFlow();
}, console.error);
