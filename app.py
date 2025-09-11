import os
import logging
import asyncio
from fastapi import FastAPI, Request, Response
from telegram import Update
from telegram.constants import ChatMemberStatus
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)
from supabase import create_client, Client

# ---------- تنظیمات ----------
BOT_TOKEN = os.environ["BOT_TOKEN"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)

# ---------- توابع دیتابیس با Supabase ----------
def add_trigger(chat_id: int, trigger: str, delay: int, message: str):
    supabase.table("triggers").insert({
        "chat_id": chat_id,
        "trigger": trigger,
        "delay": delay,
        "message": message
    }).execute()

def get_triggers(chat_id: int):
    response = supabase.table("triggers").select("*").eq("chat_id", chat_id).execute()
    return [(item['trigger'], item['delay'], item['message']) for item in response.data]

def clear_triggers(chat_id: int):
    supabase.table("triggers").delete().eq("chat_id", chat_id).execute()

def add_membership(user_id: int, chat_id: int):
    supabase.table("memberships").upsert({
        "user_id": user_id,
        "chat_id": chat_id
    }).execute()

def get_memberships(user_id: int):
    response = supabase.table("memberships").select("chat_id").eq("user_id", user_id).execute()
    return [item['chat_id'] for item in response.data]

def remove_membership(user_id: int, chat_id: int):
    supabase.table("memberships").delete().eq("user_id", user_id).eq("chat_id", chat_id).execute()

def set_user_lock_status(user_id: int, is_locked: bool):
    supabase.table("user_lock_status").upsert({
        "user_id": user_id,
        "is_locked": is_locked,
        "locked_at": "now()" if is_locked else None,
        "unlocked_at": None if is_locked else "now()"
    }).execute()

def get_user_lock_status(user_id: int):
    response = supabase.table("user_lock_status").select("*").eq("user_id", user_id).execute()
    if response.data:
        return response.data[0]['is_locked']
    return False

# ---------- هندلرها ----------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("✅ ربات روشنه و روی Render فعاله")

async def set_trigger(update: Update, context: ContextTypes.DEFAULT_TYPE):
    member = await context.bot.get_chat_member(
        update.effective_chat.id, update.effective_user.id
    )
    if member.status not in [ChatMemberStatus.ADMINISTRATOR, ChatMemberStatus.OWNER]:
        await update.message.reply_text("❌ فقط ادمین‌ها میتونن تریگر ثبت کنن")
        return

    if len(context.args) < 3:
        await update.message.reply_text("❌ استفاده: /set <کلمه> <زمان> <پیام>")
        return

    trigger = context.args[0]
    try:
        delay = int(context.args[1])
    except ValueError:
        await update.message.reply_text("⏱ زمان باید عدد باشه")
        return

    message = " ".join(context.args[2:])

    add_trigger(update.effective_chat.id, trigger, delay, message)
    await update.message.reply_text(
        f"✅ تریگر «{trigger}» با تأخیر {delay} ثانیه ثبت شد.\n"
        f"📩 پیام ذخیره‌شده: {message}",
        parse_mode="HTML",
    )

async def list_triggers(update: Update, context: ContextTypes.DEFAULT_TYPE):
    triggers = get_triggers(update.effective_chat.id)
    if not triggers:
        await update.message.reply_text("📭 هیچ تریگری ثبت نشده.")
        return

    msg = "📋 تریگرهای این گروه:\n\n"
    for t, d, m in triggers:
        msg += f"• {t} → {d} ثانیه → «{m}»\n"
    await update.message.reply_text(msg, parse_mode="HTML")

async def clear_all(update: Update, context: ContextTypes.DEFAULT_TYPE):
    clear_triggers(update.effective_chat.id)
    await update.message.reply_text("🗑 تمام تریگرهای این گروه پاک شدند.")

async def lock_user_across_groups(context: ContextTypes.DEFAULT_TYPE, user_id: int, exempt_chat_id: int = None):
    """قفل کردن کاربر در تمام گروه‌ها به جز گروه معاف"""
    groups = get_memberships(user_id)
    
    for chat_id in groups:
        if exempt_chat_id and chat_id == exempt_chat_id:
            continue
            
        try:
            # بررسی اینکه ربات در گروه ادمین هست
            bot_member = await context.bot.get_chat_member(chat_id, context.bot.id)
            if bot_member.status in [ChatMemberStatus.ADMINISTRATOR, ChatMemberStatus.OWNER]:
                await context.bot.ban_chat_member(chat_id, user_id)
                logging.info(f"✅ کاربر {user_id} از گروه {chat_id} حذف شد")
            else:
                logging.warning(f"⚠️ بات توی گروه {chat_id} ادمین نیست")
        except Exception as e:
            logging.error(f"❌ خطا در حذف کاربر {user_id} از {chat_id}: {e}")

async def unlock_user_across_groups(context: ContextTypes.DEFAULT_TYPE, user_id: int):
    """آزاد کردن کاربر در تمام گروه‌ها"""
    groups = get_memberships(user_id)
    
    for chat_id in groups:
        try:
            # بررسی اینکه ربات در گروه ادمین هست
            bot_member = await context.bot.get_chat_member(chat_id, context.bot.id)
            if bot_member.status in [ChatMemberStatus.ADMINISTRATOR, ChatMemberStatus.OWNER]:
                await context.bot.unban_chat_member(chat_id, user_id)
                logging.info(f"✅ کاربر {user_id} در گروه {chat_id} آزاد شد")
            else:
                logging.warning(f"⚠️ بات توی گروه {chat_id} ادمین نیست")
        except Exception as e:
            logging.error(f"❌ خطا در آزاد کردن کاربر {user_id} در {chat_id}: {e}")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.message.text:
        return

    text = update.message.text
    user_id = update.effective_user.id
    user_name = update.effective_user.full_name
    chat_id = update.effective_chat.id
    group_name = update.effective_chat.title or "Private"

    # ثبت عضویت در گروه
    add_membership(user_id, chat_id)

    # پردازش #ورود
    if "#ورود" in text:
        is_locked = get_user_lock_status(user_id)
        if is_locked:
            await update.message.reply_text("🔒 شما قبلاً قفل شده‌اید!")
            return

        # قفل کردن کاربر در تمام گروه‌ها به جز گروه فعلی
        await lock_user_across_groups(context, user_id, chat_id)
        
        # ذخیره وضعیت قفل
        set_user_lock_status(user_id, True)
        
        await update.message.reply_text(
            f"🔒 کاربر {user_name} در تمام گروه‌ها قفل شد و فقط در این گروه می‌ماند.\n"
            f"برای خروج از قرنطینه از #خروج استفاده کنید.",
            parse_mode="HTML"
        )
        return

    # پردازش #خروج
    if "#خروج" in text:
        is_locked = get_user_lock_status(user_id)
        if not is_locked:
            await update.message.reply_text("🔓 شما قبلاً آزاد شده‌اید!")
            return

        # آزاد کردن کاربر در تمام گروه‌ها
        await unlock_user_across_groups(context, user_id)
        
        # به‌روزرسانی وضعیت قفل
        set_user_lock_status(user_id, False)
        
        await update.message.reply_text(
            f"🔓 کاربر {user_name} از قرنطینه خارج شد و می‌تواند به تمام گروه‌ها وارد شود.",
            parse_mode="HTML"
        )
        return

    # بررسی تریگرهای معمولی
    triggers = get_triggers(chat_id)
    for trigger, delay, message in triggers:
        if trigger.lower() in text.lower():
            # پیام فوری
            info_text = (
                f"👤 پلیر <b>{user_name}</b> به منطقه <b>{group_name}</b> وارد شد.\n\n"
                f"⏱ مدت زمان سفر شما <b>{delay} ثانیه</b> می‌باشد."
            )
            await update.message.reply_text(
                info_text,
                parse_mode="HTML",
                reply_to_message_id=update.message.message_id,
            )

            # پیام نهایی بعد از تاخیر
            async def delayed_reply():
                try:
                    await asyncio.sleep(delay)
                    await update.message.reply_text(
                        message,
                        parse_mode="HTML",
                        reply_to_message_id=update.message.message_id,
                    )
                except Exception as e:
                    logging.error(e)

            context.application.create_task(delayed_reply())
            break

# ---------- اجرای ربات روی Render ----------
app = FastAPI()
application = Application.builder().token(BOT_TOKEN).build()

application.add_handler(CommandHandler("start", start))
application.add_handler(CommandHandler("set", set_trigger))
application.add_handler(CommandHandler("list", list_triggers))
application.add_handler(CommandHandler("clear", clear_all))
application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

@app.on_event("startup")
async def on_startup():
    await application.initialize()
    # تنظیم وب‌هوک
    webhook_url = f"https://your-render-url.onrender.com/webhook/{BOT_TOKEN}"
    await application.bot.set_webhook(webhook_url)
    logging.info("🚀 Bot initialized. Webhook set to: " + webhook_url)

@app.on_event("shutdown")
async def on_shutdown():
    await application.stop()
    await application.shutdown()

@app.post(f"/webhook/{BOT_TOKEN}")
async def telegram_webhook(request: Request):
    data = await request.json()
    update = Update.de_json(data, application.bot)
    await application.process_update(update)
    return Response(status_code=200)

@app.get("/health")
def health():
    return {"ok": True}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
