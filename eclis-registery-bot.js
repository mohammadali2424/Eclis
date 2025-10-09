const { Telegraf, Scenes: { WizardScene }, session, Markup } = require('telegraf');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

// ===========================
// تنظیمات اولیه
// ===========================
const TOKEN = process.env.BOT_TOKEN || "7616763801:AAHq3vnFyrZAOAz9ILAVpn_w5lpEMWhZc88";
const GROUP_ID = -1002511380813; // گروه شناسنامه‌ها
const PORT = process.env.PORT || 3000;

// ===========================
// ایجاد برنامه‌ها
// ===========================
const bot = new Telegraf(TOKEN);
const expressApp = express();

// ===========================
// حالت‌های گفتگو
// ===========================
const FORM = 'FORM';
const STICKER = 'STICKER';
const SONG = 'SONG';
const COVER = 'COVER';

// ذخیره داده‌های کاربران
const userData = new Map();

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

// ===========================
// هندلرها
// ===========================

// دستور start
bot.start(async (ctx) => {
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

// هندلر دکمه "ساخت شناسنامه"
bot.hears('📄 ساخت شناسنامه', async (ctx) => {
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
    ctx.scene.enter('registrationWizard');
});

// ===========================
// صحنه ویزارد برای ثبت‌نام
// ===========================
const registrationWizard = new WizardScene(
    'registrationWizard',
    // مرحله ۱: دریافت فرم
    async (ctx) => {
        await ctx.reply("📝 لطفاً فرم پر شده رو ارسال کنید:");
        return ctx.wizard.next();
    },
    
    // مرحله ۲: ذخیره فرم و دریافت استیکر/عکس
    async (ctx) => {
        if (!ctx.message.text) {
            await ctx.reply("⚠️ لطفاً فقط متن فرم رو ارسال کنید.");
            return;
        }
        
        const user = userData.get(ctx.from.id);
        user.form = ctx.message.text;
        userData.set(ctx.from.id, user);
        
        await ctx.reply("🌀 لطفاً استیکر رولتون یا عکس واضح از کرکترتون رو ارسال کنید.");
        return ctx.wizard.next();
    },
    
    // مرحله ۳: دریافت استیکر/عکس
    async (ctx) => {
        let fileId;
        
        if (ctx.message.sticker) {
            fileId = ctx.message.sticker.file_id;
        } else if (ctx.message.photo && ctx.message.photo.length > 0) {
            fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        } else {
            await ctx.reply("⚠️ لطفاً استیکر یا عکس ارسال کنید.");
            return;
        }
        
        const user = userData.get(ctx.from.id);
        user.sticker = fileId;
        userData.set(ctx.from.id, user);
        
        await ctx.reply("🎼 لطفاً آهنگ مورد علاقتون رو ارسال کنید.");
        return ctx.wizard.next();
    },
    
    // مرحله ۴: دریافت آهنگ
    async (ctx) => {
        if (!ctx.message.audio) {
            await ctx.reply("⚠️ لطفاً فایل صوتی واقعی بفرستید.");
            return;
        }
        
        const user = userData.get(ctx.from.id);
        user.song = ctx.message.audio.file_id;
        userData.set(ctx.from.id, user);
        
        await ctx.reply("🎨 لطفاً کاور آهنگ رو ارسال کنید.");
        return ctx.wizard.next();
    },
    
    // مرحله ۵: دریافت کاور و ارسال نهایی
    async (ctx) => {
        if (!ctx.message.photo || ctx.message.photo.length === 0) {
            await ctx.reply("⚠️ لطفاً عکس ارسال کنید.");
            return;
        }
        
        const user = userData.get(ctx.from.id);
        user.cover = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        
        // فرمت‌بندی و ارسال نهایی
        const formatted = formatForm(user.form, ctx.from.username);
        
        try {
            // ارسال به گروه
            await ctx.telegram.sendMessage(GROUP_ID, "📜 شناسنامه جدید ارسال شد:");
            await ctx.telegram.sendMessage(GROUP_ID, formatted);
            
            // ارسال استیکر/عکس
            if (user.sticker) {
                if (user.sticker.includes('CAAC')) { // استیکر
                    await ctx.telegram.sendSticker(GROUP_ID, user.sticker);
                } else { // عکس
                    await ctx.telegram.sendPhoto(GROUP_ID, user.sticker);
                }
            }
            
            // ارسال آهنگ و کاور
            if (user.song && user.cover) {
                await ctx.telegram.sendAudio(GROUP_ID, user.song, {
                    thumb: user.cover
                });
            }
            
            await ctx.reply("✅ اطلاعات شما با موفقیت ارسال شد! منتظر تأیید باشید.");
        } catch (error) {
            console.error('Error sending to group:', error);
            await ctx.reply("❌ خطایی در ارسال اطلاعات رخ داد. لطفاً دوباره تلاش کنید.");
        }
        
        // پاک کردن داده‌های کاربر
        userData.delete(ctx.from.id);
        return ctx.scene.leave();
    }
);

// ===========================
// تنظیم سن‌ها و میدلورها
// ===========================
const { Stage } = require('telegraf/scenes');
const stage = new Stage([registrationWizard]);

bot.use(session());
bot.use(stage.middleware());

// ===========================
// راه‌اندازی وب‌سرور و وب‌هوک
// ===========================
expressApp.use(express.json());

// مسیر وب‌هوک برای Render
expressApp.post('/webhook', async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ ok: false });
    }
});

// مسیر سلامت برای Render
expressApp.get('/', (req, res) => {
    res.json({ 
        status: 'Bot is running!',
        service: 'Eclis Registry Bot'
    });
});

// ===========================
// راه‌اندازی ربات
// ===========================
async function startBot() {
    try {
        // در محیط production از وب‌هوک استفاده می‌کنیم
        if (process.env.NODE_ENV === 'production') {
            const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://eclis-registery-bot.onrender.com/webhook";
            await bot.telegram.setWebhook(WEBHOOK_URL);
            console.log('✅ Webhook set successfully');
            
            expressApp.listen(PORT, () => {
                console.log(`🚀 Bot server running on port ${PORT}`);
            });
        } else {
            // در محیط توسعه از polling استفاده می‌کنیم
            await bot.launch();
            console.log('🤖 Bot started with polling');
        }
        
        console.log('✅ Eclis Registry Bot is ready!');
    } catch (error) {
        console.error('❌ Error starting bot:', error);
        process.exit(1);
    }
}

// هندلرهای خروج تمیز
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// شروع ربات
startBot();