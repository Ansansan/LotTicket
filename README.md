## Deployment & Update Protocol ("Nuclear Cache Busting")

**Critical:** Telegram's internal browser caches HTML/JS aggressively. To ensure all users receive updates immediately and to prevent "Redirect Loops" (which break the History and Stats buttons), you must follow this **4-Step Renaming Protocol** for every update.

### The Strategy: Versioning

We do not overwrite files. We rename them (e.g., `v7` -> `v8`).

### The Update Checklist

Assume you are moving from **Version X** to **Version Y** (e.g., `V7` -> `V8`).

#### 1. Rename Local Files

Physically rename the files in your local project folder.

* `script_vX.js` ➡️ **`script_vY.js`**
* `style_vX.css` ➡️ **`style_vY.css`**

#### 2. Update `index.html` (Logic Variable)

Inside the `<head>` script tag, update the version variable. This prevents the browser from reloading the page unnecessarily.

```javascript
// Change this:
var CURRENT_VERSION = "PROD_1_VX";
// To this:
var CURRENT_VERSION = "PROD_1_VY"; 

```

#### 3. Update `index.html` (File Links)

Update the CSS and JS imports to match the new filenames and add the version query param.

```html
<link rel="stylesheet" href="style_vY.css?v=PROD_1_VY">

<script src="script_vY.js?v=PROD_1_VY"></script>

```

#### 4. Update Backend (`lot_ticket.py`)

**CRITICAL:** This must match Step 2 exactly. If this does not match, the user's page will reload, and they will lose access to the History/Stats pages.

```python
# Find this line near the top:
BOT_VERSION = "PROD_1_VY" 

```

---

### 🏁 Execution Steps

1. **Commit & Push** changes to GitHub.
2. **Wait ~2 minutes** for GitHub Pages to rebuild.
3. **Restart the Bot** on PythonAnywhere:
* Go to Consoles.
* Kill the running `lot_ticket.py` console.
* Run: `cd /home/tel/lot_ticket && /home/tel/task_env/bin/python3 -u lot_ticket.py`



### What happens if I miss a step?

* **Missed Step 1/3:** Users get 404 errors (file not found).
* **Missed Step 2/4:** The Python bot sends users to `.../index.html?v=OLD`. The HTML sees it expects `NEW`. The HTML forces a page reload to add `v=NEW`. **Result:** The user experiences a glitchy flash, and `mode=history` parameters are lost (Buttons stop working).

## Bot 1 ↔ Overlay ticket sync

This release adds QR codes and signed Telegram sync for new Bot 1 tickets.
The QR contains a namespaced ID such as `BOT1-00000123`; Overlay imports the
matching `ticket.v1` event into its local ticket history and can scan the QR
without an API lookup.

Install the direct Python dependencies in the Bot 1 environment:

```text
python -m pip install -r requirements.txt
```

Copy `config.example.py` to the gitignored `config.py` and set `TOKEN`,
`SECURITY_SALT`, and the same private `TICKET_SYNC_SECRET` configured in the
Overlay build. Never commit `config.py` or the real secret.

Add Bot 1 to Overlay's private Telegram sync group and allow it to read and
post in chat `-1003595738966`, topic `17925`. The bot stores signed create and
result events in a SQLite outbox and retries them oldest-first. Overlay admin
edits and cancellations in that topic are verified and applied silently to
Bot 1's local database; Bot 1 does not send corrected images or notifications.

Overlay is the only payout authority. Bot 1 keeps its legacy payout function
for compatibility checks, but `/verificar` directs admins to Overlay and
result entry no longer runs or sends the old payout report. Sync starts with
new tickets after deployment only; there is no historical backfill or API
fallback.

This Bot 1 rendering/sync release is included in the V23 cache-busted web
release (`PROD_1_V23`). Restart the worker after installing dependencies and
configuring the group:

```text
cd /home/tel/lot_ticket && /home/tel/task_env/bin/python3 -u lot_ticket.py
```
