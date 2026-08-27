import json
import os
import telebot 
import sqlite3 
import datetime
import pytz 
import math
import random
import hashlib
import time
import traceback
import urllib.parse
import threading
from requests.exceptions import ReadTimeout, ConnectionError
from telebot import apihelper
from telebot.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
from PIL import Image, ImageDraw, ImageFont 
import qrcode
import io

from ticket_sync import (
    SYNC_CHAT_ID,
    SYNC_TOPIC_ID,
    TYPE_DRAW_RESULT,
    TYPE_TICKET_CANCEL,
    TYPE_TICKET_EDIT,
    build_draw_result_event,
    build_ticket_event,
    format_bot1_ticket_id,
    items_for_database,
    parse_bot1_ticket_id,
    select_ready_outbox_rows,
    signed_json,
    verify_signed_event,
)

# --- CONFIGURACIÓN PROD BOT 1 ---
# Secrets (TOKEN, SECURITY_SALT, TICKET_SYNC_SECRET) live in config.py (gitignored).
# Copy config.example.py -> config.py and fill in real values.
try:
    from config import TOKEN, SECURITY_SALT
    try:
        from config import TICKET_SYNC_SECRET
    except ImportError:
        # Keep an older deployment bootable while sync is not configured.
        TICKET_SYNC_SECRET = ""
except ImportError as e:
    raise SystemExit(
        "Missing config.py - copy config.example.py to config.py and set "
        "TOKEN and SECURITY_SALT. (See CLAUDE.md -> Secret handling.)"
    ) from e
ADMIN_GROUP_ID = -1003516447199
ADMIN_USER_ID = 8550582981
HISTORY_API_BASE = "https://tel.pythonanywhere.com/"

# 🔐 CLAVE SECRETA — imported from config.py (see top of file)

# GITHUB PATH: Bot 1 Base Folder
GITHUB_BASE_URL = "https://ansansan.github.io/LotTicket"

# --- TOPIC MAPPING ---
TOPIC_MAPPING = { "Nacional": 63, "Tica": 64, "Nica": 65, "Primera": 67 }

# Bot 1 publishes and consumes machine-readable events in Overlay's existing
# ticket topic. The topic is intentionally separate from Bot 1's sales topics.
TICKET_SYNC_CHAT_ID = SYNC_CHAT_ID
TICKET_SYNC_TOPIC_ID = SYNC_TOPIC_ID

# PREMIOS
AWARDS = {
    '2_digit_1': 14.00, '2_digit_2': 3.00, '2_digit_3': 2.00,
    '4_digit_12': 1000.00, '4_digit_13': 1000.00, '4_digit_23': 200.00
}

# Recycle stale Telegram HTTP sessions without enabling global upload retries.
apihelper.SESSION_TIME_TO_LIVE = 5 * 60

bot = telebot.TeleBot(TOKEN)
PANAMA_TZ = pytz.timezone('America/Panama')
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 🔥 VERSION SYNC
BOT_VERSION = "PROD_1_V23"
print(f"🚀 PROD BOT 1 started with Version ID: {BOT_VERSION}")

# DB NAME FOR BOT 1
DB_NAME = 'tickets.db'

_sync_worker_started = False
_sync_outbox_wakeup = threading.Event()
_sync_bot_user_id = None

def init_db():
    db_path = os.path.join(BASE_DIR, DB_NAME) 
    conn = sqlite3.connect(db_path) 
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS tickets_v3 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, date TEXT, lottery_type TEXT, numbers_json TEXT, is_nacional INTEGER DEFAULT 0,
                  status TEXT DEFAULT 'PENDING', amount_paid REAL DEFAULT 0, tg_message_id INTEGER, tg_chat_id INTEGER)''')
    c.execute('''CREATE TABLE IF NOT EXISTS draw_results 
                 (date TEXT, lottery_type TEXT, w1 TEXT, w2 TEXT, w3 TEXT, UNIQUE(date, lottery_type))''')
    c.execute('''CREATE TABLE IF NOT EXISTS nacional_dates (date_str TEXT PRIMARY KEY)''')
    c.execute('''CREATE TABLE IF NOT EXISTS nacional_exclusions (date_str TEXT PRIMARY KEY)''')
    c.execute('''CREATE TABLE IF NOT EXISTS ticket_sync_outbox
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  event_type TEXT NOT NULL,
                  payload TEXT NOT NULL,
                  created_at INTEGER NOT NULL,
                  attempts INTEGER NOT NULL DEFAULT 0,
                  next_attempt_at INTEGER NOT NULL DEFAULT 0,
                  last_error TEXT)''')
    conn.commit()
    conn.close()

    migrate_tickets_v3_schema()

def migrate_tickets_v3_schema():
    db_path = os.path.join(BASE_DIR, DB_NAME)
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("PRAGMA table_info(tickets_v3)")
        columns = {info[1] for info in c.fetchall()}

        if 'status' not in columns:
            print("DB migration: adding 'status' column")
            c.execute("ALTER TABLE tickets_v3 ADD COLUMN status TEXT DEFAULT 'PENDING'")

        if 'amount_paid' not in columns:
            print("DB migration: adding 'amount_paid' column")
            c.execute("ALTER TABLE tickets_v3 ADD COLUMN amount_paid REAL DEFAULT 0")

        if 'tg_message_id' not in columns:
            print("DB migration: adding 'tg_message_id' column")
            c.execute("ALTER TABLE tickets_v3 ADD COLUMN tg_message_id INTEGER")

        if 'tg_chat_id' not in columns:
            print("DB migration: adding 'tg_chat_id' column")
            c.execute("ALTER TABLE tickets_v3 ADD COLUMN tg_chat_id INTEGER")

        c.execute("UPDATE tickets_v3 SET status = 'PENDING' WHERE status IS NULL")
        c.execute("UPDATE tickets_v3 SET amount_paid = 0 WHERE amount_paid IS NULL")
        conn.commit()
    except Exception as e:
        print(f"DB migration warning: {e}")
    finally:
        if conn:
            conn.close()

init_db()


def _sync_now_ms():
    return int(time.time() * 1000)


def _signed_ticket_sync_payload(event):
    if (
        not isinstance(TICKET_SYNC_SECRET, str)
        or not TICKET_SYNC_SECRET.strip()
        or TICKET_SYNC_SECRET.strip() == "REPLACE_ME"
    ):
        raise RuntimeError(
            "TICKET_SYNC_SECRET is missing or invalid; ticket sync cannot be queued"
        )
    payload = signed_json(event, TICKET_SYNC_SECRET)
    if payload is None:
        raise RuntimeError(
            "TICKET_SYNC_SECRET is missing or invalid; ticket sync cannot be queued"
        )
    return payload


def enqueue_ticket_sync_event(event, conn=None):
    """Write one event to the durable outbox, optionally in an open transaction.

    An owned connection is committed here for standalone callers.  When a
    caller supplies a connection, signing or insertion errors are raised so
    the caller can roll back its business-row transaction atomically.
    """
    owns_connection = conn is None
    try:
        if owns_connection:
            conn = sqlite3.connect(os.path.join(BASE_DIR, DB_NAME), timeout=30)
        payload = _signed_ticket_sync_payload(event)
        conn.execute(
            "INSERT INTO ticket_sync_outbox "
            "(event_type, payload, created_at, next_attempt_at) VALUES (?, ?, ?, ?)",
            (event["type"], payload, _sync_now_ms(), 0),
        )
        if owns_connection:
            conn.commit()
            _sync_outbox_wakeup.set()
        return True
    except Exception as e:
        print(f"Ticket sync enqueue failed ({event.get('type')}): {e!r}")
        if not owns_connection:
            raise
        if conn is not None:
            conn.rollback()
        return False
    finally:
        if owns_connection and conn is not None:
            conn.close()


def drain_ticket_sync_outbox_once(max_events=20):
    """Send the oldest ready events and stop at the first failed send."""
    now_ms = _sync_now_ms()
    conn = sqlite3.connect(os.path.join(BASE_DIR, DB_NAME), timeout=30)
    try:
        rows = select_ready_outbox_rows(conn, now_ms, max_events)
        sent = 0
        for row_id, event_type, payload, attempts, _next_attempt_at in rows:
            try:
                bot.send_message(
                    TICKET_SYNC_CHAT_ID,
                    payload,
                    message_thread_id=TICKET_SYNC_TOPIC_ID,
                )
            except Exception as e:
                next_attempts = attempts + 1
                backoff_ms = min(15 * 60 * 1000, 1000 * (2 ** min(next_attempts, 10)))
                conn.execute(
                    "UPDATE ticket_sync_outbox SET attempts = ?, next_attempt_at = ?, "
                    "last_error = ? WHERE id = ?",
                    (next_attempts, now_ms + backoff_ms, repr(e)[:500], row_id),
                )
                conn.commit()
                print(
                    f"Ticket sync send deferred type={event_type} "
                    f"attempt={next_attempts}: {e!r}"
                )
                break
            else:
                conn.execute("DELETE FROM ticket_sync_outbox WHERE id = ?", (row_id,))
                conn.commit()
                sent += 1
        return sent
    finally:
        conn.close()


def start_ticket_sync_worker():
    global _sync_worker_started
    if _sync_worker_started:
        return
    _sync_worker_started = True

    def worker():
        while True:
            try:
                drain_ticket_sync_outbox_once()
            except Exception as e:
                print(f"Ticket sync outbox worker error: {e!r}")
            _sync_outbox_wakeup.wait(15)
            _sync_outbox_wakeup.clear()

    threading.Thread(
        target=worker,
        name="ticket-sync-outbox",
        daemon=True,
    ).start()


def get_bot_sync_user_id():
    """Resolve the bot's Telegram user id once for Overlay's originator field."""
    global _sync_bot_user_id
    if _sync_bot_user_id is not None:
        return _sync_bot_user_id
    try:
        _sync_bot_user_id = int(bot.get_me().id)
    except Exception as e:
        # Overlay's BOT1 namespace is the shared-admin authorization boundary;
        # zero is still a valid, deterministic fallback if Telegram is down.
        print(f"Ticket sync bot-id lookup failed: {e!r}")
        _sync_bot_user_id = 0
    return _sync_bot_user_id

# --- HELPERS ---
def is_admin_chat(message):
    is_group = str(message.chat.id) == str(ADMIN_GROUP_ID)
    is_admin_user = str(message.from_user.id) == str(ADMIN_USER_ID)
    return is_group or is_admin_user

def get_today_panama():
    return datetime.datetime.now(PANAMA_TZ).strftime("%Y-%m-%d")

def get_nacional_dates_string():
    db_path = os.path.join(BASE_DIR, DB_NAME)
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    today = get_today_panama()
    c.execute("SELECT date_str FROM nacional_dates WHERE date_str >= ?", (today,))
    manual_dates = {row[0] for row in c.fetchall()}
    c.execute("SELECT date_str FROM nacional_exclusions WHERE date_str >= ?", (today,))
    excluded_dates = {row[0] for row in c.fetchall()}
    conn.close()

    base_date = datetime.datetime.strptime(today, "%Y-%m-%d").date()
    auto_dates = set()
    for i in range(0, 30):
        d = base_date + datetime.timedelta(days=i)
        if d.weekday() in (2, 6):  # 2 = Wednesday, 6 = Sunday
            auto_dates.add(d.strftime("%Y-%m-%d"))

    final_dates = (manual_dates | auto_dates) - excluded_dates
    return ",".join(sorted(final_dates))

def send_user_main_menu(chat_id, user_id, text="¡Hola! Menú principal 👇"):
    dates_str = get_nacional_dates_string()
    web_app_url = f"{GITHUB_BASE_URL}/index.html?v={BOT_VERSION}&nacional_dates={dates_str}&uid={user_id}"
    api_base_param = urllib.parse.quote(HISTORY_API_BASE)
    history_url = f"{GITHUB_BASE_URL}/index.html?v={BOT_VERSION}&mode=history&api_base={api_base_param}&uid={user_id}"

    markup = ReplyKeyboardMarkup(resize_keyboard=True)
    markup.row(
        KeyboardButton("📝 Nuevo Ticket", web_app=WebAppInfo(url=web_app_url)),
        KeyboardButton("🏆 Chequear Premios", web_app=WebAppInfo(url=history_url))
    )
    markup.row(KeyboardButton("Actualizar"))

    bot.send_message(chat_id, text, reply_markup=markup)

def send_admin_main_menu(chat_id, user_id, text="Modo Admin Activado. Pulsa el botón:"):
    dates_str = get_nacional_dates_string()
    web_app_url = f"{GITHUB_BASE_URL}/index.html?v={BOT_VERSION}&mode=admin_dashboard&nacional_dates={dates_str}&uid={user_id}"

    markup = ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    markup.add(KeyboardButton("📊 Abrir Dashboard", web_app=WebAppInfo(url=web_app_url)))

    bot.send_message(chat_id, text, reply_markup=markup)

def get_short_security_code(ticket_id):
    raw_str = f"{ticket_id}-{SECURITY_SALT}"
    hash_object = hashlib.sha256(raw_str.encode())
    return hash_object.hexdigest()[:5].upper()

def calculate_single_ticket(num, bet, w1, w2, w3, lottery_type):
    # 🔵 LOGIC FOR "NACIONAL" (Panama Rules)
    if "Nacional" in lottery_type:
        w1, w2, w3 = str(w1), str(w2), str(w3)
        num = str(num)
        
        # --- A. CHANCES (2 Digits) ---
        if len(num) == 2:
            total_win = 0
            breakdown = []
            
            # 1st Prize
            if len(w1) >= 2 and num == w1[-2:]:
                win = bet * 14.00
                total_win += win
                breakdown.append(f"Chances (1er): $14.00 x {bet} = ${win:.2f}")
            
            # 2nd Prize
            if len(w2) >= 2 and num == w2[-2:]:
                win = bet * 3.00
                total_win += win
                breakdown.append(f"Chances (2do): $3.00 x {bet} = ${win:.2f}")
                
            # 3rd Prize
            if len(w3) >= 2 and num == w3[-2:]:
                win = bet * 2.00
                total_win += win
                breakdown.append(f"Chances (3er): $2.00 x {bet} = ${win:.2f}")
                
            return total_win, breakdown

        # --- B. BILLETES (4 Digits) - Stack across prizes ---
        elif len(num) == 4:
            total_win = 0
            breakdown = []

            # 1. Check against FIRST PRIZE (w1)
            if len(w1) == 4:
                if num == w1: amount = 2000.00; label = "1er Premio (Exacto)"
                elif num[:3] == w1[:3]: amount = 50.00; label = "1er Premio (3 Primeras)"
                elif num[-3:] == w1[-3:]: amount = 50.00; label = "1er Premio (3 Ultimas)"
                elif num[:2] == w1[:2]: amount = 3.00; label = "1er Premio (2 Primeras)"
                elif num[-2:] == w1[-2:]: amount = 3.00; label = "1er Premio (2 Ultimas)"
                elif num[-1] == w1[-1]: amount = 1.00; label = "1er Premio (Ultima)"
                else: amount = 0; label = ""
                if amount > 0:
                    win = bet * amount
                    total_win += win
                    breakdown.append(f"{label}: ${amount} x {bet} = ${win:.2f}")

            # 2. Check against SECOND PRIZE (w2)
            if len(w2) == 4:
                if num == w2: amount = 600.00; label = "2do Premio (Exacto)"
                elif num[:3] == w2[:3]: amount = 20.00; label = "2do Premio (3 Primeras)"
                elif num[-3:] == w2[-3:]: amount = 20.00; label = "2do Premio (3 Ultimas)"
                elif num[-2:] == w2[-2:]: amount = 2.00; label = "2do Premio (2 Ultimas)"
                else: amount = 0; label = ""
                if amount > 0:
                    win = bet * amount
                    total_win += win
                    breakdown.append(f"{label}: ${amount} x {bet} = ${win:.2f}")

            # 3. Check against THIRD PRIZE (w3)
            if len(w3) == 4:
                if num == w3: amount = 300.00; label = "3er Premio (Exacto)"
                elif num[:3] == w3[:3]: amount = 10.00; label = "3er Premio (3 Primeras)"
                elif num[-3:] == w3[-3:]: amount = 10.00; label = "3er Premio (3 Ultimas)"
                elif num[-2:] == w3[-2:]: amount = 1.00; label = "3er Premio (2 Ultimas)"
                else: amount = 0; label = ""
                if amount > 0:
                    win = bet * amount
                    total_win += win
                    breakdown.append(f"{label}: ${amount} x {bet} = ${win:.2f}")

            return total_win, breakdown

        return 0, []

    # 🔵 LOGIC FOR STANDARD LOTTERIES
    else:
        win_4_12 = str(w1) + str(w2)
        win_4_13 = str(w1) + str(w3)
        win_4_23 = str(w2) + str(w3)
        total_win = 0
        breakdown = []

        if len(num) == 2:
            if num == w1:
                win = bet * AWARDS['2_digit_1']
                total_win += win
                breakdown.append(f"1er Premio: ${AWARDS['2_digit_1']} x {bet} = ${win:.2f}")
            if num == w2:
                win = bet * AWARDS['2_digit_2']
                total_win += win
                breakdown.append(f"2do Premio: ${AWARDS['2_digit_2']} x {bet} = ${win:.2f}")
            if num == w3:
                win = bet * AWARDS['2_digit_3']
                total_win += win
                breakdown.append(f"3er Premio: ${AWARDS['2_digit_3']} x {bet} = ${win:.2f}")
                
        elif len(num) == 4:
            if num == win_4_12:
                win = bet * AWARDS['4_digit_12']
                total_win += win
                breakdown.append(f"Billete 1ro/2do: ${AWARDS['4_digit_12']} x {bet} = ${win:.2f}")
            if num == win_4_13:
                win = bet * AWARDS['4_digit_13']
                total_win += win
                breakdown.append(f"Billete 1ro/3ro: ${AWARDS['4_digit_13']} x {bet} = ${win:.2f}")
            if num == win_4_23:
                win = bet * AWARDS['4_digit_23']
                total_win += win
                breakdown.append(f"Billete 2do/3ro: ${AWARDS['4_digit_23']} x {bet} = ${win:.2f}")
                
        return total_win, breakdown

# --- COMANDOS ADMIN ---
@bot.message_handler(commands=['verificar'])
def check_specific_ticket(message):
    bot.reply_to(message, "La verificación de premios se realiza en Overlay.")

@bot.message_handler(commands=['nacional'])
def add_nacional_date(message):
    if not is_admin_chat(message): return
    try:
        args = message.text.split()
        if len(args) != 2:
            bot.reply_to(message, "⚠️ Uso: /nacional YYYY-MM-DD")
            return
        date_str = args[1]
        datetime.datetime.strptime(date_str, '%Y-%m-%d')
        db_path = os.path.join(BASE_DIR, DB_NAME)
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("INSERT OR REPLACE INTO nacional_dates (date_str) VALUES (?)", (date_str,))
        c.execute("DELETE FROM nacional_exclusions WHERE date_str = ?", (date_str,))
        conn.commit()
        conn.close()
        bot.reply_to(message, f"✅ Sorteo Nacional activado para: {date_str}")
    except ValueError:
        bot.reply_to(message, "⚠️ Fecha incorrecta. Usa YYYY-MM-DD")
    except Exception as e:
        bot.reply_to(message, f"Error: {e}")

@bot.message_handler(commands=['nacional_disable'])
def remove_nacional_date(message):
    if not is_admin_chat(message): return
    try:
        args = message.text.split()
        if len(args) != 2:
            bot.reply_to(message, "⚠️ Uso: /nacional_disable YYYY-MM-DD")
            return
        date_str = args[1]
        datetime.datetime.strptime(date_str, '%Y-%m-%d')
        db_path = os.path.join(BASE_DIR, DB_NAME)
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("INSERT OR REPLACE INTO nacional_exclusions (date_str) VALUES (?)", (date_str,))
        c.execute("DELETE FROM nacional_dates WHERE date_str = ?", (date_str,))
        conn.commit()
        conn.close()
        bot.reply_to(message, f"🚫 Sorteo Nacional desactivado para: {date_str}")
    except ValueError:
        bot.reply_to(message, "⚠️ Fecha incorrecta. Usa YYYY-MM-DD")
    except Exception as e:
        bot.reply_to(message, f"Error: {e}")

@bot.message_handler(commands=['premios'])
def admin_dashboard_link(message):
    if not is_admin_chat(message): 
        bot.reply_to(message, "⛔ Solo Grupo Admin.")
        return
    
    bot_username = bot.get_me().username
    deep_link = f"https://t.me/{bot_username}?start=admin_menu"
    
    markup = InlineKeyboardMarkup()
    markup.add(InlineKeyboardButton("🔐 Abrir Panel Administrativo", url=deep_link))
    
    bot.reply_to(message, "Panel de Control:", reply_markup=markup)

@bot.message_handler(commands=['start'])
def send_welcome(message):
    try:
        user_id = message.from_user.id
        args = message.text.split()

        # 🟢 ADMIN MENU
        if len(args) > 1 and args[1] == 'admin_menu':
            if not is_admin_chat(message):
                bot.reply_to(message, "⛔ No tienes permisos de administrador.")
                return

            send_admin_main_menu(message.chat.id, user_id)
            return 

        # 🟢 NORMAL USER MENU
        send_user_main_menu(message.chat.id, user_id)
        
    except Exception as e:
        print(f"Error sending welcome: {e}")

@bot.message_handler(func=lambda message: message.text == "Actualizar")
def refresh_user_main_menu(message):
    try:
        is_admin_group = str(message.chat.id) == str(ADMIN_GROUP_ID)
        is_admin_private = (
            str(message.from_user.id) == str(ADMIN_USER_ID)
            and getattr(message.chat, "type", "") == "private"
        )

        if is_admin_group or is_admin_private:
            send_admin_main_menu(message.chat.id, message.from_user.id)
        else:
            send_user_main_menu(message.chat.id, message.from_user.id)
    except Exception as e:
        print(f"Error refreshing welcome menu: {e}")

@bot.message_handler(content_types=['web_app_data'])
def handle_web_app(message):
    try:
        if not message.web_app_data.data: return
        payload = json.loads(message.web_app_data.data)
        action = payload.get('action') 

        if action == 'save_results':
            if str(message.from_user.id) != str(ADMIN_USER_ID) and str(message.chat.id) != str(ADMIN_GROUP_ID):
                 return

            result_event = build_draw_result_event(
                lottery_type=payload['lottery'],
                date=payload['date'],
                w1=payload['w1'],
                w2=payload['w2'],
                w3=payload['w3'],
                set_at=_sync_now_ms(),
            )
            db_path = os.path.join(BASE_DIR, DB_NAME)
            conn = sqlite3.connect(db_path, timeout=30)
            try:
                conn.execute("BEGIN IMMEDIATE")
                conn.execute(
                    "INSERT OR REPLACE INTO draw_results "
                    "(date, lottery_type, w1, w2, w3) VALUES (?, ?, ?, ?, ?)",
                    (
                        payload['date'],
                        payload['lottery'],
                        payload['w1'],
                        payload['w2'],
                        payload['w3'],
                    ),
                )
                if not enqueue_ticket_sync_event(result_event, conn=conn):
                    raise RuntimeError("ticket sync result outbox insert returned false")
                conn.commit()
            except Exception as e:
                conn.rollback()
                print(f"Ticket sync result transaction failed: {e!r}")
                bot.reply_to(
                    message,
                    "⚠️ Resultados no guardados: la sincronización no está "
                    "configurada o no pudo prepararse. Verifica "
                    "TICKET_SYNC_SECRET y los registros.",
                )
                return
            finally:
                conn.close()
            _sync_outbox_wakeup.set()

            # 🟢 1. Notify Group
            announcement = f"📢 *RESULTADOS OFICIALES*\n📅 {payload['date']} | {payload['lottery']}\n🏆 {payload['w1']} - {payload['w2']} - {payload['w3']}"
            _send_with_retry(lambda: bot.send_message(ADMIN_GROUP_ID, announcement, parse_mode="Markdown"), "results announcement")
            
            # 🟢 2. AUTO-SWITCH BACK TO NORMAL MENU
            send_user_main_menu(
                message.chat.id,
                message.from_user.id,
                text="✅ Datos guardados. Volviendo al menú principal 👇"
            )

        elif action == 'create_ticket':
            items = payload.get('items', [])
            lottery_type = payload.get('type', 'Desconocido')
            date = payload.get('date', get_today_panama()) 
            originator_user_id = get_bot_sync_user_id()
            created_at = _sync_now_ms()
            db_path = os.path.join(BASE_DIR, DB_NAME)
            conn = sqlite3.connect(db_path, timeout=30)
            try:
                conn.execute("BEGIN IMMEDIATE")
                c = conn.cursor()
                c.execute(
                    "INSERT INTO tickets_v3 "
                    "(user_id, date, lottery_type, numbers_json) VALUES (?, ?, ?, ?)",
                    (message.chat.id, date, lottery_type, json.dumps(items)),
                )
                ticket_id = c.lastrowid
                ticket_event = build_ticket_event(
                    ticket_id=ticket_id,
                    admin="BOT1",
                    originator_user_id=originator_user_id,
                    lottery_type=lottery_type,
                    date=date,
                    items=items,
                    created_at=created_at,
                )
                if not enqueue_ticket_sync_event(ticket_event, conn=conn):
                    raise RuntimeError("ticket sync ticket outbox insert returned false")
                conn.commit()
            except Exception as e:
                conn.rollback()
                print(f"Ticket sync create transaction failed: {e!r}")
                bot.reply_to(
                    message,
                    "⚠️ Ticket no guardado: la sincronización no está "
                    "configurada o no pudo prepararse. Verifica "
                    "TICKET_SYNC_SECRET y los registros.",
                )
                return
            finally:
                conn.close()
            _sync_outbox_wakeup.set()
            generate_ticket_image(message, ticket_id, date, lottery_type, items)

    except Exception as e:
        print(f"Error: {e}")


def is_ticket_sync_message(message):
    """Match only text sent in Overlay's exact private ticket topic."""
    if str(getattr(getattr(message, "chat", None), "id", "")) != str(TICKET_SYNC_CHAT_ID):
        return False
    try:
        return int(getattr(message, "message_thread_id", 0) or 0) == TICKET_SYNC_TOPIC_ID
    except (TypeError, ValueError):
        return False


def _apply_inbound_ticket_sync_event(event):
    """Apply one verified Overlay event without sending any Telegram message."""
    event_type = event.get("type")
    if event_type == TYPE_TICKET_EDIT:
        ticket_id = parse_bot1_ticket_id(event.get("id"))
        if ticket_id is None:
            return
        db_items = items_for_database(event["items"])
        total = sum(float(item["totalLine"]) for item in db_items)
        conn = sqlite3.connect(os.path.join(BASE_DIR, DB_NAME), timeout=30)
        try:
            conn.execute(
                "UPDATE tickets_v3 SET numbers_json = ? WHERE id = ?",
                (json.dumps(db_items, separators=(",", ":")), ticket_id),
            )
            conn.commit()
        finally:
            conn.close()
        print(f"Ticket sync edit applied silently id={event['id']} total={total:.2f}")
    elif event_type == TYPE_TICKET_CANCEL:
        ticket_id = parse_bot1_ticket_id(event.get("id"))
        if ticket_id is None:
            return
        conn = sqlite3.connect(os.path.join(BASE_DIR, DB_NAME), timeout=30)
        try:
            conn.execute(
                "UPDATE tickets_v3 SET status = 'CANCELLED' WHERE id = ?",
                (ticket_id,),
            )
            conn.commit()
        finally:
            conn.close()
        print(f"Ticket sync cancellation applied silently id={event['id']}")
    elif event_type == TYPE_DRAW_RESULT:
        conn = sqlite3.connect(os.path.join(BASE_DIR, DB_NAME), timeout=30)
        try:
            conn.execute(
                "INSERT OR REPLACE INTO draw_results "
                "(date, lottery_type, w1, w2, w3) VALUES (?, ?, ?, ?, ?)",
                (
                    event["date"],
                    event["lottery_type"],
                    event["w1"],
                    event["w2"],
                    event["w3"],
                ),
            )
            conn.commit()
        finally:
            conn.close()
        print(
            f"Ticket sync result applied silently lottery={event['lottery_type']} "
            f"date={event['date']}"
        )


@bot.message_handler(func=is_ticket_sync_message, content_types=['text'])
def handle_ticket_sync_message(message):
    event = verify_signed_event(getattr(message, "text", ""), TICKET_SYNC_SECRET)
    if event is None:
        return
    try:
        _apply_inbound_ticket_sync_event(event)
    except Exception as e:
        print(f"Ticket sync inbound apply failed: {e!r}")

# --- OPTIMIZED SECURITY PATTERN ---
def draw_security_pattern(draw, width, height, ticket_id, is_nacional):
    random.seed(f"{ticket_id}_{SECURITY_SALT}") 
    
    if is_nacional:
        line_color_1 = (70, 160, 190)
        line_color_2 = (100, 180, 200)
    else:
        line_color_1 = (200, 210, 230)
        line_color_2 = (190, 200, 220)

    step_size = 10 

    freq_v_base = random.uniform(0.01, 0.03)
    freq_v_ripple = freq_v_base * random.uniform(3.0, 6.0)
    amp_v = random.randint(15, 40)
    phase_v = random.random() * math.pi * 2
    spacing_v = random.randint(15, 25)

    for x_base in range(-width // 4, width + width // 4, spacing_v):
        points = []
        for y in range(0, height, step_size): 
            x_offset = amp_v * math.sin(y * freq_v_base + phase_v) + (amp_v / 3) * math.cos(y * freq_v_ripple)
            points.append((x_base + x_offset + (y * 0.1), y))
        if len(points) > 1: draw.line(points, fill=line_color_1, width=2)

    freq_h1 = random.uniform(0.005, 0.015)
    freq_h2 = random.uniform(0.02, 0.04) 
    amp_h = random.randint(10, 25)
    phase_h = random.random() * math.pi * 2
    spacing_h = random.randint(18, 30)

    for y_base in range(0, height, spacing_h):
        points = []
        for x in range(0, width, step_size): 
            y_offset = amp_h * math.sin(x * freq_h1 + phase_h) + (amp_h * 0.6) * math.cos(x * freq_h2)
            points.append((x, y_base + y_offset))
        if len(points) > 1: draw.line(points, fill=line_color_2, width=2)
    
    random.seed(None)

def _send_with_retry(send_callable, label="telegram send", max_attempts=3, retry_delay=2):
    """Retry a RE-SENDABLE Telegram call (plain strings / file_ids — NOT BytesIO
    uploads) on transient network errors. The global apihelper retry was disabled
    because it re-sent consumed upload streams; the upload path keeps its own
    stream-recreating retry (send_ticket_photo_with_retry), while these admin-group
    text/file_id sends need their resilience restored explicitly."""
    for attempt in range(1, max_attempts + 1):
        try:
            return send_callable()
        except (ConnectionError, ReadTimeout) as e:
            print(f"Transient error ({label}, attempt {attempt}/{max_attempts}): {e!r}")
            if attempt == max_attempts:
                raise
            time.sleep(retry_delay)

def send_ticket_photo_with_retry(chat_id, image_bytes, caption, ticket_id, max_attempts=3, retry_delay=2):
    print(f"Ticket #{ticket_id}: rendered image size {len(image_bytes)} bytes before upload")

    for attempt in range(1, max_attempts + 1):
        # Telegram upload streams are consumed per request, so recreate them on every retry.
        upload_bio = io.BytesIO(image_bytes)
        upload_bio.name = f"ticket_{ticket_id}.jpg"

        try:
            return bot.send_photo(chat_id, photo=upload_bio, caption=caption)
        except (ConnectionError, ReadTimeout) as e:
            print(
                f"Transient error uploading ticket image for ticket #{ticket_id} "
                f"(attempt {attempt}/{max_attempts}): {e!r}"
            )
            traceback.print_exc()
            if attempt == max_attempts:
                raise
            time.sleep(retry_delay)
        finally:
            upload_bio.close()

# --- OPTIMIZED IMAGE GENERATOR (SINGLE UPLOAD) ---
def generate_ticket_image(message, ticket_id, date, lottery_type, items):
    try:
        now_panama = datetime.datetime.now(PANAMA_TZ)
        time_str = now_panama.strftime("%I:%M %p") 
        sec_code = get_short_security_code(ticket_id)

        SCALE = 3
        width = 600 * SCALE 
        base_height = 800 * SCALE 
        item_height = 35 * SCALE 
        height = base_height + (len(items) * item_height)
        
        bg_color = 'white'
        is_nacional = False
        if "Nacional" in lottery_type:
            bg_color = '#c3e8f0'
            is_nacional = True

        img = Image.new('RGB', (width, height), bg_color)
        d = ImageDraw.Draw(img)
        
        draw_security_pattern(d, width, height, ticket_id, is_nacional)

        try:
            font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
            font_bold_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
            font_reg = ImageFont.truetype(font_path, 22 * SCALE)
            font_small = ImageFont.truetype(font_path, 18 * SCALE)
            font_large_bold = ImageFont.truetype(font_bold_path, 35 * SCALE)
            font_med_bold = ImageFont.truetype(font_bold_path, 24 * SCALE)
            font_num = ImageFont.truetype(font_path, 24 * SCALE)
        except:
            font_reg = ImageFont.load_default()
            font_small = ImageFont.load_default()
            font_large_bold = ImageFont.load_default()
            font_med_bold = ImageFont.load_default()
            font_num = ImageFont.load_default()

        side_padding = 80 * SCALE 
        top_padding = 30 * SCALE
        current_y = top_padding
        
        d.text((side_padding, current_y), f"Ticket #{ticket_id}", fill="gray", font=font_small)
        sec_label = f"SEC: {sec_code}"
        sec_w = d.textlength(sec_label, font=font_small)
        d.text((width - side_padding - sec_w, current_y), sec_label, fill="#333", font=font_small)
        
        current_y += 30 * SCALE
        
        date_label = f"Sorteo: {date}"
        d.text((side_padding, current_y), date_label, fill="gray", font=font_small)
        
        time_label = f"Hora: {time_str}"
        time_w = d.textlength(time_label, font=font_small)
        d.text((width - side_padding - time_w, current_y), time_label, fill="gray", font=font_small)

        current_y += 50 * SCALE
        
        flag_filename = None
        if "Nacional" in lottery_type: flag_filename = os.path.join(BASE_DIR, "flag_panama.png")
        elif "Tica" in lottery_type: flag_filename = os.path.join(BASE_DIR, "flag_tica.png")
        elif "Nica" in lottery_type: flag_filename = os.path.join(BASE_DIR, "flag_nica.png")
        elif "Primera" in lottery_type: flag_filename = os.path.join(BASE_DIR, "flag_dom.png")

        text_w = d.textlength(lottery_type, font=font_large_bold)
        flag_size = 40 * SCALE
        spacing = 10 * SCALE
        
        total_content_width = text_w
        if flag_filename:
            total_content_width = flag_size + spacing + text_w + spacing + flag_size

        start_x = (width - total_content_width) / 2
        
        if flag_filename:
            try:
                flag_img = Image.open(flag_filename).convert("RGBA")
                flag_img = flag_img.resize((flag_size, flag_size), Image.Resampling.LANCZOS)
                img.paste(flag_img, (int(start_x), int(current_y - 5*SCALE)), flag_img)
                right_flag_x = start_x + flag_size + spacing + text_w + spacing
                img.paste(flag_img, (int(right_flag_x), int(current_y - 5*SCALE)), flag_img)
                text_x = start_x + flag_size + spacing
            except Exception as e:
                text_x = (width - text_w) / 2
        else:
             text_x = (width - text_w) / 2

        d.text((text_x, current_y), lottery_type, fill="#3390ec", font=font_large_bold)
        
        current_y += 70 * SCALE
        
        d.text((side_padding, current_y), "NUM", fill="black", font=font_med_bold)
        cant_text = "CANT."
        cant_w = d.textlength(cant_text, font=font_med_bold)
        d.text(((width - cant_w) / 2, current_y), cant_text, fill="black", font=font_med_bold)
        total_text = "Total"
        total_w = d.textlength(total_text, font=font_med_bold)
        d.text((width - side_padding - total_w, current_y), total_text, fill="black", font=font_med_bold)
        
        current_y += 35 * SCALE
        d.line([(side_padding, current_y), (width - side_padding, current_y)], fill="black", width=5)
        current_y += 30 * SCALE
        
        grand_total = 0
        qty_chances = 0
        qty_large = 0 
        
        for item in items:
            total = float(item['totalLine'])
            qty = int(item['qty'])
            num_str = str(item['num'])
            if len(num_str) == 2: qty_chances += qty
            elif len(num_str) == 4: qty_large += qty
            grand_total += total
            
            display_num = f"*{num_str}*"
            d.text((side_padding, current_y), display_num, fill="black", font=font_num)
            
            qty_text = str(qty)
            qty_w = d.textlength(qty_text, font=font_num)
            d.text(((width - qty_w) / 2, current_y), qty_text, fill="black", font=font_num)
            
            line_total_str = f"{total:.2f}"
            total_w = d.textlength(line_total_str, font=font_num)
            d.text((width - side_padding - total_w, current_y), line_total_str, fill="black", font=font_num)
            
            current_y += item_height 

        current_y += 5 * SCALE 
        d.line([(side_padding, current_y), (width - side_padding, current_y)], fill="black", width=5)
        current_y += 20 * SCALE 
        
        total_label = "Total:"
        total_val = f"${grand_total:.2f}"
        d.text((side_padding, current_y), total_label, fill="black", font=font_large_bold)
        val_w = d.textlength(total_val, font=font_large_bold)
        d.text((width - side_padding - val_w, current_y), total_val, fill="black", font=font_large_bold)
        
        current_y += 40 * SCALE 
        
        if "Nacional" in lottery_type: label_large = "Billetes"
        else: label_large = "Palets"
        summary_text_1 = f"Chances: {qty_chances}"
        summary_text_2 = f"{label_large}: {qty_large}"
        w1 = d.textlength(summary_text_1, font=font_med_bold)
        w2 = d.textlength(summary_text_2, font=font_med_bold)
        
        d.text(((width - w1) / 2, current_y), summary_text_1, fill="gray", font=font_med_bold)
        current_y += 35 * SCALE 
        d.text(((width - w2) / 2, current_y), summary_text_2, fill="gray", font=font_med_bold)

        # Keep the QR in its own white band below the summary.  The generated
        # image includes qrcode's four-module quiet zone; the crop also keeps
        # the full quiet zone and a bottom margin inside the ticket.
        qr_size = 150 * SCALE
        qr_top = current_y + 20 * SCALE
        final_bottom = qr_top + qr_size + 30 * SCALE
        d.rectangle(
            (side_padding, current_y + 5 * SCALE, width - side_padding, final_bottom),
            fill="white",
        )
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr.add_data(format_bot1_ticket_id(ticket_id))
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        qr_img = qr_img.resize((qr_size, qr_size), Image.Resampling.NEAREST)
        qr_left = width - side_padding - qr_size
        img.paste(qr_img, (int(qr_left), int(qr_top)))

        img = img.crop((0, 0, width, final_bottom))

        render_bio = io.BytesIO()
        img.save(render_bio, 'JPEG', quality=95)
        image_bytes = render_bio.getvalue()
        render_bio.close()
    except Exception as e:
        print(f"Error rendering ticket image for ticket #{ticket_id}: {e!r}")
        traceback.print_exc()
        bot.reply_to(message, f"Ticket #{ticket_id} Guardado (Error imagen: {e})")
        return

    try:
        flag_emoji = "✅"
        if "Nacional" in lottery_type: flag_emoji = "🇵🇦"
        elif "Tica" in lottery_type: flag_emoji = "🇨🇷"
        elif "Nica" in lottery_type: flag_emoji = "🇳🇮"
        elif "Primera" in lottery_type: flag_emoji = "🇩🇴"
        
        # --- FAST SEND LOGIC (Send once, forward ID) ---
        # 1. Send to User
        sent_msg = send_ticket_photo_with_retry(
            message.chat.id,
            image_bytes,
            caption=f"Ticket #{ticket_id} | {lottery_type} {flag_emoji}",
            ticket_id=ticket_id
        )
        
        # 2. Get Photo ID from that message
        photo_id = sent_msg.photo[-1].file_id
        
        user_name = message.from_user.username
        if user_name: user_display = f"@{user_name}"
        else: user_display = "Sin Alias"
        first_name = message.from_user.first_name
        phone = "Oculto (Privacidad)" 
        if hasattr(message, 'contact') and message.contact:
            phone = message.contact.phone_number

        target_thread_id = None 
        if "Nacional" in lottery_type: target_thread_id = TOPIC_MAPPING["Nacional"]
        elif "Tica" in lottery_type: target_thread_id = TOPIC_MAPPING["Tica"]
        elif "Nica" in lottery_type: target_thread_id = TOPIC_MAPPING["Nica"]
        elif "Primera" in lottery_type: target_thread_id = TOPIC_MAPPING["Primera"]
        
        # 3. Forward to Admin using ID (Instant)
        admin_caption = f"👤 {user_display} ({first_name})\n📱 Tlfn: {phone}\n🎫 Ticket #{ticket_id}\n🔐 Code: {sec_code}\n📅 {date} | {time_str}\n💰 {lottery_type}"
        
        _send_with_retry(lambda: bot.send_photo(ADMIN_GROUP_ID, photo=photo_id, caption=admin_caption, message_thread_id=target_thread_id), "admin ticket forward")

    except Exception as e:
        print(f"Error uploading ticket image for ticket #{ticket_id}: {e!r}")
        traceback.print_exc()
        bot.reply_to(message, f"Ticket #{ticket_id} Guardado (Error imagen: {e})")

def calculate_and_report(chat_id, date, lottery_name, w1, w2, w3):
    db_path = os.path.join(BASE_DIR, DB_NAME)
    conn = sqlite3.connect(db_path) 
    c = conn.cursor()
    c.execute("SELECT id, numbers_json FROM tickets_v3 WHERE date = ? AND lottery_type = ?", (date, lottery_name))
    tickets = c.fetchall()
    conn.close()
    if not tickets:
        bot.send_message(chat_id, f"🔍 No se vendieron tickets para {lottery_name} el {date}.")
        return
    report = f"💰 **REPORTE DETALLADO**\nSorteo: {lottery_name}\nFecha: {date}\n🏆: {w1}-{w2}-{w3}\n====================\n"
    total_payout = 0
    winners_count = 0
    for ticket in tickets:
        t_id, data_json = ticket
        items = json.loads(data_json)
        ticket_total_win = 0
        ticket_breakdown_lines = []
        for item in items:
            num = str(item['num'])
            bet = float(item['qty'])
            win, lines = calculate_single_ticket(num, bet, w1, w2, w3, lottery_name)
            if win > 0:
                ticket_total_win += win
                for line in lines:
                    ticket_breakdown_lines.append(f"   • [{num}] {line}")
        if ticket_total_win > 0:
            winners_count += 1
            total_payout += ticket_total_win
            report += f"\n🎫 **Ticket #{t_id}** | Gana: **${ticket_total_win:.2f}**\n"
            report += "\n".join(ticket_breakdown_lines) + "\n"
    report += "\n====================\n"
    report += f"👥 Ganadores: {winners_count}\n"
    report += f"💸 **TOTAL A PAGAR: ${total_payout:.2f}**"
    
    # Split message if too long
    if len(report) > 4000:
        chunks = [report[i:i+4000] for i in range(0, len(report), 4000)]
        for chunk in chunks:
            _send_with_retry(lambda c=chunk: bot.send_message(chat_id, c, parse_mode="Markdown"), "winners report chunk")
    else:
        _send_with_retry(lambda: bot.send_message(chat_id, report, parse_mode="Markdown"), "winners report")

# 🔥 FIX: CTRL+C SUPPORT 🔥
if __name__ == "__main__":
    print(">>> BOT READY (OPTIMIZED SPEED + REFRESH URL) <<<")
    start_ticket_sync_worker()
    while True:
        try:
            bot.infinity_polling(timeout=20, long_polling_timeout=30)
        except (KeyboardInterrupt, SystemExit):
            print("🛑 Bot stopped by user (Ctrl+C).")
            break
        except (ConnectionError, ReadTimeout) as e:
            print(f"⚠️ Network blink: {e}")
            time.sleep(5)
        except Exception as e:
            print(f"❌ Critical Error: {e}")
            time.sleep(5)
