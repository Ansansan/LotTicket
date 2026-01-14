const tg = window.Telegram.WebApp;
tg.expand();

// --- 1. CONFIGURATION ---
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

// --- 2. STATE MANAGEMENT ---
let currentState = {
    mode: 'user', 
    date: null,        // YYYY-MM-DD
    displayDate: null, // "Lun 12 Ene"
    lottery: null,
    items: [],
    activeNacionalDates: [] 
};

// --- 3. INITIALIZATION ---
window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    
    // Parse Nacional Dates from URL
    const datesParam = urlParams.get('nacional_dates');
    if (datesParam) {
        currentState.activeNacionalDates = datesParam.split(',');
    }

    // --- ROBUST PANAMA TIME INITIALIZATION ---
    // 1. Get Panama Time Object
    const panamaNow = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Panama"}));
    
    // 2. Manually build YYYY-MM-DD (Safe for Spain/Anywhere)
    const pYear = panamaNow.getFullYear();
    const pMonth = String(panamaNow.getMonth() + 1).padStart(2, '0');
    const pDay = String(panamaNow.getDate()).padStart(2, '0');
    const todayStr = `${pYear}-${pMonth}-${pDay}`;
    
    // Set defaults
    currentState.date = todayStr;
    document.getElementById('adminDate').value = todayStr;

    // Render Components
    renderDateScroller(panamaNow); 
    renderLotteryGridForDate(todayStr); 
    setupInputListeners();

    // Routing
    if (mode === 'admin') {
        currentState.mode = 'admin';
        showPage('page-admin');
        populateAdminSelect(); 
    } else {
        showPage('page-menu');
    }
};

// --- 4. NAVIGATION & RENDERING ---

function renderDateScroller(startDate) {
    const container = document.getElementById('customDateScroller');
    container.innerHTML = "";
    
    // REQ 4: Only today (0) and future (up to 7 days)
    for (let i = 0; i <= 7; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        
        // Manual String Construction
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const isoDate = `${year}-${month}-${day}`;
        
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        
        const dayName = days[d.getDay()];
        const dayNum = d.getDate();
        const monthName = months[d.getMonth()];
        
        const isToday = i === 0;
        const label = isToday ? "HOY" : `${dayName} ${dayNum} ${monthName}`;
        
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
        card.style.border = "2px solid #3390ec";
        card.style.background = "#f0f8ff";
    }

    card.innerHTML = `
        <span class="card-icon">${lot.icon}</span>
        <div class="card-name">${lot.name}</div>
        <div class="card-time">${lot.time}</div>
    `;
    
    card.onclick = () => selectLottery(lot);
    container.appendChild(card);
}

function getMinutesFromTime(timeStr) {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':');
    
    hours = parseInt(hours);
    minutes = parseInt(minutes);
    
    if (hours === 12 && modifier.toLowerCase() === 'am') {
        hours = 0;
    }
    if (hours !== 12 && modifier.toLowerCase() === 'pm') {
        hours += 12;
    }
    
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
    
    let allLotteries = [...STANDARD_LOTTERIES];
    if (currentState.activeNacionalDates.includes(dateStr)) {
        allLotteries.splice(3, 0, NACIONAL_LOTTERY);
    }

    // --- ROBUST PANAMA CHECK ---
    const panamaNow = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Panama"}));
    const currentMinutes = (panamaNow.getHours() * 60) + panamaNow.getMinutes();
    
    // Manually build Today's string to compare safely
    const pYear = panamaNow.getFullYear();
    const pMonth = String(panamaNow.getMonth() + 1).padStart(2, '0');
    const pDay = String(panamaNow.getDate()).padStart(2, '0');
    const panamaDateStr = `${pYear}-${pMonth}-${pDay}`;

    const isTodayView = (dateStr === panamaDateStr);

    let availableDraws = [];

    if (isTodayView) {
        availableDraws = allLotteries.filter(lot => {
            const drawMinutes = getMinutesFromTime(lot.time);
            
            if (lot.id === 'nacional') {
                return currentMinutes < 901; // 3:01 PM
            }
            return currentMinutes < drawMinutes;
        });
    } else {
        availableDraws = allLotteries;
    }

    if (availableDraws.length === 0) {
        grid.innerHTML = "<div style='grid-column: span 2; text-align: center; color: #888; padding: 20px;'>No hay sorteos disponibles hoy.</div>";
        return;
    }

    // --- NEW LOGIC: PRIORITIZE NACIONAL ---
    // If Nacional exists in the list (index > -1), move it to the front (index 0)
    // This forces it to be "Sorteo Actual" even if there are earlier games (like 11am)
    const nicaIndex = availableDraws.findIndex(l => l.id === 'nacional');
    if (nicaIndex > -1) {
        const nacionalLottery = availableDraws[nicaIndex];
        // Remove from current position
        availableDraws.splice(nicaIndex, 1);
        // Add to the very top
        availableDraws.unshift(nacionalLottery);
    }
    // --------------------------------------

    if (isTodayView) {
        const actual = availableDraws[0];
        const others = availableDraws.slice(1);
        
        const titleActual = document.createElement('div');
        titleActual.className = 'section-title';
        titleActual.innerHTML = "⚡ SORTEO ACTUAL";
        titleActual.style.cssText = "grid-column: span 2; color: #3390ec; font-weight: bold; margin-top: 10px;";
        grid.appendChild(titleActual);

        renderCard(actual, grid, true);

        if (others.length > 0) {
            const titleOthers = document.createElement('div');
            titleOthers.className = 'section-title';
            titleOthers.innerText = "OTROS";
            titleOthers.style.cssText = "grid-column: span 2; color: #666; font-weight: bold; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px;";
            grid.appendChild(titleOthers);

            others.forEach(lot => renderCard(lot, grid, false));
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

window.goBack = function() {
    showPage('page-menu');
};

function setupInputListeners() {
    const numInput = document.getElementById('numInput');
    const qtyInput = document.getElementById('qtyInput');
    const formatError = document.getElementById('formatError');

    numInput.addEventListener('input', function() {
        const val = this.value;
        if (val.length > 0 && val.length !== 2 && val.length !== 4) {
            formatError.style.display = 'block';
            numInput.style.borderColor = '#ff3b30';
        } else {
            formatError.style.display = 'none';
            numInput.style.borderColor = '#ccc';
        }
    });

    numInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            event.preventDefault(); 
            qtyInput.focus(); 
        }
    });

    qtyInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            addItem();
        }
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
    if (num.length === 2) priceUnit = 0.25;
    else if (num.length === 4) priceUnit = 1.00;
    else { showError("Solo 2 o 4 dígitos"); return; }

    const totalLine = priceUnit * qty;
    currentState.items.push({ num, qty, totalLine });

    renderList();
    
    numInput.value = "";
    qtyInput.value = ""; 
    errorMsg.innerText = "";
    formatError.style.display = 'none';
    numInput.style.borderColor = '#ccc';
    numInput.focus();
};

window.deleteItem = function(index) {
    currentState.items.splice(index, 1); 
    renderList(); 
};

function showError(msg) { 
    document.getElementById('errorMsg').innerText = msg; 
}

function renderList() {
    const listDiv = document.getElementById('itemsList');
    listDiv.innerHTML = "";
    let grandTotal = 0;

    currentState.items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'item-row';
        div.innerHTML = `
            <span class="item-num">*${item.num}*</span>
            <span>${item.qty}</span>
            <span>${item.totalLine.toFixed(2)}</span>
            <button class="delete-btn" onclick="deleteItem(${index})">QUITAR</button>
        `;
        listDiv.appendChild(div);
        grandTotal += item.totalLine;
    });

    document.getElementById('grandTotal').innerText = "$" + grandTotal.toFixed(2);

    if (currentState.items.length > 0) {
        tg.MainButton.setText(`IMPRIMIR ($${grandTotal.toFixed(2)})`);
        tg.MainButton.show();
        tg.MainButton.enable();
    } else {
        tg.MainButton.hide();
    }

    const paper = document.querySelector('.receipt-paper');
    if (paper) {
        setTimeout(() => { paper.scrollTop = paper.scrollHeight; }, 50);
    }
}

function populateAdminSelect() {
    const sel = document.getElementById('adminLotterySelect');
    const allLotteries = [...STANDARD_LOTTERIES, NACIONAL_LOTTERY];
    allLotteries.forEach(lot => {
        const opt = document.createElement('option');
        opt.value = lot.name + " " + lot.time;
        opt.innerText = lot.name + " " + lot.time;
        sel.appendChild(opt);
    });
}

window.saveResults = function() {
    const date = document.getElementById('adminDate').value;
    const lot = document.getElementById('adminLotterySelect').value;
    const w1 = document.getElementById('w1').value;
    const w2 = document.getElementById('w2').value;
    const w3 = document.getElementById('w3').value;

    if(!w1 || !w2 || !w3) {
        tg.showAlert("⚠️ Faltan números");
        return;
    }

    const payload = {
        action: 'save_results',
        date: date,
        lottery: lot,
        w1: w1, w2: w2, w3: w3
    };
    tg.sendData(JSON.stringify(payload));
};

tg.MainButton.onClick(function(){
    if(currentState.mode === 'admin') return; 
    if (currentState.items.length === 0) return;
    const payload = {
        action: 'create_ticket',
        type: currentState.lottery,
        date: currentState.date,
        items: currentState.items
    };
    tg.sendData(JSON.stringify(payload));
    setTimeout(() => { tg.close(); }, 500);
});