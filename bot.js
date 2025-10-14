const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');

// خواندن تنظیمات از متغیرهای محیطی
const BOT_TOKEN = process.env.BOT_TOKEN;
const REVIEW_GROUP_ID = process.env.REVIEW_GROUP_ID;
const ACCEPTED_GROUP_ID = process.env.ACCEPTED_GROUP_ID;
const PORT = process.env.PORT || 3000;

// بررسی وجود متغیرهای ضروری
if (!BOT_TOKEN) {
  console.error('❌ خطا: BOT_TOKEN تنظیم نشده است');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// middleware سشن
bot.use(session({ 
  defaultSession: () => ({
    step: 'START',
    userData: {}
  })
}));

// 🗂️ مراحل کاربر
const UserStep = {
    START: 'START',
    AWAITING_FORM: 'AWAITING_FORM',
    AWAITING_STICKER: 'AWAITING_STICKER',
    AWAITING_TATTOO_PHOTO: 'AWAITING_TATTOO_PHOTO',
    AWAITING_SONG: 'AWAITING_SONG',
    AWAITING_COVER_PHOTO: 'AWAITING_COVER_PHOTO'
};

// 🎯 دستور /start
bot.start((ctx) => {
    const userName = ctx.from.first_name || 'کاربر';
    const welcomeMessage = `با ورودتون از جام بلند میشم و با لبخند گرمی بهتون نگاه میکنم دستامو بهم قفل میکنم *
دست راستم رو خم شده با حالت خدمتکار ها روبه‌روی شکمم نگه میدارم *
+ خوش اومدین (${userName})
من درویدم، دستیار شما توی سرزمین اکلیس

برای شروع یکی از گزینه‌های زیر رو انتخاب کن:`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('<< ساخت شناسنامه >>', 'create_id')]
    ]);

    ctx.session.step = UserStep.START;
    ctx.session.userData = {};

    return ctx.reply(welcomeMessage, keyboard);
});

// 🖱️ کلیک روی دکمه "ساخت شناسنامه"
bot.action('create_id', (ctx) => {
    ctx.session.step = UserStep.AWAITING_FORM;
    ctx.session.userData = {};

    const formInstructions = `+ خوش اومدین لطفا بشینید و اطلاعاتتون کامل کنید
از توی کشو برگه‌ای رو بیرون میارم و به همراه خودکار جلوتون می‌ذارم *
+ حتما قبل از نوشتن فرم توضیحات چنل @Eclis_Darkness رو بخونید`;

    const formFields = `🪶اسم و اسم خاندان:
🪶نژاد:
🪶تاریخ تولد به میلادی:
🪶اسم پدر / مادر:

✅ لطفا متن بالا را کپی کنید، اطلاعات خود را در مقابل هر قسمت وارد کرده و سپس ارسال کنید.`;

    ctx.editMessageText(formInstructions);
    setTimeout(() => {
        ctx.reply(formFields);
    }, 500);
});

// 📝 دریافت متن فرم
bot.on('text', (ctx) => {
    const userSession = ctx.session;

    if (userSession.step === UserStep.AWAITING_FORM) {
        const userText = ctx.message.text;
        
        // بررسی ساده‌تر فرم
        if (userText.includes('اسم و اسم خاندان:') && userText.includes('نژاد:')) {
            
            userSession.userData.formData = userText;
            userSession.step = UserStep.AWAITING_STICKER;

            const confirmationMessage = `بعد از اینکه فرمو پر کردین برگه رو ازتون میگیرم *
+ خب لطفا ی استیکر متحرک از رولتون که مربعی باشه ، گوشه‌ هاش تیز باشه و صورت کرکتر کامل معلوم باشه بدین`;

            return ctx.reply(confirmationMessage);
        } else {
            return ctx.reply('⚠️ لطفا فرم را دقیقاً به همان شکل که ارائه شد کپی و پر کنید.');
        }
    }
});

// 🎞️ دریافت استیکر - کد کاملاً اصلاح شده
bot.on('sticker', (ctx) => {
    console.log('استیکر دریافت شد:', ctx.message.sticker);
    
    const userSession = ctx.session;
    const sticker = ctx.message.sticker;

    if (userSession.step === UserStep.AWAITING_STICKER) {
        // بررسی کامل استیکر متحرک
        const isAnimated = sticker.is_animated || false;
        const isVideo = sticker.is_video || false;
        
        console.log('ویژگی های استیکر:', {
            is_animated: isAnimated,
            is_video: isVideo,
            set_name: sticker.set_name,
            emoji: sticker.emoji
        });

        if (isAnimated === true) {
            userSession.userData.stickerFileId = sticker.file_id;
            userSession.step = UserStep.AWAITING_TATTOO_PHOTO;

            return ctx.reply('✅ استیکر متحرک دریافت شد.\n+ حالا عکس خالکوبی/شاخ/بال یا اژدهای رولتون رو بفرستید 📸');
        } else {
            // پیام خطای دقیق‌تر
            return ctx.reply(`⚠️ **استیکر متحرک ارسال کنید!**

استیکر شما: ${sticker.emoji || '❓'}
نوع: ${isAnimated ? 'متحرک' : 'عادی'}

لطفاً یک استیکر متحرک (Animated Sticker) ارسال کنید. استیکرهای معمولی قابل قبول نیستند.

💡 **راهنما:**
- استیکرهای متحرک معمولاً دارای انیمیشن هستند
- می‌توانید از ربات @StickerPackBot برای ساخت استیکر متحرک استفاده کنید`);
        }
    } else {
        return ctx.reply('⚠️ لطفاً ابتدا فرم را پر کنید و سپس استیکر ارسال کنید.');
    }
});

// 🖼️ دریافت عکس
bot.on('photo', (ctx) => {
    const userSession = ctx.session;

    if (userSession.step === UserStep.AWAITING_TATTOO_PHOTO) {
        userSession.userData.tattooPhotoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        userSession.step = UserStep.AWAITING_SONG;

        return ctx.reply('✅ عکس خالکوبی دریافت شد.\n+ آهنگی که توصیف‌کننده شماست رو بفرستید 🎵');
    
    } else if (userSession.step === UserStep.AWAITING_COVER_PHOTO) {
        userSession.userData.coverPhotoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        userSession.step = 'COMPLETED';

        return finalizeApplication(ctx);
    }
});

// 🎵 دریافت آهنگ
bot.on('audio', (ctx) => {
    const userSession = ctx.session;

    if (userSession.step === UserStep.AWAITING_SONG) {
        userSession.userData.audioFileId = ctx.message.audio.file_id;
        userSession.userData.audioTitle = ctx.message.audio.title || 'بدون عنوان';
        userSession.step = UserStep.AWAITING_COVER_PHOTO;

        return ctx.reply('✅ آهنگ دریافت شد.\n+ حالا یک عکس برای کاور آهنگ بفرستید 🎼');
    }
});

// 📤 تابع نهایی‌سازی
async function finalizeApplication(ctx) {
    const userSession = ctx.session;
    const user = ctx.from;

    try {
        if (!REVIEW_GROUP_ID) {
            throw new Error('REVIEW_GROUP_ID تنظیم نشده است');
        }

        const userDataMessage = `📬 **درخواست شناسنامه جدید**\n\n👤 **نام کاربر:** ${user.first_name || 'ندارد'} ${user.last_name || ''}\n📱 **آیدی:** @${user.username || 'ندارد'}\n🔢 **آیدی عددی:** ${user.id}\n\n📋 **اطلاعات ارسالی:**\n${userSession.userData.formData}\n\n🧪 **زیرکلاس:** نامشخص\n\n📥 **ارسال‌شده توسط:** ${user.first_name || 'کاربر'} (${user.id})`;

        const reviewKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ قبول', `accept_${user.id}`), Markup.button.callback('❌ رد', `reject_${user.id}`)]
        ]);

        await ctx.telegram.sendMessage(REVIEW_GROUP_ID, userDataMessage, { 
            ...reviewKeyboard,
            parse_mode: 'Markdown'
        });

        // ارسال رسانه‌ها
        if (userSession.userData.stickerFileId) {
            await ctx.telegram.sendSticker(REVIEW_GROUP_ID, userSession.userData.stickerFileId, {
                caption: '🎞 استیکر ارسالی کاربر'
            });
        }
        
        if (userSession.userData.tattooPhotoFileId) {
            await ctx.telegram.sendPhoto(REVIEW_GROUP_ID, userSession.userData.tattooPhotoFileId, {
                caption: '🖼 عکس خالکوبی/شاخ/بال'
            });
        }

        await ctx.reply('✅ اطلاعات شما ثبت شد و به زودی در چنل شناسنامه ثبت خواهد شد ، به اکلیس خوش آمدید');
        
        // ریست سشن
        ctx.session.step = UserStep.START;
        ctx.session.userData = {};

    } catch (error) {
        console.error('خطا در ارسال به گروه بررسی:', error);
        await ctx.reply('❌ مشکلی در ثبت اطلاعات پیش آمد. لطفاً بعداً مجدداً تلاش کنید.');
    }
}

// ✅❌ مدیریت تصمیم ادمین
bot.action(/accept_(\d+)/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const adminUser = ctx.callbackQuery.from;

    try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n--- ✅ **تایید شده** ---');

        await ctx.telegram.sendMessage(targetUserId, '🎉 **درخواست شناسنامه شما تایید شد!**\n\nبه خانواده اکلیس خوش آمدید.');

        if (ACCEPTED_GROUP_ID) {
            const acceptedMessage = `🎊 **کاربر جدید تایید شد**\n\n👤 نام: ${adminUser.first_name || 'ندارد'}\n🆔 آیدی عددی: ${adminUser.id}\n📧 آیدی کاربری: @${adminUser.username || 'ندارد'}`;
            await ctx.telegram.sendMessage(ACCEPTED_GROUP_ID, acceptedMessage);
        }

        await ctx.answerCbQuery('کاربر تایید شد.');

    } catch (error) {
        console.error('خطا در پردازش تایید:', error);
        await ctx.answerCbQuery('خطا در پردازش');
    }
});

bot.action(/reject_(\d+)/, async (ctx) => {
    const targetUserId = ctx.match[1];

    try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n--- ❌ **رد شده** ---');

        await ctx.telegram.sendMessage(targetUserId, '❌ **متاسفانه درخواست شناسنامه شما رد شد.**');
        await ctx.answerCbQuery('کاربر رد شد.');

    } catch (error) {
        console.error('خطا در پردازش رد:', error);
        await ctx.answerCbQuery('خطا در پردازش');
    }
});

// راه‌اندازی ربات تلگرام
bot.launch().then(() => {
    console.log('✅ ربات تلگرام راه‌اندازی شد');
}).catch((err) => {
    console.error('خطا در راه‌اندازی ربات:', err);
});

// راه‌اندازی سرور اکسپرس برای Render
app.get('/', (req, res) => {
  res.send('ربات اکلیس در حال اجراست!');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ سرور روی پورت ${PORT} در حال اجراست`);
});

// مدیریت خاموشی
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
