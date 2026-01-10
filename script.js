const tg = window.Telegram.WebApp;
tg.expand();

// CONFIG
const LOTTERIES = [
    { id: "primera_11", name: "La Primera", time: "11:00 am", icon: "🌅" },
    { id: "nica_1", name: "Nica", time: "1:00 pm", icon: "🇳🇮" },
    { id: "tica_1", name: "Tica", time: "1:55 pm", icon: "🇨🇷" },
    { id: "nica_4", name: "Nica", time: "4:00 pm", icon: "🇳🇮" },
    { id: "tica_5", name: "Tica", time: "5:30 pm", icon: "🇨🇷" },
    { id: "primera_6", name: "La Primera", time: "6:00 pm", icon: "🌆" },
    { id: "nica_7", name: "Nica", time: "7:00 pm", icon: "🇳🇮" },
    { id: "tica_8", name: "Tica", time: "8:30 pm", icon: "🇨🇷" },
    { id: "nica_10", name: "Nica", time: "10:00 pm", icon: "🇳🇮" }
];

// STATE
let currentState = {
    mode: 'user', // 'user' or 'admin'
    date: null,
    lottery: null,
    items: []
};

// --- INITIALIZATION ---
window.onload = function() {
    // 1. Get URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const isNacionalActive = urlParams.get('nacional') === 'true';
    const mode = urlParams.get('mode'); // 'admin' if accessed via /premios

    // 2. Add Nacional if active or if Admin
    if (isNacionalActive || mode === 'admin') {
        LOTTERIES.push({ id: "nacional", name: "Nacional", time: "Mié/Dom", icon: "🇵🇦", special: true });
    }

    // 3. Set Default Date (Panama Time)
    // We create a date object and shift it to UTC-5
    const now = new Date();
    const offset = -5; 
    const panamaTime = new Date(now.getTime() + (offset * 3600 * 1000)); 
    // Format YYYY-MM-DD
    const todayStr = panamaTime.toISOString().split('T')[0];
    
    document.getElementById('datePicker').value = todayStr;
    document.getElementById('adminDate').value = todayStr;

    // 4. Render Grid
    renderLotteryGrid(mode);
    populateAdminSelect();

    // 5. Route to correct page
    if (mode === 'admin') {
        currentState.mode = 'admin';
        showPage('page-admin');
    } else {
        showPage('page-menu');
    }
};

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
    currentState.date = document.getElementById('datePicker').value;
    
    // Go to Input Page
    document.getElementById('selectedDrawDisplay').innerText = `${currentState.lottery} (${currentState.date})`;
    showPage('page-input');
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(pageId).classList.remove('hidden');
    
    if (pageId === 'page-input') {
        tg.MainButton.show();
    } else {
        tg.MainButton.hide();
    }
}

function goBack() {
    showPage('page-menu');
    // Clear items when going back? Optional. 
    // items = []; renderList(); 
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

function saveResults() {
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
}

// --- TICKET LOGIC (Existing logic, slightly adapted) ---
// ... [Keep your addItem, renderList, deleteItem functions here] ...

// UPDATE TG MAIN BUTTON FOR USER
tg.MainButton.onClick(function(){
    // Check if in Admin Mode
    if(currentState.mode === 'admin') return; 

    // User Mode
    if (items.length === 0) return;

    const payload = {
        action: 'create_ticket',
        type: currentState.lottery,
        date: currentState.date,
        items: items
    };
    
    tg.sendData(JSON.stringify(payload));
    setTimeout(() => { tg.close(); }, 500);
});