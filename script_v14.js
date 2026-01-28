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
    historyDate: null, historyLottery: null, statsDate: null
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

    // 🟢 ROUTING
    if (mode === 'admin_dashboard') {
        currentState.mode = 'admin';
        showPage('page-admin-dashboard');
    }
    else if (mode === 'admin') {
        currentState.mode = 'admin';
        showPage('page-admin');
        populateAdminSelect(); 
    } 
    else if (mode === 'history') {
        currentState.mode = 'history';
        showPage('page-history');
        
        let attempts = 0;
        const maxAttempts = 20; 

        function tryLoadData() {
            // 🛑 FIX: Use explicit PROD1_ID_ routing
            if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                console.log("Authenticated via Telegram User ID");
                const forcedAuth = "PROD1_ID_" + tg.initDataUnsafe.user.id;
                loadHistoryData(forcedAuth, panamaNow);
            } 
            // Fallback for debugging via URL (Legacy)
            else {
                const urlParams = new URLSearchParams(window.location.search);
                const forcedUid = urlParams.get('uid');
                
                if (forcedUid) {
                    console.log("Using URL ID:", forcedUid);
                    loadHistoryData("PROD1_ID_" + forcedUid, panamaNow);
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
        }
        
        tg.ready(); 
        tryLoadData(); 

    } else {
        showPage('page-menu');
    }
};

// --- API LOADER ---
function loadHistoryData(telegramData, panamaNow) {
    setHistoryStatus("Entrando...");
    
    if (!telegramData) {
        alert("⛔ Error Crítico: Telegram Data Vacío.");
        setHistoryStatus("Error: No Identidad");
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
                alert("🚨 ERROR REAL DEL SERVIDOR:\n" + errData.error);
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

// 🟢 2-BOX INPUT LOGIC
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

// 🟢 FIXED: Generates dates including TOMORROW and auto-scrolls to TODAY
function initHistoryView(panamaNow) {
    const dates = [];
    
    // Loop from 6 days ago (i=6) up to Tomorrow (i=-1)
    for (let i = 6; i >= -1; i--) {
        const d = new Date(panamaNow);
        d.setDate(d.getDate() - i);
        const year = d.getFullYear(); 
        const month = String(d.getMonth() + 1).padStart(2, '0'); 
        const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
    }

    // Calculate Today's String to set as default
    const pYear = panamaNow.getFullYear();
    const pMonth = String(panamaNow.getMonth() + 1).padStart(2, '0');
    const pDay = String(panamaNow.getDate()).padStart(2, '0');
    const todayStr = `${pYear}-${pMonth}-${pDay}`;

    // Decide which date to activate (Today if available, else the last one)
    const targetDate = dates.includes(todayStr) ? todayStr : dates[dates.length - 1];
    currentState.historyDate = targetDate;

    // Render Shelf with the target date active
    renderHistoryShelf(dates, targetDate);

    // Initial Load of Grid
    currentState.historyLottery = null;
    renderHistoryLotteryGrid(targetDate);
    renderHistoryTickets(targetDate, null);
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

// 🟢 FIXED: Adds auto-scroll logic
function renderHistoryShelf(dates, activeDateStr) {
    const shelf = document.getElementById('historyShelf');
    shelf.innerHTML = "";
    let activeChipElement = null;

    dates.forEach((dateStr) => {
        const chip = document.createElement('div');
        const isActive = dateStr === activeDateStr;
        
        chip.className = `shelf-date ${isActive ? 'active' : ''}`;
        
        // Optional: Simple Label Logic
        let label = dateStr;
        
        chip.innerText = label;
        
        chip.onclick = () => {
            document.querySelectorAll('.shelf-date').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentState.historyDate = dateStr;
            currentState.historyLottery = null;
            renderHistoryLotteryGrid(dateStr);
            renderHistoryTickets(dateStr, null);
            
            // Center clicked item
            chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        };
        
        shelf.appendChild(chip);
        if (isActive) activeChipElement = chip;
    });

    // 🚀 MAGIC FIX: Scroll to the active date (Today) on load
    if (activeChipElement) {
        setTimeout(() => {
            activeChipElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }, 100);
    }
}

// 🟢 UPDATED: Change Text Logic Here
function renderHistoryLotteryGrid(dateStr) {
    const grid = document.getElementById('historyLotteryGrid');
    grid.innerHTML = "";
    const types = getHistoryLotteryTypes(dateStr);
    
    // 🟢 CHANGED: New Text "No compraste para esta fecha"
    if (types.length === 0) {
        grid.innerHTML = "<div style='grid-column: span 2; text-align: center; color: #888; padding: 20px; font-weight: 500;'>No compraste para esta fecha</div>";
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
        let statusHtml = "<span class='h-status status-wait'>Pendiente de introducir premios</span>";
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

// 🟢 ADMIN FUNCTIONS 
window.openAdminResults = function() {
    currentState.mode = 'admin';
    showPage('page-admin');
    populateAdminSelect(); 
    if(!document.getElementById('adminDate').value) {
        document.getElementById('adminDate').value = currentState.date;
    }
};

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

// 🟢 STATS LOGIC (Merged from Source Bot)
window.goToStats = function() {
    showPage('page-stats-menu');
    initStatsView(); 
}

// 🟢 FIXED: Now passes 'defaultDate' so the Shelf highlights the correct day
window.initStatsView = function() {
    const dates = [];
    const panamaNow = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Panama"}));
    
    // Loop from -1 (Tomorrow) to 10 days ago
    for(let i = -1; i < 10; i++) {
        const d = new Date(panamaNow);
        d.setDate(d.getDate() - i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${day}`);
    }
    
    // Calculate Today's String
    const pYear = panamaNow.getFullYear();
    const pMonth = String(panamaNow.getMonth() + 1).padStart(2, '0');
    const pDay = String(panamaNow.getDate()).padStart(2, '0');
    const todayStr = `${pYear}-${pMonth}-${pDay}`;

    // Default to Today if available, otherwise Tomorrow
    const defaultDate = dates.includes(todayStr) ? todayStr : dates[0];
    
    // 🟢 PASS defaultDate to renderStatsShelf
    renderStatsShelf(dates, defaultDate);
    selectStatsDate(defaultDate);
}

// 🟢 FIXED: Accepts 'activeDateStr' to highlight the REAL active date
window.renderStatsShelf = function(dates, activeDateStr) {
    const shelf = document.getElementById('statsShelf');
    shelf.innerHTML = "";
    
    dates.forEach((d) => {
        const chip = document.createElement('div');
        // Only add 'active' if it matches the logic (not just index 0)
        const isActive = d === activeDateStr;
        chip.className = `shelf-date ${isActive ? 'active' : ''}`;
        chip.innerText = d;
        
        chip.onclick = () => {
            document.querySelectorAll('#statsShelf .shelf-date').forEach(e=>e.classList.remove('active'));
            chip.classList.add('active');
            selectStatsDate(d);
        };
        shelf.appendChild(chip);
        
        // Auto-scroll to active
        if (isActive) {
            setTimeout(() => {
                chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }, 100);
        }
    });
}

// 🟢 FIXED: Puts Nacional on TOP using 'unshift' & Correct Timezone Logic
window.selectStatsDate = function(dateStr) {
    currentState.statsDate = dateStr;
    const grid = document.getElementById('statsLotteryGrid');
    grid.innerHTML = "";
    
    // Hybrid Check for Nacional Visibility
    let showNacional = currentState.activeNacionalDates.includes(dateStr);
    
    // 🟢 TIMEZONE SAFE CHECK for History
    if (!showNacional) {
        const d = new Date(dateStr + "T12:00:00"); 
        const day = d.getDay(); // 0 = Sun, 3 = Wed
        
        // Robust Panama Today Calculation (Matches initStatsView)
        const panamaNow = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Panama"}));
        const pYear = panamaNow.getFullYear();
        const pMonth = String(panamaNow.getMonth() + 1).padStart(2, '0');
        const pDay = String(panamaNow.getDate()).padStart(2, '0');
        const pTodayStr = `${pYear}-${pMonth}-${pDay}`;

        if (dateStr < pTodayStr && (day === 0 || day === 3)) {
            showNacional = true;
        }
    }

    let all = [...STANDARD_LOTTERIES];
    if (showNacional) {
        // 🟢 FIX 1: UNSHIFT puts it at the TOP (Start of array)
        all.unshift(NACIONAL_LOTTERY); 
    }
    
    all.forEach(lot => {
        const card = document.createElement('div');
        card.className = "lottery-card";
        if(lot.special) card.classList.add('card-nacional');
        card.innerHTML = `${buildIconHtml(lot.icon)}<div class="card-name">${lot.name}</div><div class="card-time">${lot.time}</div>`;
        card.onclick = () => loadDetailedStats(dateStr, lot.name + " " + lot.time);
        grid.appendChild(card);
    });
}

window.loadDetailedStats = function(date, lottery) {
    showPage('page-stats-detail');
    document.getElementById('statsDetailTitle').innerText = `${date} | ${lottery}`;
    const container = document.getElementById('statsDetailContent');
    container.innerHTML = "<div style='text-align:center; padding:20px;'>Cargando datos...</div>";

    // 🛑 FIX: Explicit routing for Stats too
    let authData = "";
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
         authData = "PROD1_ID_" + tg.initDataUnsafe.user.id;
    } else {
        // Fallback to URL uid
        const urlParams = new URLSearchParams(window.location.search);
        const forcedUid = urlParams.get('uid');
        if(forcedUid) authData = "PROD1_ID_" + forcedUid;
    }

    fetch(`${API_URL}/admin/stats_detail`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ initData: authData, date: date, lottery: lottery })
    })
    .then(res => {
        if (!res.ok) throw new Error("Error del Servidor");
        return res.json();
    })
    .then(resp => {
        if(!resp.ok) { 
            container.innerHTML = `<div class="error">${resp.error}</div>`; 
            return; 
        }
        renderDetailedTable(resp.data, container); 
    })
    .catch(err => {
        container.innerHTML = `<div class="error">Error de conexión: ${err.message}</div>`;
    });
}

window.renderDetailedTable = function(data, container) {
    const s = data.sales;
    const p = data.payouts;
    const w = data.meta;
    
    const net = s.total - p.total_won;
    const netColor = net >= 0 ? '#2e7d32' : '#c62828';

    let html = `
        <div style="background:#fff; padding:15px; border-radius:10px; margin-bottom:15px; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
            <h3 style="margin:0 0 10px 0; font-size:16px;">💰 Resumen Financiero</h3>
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>Venta Total:</span> <b>$${s.total.toFixed(2)}</b></div>
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>Premios:</span> <b>$${p.total_won.toFixed(2)}</b></div>
            <div style="display:flex; justify-content:space-between; border-top:1px solid #eee; padding-top:5px; font-size:18px;">
                <span>Neto:</span> <b style="color:${netColor}">$${net.toFixed(2)}</b>
            </div>
        </div>

        <div style="background:#fff; padding:15px; border-radius:10px; margin-bottom:15px;">
            <h3 style="margin:0 0 10px 0; font-size:16px;">🎟️ Ventas por Tipo</h3>
            <div style="display:flex; justify-content:space-between;"><span>Chances:</span> <span>${s.chances_qty} ($${s.chances_amount.toFixed(2)})</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Billetes:</span> <span>${s.billetes_qty} ($${s.billetes_amount.toFixed(2)})</span></div>
        </div>
    `;
    
    // --- WINNERS SECTION ---
    if (!w.w1) {
        html += `<div style="text-align:center; color:#999;">Resultados no ingresados aún.</div>`;
    } else {
        html += `<h3 style="padding-left:5px; margin-bottom:10px;">🏆 Ganadores</h3>`;
        
        // 🟢 SAFETY FIX HERE: Checks if 'paid' is strictly undefined
        const drawChanceRow = (label, num, statObj) => {
            const count = (statObj && statObj.count !== undefined) ? statObj.count : 0;
            const paid = (statObj && statObj.paid !== undefined) ? statObj.paid : 0;
            const numDisplay = num ? num.slice(-2) : "--";
            
            return `
            <div style="background:#fff; padding:10px; border-radius:8px; margin-bottom:8px; display:flex; align-items:center;">
                <div style="width:40px; font-weight:bold; font-size:18px;">${numDisplay}</div>
                <div style="flex:1; padding-left:10px;">
                    <div style="font-size:12px; color:#666;">${label}</div>
                    <div style="font-size:14px;"><b>${count}</b> ganadores</div>
                </div>
                <div style="font-weight:bold; color:#c62828;">$${paid.toFixed(2)}</div>
            </div>`;
        };

        html += drawChanceRow("1er Premio (Chance)", w.w1, p.chances.w1);
        html += drawChanceRow("2do Premio (Chance)", w.w2, p.chances.w2);
        html += drawChanceRow("3er Premio (Chance)", w.w3, p.chances.w3);
        
        if (data.meta.type.includes("Nacional") && p.billetes) {
             html += `<h3 style="padding-left:5px; margin-top:20px; margin-bottom:10px;">🇵🇦 Desglose Billetes</h3>`;
             if(p.billetes.w1) {
                 for (const [cat, val] of Object.entries(p.billetes.w1)) {
                     // Safety for loop vars (though these are usually safe coming from Object.entries)
                     const safeCount = val.count || 0;
                     const safePaid = val.paid || 0;
                     html += `<div style="font-size:13px; display:flex; justify-content:space-between; padding:5px 10px; background:#fff; margin-bottom:2px;">
                        <span>1er ${cat}:</span> <span><b>${safeCount}</b> ($${safePaid})</span>
                      </div>`;
                 }
             }
        }
    }
    container.innerHTML = html;
}
