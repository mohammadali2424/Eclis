import os
from fastapi import FastAPI, Request
from telegram import Update, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import (
    Application, CommandHandler, MessageHandler, ConversationHandler,
    ContextTypes, filters
)

# ===========================
# تنظیمات اولیه
# ===========================
TOKEN = os.getenv("BOT_TOKEN", "7616763801:AAHq3vnFyrZAOAz9ILAVpn_w5lpEMWhZc88")
GROUP_ID = -1002511380813  # گروه شناسنامه‌ها

# Webhook تنظیم
WEBHOOK_URL = "https://eclis-registery-bot.onrender.com/webhook"

# FastAPI app
fastapi_app = FastAPI()

# ===========================
# وضعیت گفتگو
# ===========================
FORM, STICKER, SONG, COVER = range(4)
user_data = {}

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
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [[KeyboardButton("📄 ساخت شناسنامه")], [KeyboardButton("🏦 ورود به بانک")]]
    markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True)
    await update.message.reply_text(
        "✨ خوش اومدین!\n"
        "من درویدم، دستیار شما توی سرزمین اکلیس.\n\n"
        "برای شروع یکی از دکمه‌های پایین رو انتخاب کنید:",
        reply_markup=markup
    )

async def handle_button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🪶 لطفاً فرم زیر رو کپی کرده و پر کنید:\n\n"
        "🪶اسم و اسم خاندان:\n"
        "🪶نژاد:\n"
        "🪶تاریخ تولد به میلادی:\n"
        "🪶اسم پدر / مادر:\n"
        "🪶زیر کلاس:\n"
    )
    return FORM

async def get_form(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_data[update.effective_user.id] = {'form': update.message.text}
    await update.message.reply_text("🌀 لطفاً استیکر رولتون یا عکس واضح از کرکترتون رو ارسال کنید.")
    return STICKER

async def get_sticker(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    if update.message.sticker:
        sticker = update.message.sticker
    elif update.message.photo:
        sticker = update.message.photo[-1]
    else:
        await update.message.reply_text("⚠️ لطفاً استیکر یا عکس ارسال کنید.")
        return STICKER
    
    user_data[uid]['sticker'] = sticker.file_id
    await update.message.reply_text("🎼 لطفاً آهنگ مورد علاقتون رو ارسال کنید.")
    return SONG

async def get_song(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    if update.message.audio:
        user_data[uid]['song'] = update.message.audio.file_id
        await update.message.reply_text("🎨 لطفاً کاور آهنگ رو ارسال کنید.")
        return COVER
    else:
        await update.message.reply_text("⚠️ لطفاً فایل صوتی واقعی بفرستید.")
        return SONG

async def get_cover(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    if update.message.photo:
        user_data[uid]['cover'] = update.message.photo[-1].file_id
    else:
        await update.message.reply_text("⚠️ لطفاً عکس ارسال کنید.")
        return COVER
        
    form = user_data[uid]['form']
    formatted = format_form(form, update.effective_user.username)

    await context.bot.send_message(chat_id=GROUP_ID, text="📜 شناسنامه جدید ارسال شد:")
    await context.bot.send_message(chat_id=GROUP_ID, text=formatted)
    await update.message.reply_text("✅ اطلاعات شما با موفقیت ارسال شد! منتظر تأیید باشید.")
    return ConversationHandler.END

# ===========================
# FastAPI webhook endpoint
# ===========================
@fastapi_app.post("/webhook")
async def webhook(request: Request):
    try:
        data = await request.json()
        update = Update.de_json(data, app.bot)
        await app.update_queue.put(update)
        return {"ok": True}
    except Exception as e:
        print(f"Error in webhook: {e}")
        return {"ok": False}

# ===========================
# راه‌اندازی بات
# ===========================
app = Application.builder().token(TOKEN).build()

conv_handler = ConversationHandler(
    entry_points=[MessageHandler(filters.Regex("^(📄 ساخت شناسنامه)$"), handle_button)],
    states={
        FORM: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_form)],
        STICKER: [MessageHandler(filters.ALL, get_sticker)],
        SONG: [MessageHandler(filters.AUDIO | filters.VOICE, get_song)],
        COVER: [MessageHandler(filters.PHOTO, get_cover)],
    },
    fallbacks=[],
)

app.add_handler(CommandHandler("start", start))
app.add_handler(conv_handler)

# ===========================
# شروع در Render
# ===========================
@fastapi_app.on_event("startup")
async def on_startup():
    await app.bot.set_webhook(WEBHOOK_URL)
    print("✅ Webhook set and bot ready!")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(fastapi_app, host="0.0.0.0", port=8000)
