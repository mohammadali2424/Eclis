const { Telegraf, Scenes: { WizardScene }, session, Markup } = require('telegraf');
const express = require('express');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const path = require('path');

dotenv.config();

// ===========================
// تنظیمات اولیه
// ===========================
const TOKEN = process.env.BOT_TOKEN || "7616763801:AAHq3vnFyrZAOAz9ILAVpn_w5lpEMWhZc88";
const GROUP_ID = -1002511380813;
const PORT = process.env.PORT || 3000;
const LOG_FILE = path.join(__dirname, 'requests.log');

// ===========================
// سیستم لاگ‌گیری
// ===========================
async function logRequest(userId, username, action, data = {}) {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] UserID: ${userId} | Username: @${username || 'بدون آیدی'} | Action: ${action} | Data: ${JSON.stringify(data)}\n`;
        
        await fs.appendFile(LOG_FILE, logEntry, 'utf8');
        console.log('📝 Log Entry:', logEntry.trim());
    } catch (error) {
        console.error('❌ Error writing to log file:', error);
    }
}

// ===========================
// ایجاد صف ساده
// ===========================
class SimpleQueue {
    constructor(concurrency = 5) {
        this.concurrency = concurrency;
        this.running = 0;
        this.queue = [];
    }

    add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.next();
        });
    }

    next() {
        if (this.running >= this.concurrency || this.queue.length === 0) {
            return;
        }

        this.running++;
        const { task, resolve, reject } = this.queue.shift();

        task()
            .then(resolve)
            .catch(reject)
            .finally(() => {
                this.running--;
                this.next();
            });
    }

    get size() {
        return this.queue.length;
    }

    get pending() {
        return this.running;
    }
}

const messageQueue = new SimpleQueue(5);

// ===========================
// ایجاد برنامه‌ها
// ===========================
const bot = new Telegraf(TOKEN);
const expressApp = express();

// ===========================
// مدیریت داده‌های کاربران
// ===========================
class UserDataManager {
    constructor() {
        this.userData = new Map();
    }

    set(userId, data) {
        this.userData.set(userId, {
            ...data,
            timestamp: Date.now()
        });
    }

    get(userId) {
        const data = this.userData.get(userId);
        if (data) {
            data.timestamp = Date.now();
        }
        return data;
    }

    delete(userId) {
        return this.userData.delete(userId);
    }
}

const userData = new UserDataManager();

// ===========================
// توابع کمکی
// ===========================
function formatForm(formText, username) {
    const lines = formText.trim().split('\n');
    const values = {
        name: lines[0]?.replace("اسم و اسم خاندان:", "").trim() || "نامشخص",
        race: lines[1]?.replace("نژاد:", "").trim() || "نامشخص",
        birth: lines[2]?.replace("تاریخ تولد به میلادی:", "").trim() || "نامشخص",
        parents: lines[3]?.replace("اسم پدر / مادر:", "").trim() || "نامشخص",
        subclass: lines[4]?.replace("زیر کلاس:", "").trim() || "نامشخص",
    };
    
    return (
        `👤 نام: ${values['name']}\n` +
        `🏰 خاندان: ${values['race']}\n` +
        `🧬 نژاد: ${values['race']}\n` +
        `📅 تاریخ تولد: ${values['birth']}\n` +
        `👨‍👩‍👧 والدین: ${values['parents']}\n` +
        `⚗️ زیرکلاس: ${values['subclass']}\n\n` +
        `📨 ارسال‌شده توسط: @${username || 'بدون آیدی'}`
    );
}

async function safeSendToGroup(ctx, content, media = null) {
    return messageQueue.add(async () => {
        try {
            if (media && media.type === 'sticker') {
                await ctx.telegram.sendSticker(GROUP_ID, media.fileId);
            } else if (media && media.type === 'photo') {
                await ctx.telegram.sendPhoto(GROUP_ID, media.fileId);
            } else if (media && media.type === 'audio') {
                await ctx.telegram.sendAudio(GROUP_ID, media.fileId, {
                    thumb: media.thumb
                });
            } else {
                await ctx.telegram.sendMessage(GROUP_ID, content);
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
            return true;
        } catch (error) {
            console.error('Error sending to group:', error);
            throw error;
        }
    });
}

// ===========================
// هندلرهای اصلی
// ===========================

// دستور start
bot.start(async (ctx) => {
    await logRequest(ctx.from.id, ctx.from.username, 'START_COMMAND');
    
    const keyboard = Markup.keyboard([
        ['📄 ساخت شناسنامه'],
        ['🏦 ورود به بانک']
    ]).resize();
    
    await ctx.reply(
        "✨ خوش اومدین!\n" +
        "من درویدم، دستیار شما توی سرزمین اکلیس.\n\n" +
        "برای شروع یکی از دکمه‌های پایین رو انتخاب کنید:",
        keyboard
    );
});

// هندلر دکمه "ساخت شناسنامه" - نسخه اصلاح شده
bot.hears('📄 ساخت شناسنامه', async (ctx) => {
    try {
        await logRequest(ctx.from.id, ctx.from.username, 'CREATE_ID_CLICKED');
        
        // این پیام باید حتما نمایش داده شود
        await ctx.reply(
            "🪶 لطفاً فرم زیر رو کپی کرده و پر کنید:\n\n" +
            "\n" +
            "🪶اسم و اسم خاندان:\n" +
            "🪶نژاد:\n" +
            "🪶تاریخ تولد به میلادی:\n" +
            "🪶اسم پدر / مادر:\n" +
            "🪶زیر کلاس:\n"
        );
        
        userData.set(ctx.from.id, {});
        
        // ورود به صحنه ثبت‌نام
        await ctx.scene.enter('registrationWizard');
        
        await logRequest(ctx.from.id, ctx.from.username, 'SCENE_ENTERED');
        
    } catch (error) {
        console.error('Error in create ID handler:', error);
        await logRequest(ctx.from.id, ctx.from.username, 'CREATE_ID_ERROR', { error: error.message });
        await ctx.reply("⚠️ خطایی پیش اومد. لطفاً دوباره تلاش کنید.");
    }
});

// هندلر دکمه "ورود به بانک"
bot.hears('🏦 ورود به بانک', async (ctx) => {
    await logRequest(ctx.from.id, ctx.from.username, 'BANK_ACCESS_CLICKED');
    await ctx.reply("🚧 این بخش به زودی فعال خواهد شد!");
});

// ===========================
// صحنه ویزارد برای ثبت‌نام
// ===========================
const registrationWizard = new WizardScene(
    'registrationWizard',
    
    // مرحله ۱: دریافت فرم
    async (ctx) => {
        try {
            await logRequest(ctx.from.id, ctx.from.username, 'FORM_STEP_STARTED');
            await ctx.reply("📝 لطفاً فرم پر شده رو ارسال کنید:");
            return ctx.wizard.next();
        } catch (error) {
            console.error('Error in form step:', error);
            await logRequest(ctx.from.id, ctx.from.username, 'FORM_STEP_ERROR', { error: error.message });
            await ctx.reply("⚠️ خطایی پیش اومد. لطفاً /start رو بزنین و دوباره تلاش کنید.");
            return ctx.scene.leave();
        }
    },
    
    // مرحله ۲: ذخیره فرم و دریافت استیکر/عکس
    async (ctx) => {
        try {
            if (!ctx.message.text) {
                await ctx.reply("⚠️ لطفاً فقط متن فرم رو ارسال کنید.");
                return;
            }
            
            await logRequest(ctx.from.id, ctx.from.username, 'FORM_RECEIVED', { 
                formLength: ctx.message.text.length 
            });
            
            const user = userData.get(ctx.from.id) || {};
            user.form = ctx.message.text;
            userData.set(ctx.from.id, user);
            
            await ctx.reply("🌀 لطفاً استیکر رولتون یا عکس واضح از کرکترتون رو ارسال کنید.");
            return ctx.wizard.next();
        } catch (error) {
            console.error('Error saving form:', error);
            await logRequest(ctx.from.id, ctx.from.username, 'FORM_SAVE_ERROR', { error: error.message });
            await ctx.reply("⚠️ خطایی در ذخیره فرم پیش اومد. لطفاً دوباره تلاش کنید.");
            return ctx.scene.leave();
        }
    },
    
    // مرحله ۳: دریافت استیکر/عکس
    async (ctx) => {
        try {
            let fileId;
            let mediaType;
            
            if (ctx.message.sticker) {
                fileId = ctx.message.sticker.file_id;
                mediaType = 'sticker';
            } else if (ctx.message.photo && ctx.message.photo.length > 0) {
                fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
                mediaType = 'photo';
            } else {
                await ctx.reply("⚠️ لطفاً استیکر یا عکس ارسال کنید.");
                return;
            }
            
            await logRequest(ctx.from.id, ctx.from.username, 'MEDIA_RECEIVED', { type: mediaType });
            
            const user = userData.get(ctx.from.id) || {};
            user.sticker = fileId;
            user.mediaType = mediaType;
            userData.set(ctx.from.id, user);
            
            await ctx.reply("🎼 لطفاً آهنگ مورد علاقتون رو ارسال کنید.");
            return ctx.wizard.next();
        } catch (error) {
            console.error('Error processing media:', error);
            await logRequest(ctx.from.id, ctx.from.username, 'MEDIA_ERROR', { error: error.message });
            await ctx.reply("⚠️ خطایی در پردازش عکس/استیکر پیش اومد. لطفاً دوباره تلاش کنید.");
            return ctx.scene.leave();
        }
    },
    
    // مرحله ۴: دریافت آهنگ
    async (ctx) => {
        try {
            if (!ctx.message.audio) {
                await ctx.reply("⚠️ لطفاً فایل صوتی واقعی بفرستید.");
                return;
            }
            
            await logRequest(ctx.from.id, ctx.from.username, 'AUDIO_RECEIVED');
            
            const user = userData.get(ctx.from.id) || {};
            user.song = ctx.message.audio.file_id;
            userData.set(ctx.from.id, user);
            
            await ctx.reply("🎨 لطفاً کاور آهنگ رو ارسال کنید.");
            return ctx.wizard.next();
        } catch (error) {
            console.error('Error processing audio:', error);
            await logRequest(ctx.from.id, ctx.from.username, 'AUDIO_ERROR', { error: error.message });
            await ctx.reply("⚠️ خطایی در پردازش آهنگ پیش اومد. لطفاً دوباره تلاش کنید.");
            return ctx.scene.leave();
        }
    },
    
    // مرحله ۵: دریافت کاور و ارسال نهایی
    async (ctx) => {
        try {
            if (!ctx.message.photo || ctx.message.photo.length === 0) {
                await ctx.reply("⚠️ لطفاً عکس ارسال کنید.");
                return;
            }
            
            const user = userData.get(ctx.from.id);
            if (!user) {
                await ctx.reply("⚠️ اطلاعات شما یافت نشد. لطفاً از /start شروع کنید.");
                return ctx.scene.leave();
            }
            
            user.cover = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            
            // فرمت‌بندی و ارسال نهایی
            const formatted = formatForm(user.form, ctx.from.username);
            
            await ctx.reply("⏳ در حال ارسال اطلاعات به گروه...");
            
            // ارسال اطلاعات به گروه با مدیریت صف
            await safeSendToGroup(ctx, "📜 شناسنامه جدید ارسال شد:");
            await safeSendToGroup(ctx, formatted);
            
            if (user.sticker) {
                await safeSendToGroup(ctx, null, {
                    type: user.mediaType,
                    fileId: user.sticker
                });
            }
            
            if (user.song && user.cover) {
                await safeSendToGroup(ctx, null, {
                    type: 'audio',
                    fileId: user.song,
                    thumb: user.cover
                });
            }
            
            await logRequest(ctx.from.id, ctx.from.username, 'REGISTRATION_COMPLETED');
            await ctx.reply("✅ اطلاعات شما با موفقیت ارسال شد! منتظر تأیید باشید.");
            
        } catch (error) {
            console.error('Error in final step:', error);
            await logRequest(ctx.from.id, ctx.from.username, 'FINAL_STEP_ERROR', { error: error.message });
            await ctx.reply("❌ خطایی در ارسال اطلاعات رخ داد. لطفاً دوباره تلاش کنید.");
        } finally {
            userData.delete(ctx.from.id);
            return ctx.scene.leave();
        }
    }
);

// ===========================
// تنظیم سن‌ها و میدلورها
// ===========================
const { Stage } = require('telegraf/scenes');
const stage = new Stage([registrationWizard]);

bot.use(session());
bot.use(stage.middleware());

// هندلر خطاهای全局
bot.catch(async (err, ctx) => {
    console.error(`Global error for ${ctx.updateType}:`, err);
    await logRequest(ctx.from?.id, ctx.from?.username, 'GLOBAL_ERROR', { error: err.message });
    try {
        await ctx.reply("⚠️ خطای سیستمی پیش اومد. لطفاً دوباره تلاش کنید.");
        userData.delete(ctx.from?.id);
    } catch (e) {
        console.error('Error in error handler:', e);
    }
});

// ===========================
// راه‌اندازی وب‌سرور
// ===========================
expressApp.use(express.json());

expressApp.post('/webhook', async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ ok: false });
    }
});

expressApp.get('/', (req, res) => {
    res.json({ 
        status: 'Bot is running!',
        service: 'Eclis Registry Bot v2.1',
        queueSize: messageQueue.size,
        activeUsers: messageQueue.pending,
        uptime: process.uptime()
    });
});

// مسیر جدید برای مشاهده لاگ‌ها
expressApp.get('/logs', async (req, res) => {
    try {
        const logs = await fs.readFile(LOG_FILE, 'utf8');
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(logs);
    } catch (error) {
        res.status(500).json({ error: 'Unable to read log file' });
    }
});

// ===========================
// راه‌اندازی ربات
// ===========================
async function startBot() {
    try {
        if (process.env.NODE_ENV === 'production') {
            const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://eclis-registery-bot.onrender.com/webhook";
            await bot.telegram.setWebhook(WEBHOOK_URL);
            console.log('✅ Webhook set successfully');
            
            expressApp.listen(PORT, () => {
                console.log(`🚀 Bot server running on port ${PORT}`);
                console.log(`📊 Logs available at /logs`);
            });
        } else {
            await bot.launch();
            console.log('🤖 Bot started with polling');
        }
        
        console.log('✅ Eclis Registry Bot v2.1 with logging is ready!');
    } catch (error) {
        console.error('❌ Error starting bot:', error);
        process.exit(1);
    }
}

// هندلرهای خروج تمیز
process.once('SIGINT', () => {
    console.log('🛑 Shutting down gracefully...');
    bot.stop('SIGINT');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 Shutting down gracefully...');
    bot.stop('SIGTERM');
    process.exit(0);
});

// شروع ربات
startBot();
