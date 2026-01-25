const tg = window.Telegram.WebApp;
tg.expand();
const ASSET_BASE = new URL('.', window.location.href).href;

const API_URL = "https://tel.pythonanywhere.com"; 

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
const AWARDS = {
    '2_digit_1': 14.00, '2_digit_2': 3.00, '2_digit_3': 2.00,
    '4_digit_12': 1000.00, '4_digit_13': 1000.00, '4_digit_23': 200.00
};

let currentState = {
    mode: 'user', date: null, displayDate: null, lottery: null, items: [],
    activeNacionalDates: [], history: { tickets: [], results: {} },
    historyDate: null, historyLottery: null
};

window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const datesParam = urlParams.get('nacional_dates');

    if (datesParam) {
        currentState.activeNacionalDates = datesParam.split(',').map(d => d.trim()).filter(Boolean);
    }

    const panamaNow = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Panama"}));
    const pYear = panamaNow.getFullYear();
    const pMonth = String(panamaNow.getMonth() + 1).padStart(2, '0');
    const pDay = String(panamaNow.getDate()).padStart(2, '0');
    const todayStr = `${pYear}-${pMonth}-${pDay}`;
    
    currentState.date = todayStr;
    const adminDate = document.getElementById('adminDate');
    if(adminDate) adminDate.value = todayStr;

    renderDateScroller(panamaNow); 
    renderLotteryGridForDate(todayStr); 
    setupInputListeners();

    if (mode === 'admin') {
        currentState.mode = 'admin';
        showPage('page-admin');
        populateAdminSelect(); 
    } else if (mode === 'history') {
        currentState.mode = 'history';
        showPage('page-history');
        showDebugUrl();
        
        let attempts = 0;
        const maxAttempts = 20; 

        function tryLoadData() {
            // 1. Get UID from URL (injected by Python Bot)
            const urlParams = new URLSearchParams(window.location.search);
            const forcedUid = urlParams.get('uid');

            // 2. FORCE PROD_ID prefix. 
            if (forcedUid) {
                console.log("Using PROD ID:", forcedUid);
                loadHistoryData("PROD_ID_" + forcedUid, panamaNow);
            } 
            // 3. Fallback
            else if (tg.initData && tg.initData.length > 0) {
                 loadHistoryData(tg.initData, panamaNow); 
            }
            else if (attempts < maxAttempts) {
                attempts++;
                const statusEl = document.getElementById('historyStatus');
                if(statusEl) {
                    statusEl.innerText = `Buscando ID... (${attempts})`;
                    statusEl.style.display = 'block';
                }
                setTimeout(tryLoadData, 200); 
            } 
            else {
                 setHistoryStatus("Error: Identidad no encontrada.");
                 alert("⚠️ Error: No se detectó tu usuario.\nPor favor escribe /start de nuevo.");
            }
        }
        
        tg.ready(); 
        tryLoadData(); 

    } else {
        showPage('page-menu');
    }
};

function loadHistoryData(telegramData, panamaNow) {
    setHistoryStatus("Verificando identidad...");
    if (!telegramData) {
        alert("⛔ Error Crítico: Telegram Data Vacío.");
        initHistoryView(panamaNow);
        return;
    }
    fetch(`${API_URL}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: telegramData })
    })
    .then(res => {
        if (res.status === 401) {
            return res.json().then(errData => {
                alert("🚨 ERROR SERVIDOR:\n" + errData.error);
                setHistoryStatus("Error: " + errData.error);
            });
        }
        if (!res.ok) {
            setHistoryStatus("Error Servidor: " + res.status);
            return null;
        }
        return res.json();
    })
    .then(data => {
        if (data && data.ok) {
            currentState.history = data.data;
            setHistoryStatus(""); 
        } else if (data) {
            setHistoryStatus("No tienes tickets jugados.");
        }
        initHistoryView(panamaNow);
    })
    .catch(err => {
        setHistoryStatus("Error de conexión");
        initHistoryView(panamaNow);
    });
}

// 🟢 NEW SMART INPUT LOGIC 🟢
function setupInputListeners() {
    ['input2', 'input4'].forEach(id => {
        const el = document.getElementById(id);
        if(el){
            el.addEventListener('input', function() {
               this.value = this.value.replace(/[^0-9]/g, ''); 
               document.getElementById('errorMsg').innerText = ""; 
            });
        }
    });
}

window.handleSmartEnter = function(event, type) {
    if (event.key === "Enter") {
        event.preventDefault();
        processSmartInputs();
    }
}

window.processSmartInputs = function() {
    const raw2 = document.getElementById('input2').value.trim();
    const raw4 = document.getElementById('input4').value.trim();
    const errorMsg = document.getElementById('errorMsg');
    
    let added = false;

    // 2 Digits Logic
    if (raw2.length >= 3) { 
        const num = raw2.substring(0, 2);
        const amountStr = raw2.substring(2);
        const amount = parseInt(amountStr);
        if (amount > 0) {
            addSmartItem(num, amount);
            document.getElementById('input2').value = ""; 
            added = true;
        }
    } else if (raw2.length > 0) {
        errorMsg.innerText = "Error en 2 cifras: Faltan datos (Ej: 235)";
        return;
    }

    // 4 Digits Logic
    if (raw4.length >= 5) { 
        const num = raw4.substring(0, 4);
        const amountStr = raw4.substring(4);
        const amount = parseInt(amountStr);
        if (amount > 0) {
            addSmartItem(num, amount);
            document.getElementById('input4').value = ""; 
            added = true;
        }
    } else if (raw4.length > 0) {
        errorMsg.innerText = "Error en 4 cifras: Faltan datos (Ej: 12345)";
        return;
    }

    if (!added && !errorMsg.innerText) {
        errorMsg.innerText = "Escribe un número y su cantidad pegados.";
    }
    
    if (added) {
        document.getElementById('input2').focus();
    }
};

function addSmartItem(num, qty) {
    let priceUnit = 0;
    if (num.length === 2) priceUnit = 0.25;
    else if (num.length === 4) priceUnit = 1.00;
    
    const totalLine = priceUnit * qty;
    currentState.items.push({ num, qty, totalLine });
    renderList();
}

function renderList() {
    const listDiv = document.getElementById('itemsList');
    listDiv.innerHTML = "";
    let grandTotal = 0;
    currentState.items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'item-row';
        div.innerHTML = `<span class="item-num">*${item.num}*</span><span>${item.qty}</span><span>${item.totalLine.toFixed(2)}</span><button class="delete-btn" onclick="deleteItem(${index})">QUITAR</button>`;
        listDiv.appendChild(div);
        grandTotal += item.totalLine;
    });
    document.getElementById('grandTotal').innerText = "$" + grandTotal.toFixed(2);
    if (currentState.items.length > 0) {
        tg.MainButton.setText(`IMPRIMIR ($${grandTotal.toFixed(2)})`);
        tg.MainButton.show(); tg.MainButton.enable();
    } else {
        tg.MainButton.hide();
    }
    const paper = document.querySelector('.receipt-paper');
    if (paper) setTimeout(() => { paper.scrollTop = paper.scrollHeight; }, 50);
}

window.deleteItem = function(index) {
    currentState.items.splice(index, 1); renderList(); 
};

// ... REST OF THE STANDARD FUNCTIONS ...
function renderDateScroller(startDate) {
    const container = document.getElementById('customDateScroller');
    container.innerHTML = "";
    for (let i = 0; i < 2; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const year = d.getFullYear(); const month = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
        const isoDate = `${year}-${month}-${day}`;
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const isToday = i === 0;
        let label = isToday ? "HOY" : "MAÑANA";
        if (!isToday) label = `${days[d.getDay()]} ${d.getDate()}`;

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
    if (isHighlight && !lot.special) {
        card.style.border = "2px solid #3390ec"; card.style.background = "#f0f8ff";
    }
    const iconHtml = buildIconHtml(lot.icon);
    card.innerHTML = `${iconHtml}<div class="card-name">${lot.name}</div><div class="card-time">${lot.time}</div>`;
    card.onclick = () => selectLottery(lot);
    container.appendChild(card);
}

function getMinutesFromTime(timeStr) {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':');
    hours = parseInt(hours); minutes = parseInt(minutes);
    if (hours === 12 && modifier.toLowerCase() === 'am') hours = 0;
    if (hours !== 12 && modifier.toLowerCase() === 'pm') hours += 12;
    return (hours * 60) + minutes;
}

function selectDate(element, dateStr, label) {
    currentState.date = dateStr;
    currentState.displayDate = label;
    document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');
    renderLotteryGridForDate(dateStr);
}

function renderLotteryGridForDate(dateStr) {
    const grid = document.getElementById('lotteryGrid');
    grid.innerHTML = "";
    const panamaNow = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Panama"}));
    const pYear = panamaNow.getFullYear(); const pMonth = String(panamaNow.getMonth() + 1).padStart(2, '0'); const pDay = String(panamaNow.getDate()).padStart(2, '0');
    const panamaDateStr = `${pYear}-${pMonth}-${pDay}`;
    const isTodayView = (dateStr === panamaDateStr);

    let availableDraws = [];
    if (isTodayView) {
        let allLotteries = [...STANDARD_LOTTERIES];
        if (currentState.activeNacionalDates.includes(dateStr)) {
            allLotteries.splice(3, 0, NACIONAL_LOTTERY);
        }
        const currentMinutes = (panamaNow.getHours() * 60) + panamaNow.getMinutes();
        availableDraws = allLotteries.filter(lot => {
            const drawMinutes = getMinutesFromTime(lot.time);
            if (lot.id === 'nacional') return currentMinutes < 901; 
            return currentMinutes < drawMinutes;
        });
    } else {
        availableDraws = STANDARD_LOTTERIES.filter(lot => lot.id === 'primera_11' || lot.id === 'nica_1');
        if (currentState.activeNacionalDates.includes(dateStr)) {
            availableDraws = [NACIONAL_LOTTERY, ...availableDraws];
        }
    }

    if (availableDraws.length === 0) {
        grid.innerHTML = "<div style='grid-column: span 2; text-align: center; color: #888; padding: 20px;'>No hay sorteos disponibles.</div>";
        return;
    }

    if (isTodayView) {
        const nacional = availableDraws.find(l => l.id === 'nacional');
        const standardDraws = availableDraws.filter(l => l.id !== 'nacional');
        const titleActual = document.createElement('div');
        titleActual.className = 'section-title';
        titleActual.innerHTML = "⚡ SORTEO ACTUAL";
        titleActual.style.cssText = "grid-column: span 2; color: #3390ec; font-weight: bold; margin-top: 10px;";
        grid.appendChild(titleActual);
        if (nacional) renderCard(nacional, grid, true);
        if (standardDraws.length > 0) {
            renderCard(standardDraws[0], grid, true);
            const others = standardDraws.slice(1);
            if (others.length > 0) {
                const titleOthers = document.createElement('div');
                titleOthers.className = 'section-title';
                titleOthers.innerText = "OTROS";
                titleOthers.style.cssText = "grid-column: span 2; color: #666; font-weight: bold; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px;";
                grid.appendChild(titleOthers);
                others.forEach(lot => renderCard(lot, grid, false));
            }
        }
    } else {
        availableDraws.forEach(lot => renderCard(lot, grid, false));
    }
}

function selectLottery(lotteryObj) {
    currentState.lottery = lotteryObj.name + " " + lotteryObj.time;
    let dateLabel = currentState.displayDate || currentState.date;
    document.getElementById('selectedDrawDisplay').innerText = `${currentState.lottery} (${dateLabel})`;
    showPage('page-input');
    setTimeout(() => { 
        const i2 = document.getElementById('input2');
        if(i2) i2.focus(); 
    }, 300);
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(pageId).classList.remove('hidden');
    if (pageId === 'page-input' && currentState.items.length > 0) {
        tg.MainButton.show();
    } else {
        tg.MainButton.hide();
    }
}
window.goBack = function() { showPage('page-menu'); };

// 🟢 NEW HISTORY LOGIC (Future Dates + No Empty Days)
function initHistoryView(panamaNow) {
    // 1. Get all tickets from the loaded history
    const tickets = currentState.history.tickets || [];
    
    // 2. Extract unique date strings
    const rawDates = tickets.map(t => t.date);
    const uniqueDates = [...new Set(rawDates)];
    
    // 3. Sort dates Descending (Newest/Future first -> Oldest last)
    uniqueDates.sort((a, b) => {
        return a < b ? 1 : -1; 
    });

    // 4. Handle case with no tickets
    if (uniqueDates.length === 0) {
        document.getElementById('historyShelf').innerHTML = "<div style='padding:15px; color:#999; text-align:center; width:100%; font-size: 14px;'>No tienes tickets recientes.</div>";
        document.getElementById('historyLotteryGrid').innerHTML = "";
        document.getElementById('historyList').innerHTML = "";
        return;
    }

    // 5. Select the most recent/future date by default (Index 0)
    currentState.historyDate = uniqueDates[0];

    // 6. Render the shelf and the grids
    renderHistoryShelf(uniqueDates);
    renderHistoryLotteryGrid(currentState.historyDate);
    renderHistoryTickets(currentState.historyDate, null);
}

function resolveIconSrc(iconPath) {
    try { return new URL(iconPath, ASSET_BASE).href; } catch (e) { return iconPath; }
}

function buildIconHtml(icon) {
    if (!icon) return `<span class="card-icon"></span>`;
    if (typeof icon === "string" && icon.toLowerCase().endsWith(".png")) {
        const iconSrc = resolveIconSrc(icon);
        return `<img class="card-flag" src="${iconSrc}" alt="">`;
    }
    return `<span class="card-icon">${icon}</span>`;
}

// 🟢 UPDATED SHELF RENDERER (Highlights Index 0)
function renderHistoryShelf(dates) {
    const shelf = document.getElementById('historyShelf');
    shelf.innerHTML = "";
    
    dates.forEach((dateStr, idx) => {
        const chip = document.createElement('div');
        // Highlight Index 0 (Newest/Future)
        chip.className = `shelf-date ${idx === 0 ? 'active' : ''}`;
        chip.innerText = dateStr;
        
        chip.onclick = () => {
            document.querySelectorAll('.shelf-date').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            
            currentState.historyDate = dateStr;
            currentState.historyLottery = null; 
            
            renderHistoryLotteryGrid(dateStr);
            renderHistoryTickets(dateStr, null);
        };
        shelf.appendChild(chip);
    });
}

function renderHistoryLotteryGrid(dateStr) {
    const grid = document.getElementById('historyLotteryGrid');
    grid.innerHTML = "";
    const types = getHistoryLotteryTypes(dateStr);
    if (types.length === 0) {
        grid.innerHTML = "<div style='grid-column: span 2; text-align: center; color: #888; padding: 10px;'>No hay sorteos para este dia.</div>";
        return;
    }
    types.forEach(lotteryType => {
        const meta = getLotteryMetaFromType(lotteryType);
        const card = document.createElement('div');
        card.className = "lottery-card";
        if (meta.special) card.classList.add('card-nacional');
        const isSelected = currentState.historyLottery === lotteryType && currentState.historyDate === dateStr;
        if (isSelected && !meta.special) {
            card.style.border = "2px solid #3390ec"; card.style.background = "#f0f8ff";
        }
        const iconHtml = buildIconHtml(meta.icon);
        card.innerHTML = `${iconHtml}<div class="card-name">${meta.name}</div><div class="card-time">${meta.time}</div>`;
        card.onclick = () => selectHistoryLottery(lotteryType, dateStr);
        grid.appendChild(card);
    });
}

function selectHistoryLottery(lotteryType, dateStr) {
    currentState.historyLottery = lotteryType;
    renderHistoryLotteryGrid(dateStr);
    renderHistoryTickets(dateStr, lotteryType);
}

function renderHistoryTickets(dateStr, lotteryType) {
    const list = document.getElementById('historyList');
    list.innerHTML = "";
    if (!lotteryType) {
        list.innerHTML = "<div style='text-align:center;color:#888;padding:10px;'>Selecciona un sorteo.</div>";
        return;
    }
    const tickets = currentState.history.tickets.filter(t => t.date === dateStr && t.lottery_type === lotteryType);
    if (tickets.length === 0) {
        list.innerHTML = "<div style='text-align:center;color:#888;padding:10px;'>No hay tickets para este sorteo.</div>";
        return;
    }
    tickets.forEach(ticket => {
        const resultsKey = `${ticket.date}|${ticket.lottery_type}`;
        const results = currentState.history.results[resultsKey];
        let statusHtml = "<span class='h-status status-wait'>Pendiente</span>";
        let breakdownHtml = "";
        let checkedHtml = "";
        if (results) {
            const calc = calculateTicketWin(ticket.items || [], results);
            checkedHtml = "<span class='h-status' style='background:#e5e5ea;color:#333;margin-left:8px;'>Chequeado</span>";
            if (calc.total > 0) {
                statusHtml = `<span class='h-status status-win'>Ganaste $${calc.total.toFixed(2)}</span>`;
                breakdownHtml = `<div class="h-breakdown">${calc.lines.join("<br>")}</div>`;
            } else {
                statusHtml = "<span class='h-status status-loss'>No ganó</span>";
            }
        }
        const nums = (ticket.items || []).map(i => `${i.num} x${i.qty}`).join(" | ");
        const card = document.createElement('div');
        card.className = "history-card";
        card.innerHTML = `
            <div class="h-header">
                <div>${ticket.date}</div>
                <div>Ticket #${ticket.id}</div>
            </div>
            <div class="h-title">${ticket.lottery_type}</div>
            <div class="h-nums">${nums || "-"}</div>
            <div>${statusHtml}${checkedHtml}</div>
            ${breakdownHtml}
        `;
        list.appendChild(card);
    });
}

function setHistoryStatus(text) {
    const el = document.getElementById('historyStatus');
    if (!el) return;
    el.innerText = text || "";
    el.style.display = text ? 'block' : 'none';
}

function showDebugUrl() {
    const el = document.getElementById('historyDebugUrl');
    if (!el) return;
    el.innerText = window.location.href;
}

function getHistoryLotteryTypes(dateStr) {
    const types = new Set();
    currentState.history.tickets.filter(t => t.date === dateStr && t.lottery_type).forEach(t => types.add(t.lottery_type));
    const ordered = [];
    const knownOrder = [NACIONAL_LOTTERY, ...STANDARD_LOTTERIES].map(l => `${l.name} ${l.time}`);
    knownOrder.forEach(type => { if (types.has(type)) ordered.push(type); types.delete(type); });
    Array.from(types).sort().forEach(type => ordered.push(type));
    return ordered;
}

function getLotteryMetaFromType(lotteryType) {
    const known = [NACIONAL_LOTTERY, ...STANDARD_LOTTERIES].find(lot => `${lot.name} ${lot.time}` === lotteryType);
    if (known) {
        return { name: known.name, time: known.time, icon: known.icon, special: !!known.special };
    }
    const parts = lotteryType.split(' ');
    const time = parts.length >= 2 ? parts.slice(-2).join(' ') : "";
    const name = parts.length >= 3 ? parts.slice(0, -2).join(' ') : lotteryType;
    let icon = "";
    if (name.includes("Nacional")) icon = "🇵🇦";
    else if (name.includes("Tica")) icon = "🇨🇷";
    else if (name.includes("Nica")) icon = "🇳🇮";
    else if (name.includes("Primera")) icon = "🇩🇴";
    return { name, time, icon, special: name.includes("Nacional") };
}

function calculateTicketWin(items, results) {
    const w1 = String(results.w1 || "");
    const w2 = String(results.w2 || "");
    const w3 = String(results.w3 || "");
    const win4_12 = w1 + w2; const win4_13 = w1 + w3; const win4_23 = w2 + w3;
    let total = 0; const lines = [];
    items.forEach(item => {
        const num = String(item.num || ""); const bet = Number(item.qty || 0);
        if (num.length === 2) {
            if (num === w1) { const win = bet * AWARDS['2_digit_1']; total += win; lines.push(`1er Premio: $${AWARDS['2_digit_1']} * ${bet} = $${win.toFixed(2)}`); }
            if (num === w2) { const win = bet * AWARDS['2_digit_2']; total += win; lines.push(`2do Premio: $${AWARDS['2_digit_2']} * ${bet} = $${win.toFixed(2)}`); }
            if (num === w3) { const win = bet * AWARDS['2_digit_3']; total += win; lines.push(`3er Premio: $${AWARDS['2_digit_3']} * ${bet} = $${win.toFixed(2)}`); }
        } else if (num.length === 4) {
            if (num === win4_12) { const win = bet * AWARDS['4_digit_12']; total += win; lines.push(`Billete 1ro/2do: $${AWARDS['4_digit_12']} * ${bet} = $${win.toFixed(2)}`); }
            if (num === win4_13) { const win = bet * AWARDS['4_digit_13']; total += win; lines.push(`Billete 1ro/3ro: $${AWARDS['4_digit_13']} * ${bet} = $${win.toFixed(2)}`); }
            if (num === win4_23) { const win = bet * AWARDS['4_digit_23']; total += win; lines.push(`Billete 2do/3ro: $${AWARDS['4_digit_23']} * ${bet} = $${win.toFixed(2)}`); }
        }
    });
    return { total, lines };
}

function populateAdminSelect() {
    const sel = document.getElementById('adminLotterySelect');
    const allLotteries = [...STANDARD_LOTTERIES, NACIONAL_LOTTERY];
    allLotteries.forEach(lot => {
        const opt = document.createElement('option'); opt.value = lot.name + " " + lot.time; opt.innerText = lot.name + " " + lot.time; sel.appendChild(opt);
    });
}

window.saveResults = function() {
    const date = document.getElementById('adminDate').value;
    const lot = document.getElementById('adminLotterySelect').value;
    const w1 = document.getElementById('w1').value;
    const w2 = document.getElementById('w2').value;
    const w3 = document.getElementById('w3').value;
    if(!w1 || !w2 || !w3) { tg.showAlert("⚠️ Faltan números"); return; }
    const payload = { action: 'save_results', date: date, lottery: lot, w1: w1, w2: w2, w3: w3 };
    tg.sendData(JSON.stringify(payload));
};

tg.MainButton.onClick(function(){
    if(currentState.mode === 'admin' || currentState.mode === 'history') return; 
    if (currentState.items.length === 0) return;
    const modal = document.getElementById('reviewModal');
    if (modal) { modal.classList.remove('hidden'); } 
    else { tg.showAlert("Error: Modal HTML missing. Update index.html"); }
});

window.closeReview = function() { document.getElementById('reviewModal').classList.add('hidden'); }

window.confirmPrint = function() {
    const payload = {
        action: 'create_ticket', type: currentState.lottery, date: currentState.date, items: currentState.items
    };
    tg.sendData(JSON.stringify(payload));
    setTimeout(() => { tg.close(); }, 500);
}

// 🟢 NEW SHORTCUT LOGIC
// "/" or "+" = Switch Box
// "." = Hide Keyboard
// "-" = Print (Confirm)
document.addEventListener('keydown', function(event) {
    const key = event.key;
    const input2 = document.getElementById('input2');
    const input4 = document.getElementById('input4');

    // 1. SWITCH BOX (+ or /)
    if (key === '+' || key === 'Add' || key === '/') {
        event.preventDefault(); 
        if (document.activeElement === input2) input4.focus();
        else input2.focus();
    }

    // 2. HIDE KEYBOARD (.)
    if (key === '.') {
        event.preventDefault();
        if (document.activeElement) {
            document.activeElement.blur();
        }
    }

    // 3. PRINT TICKET (-)
    if (key === '-') {
        event.preventDefault();
        if (currentState.items.length > 0) {
            confirmPrint();
        }
    }
});