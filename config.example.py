# config.example.py — TEMPLATE. Copy to config.py and fill in real values.
#
#   cp config.example.py config.py   (then edit config.py)
#
# config.py is gitignored — never commit real secrets. See CLAUDE.md →
# "Secret handling". The TOKEN must be rotated in @BotFather if it ever leaks.

TOKEN = "REPLACE_ME"          # Telegram bot token from @BotFather
SECURITY_SALT = "REPLACE_ME"  # salt for ticket SEC codes / guilloche pattern
