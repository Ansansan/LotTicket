const tg = window.Telegram.WebApp;
tg.expand();
const ASSET_BASE = new URL('.', window.location.href).href;

// --- CONFIGURATION ---
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

    // 1. Restore the Missing Date Logic
    if (datesParam) {
        currentState.activeNacionalDates = datesParam.split(',').map(d => d.trim()).filter(Boolean);
    }

    const panamaNow = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Panama"}));
    const pYear = panamaNow.getFullYear();
    const pMonth = String(panamaNow.getMonth() + 1).padStart(2, '0');
    const pDay = String(panamaNow.getDate()).padStart(2, '0');
    const todayStr = `${pYear}-${pMonth}-${pDay}`;
    
    // Set the initial state correctly
    currentState.date = todayStr;
    const adminDate = document.getElementById('adminDate');
    if(adminDate) adminDate.value = todayStr;

    // 2. Render the View
    renderDateScroller(panamaNow); 
    renderLotteryGridForDate(todayStr); // This will now work because todayStr is defined!
    setupInputListeners();

    // 3. Handle Modes (Admin / History / User)
    if (mode === 'admin') {
        currentState.mode = 'admin';
        showPage('page-admin');
        populateAdminSelect(); 
    } else if (mode === 'history') {
        currentState.mode = 'history';
        showPage('page-history');
        showDebugUrl();
        
        // --- ROBUST RETRY SYSTEM (FIX FOR ANDROID) ---
        let attempts = 0;
        const maxAttempts = 20; 

        function tryLoadData() {
            const MOCK_DATA = "auth_date=1700000000&user=%7B%22id%22%3A%208550582981%2C%20%22first_name%22%3A%20%22Admin%22%2C%20%22is_bot%22%3A%20false%2C%20%22language_code%22%3A%20%22es%22%7D&hash=2825e2d940b238304e53b4fa2c24f2848de0dd81ad0e7ee55d390608bd23d958";
            if (!tg.initData) tg.initData = MOCK_DATA;

            if (tg.initData && tg.initData.length > 0) {
                loadHistoryData(tg.initData, panamaNow);
            } 
            else if (attempts < maxAttempts) {
                attempts++;
                const statusEl = document.getElementById('historyStatus');
                if(statusEl) {
                    statusEl.innerText = `Cargando ID... (${attempts})`;
                    statusEl.style.display = 'block';
                }
                setTimeout(tryLoadData, 200); 
            } 
            else {
                const unsafe = JSON.stringify(tg.initDataUnsafe || {});
                alert(`⛔ ERROR FINAL: Timeout.\nPlat: ${tg.platform}\nInitData: VACÍO\nUnsafe: ${unsafe}`);
                initHistoryView(panamaNow);
            }
        }
        
        tg.ready(); 
        tryLoadData(); 

    } else {
        // Default User Mode
        showPage('page-menu');
    }
};

// --- API LOADER ---
function loadHistoryData(telegramData, panamaNow) {
    setHistoryStatus("Verificando identidad...");
    
    // 1. Check if Data exists
    if (!telegramData) {
        // Detailed Alert for debugging
        alert("⛔ Error Crítico: Telegram Data Vacío.\nPlatform: " + tg.platform + "\nExpanded: " + tg.isExpanded);
        setHistoryStatus("Error: No Identidad");
        initHistoryView(panamaNow);
        return;
    }

    // 2. Send to Server
    setHistoryStatus("Consultando servidor...");
    fetch(`${API_URL}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: telegramData })
    })
    .then(res => {
        if (res.status === 401) {
            alert("⚠️ Error 401: El Token del Servidor no coincide con el del Bot.");
            setHistoryStatus("Error de Configuración (401)");
            return null;
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

// --- KEEP ALL OTHER FUNCTIONS BELOW AS THEY WERE ---
// (renderDateScroller, renderCard, getMinutesFromTime, selectDate, etc...)
// [PASTE THE REST OF YOUR RENDER FUNCTIONS HERE]
// ...
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
// ... (Include the rest of the functions from your previous file: renderCard, selectLottery, etc.)
// ...
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
    setTimeout(() => { document.getElementById('numInput').focus(); }, 300);
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

function setupInputListeners() {
    const numInput = document.getElementById('numInput');
    const qtyInput = document.getElementById('qtyInput');
    const formatError = document.getElementById('formatError');
    numInput.addEventListener('input', function() {
        const val = this.value;
        if (val.length > 0 && val.length !== 2 && val.length !== 4) {
            formatError.style.display = 'block'; numInput.style.borderColor = '#ff3b30';
        } else {
            formatError.style.display = 'none'; numInput.style.borderColor = '#ccc';
        }
    });
    numInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") { event.preventDefault(); qtyInput.focus(); }
    });
    qtyInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") { event.preventDefault(); addItem(); }
    });
}

window.addItem = function() {
    const numInput = document.getElementById('numInput');
    const qtyInput = document.getElementById('qtyInput');
    const errorMsg = document.getElementById('errorMsg');
    const formatError = document.getElementById('formatError');
    const num = numInput.value.trim(); 
    const qtyVal = qtyInput.value.trim(); 
    const qty = qtyVal === "" ? 1 : parseInt(qtyVal); 
    if (!num) { showError("Ingresa un número"); return; }
    if (qty < 1) { showError("Cantidad inválida"); return; }
    let priceUnit = 0;
    if (num.length === 2) priceUnit = 0.25; else if (num.length === 4) priceUnit = 1.00; else { showError("Solo 2 o 4 dígitos"); return; }
    const totalLine = priceUnit * qty;
    currentState.items.push({ num, qty, totalLine });
    renderList();
    numInput.value = ""; qtyInput.value = ""; errorMsg.innerText = "";
    formatError.style.display = 'none'; numInput.style.borderColor = '#ccc'; numInput.focus();
};

window.deleteItem = function(index) {
    currentState.items.splice(index, 1); renderList(); 
};
function showError(msg) { document.getElementById('errorMsg').innerText = msg; }

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

function initHistoryView(panamaNow) {
    const dates = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(panamaNow);
        d.setDate(d.getDate() - i);
        const year = d.getFullYear(); const month = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
    }
    renderHistoryShelf(dates);
    if (dates.length > 0) {
        currentState.historyDate = dates[dates.length - 1];
        renderHistoryLotteryGrid(currentState.historyDate);
        renderHistoryTickets(currentState.historyDate, null);
    }
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

function renderHistoryShelf(dates) {
    const shelf = document.getElementById('historyShelf');
    shelf.innerHTML = "";
    dates.forEach((dateStr, idx) => {
        const chip = document.createElement('div');
        chip.className = `shelf-date ${idx === dates.length - 1 ? 'active' : ''}`;
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