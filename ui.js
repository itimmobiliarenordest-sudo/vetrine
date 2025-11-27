// ui.js
import { getAllVetrine, searchByRif, postRibasso, postPlaceholder } from './api.js';

// If your environment doesn't support modules in browser, the above can be replaced by including api.js first
// and reading global functions. For GitHub Pages we used <script src="api.js"></script><script src="ui.js"></script>
// So here we instead assume api functions are global. To keep simple reassign:
if (typeof getAllVetrine === 'undefined') {
  // In-browser non-module fallback: api.js attached its functions to window
  window.getAllVetrine = window.getAllVetrine || (() => Promise.reject('API missing'));
  window.searchByRif = window.searchByRif || (() => Promise.reject('API missing'));
  window.postRibasso = window.postRibasso || (() => Promise.reject('API missing'));
  window.postPlaceholder = window.postPlaceholder || (() => Promise.reject('API missing'));
}

(function main(){
  const agencyEl = document.getElementById('agency');
  const refreshBtn = document.getElementById('refreshBtn');
  const loadingEl = document.getElementById('loading');
  const grid = document.getElementById('grid');
  const toast = document.getElementById('toast');
  const modalBack = document.getElementById('modal');
  const modalContent = document.getElementById('modalContent');
  const modalCancel = document.getElementById('modalCancel');
  const modalConfirm = document.getElementById('modalConfirm');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');

  const statTotal = document.getElementById('statTotal');
  const statYellow = document.getElementById('statYellow');
  const statRed = document.getElementById('statRed');
  const statBlue = document.getElementById('statBlue');
  const statPlaceholder = document.getElementById('statPlaceholder');

  let allData = [];
  let currentAgency = agencyEl.value;
  let currentFilter = 'all';
  let pendingAction = null; // {type, rif, extra}

  // load on start
  agencyEl.addEventListener('change', () => {
    currentAgency = agencyEl.value;
    renderGrid();
  });
  refreshBtn.addEventListener('click', loadData);
  searchBtn.addEventListener('click', onSearch);
  searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') onSearch(); });

  // filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      renderGrid();
    });
  });

  modalCancel.addEventListener('click', ()=> { modalBack.style.display='none'; pendingAction=null; });
  modalBack.addEventListener('click', (e) => { if(e.target===modalBack){ modalBack.style.display='none'; pendingAction=null;}});
  modalConfirm.addEventListener('click', async () => {
    if (!pendingAction) return;
    modalBack.style.display = 'none';
    const { type, rif, payload } = pendingAction;
    showToast('Eseguo...', 2000);
    try {
      if (type === 'ribasso') {
        const resp = await postRibasso(rif, payload.nuovo);
        if (resp && resp.success) showToast('Prezzo aggiornato', 2500);
        else showToast('Errore: ' + (resp.error||'unknown'), 3500);
      } else if (type === 'placeholder') {
        const resp = await postPlaceholder(rif, payload.placeholder);
        if (resp && resp.success) showToast('Segnaposto aggiornato', 2500);
        else showToast('Errore: ' + (resp.error||'unknown'), 3500);
      }
      await loadData();
    } catch (err) {
      showToast('Errore rete: ' + err.message, 3500);
    } finally {
      pendingAction = null;
    }
  });

  async function onSearch() {
    const rif = searchInput.value.trim();
    if (!rif) return showToast('Inserisci un RIF',2000);
    showLoading(true);
    try {
      const imm = await searchByRif(rif);
      showLoading(false);
      if (!imm) return showToast(`Nessun immobile con RIF ${rif}`, 3000);
      // highlight agency and scroll
      agencyEl.value = imm.agenzia;
      currentAgency = imm.agenzia;
      renderGrid(imm.rif);
      showToast(`Trovato RIF ${rif}`, 2000);
    } catch (err) {
      showLoading(false);
      showToast('Errore ricerca: ' + err.message, 3500);
    }
  }

  async function loadData(){
    showLoading(true);
    try {
      const data = await getAllVetrine();
      // data is object with agency arrays OR flat array. Normalize:
      if (Array.isArray(data)) {
        // if server returns flat array, group by agency
        const grouped = {};
        data.forEach(it => {
          const ag = it.agenzia || 'portogruaro';
          grouped[ag] = grouped[ag] || [];
          grouped[ag].push(it);
        });
        allData = grouped;
      } else {
        allData = data;
      }
      showLoading(false);
      renderGrid();
    } catch (err) {
      showLoading(false);
      showToast('Errore caricamento: ' + err.message, 3500);
    }
  }

  function computeClass(item){
    if (item.segnaposto) return 'bianco';
    if (!item.prezzo || Number(item.prezzo) === 0) return 'rosso';
    // prezzo_myagency is authoritative price to set locally (if prezzo < prezzo_myagency => giallo)
    const prezzo = Number(item.prezzo || 0);
    const prezzo_ref = Number(item.prezzo_myagency || item.prezzo || 0);
    const days = daysSince(item.timestamp);
    if (prezzo < prezzo_ref) return 'giallo';
    if (days > 180) return 'blu';
    return 'verde';
  }

  function daysSince(dateStr){
    if (!dateStr) return 9999;
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    return Math.floor(diff / (1000*60*60*24));
  }

  function buildCellHTML(item, idx) {
    const cls = computeClass(item);
    const price = item.prezzo ? formatMoney(item.prezzo) : '-';
    const ref = item.rif || '';
    let html = `<div class="cell ${cls}" data-rif="${ref}" data-idx="${idx}">
      <div>
        <div class="ref">Rif. ${ref}</div>
        <div class="price">€ ${price}</div>
        <div class="comune">${(item.comune||'').toUpperCase()}</div>
      </div>
      <div class="actions">`;

    if (cls === 'giallo') {
      html += `<button class="smallbtn" data-action="ribasso">Aggiorna</button>`;
    }
    html += `<button class="smallbtn" data-action="placeholder">${item.segnaposto ? 'Rimuovi segnaposto' : 'Segnaposto'}</button>`;
    html += `</div></div>`;
    return html;
  }

  function formatMoney(n){
    return Number(n).toLocaleString('it-IT');
  }

  function renderGrid(highlightRif){
    grid.innerHTML = '';
    const list = allData[currentAgency] || [];
    // apply filter
    let filtered = list.filter(it => {
      if (currentFilter === 'all') return true;
      if (currentFilter === 'gialli') return computeClass(it) === 'giallo';
      if (currentFilter === 'rossi') return computeClass(it) === 'rosso';
      if (currentFilter === 'placeholder') return it.segnaposto === true;
      return true;
    });

    // stats
    statTotal.innerText = list.length;
    statYellow.innerText = list.filter(i=>computeClass(i)==='giallo').length;
    statRed.innerText = list.filter(i=>computeClass(i)==='rosso').length;
    statBlue.innerText = list.filter(i=>computeClass(i)==='blu').length;
    statPlaceholder.innerText = list.filter(i=>i.segnaposto).length;

    // render cells
    filtered.forEach((item, idx) => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = buildCellHTML(item, idx);
      const cell = wrapper.firstElementChild;
      // highlight if searched
      if (highlightRif && item.rif === highlightRif) {
        cell.style.outline = '3px solid #333';
        setTimeout(()=>cell.style.outline='',4000);
      }
      // bind actions
      cell.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          const action = btn.dataset.action;
          onCellAction(action, item);
        });
      });
      grid.appendChild(cell);
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="padding:20px;color:#666">Nessun cartello in questa vista</div>';
    }
  }

  async function onCellAction(action, item){
    if (action === 'ribasso') {
      // ask user the new price
      const current = item.prezzo || item.prezzo_myagency || 0;
      showModal(`<div>RIF: <b>${item.rif}</b></div>
      <div style="margin-top:8px">Prezzo corrente: <b>€ ${formatMoney(current)}</b></div>
      <div style="margin-top:8px">
        <label>Nuovo prezzo (senza separatori):</label>
        <input id="modalInput" type="number" style="width:100%;padding:8px;margin-top:6px" value="${current}">
      </div>`);
      pendingAction = { type: 'ribasso', rif: item.rif, payload: { nuovo: null } };
      // when confirm clicked, read input value in confirm handler
      modalConfirm.onclick = async ()=>{
        const val = document.getElementById('modalInput').value;
        if (!val || Number(val)<=0) { showToast('Inserisci un prezzo valido', 2000); return; }
        pendingAction.payload.nuovo = Number(val);
        modalBack.style.display='none';
        // delegate to modalConfirm's general handler
        await modalConfirm.dispatchEvent(new Event('click_global'));
      };
      // dispatch to general handler by listening for custom event
      modalConfirm.addEventListener('click_global', async function handler(){
        modalConfirm.removeEventListener('click_global', handler);
        // reuse general confirm click
        modalBack.style.display='none';
        showToast('Aggiorno prezzo...', 2000);
        try {
          const resp = await postRibasso(item.rif, pendingAction.payload.nuovo);
          if (resp && resp.success) showToast('Prezzo aggiornato', 2200);
          else showToast('Errore: ' + (resp.error || 'unknown'), 3000);
        } catch (err) {
          showToast('Errore rete: ' + err.message, 3000);
        }
        pendingAction = null;
        await loadData();
      }, { once: true });
    } else if (action === 'placeholder') {
      // toggle
      const newVal = !item.segnaposto;
      showModal(`<div>RIF: <b>${item.rif}</b></div><div>Impostare segnaposto: <b>${newVal ? 'SI' : 'NO'}</b>?</div>`);
      pendingAction = { type: 'placeholder', rif: item.rif, payload: { placeholder: newVal } };
      modalConfirm.onclick = ()=> {
        modalConfirm.dispatchEvent(new Event('click_global_placeholder'));
      };
      modalConfirm.addEventListener('click_global_placeholder', async function handler(){
        modalConfirm.removeEventListener('click_global_placeholder', handler);
        modalBack.style.display='none';
        showToast('Aggiorno segnaposto...', 1500);
        try {
          const resp = await postPlaceholder(item.rif, newVal);
          if (resp && resp.success) showToast('Segnaposto aggiornato', 2000);
          else showToast('Errore: ' + (resp.error||'unknown'), 3000);
        } catch (err) {
          showToast('Errore rete: ' + err.message, 3000);
        }
        pendingAction = null;
        await loadData();
      }, { once: true });
    }
  }

  function showModal(html){
    modalContent.innerHTML = html;
    modalBack.style.display='flex';
  }

  function showToast(msg, ms=2000){
    toast.innerText = msg;
    toast.style.display='block';
    setTimeout(()=>{ toast.style.display='none'; }, ms);
  }

  function showLoading(flag){
    loadingEl.style.display = flag ? 'block' : 'none';
  }

  // initial load
  loadData();
})();
