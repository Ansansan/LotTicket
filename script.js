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
    
    // Parse Nacional Dates from URL (Format: "2026-01-15,2026-01-18")
    const datesParam = urlParams.get('nacional_dates');
    if (datesParam) {
        currentState.activeNacionalDates = datesParam.split(',');
    }

    // Initialize Date (Panama Time Approximation)
    const now = new Date();
    const offset = -5; // Panama is UTC-5
    const panamaTime = new Date(now.getTime() + (offset * 3600 * 1000)); 
    const todayStr = panamaTime.toISOString().split('T')[0];
    
    // Set defaults
    currentState.date = todayStr;
    document.getElementById('adminDate').value = todayStr;

    // Render Components
    renderDateScroller(panamaTime); 
    renderLotteryGridForDate(todayStr); // Initial render
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
    
    // Generate dates: 2 days back, 5 days forward
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
        
        if(isToday) currentState.displayDate = label;
    }
}

function selectDate(element, dateStr, label) {
    currentState.date = dateStr;
    currentState.displayDate = label;
    
    // Visual update
    document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');

    // IMPORTANT: Re-render grid to check if Nacional should appear
    renderLotteryGridForDate(dateStr);
}

function renderLotteryGridForDate(dateStr) {
    const grid = document.getElementById('lotteryGrid');
    grid.innerHTML = "";
    
    // 1. Create a copy of the standard list
    let currentLotteries = [...STANDARD_LOTTERIES];

    // 2. Check if "Nacional" is active for this specific date
    if (currentState.activeNacionalDates.includes(dateStr)) {
        // INSERT NACIONAL AT INDEX 3 (Between Tica 1:55 and Nica 4)
        // Array index 0=Primera11, 1=Nica1, 2=Tica1:55, --> 3=NACIONAL <--
        currentLotteries.splice(3, 0, NACIONAL_LOTTERY);
    }

    currentLotteries.forEach(lot => {
        const card = document.createElement('div');
        
        // Base class
        card.className = "lottery-card";
        
        // Add special class AND style if it is Nacional
        if (lot.special) {
            card.classList.add('card-nacional');
        }
        
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
    
    // Focus on number input immediately
    setTimeout(() => {
        document.getElementById('numInput').focus();
    }, 300);
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(pageId).classList.remove('hidden');
    
    // Main Button Visibility
    if (pageId === 'page-input' && currentState.items.length > 0) {
        tg.MainButton.show();
    } else {
        tg.MainButton.hide();
    }
}

window.goBack = function() {
    showPage('page-menu');
};

// --- 5. TICKET INPUT LOGIC ---

function setupInputListeners() {
    const numInput = document.getElementById('numInput');
    const qtyInput = document.getElementById('qtyInput');
    const formatError = document.getElementById('formatError');

    // Validation styling
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

    // 1. When hitting Enter on Number -> Go to Quantity
    numInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            event.preventDefault(); 
            qtyInput.focus(); 
        }
    });

    // 2. When hitting Enter on Quantity -> Add Item (which clears inputs)
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
    
    // --- CLEAR INPUTS ---
    // This will now work because renderList() won't crash anymore
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

    // UPDATED: Only update Grand Total (removed the line that caused the crash)
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
        setTimeout(() => {
            paper.scrollTop = paper.scrollHeight;
        }, 50);
    }
}

// --- 6. ADMIN & SUBMISSION ---

function populateAdminSelect() {
    const sel = document.getElementById('adminLotterySelect');
    // Combine standard and Nacional for the dropdown
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

// Telegram Main Button Action
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