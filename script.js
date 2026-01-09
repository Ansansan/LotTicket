const tg = window.Telegram.WebApp;
tg.expand(); 

const items = [];
const numInput = document.getElementById('numInput');
const qtyInput = document.getElementById('qtyInput');
const errorMsg = document.getElementById('errorMsg');

function addItem() {
    const num = numInput.value;
    const qty = parseInt(qtyInput.value);

    if (!qty || qty < 1) { showError("Cantidad inválida"); return; }
    
    // PRICING LOGIC
    let priceUnit = 0;
    if (num.length === 2) priceUnit = 0.25;
    else if (num.length === 4) priceUnit = 1.00;
    else { showError("Solo 2 o 4 dígitos"); return; }

    const totalLine = priceUnit * qty;
    items.push({ num, qty, totalLine });

    renderList();
    numInput.value = "";
    qtyInput.value = "1";
    numInput.focus();
    errorMsg.innerText = "";
}

function showError(msg) { errorMsg.innerText = msg; }

function renderList() {
    const listDiv = document.getElementById('itemsList');
    listDiv.innerHTML = "";
    let grandTotal = 0;
    let totalQty = 0;

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'item-row';
        div.innerHTML = `<span class="item-num">*${item.num}*</span><span>${item.qty}</span><span>${item.totalLine.toFixed(2)}</span>`;
        listDiv.appendChild(div);
        grandTotal += item.totalLine;
        totalQty += item.qty;
    });

    document.getElementById('grandTotal').innerText = "$" + grandTotal.toFixed(2);
    document.getElementById('totalItems').innerText = totalQty;

    // --- BUTTON VISIBILITY LOGIC (CLEANED) ---
    if (items.length > 0) {
        tg.MainButton.setText(`IMPRIMIR ($${grandTotal.toFixed(2)})`);
        tg.MainButton.show();
        tg.MainButton.enable(); // Ensures button is clickable on mobile
    } else {
        tg.MainButton.hide();
    }
}

// --- SEND DATA LOGIC ---
tg.MainButton.onClick(function(){
    try {
        const data = JSON.stringify(items);
        tg.sendData(data);
        
        // Force close if Telegram doesn't do it automatically
        setTimeout(() => {
            tg.close();
        }, 500);
        
    } catch (e) {
        alert("Error: " + e.message); 
    }
});