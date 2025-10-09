const { Telegraf, Scenes: { WizardScene }, session, Markup } = require('telegraf');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const TOKEN = process.env.BOT_TOKEN || "7616763801:AAHq3vnFyrZAOAz9ILAVpn_w5lpEMWhZc88";
const GROUP_ID = -1002511380813;
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(TOKEN);
const expressApp = express();

// ===========================
// مدیریت داده‌های کاربر
// ===========================
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
// تعریف مراحل ویزارد
// ===========================
const registrationWizard = new WizardScene(
    'registrationWizard',
    // مرحله 1: دریافت فرم
    async (ctx) => {
        await ctx.reply("📝 لطفاً فرم پر شده رو ارسال کنید:");
        return ctx.wizard.next();
    },
    // مرحله 2: دریافت استیکر/عکس
    async (ctx) => {
        if (ctx.message.text) {
            const uid = ctx.from.id;
            if (!userData.has(uid)) userData.set(uid, {});
            userData.get(uid).form = ctx.message.text;
            
            await ctx.reply("🌀 لطفاً استیکر رولتون یا عکس واضح از کرکترتون رو ارسال کنید.");
            return ctx.wizard.next();
        } else {
            await ctx.reply("⚠️ لطفاً فقط متن فرم رو ارسال کنید.");
            return;
        }
    },
    // مرحله 3: دریافت آهنگ
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
        
        const uid = ctx.from.id;
        userData.get(uid).sticker = fileId;
        
        await ctx.reply("🎼 لطفاً آهنگ مورد علاقتون رو ارسال کنید.");
        return ctx.wizard.next();
    },
    // مرحله 4: دریافت کاور
    async (ctx) => {
        if (ctx.message.audio) {
            const uid = ctx.from.id;
            userData.get(uid).song = ctx.message.audio.file_id;
            
            await ctx.reply("🎨 لطفاً کاور آهنگ رو ارسال کنید.");
            return ctx.wizard.next();
        } else {
            await ctx.reply("⚠️ لطفاً فایل صوتی واقعی بفرستید.");
            return;
        }
    },
    // مرحله 5: پردازش نهایی
    async (ctx) => {
        if (ctx.message.photo && ctx.message.photo.length > 0) {
            const uid = ctx.from.id;
            const user = userData.get(uid);
            user.cover = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            
            const formatted = formatForm(user.form, ctx.from.username);
            
            try {
                await ctx.telegram.sendMessage(GROUP_ID, "📜 شناسنامه جدید ارسال شد:");
                await ctx.telegram.sendMessage(GROUP_ID, formatted);
                
                if (user.sticker) {
                    await ctx.telegram.sendSticker(GROUP_ID, user.sticker);
                }
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
            
            userData.delete(uid);
            return ctx.scene.leave();
        } else {
            await ctx.reply("⚠️ لطفاً عکس ارسال کنید.");
            return;
        }
    }
);

// ===========================
// تنظیم Stage و میدلورها
// ===========================
const { Stage } = require('telegraf/scenes');
const stage = new Stage([registrationWizard]);

bot.use(session());
bot.use(stage.middleware());

// ===========================
// هندلرهای اصلی
// ===========================
bot.start(async (ctx) => {
    const keyboard = Markup.keyboard([
        ['📄 ساخت شناسنامه'],
        ['🏦 ورود به بانک']
    ]).resize();
    
    await ctx.reply(
        "✨ خوش اومدین!\n" +
        "من درویدم، دستیار شما توی سرزمین اکلیس.\n\n" +
        "برای شروع یکی از دکمه‌های پایین رو انتخاب کنید:",
        { reply_markup: keyboard }
    );
});

bot.hears('📄 ساخت شناسنامه', async (ctx) => {
    await ctx.reply(
        "🪶 لطفاً فرم زیر رو کپی کرده و پر کنید:\n\n" +
        "🪶اسم و اسم خاندان:\n" +
        "🪶نژاد:\n" +
        "🪶تاریخ تولد به میلادی:\n" +
        "🪶اسم پدر / مادر:\n" +
        "🪶زیر کلاس:"
    );
    await ctx.scene.enter('registrationWizard');
});

bot.hears('🏦 ورود به بانک', async (ctx) => {
    await ctx.reply("🚧 این بخش به زودی فعال خواهد شد!");
});

// ===========================
// راه‌اندازی سرور
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
    res.json({ status: 'Bot is running!' });
});

async function startBot() {
    if (process.env.NODE_ENV === 'production') {
        const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://your-app-name.onrender.com/webhook";
        await bot.telegram.setWebhook(WEBHOOK_URL);
        expressApp.listen(PORT, () => {
            console.log(`🚀 Bot server running on port ${PORT}`);
        });
    } else {
        await bot.launch();
        console.log('🤖 Bot started with polling');
    }
    console.log('✅ Eclis Registry Bot is ready!');
}

startBot();
