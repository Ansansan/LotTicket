const tg = window.Telegram.WebApp;
tg.expand();

// --- CONFIGURATION ---
const LOTTERIES = [
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

// --- STATE MANAGEMENT ---
let currentState = {
    mode: 'user', 
    date: null, // YYYY-MM-DD
    displayDate: null, // "Lun 12 Ene"
    lottery: null,
    items: [] // Stores the ticket items
};

// --- INITIALIZATION ---
window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const isNacionalActive = urlParams.get('nacional') === 'true';
    const mode = urlParams.get('mode'); 

    // Add Nacional if active
    if (isNacionalActive || mode === 'admin') {
        LOTTERIES.push({ id: "nacional", name: "Nacional", time: "Mié/Dom", icon: "🇵🇦", special: true });
    }

    // Initialize Date (Panama Time)
    const now = new Date();
    const offset = -5; 
    const panamaTime = new Date(now.getTime() + (offset * 3600 * 1000)); 
    const todayStr = panamaTime.toISOString().split('T')[0];
    
    // Set Defaults
    currentState.date = todayStr;
    document.getElementById('adminDate').value = todayStr;

    // Render UI Components
    renderDateScroller(panamaTime); 
    renderLotteryGrid(mode);
    populateAdminSelect();
    
    // Setup Input Listeners (The part that was missing!)
    setupInputListeners();

    // Route to correct page
    if (mode === 'admin') {
        currentState.mode = 'admin';
        showPage('page-admin');
    } else {
        showPage('page-menu');
    }
};

// --- NAVIGATION LOGIC ---
function renderDateScroller(startDate) {
    const container = document.getElementById('customDateScroller');
    container.innerHTML = "";
    
    for (let i = -2; i <= 5; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        
        const isoDate = d.toISOString().split('T')[0];
        
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
        
        if(isToday) { // Set initial display label
            currentState.displayDate = label;
        }
    }
}

function selectDate(element, dateStr, label) {
    currentState.date = dateStr;
    currentState.displayDate = label;
    
    document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');
}

function renderLotteryGrid(mode) {
    const grid = document.getElementById('lotteryGrid');
    grid.innerHTML = "";
    
    LOTTERIES.forEach(lot => {
        const card = document.createElement('div');
        card.className = "lottery-card";
        if (lot.special) card.style.border = "2px solid gold";
        
        card.innerHTML = `
            <span class="card-icon">${lot.icon}</span>
            <div class="card-name">${lot.name}</div>
            <div class="card-time">${lot.time}</div>
        `;
        
        card.onclick = () => selectLottery(lot);
        grid.appendChild(card);
    });
}

function selectLottery(lotteryObj) {
    currentState.lottery = lotteryObj.name + " " + lotteryObj.time;
    
    let dateLabel = currentState.displayDate || currentState.date;
    document.getElementById('selectedDrawDisplay').innerText = `${currentState.lottery} (${dateLabel})`;
    
    showPage('page-input');
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(pageId).classList.remove('hidden');
    
    // Only show Telegram Main Button on the ticket page AND if there are items
    if (pageId === 'page-input' && currentState.items.length > 0) {
        tg.MainButton.show();
    } else {
        tg.MainButton.hide();
    }
}

function goBack() {
    showPage('page-menu');
}

// --- TICKET LOGIC (RESTORED) ---

function setupInputListeners() {
    const numInput = document.getElementById('numInput');
    const qtyInput = document.getElementById('qtyInput');
    const formatError = document.getElementById('formatError');

    // Real-time validation
    numInput.addEventListener('input', function() {
        const val = this.value;
        if (val.length > 0 && val.length !== 2 && val.length !== 4) {
            formatError.style.display = 'block';
            numInput.style.borderColor = 'red';
        } else {
            formatError.style.display = 'none';
            numInput.style.borderColor = '#ccc';
        }
    });

    // Enter Key Logic
    numInput.addEventListener("keypress", function(event) {
        if (event.key === "Enter") {
            event.preventDefault(); 
            qtyInput.focus(); 
        }
    });

    qtyInput.addEventListener("keypress", function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            addItem();
        }
    });
}

// Global addItem function so the HTML button can find it
window.addItem = function() {
    const numInput = document.getElementById('numInput');
    const qtyInput = document.getElementById('qtyInput');
    const errorMsg = document.getElementById('errorMsg');
    const formatError = document.getElementById('formatError');

    const num = numInput.value;
    const qtyVal = qtyInput.value; 
    const qty = qtyVal === "" ? 1 : parseInt(qtyVal);

    if (!num) { showError("Ingresa un número"); return; }
    if (qty < 1) { showError("Cantidad inválida"); return; }
    
    let priceUnit = 0;
    if (num.length === 2) priceUnit = 0.25;
    else if (num.length === 4) priceUnit = 1.00;
    else { showError("Solo 2 o 4 dígitos"); return; }

    const totalLine = priceUnit * qty;
    
    // Add to global items array
    currentState.items.push({ num, qty, totalLine });

    renderList();
    
    // Reset Fields
    numInput.value = "";
    qtyInput.value = ""; 
    numInput.focus();
    errorMsg.innerText = "";
    formatError.style.display = 'none';
    numInput.style.borderColor = '#ccc';
};

// Global delete function
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
    let totalQty = 0;

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
        totalQty += item.qty;
    });

    document.getElementById('grandTotal').innerText = "$" + grandTotal.toFixed(2);
    
    // Update Main Button
    if (currentState.items.length > 0) {
        tg.MainButton.setText(`IMPRIMIR ($${grandTotal.toFixed(2)})`);
        tg.MainButton.show();
        tg.MainButton.enable();
    } else {
        tg.MainButton.hide();
    }
}

// --- ADMIN LOGIC ---
function populateAdminSelect() {
    const sel = document.getElementById('adminLotterySelect');
    LOTTERIES.forEach(lot => {
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

// --- SEND DATA TO TELEGRAM ---
tg.MainButton.onClick(function(){
    // Admin handling is done via saveResults button, so this is only for User Tickets
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