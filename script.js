const tg = window.Telegram.WebApp;
tg.expand();

// --- CONFIGURATION ---
const STANDARD_LOTTERIES = [
    { id: "primera_11", name: "La Primera", time: "11:00 am", icon: "🇩🇴" },
    { id: "nica_1", name: "Nica", time: "1:00 pm", icon: "🇳🇮" },
    { id: "tica_1", name: "Tica", time: "1:55 pm", icon: "🇨🇷" },
    { id: "nica_4", name: "Nica", time: "4:00 pm", icon: "🇳🇮" },
    { id: "tica_5", name: "Tica", time: "5:30 pm", icon: "🇨🇷" },
    { id: "primera_6", name: "La Primera", time: "6:00 pm", icon: "🇩🇴" },
    { id: "nica_7", name: "Nica", time: "7:00 pm", icon: "🇳🇮" },
    { id: "tica_8", name: "Tica", time: "8:30 pm", icon: "🇨🇷" },
    { id: "nica_10", name: "Nica", time: "10:00 pm", icon: "🇳🇮" }
];
const NACIONAL_LOTTERY = { id: "nacional", name: "Nacional", time: "3:00 pm", icon: "🇵🇦", special: true };

// AWARDS (Must match Python)
const AWARDS = {
    '2_digit_1': 14.00, '2_digit_2': 3.00, '2_digit_3': 2.00,
    '4_digit_12': 1000.00, '4_digit_13': 1000.00, '4_digit_23': 200.00
};

let currentState = { mode: 'user', date: null, displayDate: null, lottery: null, items: [], activeNacionalDates: [] };
let historyData = [];

window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const datesParam = urlParams.get('nacional_dates');
    const rawHistoryData = urlParams.get('data');

    if (datesParam) currentState.activeNacionalDates = datesParam.split(',');

    const panamaNow = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Panama"}));
    const pYear = panamaNow.getFullYear();
    const pMonth = String(panamaNow.getMonth() + 1).padStart(2, '0');
    const pDay = String(panamaNow.getDate()).padStart(2, '0');
    const todayStr = `${pYear}-${pMonth}-${pDay}`;
    
    currentState.date = todayStr;
    document.getElementById('adminDate').value = todayStr;

    // --- ROUTING ---
    if (mode === 'admin') {
        currentState.mode = 'admin';
        showPage('page-admin');
        populateAdminSelect();
    } else if (mode === 'history' && rawHistoryData) {
        currentState.mode = 'history';
        try {
            historyData = JSON.parse(decodeURIComponent(rawHistoryData));
            showPage('page-history');
            renderHistory('all'); // Default to showing all
        } catch (e) {
            tg.showAlert("Error loading history: " + e.message);
        }
    } else {
        renderDateScroller(panamaNow); 
        renderLotteryGridForDate(todayStr); 
        setupInputListeners();
        showPage('page-menu');
    }
};

// --- CORE UI FUNCTIONS ---
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(pageId).classList.remove('hidden');
    if (pageId === 'page-input' && currentState.items.length > 0) tg.MainButton.show();
    else tg.MainButton.hide();
}

// --- HISTORY RENDERER ---
function renderHistory(filterDate) {
    const shelf = document.getElementById('historyShelf');
    const list = document.getElementById('historyList');
    
    // 1. Build Date Shelf
    const dates = [...new Set(historyData.map(item => item.d))];
    shelf.innerHTML = `<div class="shelf-date ${filterDate==='all'?'active':''}" onclick="renderHistory('all')">Todos</div>`;
    
    dates.forEach(d => {
        const div = document.createElement('div');
        div.className = `shelf-date ${filterDate===d ? 'active' : ''}`;
        div.innerText = d.substring(5); // Show MM-DD
        div.onclick = () => renderHistory(d);
        shelf.appendChild(div);
    });

    // 2. Build List
    list.innerHTML = "";
    const filtered = filterDate === 'all' ? historyData : historyData.filter(h => h.d === filterDate);
    
    if (filtered.length === 0) {
        list.innerHTML = "<div style='text-align:center; color:#888; margin-top:30px;'>No hay tickets.</div>";
        return;
    }

    filtered.forEach(ticket => {
        const card = document.createElement('div');
        card.className = "history-card";
        
        let statusHtml = "";
        let breakdownHtml = "";
        
        // CALCULATION LOGIC (Client Side)
        if (ticket.r) { // If result exists [w1, w2, w3]
            const [w1, w2, w3] = ticket.r;
            let totalWin = 0;
            let wins = [];
            
            ticket.i.forEach(item => {
                const num = String(item[0]);
                const bet = parseFloat(item[1]);
                
                // --- JS PORT OF PYTHON CALC LOGIC ---
                if (num.length === 2) {
                    if(num === w1) { let w=bet*AWARDS['2_digit_1']; totalWin+=w; wins.push(`1º [${num}]: $${w.toFixed(2)}`); }
                    if(num === w2) { let w=bet*AWARDS['2_digit_2']; totalWin+=w; wins.push(`2º [${num}]: $${w.toFixed(2)}`); }
                    if(num === w3) { let w=bet*AWARDS['2_digit_3']; totalWin+=w; wins.push(`3º [${num}]: $${w.toFixed(2)}`); }
                } else if (num.length === 4) {
                    const w12=w1+w2, w13=w1+w3, w23=w2+w3;
                    if(num === w12) { let w=bet*AWARDS['4_digit_12']; totalWin+=w; wins.push(`Bill 1/2: $${w.toFixed(2)}`); }
                    if(num === w13) { let w=bet*AWARDS['4_digit_13']; totalWin+=w; wins.push(`Bill 1/3: $${w.toFixed(2)}`); }
                    if(num === w23) { let w=bet*AWARDS['4_digit_23']; totalWin+=w; wins.push(`Bill 2/3: $${w.toFixed(2)}`); }
                }
            });

            if (totalWin > 0) {
                statusHtml = `<div class="h-status status-win">🎉 Ganaste $${totalWin.toFixed(2)}</div>`;
                breakdownHtml = `<div class="h-breakdown">${wins.join('<br>')}</div>`;
            } else {
                statusHtml = `<div class="h-status status-loss">❌ No hubo suerte</div>`;
                breakdownHtml = `<div style="font-size:12px; color:#999; margin-top:5px;">Resultados: ${w1}-${w2}-${w3}</div>`;
            }
        } else {
            statusHtml = `<div class="h-status status-wait">⏳ Pendiente</div>`;
        }

        // Render Card
        const numsStr = ticket.i.map(i => `<b>${i[0]}</b>(${i[1]})`).join(', ');
        
        card.innerHTML = `
            <div class="h-header"><span>Ticket #${ticket.id}</span><span>${ticket.d}</span></div>
            <div class="h-title">${ticket.t}</div>
            <div class="h-nums">${numsStr}</div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                ${statusHtml}
            </div>
            ${breakdownHtml}
        `;
        list.appendChild(card);
    });
}

// --- STANDARD TICKET FUNCTIONS (Copied from previous) ---
function renderDateScroller(startDate) {
    const container = document.getElementById('customDateScroller');
    container.innerHTML = "";
    for (let i = 0; i < 2; i++) {
        const d = new Date(startDate); d.setDate(d.getDate() + i);
        const year = d.getFullYear(); const month = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
        const isoDate = `${year}-${month}-${day}`;
        const isToday = i === 0;
        let label = isToday ? "HOY" : "MAÑANA";
        const chip = document.createElement('div');
        chip.className = `date-chip ${isToday ? 'selected' : ''}`;
        chip.innerText = label;
        chip.onclick = () => selectDate(chip, isoDate, label);
        container.appendChild(chip);
        if(isToday) currentState.displayDate = label;
    }
}
function renderCard(lot, container, isHighlight) {
    const card = document.createElement('div');
    card.className = "lottery-card";
    if (lot.special) card.classList.add('card-nacional');
    if (isHighlight && !lot.special) { card.style.border = "2px solid #3390ec"; card.style.background = "#f0f8ff"; }
    card.innerHTML = `<span class="card-icon">${lot.icon}</span><div class="card-name">${lot.name}</div><div class="card-time">${lot.time}</div>`;
    card.onclick = () => selectLottery(lot);
    container.appendChild(card);
}
function selectDate(el, dateStr, label) {
    currentState.date = dateStr; currentState.displayDate = label;
    document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected'); renderLotteryGridForDate(dateStr);
}
function getMinutesFromTime(timeStr) {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':');
    hours = parseInt(hours); minutes = parseInt(minutes);
    if (hours === 12 && modifier.toLowerCase() === 'am') hours = 0;
    if (hours !== 12 && modifier.toLowerCase() === 'pm') hours += 12;
    return (hours * 60) + minutes;
}
function renderLotteryGridForDate(dateStr) {
    const grid = document.getElementById('lotteryGrid'); grid.innerHTML = "";
    const panamaNow = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Panama"}));
    const pYear = panamaNow.getFullYear(); const pMonth = String(panamaNow.getMonth() + 1).padStart(2, '0'); const pDay = String(panamaNow.getDate()).padStart(2, '0');
    const panamaDateStr = `${pYear}-${pMonth}-${pDay}`;
    const isTodayView = (dateStr === panamaDateStr);
    let availableDraws = [];

    if (isTodayView) {
        let allLotteries = [...STANDARD_LOTTERIES];
        if (currentState.activeNacionalDates.includes(dateStr)) allLotteries.splice(3, 0, NACIONAL_LOTTERY);
        const currentMinutes = (panamaNow.getHours() * 60) + panamaNow.getMinutes();
        availableDraws = allLotteries.filter(lot => {
            const drawMinutes = getMinutesFromTime(lot.time);
            if (lot.id === 'nacional') return currentMinutes < 901; 
            return currentMinutes < drawMinutes;
        });
    } else {
        availableDraws = STANDARD_LOTTERIES.filter(lot => lot.id === 'primera_11' || lot.id === 'nica_1');
    }
    if (availableDraws.length === 0) { grid.innerHTML = "<div style='grid-column: span 2; text-align: center; color: #888; padding: 20px;'>No hay sorteos disponibles.</div>"; return; }

    if (isTodayView) {
        const nacional = availableDraws.find(l => l.id === 'nacional');
        const standardDraws = availableDraws.filter(l => l.id !== 'nacional');
        const titleActual = document.createElement('div');
        titleActual.className = 'section-title'; titleActual.innerHTML = "⚡ SORTEO ACTUAL"; titleActual.style.cssText = "grid-column: span 2; color: #3390ec; font-weight: bold; margin-top: 10px;"; grid.appendChild(titleActual);
        if (nacional) renderCard(nacional, grid, true);
        if (standardDraws.length > 0) {
            renderCard(standardDraws[0], grid, true);
            const others = standardDraws.slice(1);
            if (others.length > 0) {
                const titleOthers = document.createElement('div');
                titleOthers.className = 'section-title'; titleOthers.innerText = "OTROS"; titleOthers.style.cssText = "grid-column: span 2; color: #666; font-weight: bold; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px;"; grid.appendChild(titleOthers);
                others.forEach(lot => renderCard(lot, grid, false));
            }
        }
    } else { availableDraws.forEach(lot => renderCard(lot, grid, false)); }
}
function selectLottery(lot) {
    currentState.lottery = lot.name + " " + lot.time;
    document.getElementById('selectedDrawDisplay').innerText = `${currentState.lottery} (${currentState.displayDate || currentState.date})`;
    showPage('page-input'); setTimeout(() => { document.getElementById('numInput').focus(); }, 300);
}
window.goBack = function() { showPage('page-menu'); };
function setupInputListeners() {
    const numInput = document.getElementById('numInput'); const qtyInput = document.getElementById('qtyInput');
    numInput.addEventListener('input', function() {
        const val = this.value;
        if (val.length > 0 && val.length !== 2 && val.length !== 4) { document.getElementById('formatError').style.display = 'block'; numInput.style.borderColor = '#ff3b30'; } 
        else { document.getElementById('formatError').style.display = 'none'; numInput.style.borderColor = '#ccc'; }
    });
    numInput.addEventListener("keydown", function(event) { if (event.key === "Enter") { event.preventDefault(); qtyInput.focus(); } });
    qtyInput.addEventListener("keydown", function(event) { if (event.key === "Enter") { event.preventDefault(); addItem(); } });
}
window.addItem = function() {
    const numInput = document.getElementById('numInput'); const qtyInput = document.getElementById('qtyInput');
    const num = numInput.value.trim(); const qtyVal = qtyInput.value.trim(); const qty = qtyVal === "" ? 1 : parseInt(qtyVal);
    if (!num) { showError("Ingresa un número"); return; }
    if (qty < 1) { showError("Cantidad inválida"); return; }
    let priceUnit = 0;
    if (num.length === 2) priceUnit = 0.25; else if (num.length === 4) priceUnit = 1.00; else { showError("Solo 2 o 4 dígitos"); return; }
    currentState.items.push({ num, qty, totalLine: priceUnit * qty });
    renderList(); numInput.value = ""; qtyInput.value = ""; document.getElementById('errorMsg').innerText = ""; numInput.focus();
};
window.deleteItem = function(index) { currentState.items.splice(index, 1); renderList(); };
function showError(msg) { document.getElementById('errorMsg').innerText = msg; }
function renderList() {
    const listDiv = document.getElementById('itemsList'); listDiv.innerHTML = ""; let grandTotal = 0;
    currentState.items.forEach((item, index) => {
        const div = document.createElement('div'); div.className = 'item-row';
        div.innerHTML = `<span class="item-num">*${item.num}*</span><span>${item.qty}</span><span>${item.totalLine.toFixed(2)}</span><button class="delete-btn" onclick="deleteItem(${index})">QUITAR</button>`;
        listDiv.appendChild(div); grandTotal += item.totalLine;
    });
    document.getElementById('grandTotal').innerText = "$" + grandTotal.toFixed(2);
    if (currentState.items.length > 0) { tg.MainButton.setText(`IMPRIMIR ($${grandTotal.toFixed(2)})`); tg.MainButton.show(); tg.MainButton.enable(); } else { tg.MainButton.hide(); }
}

// --- ADMIN FIX ---
function populateAdminSelect() {
    const sel = document.getElementById('adminLotterySelect'); sel.innerHTML = ""; // Clear first
    [...STANDARD_LOTTERIES, NACIONAL_LOTTERY].forEach(lot => {
        const opt = document.createElement('option'); opt.value = lot.name + " " + lot.time; opt.innerText = lot.name + " " + lot.time; sel.appendChild(opt);
    });
}
window.saveResults = function() {
    const date = document.getElementById('adminDate').value;
    const lot = document.getElementById('adminLotterySelect').value;
    const w1 = document.getElementById('w1').value;
    const w2 = document.getElementById('w2').value;
    const w3 = document.getElementById('w3').value;
    
    if(!date || !lot) { tg.showAlert("⚠️ Faltan datos de fecha/sorteo"); return; }
    if(!w1 || !w2 || !w3) { tg.showAlert("⚠️ Faltan números ganadores"); return; }
    
    const payload = { action: 'save_results', date: date, lottery: lot, w1: w1, w2: w2, w3: w3 };
    tg.sendData(JSON.stringify(payload));
    
    // Visual feedback for user
    tg.close();
};

// --- MODAL & PRINT ---
tg.MainButton.onClick(function(){
    if(currentState.mode === 'admin') return; 
    if (currentState.items.length === 0) return;
    document.getElementById('reviewModal').classList.remove('hidden');
});
window.closeReview = function() { document.getElementById('reviewModal').classList.add('hidden'); }
window.confirmPrint = function() {
    const payload = { action: 'create_ticket', type: currentState.lottery, date: currentState.date, items: currentState.items };
    tg.sendData(JSON.stringify(payload));
    setTimeout(() => { tg.close(); }, 500);
}