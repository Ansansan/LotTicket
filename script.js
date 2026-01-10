const tg = window.Telegram.WebApp;
tg.expand(); 

let items = []; 
const numInput = document.getElementById('numInput');
const qtyInput = document.getElementById('qtyInput');
const errorMsg = document.getElementById('errorMsg');
const formatError = document.getElementById('formatError');

// --- REAL-TIME VALIDATION ---
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

// --- ENTER KEY LISTENERS ---
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

function addItem() {
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
    items.push({ num, qty, totalLine });

    renderList();
    
    numInput.value = "";
    qtyInput.value = ""; 
    numInput.focus();
    errorMsg.innerText = "";
    formatError.style.display = 'none';
    numInput.style.borderColor = '#ccc';
}

// --- DELETE FUNCTION ---
window.deleteItem = function(index) {
    items.splice(index, 1); 
    renderList(); 
};

function showError(msg) { errorMsg.innerText = msg; }

function renderList() {
    const listDiv = document.getElementById('itemsList');
    listDiv.innerHTML = "";
    let grandTotal = 0;
    let totalQty = 0;

    items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'item-row';
        
        // --- CHANGED TO BUTTON 'Quitar' ---
        div.innerHTML = `
            <span class="item-num">*${item.num}*</span>
            <span>${item.qty}</span>
            <span>${item.totalLine.toFixed(2)}</span>
            <button class="delete-btn" onclick="deleteItem(${index})">Quitar</button>
        `;
        listDiv.appendChild(div);
        grandTotal += item.totalLine;
        totalQty += item.qty;
    });

    document.getElementById('grandTotal').innerText = "$" + grandTotal.toFixed(2);
    document.getElementById('totalItems').innerText = totalQty;

    if (items.length > 0) {
        tg.MainButton.setText(`IMPRIMIR ($${grandTotal.toFixed(2)})`);
        tg.MainButton.show();
        tg.MainButton.enable();
    } else {
        tg.MainButton.hide();
    }
}

tg.MainButton.onClick(function(){
    try {
        const data = JSON.stringify(items);
        tg.sendData(data);
        setTimeout(() => { tg.close(); }, 500);
    } catch (e) {
        alert("Error: " + e.message); 
    }
});