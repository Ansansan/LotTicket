# LotTicket

# 🚀 Deployment Protocol: Nuclear Cache Update

To ensure **all users** (especially those with old phones and aggressive caching) receive the latest version immediately without typing `/start`, follow this strict procedure for every new deployment.

## 📋 Step-by-Step Update Checklist

### 1. Pick a New Version ID (this is for step 3)  

Decide on a new unique identifier for this release.

* *Example:* If current is `PROD_1_V5`, the new one is `PROD_1_V6`.

### 2. Rotate Asset Filenames (The "Nuclear" Step)

Go to your local project folder and rename the actual JavaScript and CSS files to match the new version ID.

* Rename `script_v5.js`  ➡️  **`script_v6.js`**
* Rename `style_v5.css`  ➡️  **`style_v6.css`**

### 3. Update `index.html`

You must update **3 specific areas** inside `index.html`:

**A. The Version Variable (Lines ~10-15)**
Update the variable inside the `<head>` script. This forces the browser to check its local storage and reload if it has an old version.

```javascript
// Change this:
var CURRENT_VERSION = "PROD_1_V5";

// To this:
var CURRENT_VERSION = "PROD_1_V6"; 

```

**B. The CSS Link (Line ~35)**
Update the href to point to the **new filename**.

```html
<link rel="stylesheet" href="style_v5.css?v=PROD_1_V5">

<link rel="stylesheet" href="style_v6.css?v=PROD_1_V6">

```

**C. The JS Script Source (Bottom of body)**
Update the src to point to the **new filename**.

```html
<script src="script_v5.js?v=PROD_1_V5"></script>

<script src="script_v6.js?v=PROD_1_V6"></script>

```

### 4. Deploy Frontend

1. Commit the renamed files and the updated `index.html`.
2. Push to GitHub.
3. Wait ~2 minutes for GitHub Pages to rebuild (Check the "Actions" tab for a green checkmark).

### 5. Backend Verification (PythonAnywhere)

* **Restart the Bot:** Go to your console and restart `lot_ticket.py`. This ensures the bot generates links with the new timestamp `v=...`.
* **API Check:** If you modified `history_api.py`, reload the Web App in the "Web" tab.

---

## 🛠 Reference: Ghost File Strategy (Redirects)

**DO NOT RENAME `index.html`.**
To support old buttons sent in Telegram history (e.g., pointing to `app_v3.html`), ensure you have "Ghost Files" in your repo named exactly `app_v2.html` and `app_v3.html` containing **only** this redirect code:

```html
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="refresh" content="0; url=index.html">
    <script>window.location.replace("index.html");</script>
</head>
<body>
    <p>Redirigiendo... <a href="index.html">Click aquí</a></p>
</body>
</html>

```

---

## 📄 Reference: The Cache Buster Script

Ensure this script is always present at the top of the `<head>` in `index.html`:

```html
<script>
    (function() {
        // 🔴 UPDATE THIS MANUALLY ON EVERY DEPLOYMENT
        var CURRENT_VERSION = "PROD_1_V6"; 
        
        try {
            var storedVersion = localStorage.getItem('app_version');
            if (storedVersion !== CURRENT_VERSION) {
                console.log('New version detected! Nuking cache...');
                localStorage.clear();
                sessionStorage.clear();
                localStorage.setItem('app_version', CURRENT_VERSION);
                
                if (window.location.search.indexOf('v=' + CURRENT_VERSION) === -1) {
                        var separator = window.location.href.indexOf('?') === -1 ? '?' : '&';
                        window.location.replace(window.location.href + separator + 'v=' + CURRENT_VERSION);
                }
            }
        } catch (e) { console.error("Cache clear failed", e); }
    })();
</script>

```
