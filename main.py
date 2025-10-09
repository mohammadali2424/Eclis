import os
import logging
from fastapi import FastAPI, Request
from telegram import Update, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import (
    Updater, CommandHandler, MessageHandler, ConversationHandler,
    Filters, CallbackContext
)

# تنظیمات لاگ
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# ===========================
# تنظیمات اولیه
# ===========================
TOKEN = os.getenv("BOT_TOKEN", "7616763801:AAHq3vnFyrZAOAz9ILAVpn_w5lpEMWhZc88")
GROUP_ID = -1002511380813

# وضعیت گفتگو
FORM, STICKER, SONG, COVER = range(4)
user_data = {}

# FastAPI app
fastapi_app = FastAPI()

# ===========================
# توابع کمکی
# ===========================
def format_form(form_text: str, username: str) -> str:
    lines = form_text.strip().split('\n')
    values = {
        'name': lines[0].replace("اسم و اسم خاندان:", "").strip() if len(lines) > 0 else "نامشخص",
        'race': lines[1].replace("نژاد:", "").strip() if len(lines) > 1 else "نامشخص",
        'birth': lines[2].replace("تاریخ تولد به میلادی:", "").strip() if len(lines) > 2 else "نامشخص",
        'parents': lines[3].replace("اسم پدر / مادر:", "").strip() if len(lines) > 3 else "نامشخص",
        'subclass': lines[4].replace("زیر کلاس:", "").strip() if len(lines) > 4 else "نامشخص",
    }
    return (
        f"👤 نام: {values['name']}\n"
        f"🏰 خاندان: {values['race']}\n"
        f"🧬 نژاد: {values['race']}\n"
        f"📅 تاریخ تولد: {values['birth']}\n"
        f"👨‍👩‍👧 والدین: {values['parents']}\n"
        f"⚗️ زیرکلاس: {values['subclass']}\n\n"
        f"📨 ارسال‌شده توسط: @{username or 'بدون آیدی'}"
    )

# ===========================
# هندلرها
# ===========================
def start(update: Update, context: CallbackContext):
    keyboard = [[KeyboardButton("📄 ساخت شناسنامه")], [KeyboardButton("🏦 ورود به بانک")]]
    markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True)
    update.message.reply_text(
        "✨ خوش اومدین!\n"
        "من درویدم، دستیار شما توی سرزمین اکلیس.\n\n"
        "برای شروع یکی از دکمه‌های پایین رو انتخاب کنید:",
        reply_markup=markup
    )

def handle_button(update: Update, context: CallbackContext):
    update.message.reply_text(
        "🪶 لطفاً فرم زیر رو کپی کرده و پر کنید:\n\n"
        "🪶اسم و اسم خاندان:\n"
        "🪶نژاد:\n"
        "🪶تاریخ تولد به میلادی:\n"
        "🪶اسم پدر / مادر:\n"
        "🪶زیر کلاس:\n"
    )
    return FORM

def get_form(update: Update, context: CallbackContext):
    user_data[update.effective_user.id] = {'form': update.message.text}
    update.message.reply_text("🌀 لطفاً استیکر رولتون یا عکس واضح از کرکترتون رو ارسال کنید.")
    return STICKER

def get_sticker(update: Update, context: CallbackContext):
    uid = update.effective_user.id
    if update.message.sticker:
        user_data[uid]['sticker'] = update.message.sticker.file_id
    elif update.message.photo:
        user_data[uid]['sticker'] = update.message.photo[-1].file_id
    else:
        update.message.reply_text("⚠️ لطفاً استیکر یا عکس ارسال کنید.")
        return STICKER
    
    update.message.reply_text("🎼 لطفاً آهنگ مورد علاقتون رو ارسال کنید.")
    return SONG

def get_song(update: Update, context: CallbackContext):
    uid = update.effective_user.id
    if update.message.audio:
        user_data[uid]['song'] = update.message.audio.file_id
        update.message.reply_text("🎨 لطفاً کاور آهنگ رو ارسال کنید.")
        return COVER
    else:
        update.message.reply_text("⚠️ لطفاً فایل صوتی واقعی بفرستید.")
        return SONG

def get_cover(update: Update, context: CallbackContext):
    uid = update.effective_user.id
    if update.message.photo:
        user_data[uid]['cover'] = update.message.photo[-1].file_id
    else:
        update.message.reply_text("⚠️ لطفاً عکس ارسال کنید.")
        return COVER
        
    form = user_data[uid]['form']
    formatted = format_form(form, update.effective_user.username)

    context.bot.send_message(chat_id=GROUP_ID, text="📜 شناسنامه جدید ارسال شد:")
    context.bot.send_message(chat_id=GROUP_ID, text=formatted)
    update.message.reply_text("✅ اطلاعات شما با موفقیت ارسال شد! منتظر تأیید باشید.")
    
    # پاک کردن داده کاربر
    if uid in user_data:
        del user_data[uid]
        
    return ConversationHandler.END

def cancel(update: Update, context: CallbackContext):
    uid = update.effective_user.id
    if uid in user_data:
        del user_data[uid]
    update.message.reply_text("❌ عملیات لغو شد.")
    return ConversationHandler.END

# ===========================
# راه‌اندازی بات
# ===========================
# ساخت updater
updater = Updater(TOKEN, use_context=True)
dp = updater.dispatcher

# Conversation Handler
conv_handler = ConversationHandler(
    entry_points=[MessageHandler(Filters.regex('^(📄 ساخت شناسنامه)$'), handle_button)],
    states={
        FORM: [MessageHandler(Filters.text & ~Filters.command, get_form)],
        STICKER: [MessageHandler(Filters.sticker | Filters.photo, get_sticker)],
        SONG: [MessageHandler(Filters.audio, get_song)],
        COVER: [MessageHandler(Filters.photo, get_cover)],
    },
    fallbacks=[CommandHandler('cancel', cancel)]
)

dp.add_handler(CommandHandler("start", start))
dp.add_handler(conv_handler)

# ===========================
# FastAPI webhook endpoint
# ===========================
@fastapi_app.post("/webhook")
async def webhook(request: Request):
    try:
        data = await request.json()
        update = Update.de_json(data, updater.bot)
        dp.process_update(update)
        return {"ok": True}
    except Exception as e:
        logger.error(f"Error in webhook: {e}")
        return {"ok": False}

@fastapi_app.on_event("startup")
async def on_startup():
    # راه‌اندازی وب‌هوک
    webhook_url = "https://eclis-registery-bot.onrender.com/webhook"
    updater.bot.set_webhook(webhook_url)
    logger.info("✅ Bot started with webhook!")

@fastapi_app.get("/")
async def root():
    return {"status": "Bot is running!"}

# برای اجرای محلی
if __name__ == "__main__":
    updater.start_polling()
    updater.idle()
