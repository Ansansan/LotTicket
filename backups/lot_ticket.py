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
import urllib.parse
from requests.exceptions import ReadTimeout, ConnectionError
from telebot.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
from PIL import Image, ImageDraw, ImageFont 
import io

# --- CONFIGURACIÓN PROD BOT 1 ---
TOKEN = "8589741441:AAGrEHYG1CfN9MSzjGY4ISoLaYe70MtdzCA"
ADMIN_GROUP_ID = -1003516447199 
ADMIN_USER_ID = 8550582981
HISTORY_API_BASE = "https://tel.pythonanywhere.com/"

# 🔐 CLAVE SECRETA (SALT)
SECURITY_SALT = "TicaPanama857" 

# --- TOPIC MAPPING ---
TOPIC_MAPPING = { "Nacional": 63, "Tica": 64, "Nica": 65, "Primera": 67 }

# PREMIOS
AWARDS = {
    '2_digit_1': 14.00,
    '2_digit_2': 3.00,
    '2_digit_3': 2.00,
    '4_digit_12': 1000.00,
    '4_digit_13': 1000.00,
    '4_digit_23': 200.00
}

bot = telebot.TeleBot(TOKEN)
PANAMA_TZ = pytz.timezone('America/Panama')
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 🔥 AUTO-UPDATE SYSTEM
# OLD: BOT_VERSION = str(int(time.time())) 
# NEW: Hardcode this to match index.html to prevent redirect loops
BOT_VERSION = "PROD_1_V13" 

print(f"🚀 PROD BOT 1 started with Version ID: {BOT_VERSION}")

def init_db():
    db_path = os.path.join(BASE_DIR, 'tickets.db') 
    conn = sqlite3.connect(db_path) 
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS tickets_v3 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, date TEXT, lottery_type TEXT, numbers_json TEXT, is_nacional INTEGER DEFAULT 0)''')
    c.execute('''CREATE TABLE IF NOT EXISTS draw_results 
                 (date TEXT, lottery_type TEXT, w1 TEXT, w2 TEXT, w3 TEXT, UNIQUE(date, lottery_type))''')
    c.execute('''CREATE TABLE IF NOT EXISTS nacional_dates (date_str TEXT PRIMARY KEY)''')
    c.execute('''CREATE TABLE IF NOT EXISTS nacional_exclusions (date_str TEXT PRIMARY KEY)''')
    conn.commit()
    conn.close()

init_db()

# --- HELPERS ---
def is_admin_chat(message):
    is_group = str(message.chat.id) == str(ADMIN_GROUP_ID)
    is_admin_user = str(message.from_user.id) == str(ADMIN_USER_ID)
    return is_group or is_admin_user

def get_today_panama():
    return datetime.datetime.now(PANAMA_TZ).strftime("%Y-%m-%d")

def get_nacional_dates_string():
    db_path = os.path.join(BASE_DIR, 'tickets.db')
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

def get_short_security_code(ticket_id):
    raw_str = f"{ticket_id}-{SECURITY_SALT}"
    hash_object = hashlib.sha256(raw_str.encode())
    return hash_object.hexdigest()[:5].upper()

def calculate_single_ticket(num, bet, w1, w2, w3):
    win_4_12 = w1 + w2
    win_4_13 = w1 + w3
    win_4_23 = w2 + w3
    total_win = 0
    breakdown = []

    if len(num) == 2:
        if num == w1:
            win = bet * AWARDS['2_digit_1']
            total_win += win
            breakdown.append(f"1er Premio: ${AWARDS['2_digit_1']} * {bet} = ${win:.2f}")
        if num == w2:
            win = bet * AWARDS['2_digit_2']
            total_win += win
            breakdown.append(f"2do Premio: ${AWARDS['2_digit_2']} * {bet} = ${win:.2f}")
        if num == w3:
            win = bet * AWARDS['2_digit_3']
            total_win += win
            breakdown.append(f"3er Premio: ${AWARDS['2_digit_3']} * {bet} = ${win:.2f}")
            
    elif len(num) == 4:
        if num == win_4_12:
            win = bet * AWARDS['4_digit_12']
            total_win += win
            breakdown.append(f"Billete 1ro/2do: ${AWARDS['4_digit_12']} * {bet} = ${win:.2f}")
        if num == win_4_13:
            win = bet * AWARDS['4_digit_13']
            total_win += win
            breakdown.append(f"Billete 1ro/3ro: ${AWARDS['4_digit_13']} * {bet} = ${win:.2f}")
        if num == win_4_23:
            win = bet * AWARDS['4_digit_23']
            total_win += win
            breakdown.append(f"Billete 2do/3ro: ${AWARDS['4_digit_23']} * {bet} = ${win:.2f}")
            
    return total_win, breakdown

# --- COMANDOS ADMIN ---
@bot.message_handler(commands=['verificar'])
def check_specific_ticket(message):
    try:
        args = message.text.split()
        if len(args) < 3:
            bot.reply_to(message, "⚠️ Uso: /verificar [numero] [cantidad]")
            return
        user_num = args[1]
        user_qty = float(args[2])
        db_path = os.path.join(BASE_DIR, 'tickets.db')
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("SELECT * FROM draw_results ORDER BY rowid DESC LIMIT 1")
        last_result = c.fetchone()
        conn.close()
        if not last_result:
            bot.reply_to(message, "⚠️ No hay resultados guardados aún.")
            return
        _, r_date, r_type, w1, w2, w3 = last_result
        payout, breakdown = calculate_single_ticket(user_num, user_qty, w1, w2, w3)
        response = f"🔍 **VERIFICACIÓN RÁPIDA**\nSorteo: {r_type} ({r_date})\nGanadores: {w1} - {w2} - {w3}\nJugada: Num {user_num} x ${user_qty}\n----------------\n"
        if payout > 0:
            response += f"🎉 **GANASTE: ${payout:.2f}**\n\nDesglose:\n" + "\n".join(breakdown)
        else:
            response += "❌ No hubo suerte."
        bot.reply_to(message, response, parse_mode="Markdown")
    except Exception as e:
        bot.reply_to(message, f"Error: {e}")

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
        db_path = os.path.join(BASE_DIR, 'tickets.db')
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
        db_path = os.path.join(BASE_DIR, 'tickets.db')
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
def set_results_ui(message):
    if not is_admin_chat(message): 
        bot.reply_to(message, "⛔ Solo Grupo Admin.")
        return
    
    bot_username = bot.get_me().username
    deep_link = f"https://t.me/{bot_username}?start=admin_menu"
    
    markup = InlineKeyboardMarkup()
    markup.add(InlineKeyboardButton("🚀 Abrir Panel Admin", url=deep_link))
    
    bot.reply_to(message, "⚠️ Gestión de premios solo disponible en chat privado.\n\nHaz clic aquí:", reply_markup=markup)

@bot.message_handler(commands=['start'])
def send_welcome(message):
    try:
        user_id = message.from_user.id
        dates_str = get_nacional_dates_string()
        
        args = message.text.split()

        # 🟢 ADMIN MENU
        if len(args) > 1 and args[1] == 'admin_menu':
            if not is_admin_chat(message):
                bot.reply_to(message, "⛔ No tienes permisos de administrador.")
                return

            web_app_url = f"https://ansansan.github.io/LotTicket/index.html?v={BOT_VERSION}&mode=admin_dashboard&nacional_dates={dates_str}&uid={user_id}"
            markup = ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
            markup.add(KeyboardButton("📊 Abrir Dashboard", web_app=WebAppInfo(url=web_app_url)))
            
            bot.send_message(message.chat.id, "Modo Admin Activado. Pulsa el botón:", reply_markup=markup)
            return 

        # 🟢 NORMAL USER MENU
        web_app_url = f"https://ansansan.github.io/LotTicket/index.html?v={BOT_VERSION}&nacional_dates={dates_str}&uid={user_id}"
        api_base_param = urllib.parse.quote(HISTORY_API_BASE)
        history_url = f"https://ansansan.github.io/LotTicket/index.html?v={BOT_VERSION}&mode=history&api_base={api_base_param}&uid={user_id}"
        
        markup = ReplyKeyboardMarkup(resize_keyboard=True)
        markup.row(
            KeyboardButton("📝 Nuevo Ticket", web_app=WebAppInfo(url=web_app_url)),
            KeyboardButton("🏆 Chequear Premios", web_app=WebAppInfo(url=history_url))
        )
        
        bot.send_message(message.chat.id, f"¡Hola! Menú principal 👇", reply_markup=markup)
        
    except Exception as e:
        print(f"Error sending welcome: {e}")

@bot.message_handler(content_types=['web_app_data'])
def handle_web_app(message):
    try:
        if not message.web_app_data.data: return
        payload = json.loads(message.web_app_data.data)
        action = payload.get('action') 

        if action == 'save_results':
            if str(message.from_user.id) != str(ADMIN_USER_ID) and str(message.chat.id) != str(ADMIN_GROUP_ID):
                 return

            db_path = os.path.join(BASE_DIR, 'tickets.db')
            conn = sqlite3.connect(db_path)
            c = conn.cursor()
            c.execute("INSERT OR REPLACE INTO draw_results (date, lottery_type, w1, w2, w3) VALUES (?, ?, ?, ?, ?)", 
                      (payload['date'], payload['lottery'], payload['w1'], payload['w2'], payload['w3']))
            conn.commit()
            conn.close()

            # 🟢 1. Notify Group
            announcement = f"📢 *RESULTADOS OFICIALES*\n📅 {payload['date']} | {payload['lottery']}\n🏆 {payload['w1']} - {payload['w2']} - {payload['w3']}"
            bot.send_message(ADMIN_GROUP_ID, announcement, parse_mode="Markdown")
            
            # 🟢 2. Send Report to Group
            try:
                calculate_and_report(ADMIN_GROUP_ID, payload['date'], payload['lottery'], payload['w1'], payload['w2'], payload['w3'])
            except Exception as e:
                bot.send_message(ADMIN_GROUP_ID, f"⚠️ Error reporte: {e}")
            
            # 🟢 3. AUTO-SWITCH BACK TO NORMAL MENU
            user_id = message.from_user.id
            dates_str = get_nacional_dates_string()
            
            web_app_url = f"https://ansansan.github.io/LotTicket/index.html?v={BOT_VERSION}&nacional_dates={dates_str}&uid={user_id}"
            api_base_param = urllib.parse.quote(HISTORY_API_BASE)
            history_url = f"https://ansansan.github.io/LotTicket/index.html?v={BOT_VERSION}&mode=history&api_base={api_base_param}&uid={user_id}"

            markup = ReplyKeyboardMarkup(resize_keyboard=True)
            markup.row(
                KeyboardButton("📝 Nuevo Ticket", web_app=WebAppInfo(url=web_app_url)),
                KeyboardButton("🏆 Chequear Premios", web_app=WebAppInfo(url=history_url))
            )

            bot.send_message(message.chat.id, "✅ Datos guardados. Volviendo al menú principal 👇", reply_markup=markup)

        elif action == 'create_ticket':
            items = payload.get('items', [])
            lottery_type = payload.get('type', 'Desconocido')
            date = payload.get('date', get_today_panama()) 
            db_path = os.path.join(BASE_DIR, 'tickets.db')
            conn = sqlite3.connect(db_path)
            c = conn.cursor()
            c.execute("INSERT INTO tickets_v3 (user_id, date, lottery_type, numbers_json) VALUES (?, ?, ?, ?)", 
                      (message.chat.id, date, lottery_type, json.dumps(items)))
            ticket_id = c.lastrowid
            conn.commit()
            conn.close()
            generate_ticket_image(message, ticket_id, date, lottery_type, items)

    except Exception as e:
        print(f"Error: {e}")

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
        
        final_bottom = current_y + 40 * SCALE
        img = img.crop((0, 0, width, final_bottom))

        bio = io.BytesIO()
        img.save(bio, 'JPEG', quality=95)
        bio.seek(0)
        
        flag_emoji = "✅"
        if "Nacional" in lottery_type: flag_emoji = "🇵🇦"
        elif "Tica" in lottery_type: flag_emoji = "🇨🇷"
        elif "Nica" in lottery_type: flag_emoji = "🇳🇮"
        elif "Primera" in lottery_type: flag_emoji = "🇩🇴"
        
        # --- FAST SEND LOGIC (Send once, forward ID) ---
        # 1. Send to User
        sent_msg = bot.send_photo(message.chat.id, photo=bio, caption=f"Ticket #{ticket_id} | {lottery_type} {flag_emoji}")
        
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
        
        bot.send_photo(ADMIN_GROUP_ID, photo=photo_id, caption=admin_caption, message_thread_id=target_thread_id)
        
    except Exception as e:
        print(f"Error generating image: {e}")
        bot.reply_to(message, f"Ticket #{ticket_id} Guardado (Error imagen: {e})")

def calculate_and_report(chat_id, date, lottery_name, w1, w2, w3):
    db_path = os.path.join(BASE_DIR, 'tickets.db')
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
            win, lines = calculate_single_ticket(num, bet, w1, w2, w3)
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
    bot.send_message(chat_id, report, parse_mode="Markdown")

# 🔥 FIX: CTRL+C SUPPORT 🔥
if __name__ == "__main__":
    print(">>> BOT READY (OPTIMIZED SPEED + REFRESH URL) <<<")
    while True:
        try:
            # timeout=90 keeps connection open
            # allowed_updates=[] gets everything
            bot.infinity_polling(timeout=90, long_polling_timeout=5)
        except (KeyboardInterrupt, SystemExit):
            print("🛑 Bot stopped by user (Ctrl+C).")
            break
        except (ConnectionError, ReadTimeout) as e:
            print(f"⚠️ Network blink: {e}")
            time.sleep(5)
        except Exception as e:
            print(f"❌ Critical Error: {e}")
            time.sleep(5)