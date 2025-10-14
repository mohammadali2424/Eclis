const { Telegraf, Markup, session } = require('telegraf');

// توکن ربات خود را از @BotFather دریافت و اینجا قرار دهید
const BOT_TOKEN = '7971581878:AAEgltaGBY9mOCEgBOi2syPkFlQQWTcxhlU';

// آیدی عددی گروه‌ها را قرار دهید (مقادیر منفی برای گروه‌ها)
const REVIEW_GROUP_ID = -1002123456789; // گروه بررسی درخواست‌ها
const ACCEPTED_GROUP_ID = -1002987654321; // گروه کاربران تایید شده

const bot = new Telegraf(BOT_TOKEN);

// استفاده از سشن برای ذخیره وضعیت هر کاربر
bot.use(session({ defaultSession: () => ({}) }));

// تعریف وضعیت‌های مختلف ربات
const UserStep = {
    START: 'start',
    AWAITING_FORM: 'awaiting_form',
    AWAITING_STICKER: 'awaiting_sticker',
    AWAITING_TATTOO_PHOTO: 'awaiting_tattoo_photo',
    AWAITING_SONG: 'awaiting_song',
    AWAITING_COVER_PHOTO: 'awaiting_cover_photo',
    COMPLETED: 'completed'
};

// هندلر دستور /start
bot.start((ctx) => {
    const userName = ctx.from.first_name || 'کاربر';
    const welcomeMessage = `با ورودتون از جام بلند میشم و با لبخند گرمی بهتون نگاه میکنم دستامو بهم قفل میکنم *\nدست راستم رو خم شده با حالت خدمتکار ها روبه‌روی شکمم نگه میدارم *\n+ خوش اومدین (${userName})\nمن درویدم، دستیار شما توی سرزمین اکلیس\n\nبرای شروع یکی از گزینه‌های زیر رو انتخاب کن:`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('<< ساخت شناسنامه >>', 'create_id')]
    ]);

    ctx.session.step = UserStep.START;
    ctx.session.userData = {};

    return ctx.reply(welcomeMessage, keyboard);
});

// هندلر کلیک روی دکمه "ساخت شناسنامه"
bot.action('create_id', (ctx) => {
    ctx.session.step = UserStep.AWAITING_FORM;
    ctx.session.userData = {
        userId: ctx.from.id,
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name
    };

    const formInstructions = `+ خوش اومدین لطفا بشینید و اطلاعاتتون کامل کنید\nاز توی کشو برگه‌ای رو بیرون میارم و به همراه خودکار جلوتون می‌ذارم\n+ حتما قبل از نوشتن فرم توضیحات چنل @Eclis_Darkness رو بخونید`;
    const formFields = `🪶اسم و اسم خاندان:\n🪶نژاد:\n🪶تاریخ تولد به میلادی:\n🪶اسم پدر / مادر:`;

    ctx.editMessageText(formInstructions);
    return ctx.reply(formFields);
});

// هندلر دریافت متن فرم
bot.on('text', async (ctx) => {
    const userSession = ctx.session;

    if (userSession.step === UserStep.AWAITING_FORM) {
        const userText = ctx.message.text;
        
        // بررسی وجود کلیدواژه‌های ضروری در متن
        if (userText.includes('اسم و اسم خاندان:') && 
            userText.includes('نژاد:') && 
            userText.includes('تاریخ تولد به میلادی:') && 
            userText.includes('اسم پدر / مادر:')) {
            
            userSession.userData.formData = userText;
            userSession.step = UserStep.AWAITING_STICKER;

            const confirmationMessage = `بعد از اینکه فرمو پر کردین برگه رو ازتون میگیرم *\n+ خب لطفا ی استیکر متحرک از رولتون که مربعی باشه ، گوشه‌ هاش تیز باشه و صورت کرکتر کامل معلوم باشه بدین`;
            return ctx.reply(confirmationMessage);
        } else {
            return ctx.reply('⚠️ لطفا فرم را دقیقاً به همان شکل که ارائه شد کپی و پر کنید. مطمئن شوید همه بخش‌ها شامل:\n- اسم و اسم خاندان:\n- نژاد:\n- تاریخ تولد به میلادی:\n- اسم پدر / مادر:\nپر شده باشند.');
        }
    }
});

// هندلر دریافت استیکر
bot.on('sticker', (ctx) => {
    const userSession = ctx.session;

    if (userSession.step === UserStep.AWAITING_STICKER) {
        if (ctx.message.sticker.is_animated) {
            userSession.userData.stickerFileId = ctx.message.sticker.file_id;
            userSession.step = UserStep.AWAITING_TATTOO_PHOTO;

            return ctx.reply('✅ استیکر دریافت شد.\n+ حالا عکس خالکوبی/شاخ/بال یا اژدهای رولتون رو بفرستید 📸');
        } else {
            return ctx.reply('⚠️ لطفا یک **استیکر متحرک** ارسال کنید. استیکر معمولی قابل قبول نیست.');
        }
    }
});

// هندلر دریافت عکس
bot.on('photo', (ctx) => {
    const userSession = ctx.session;

    if (userSession.step === UserStep.AWAITING_TATTOO_PHOTO) {
        // ذخیره بزرگترین سایز عکس
        userSession.userData.tattooPhotoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        userSession.step = UserStep.AWAITING_SONG;

        return ctx.reply('✅ عکس خالکوبی دریافت شد.\n+ آهنگی که توصیف‌کننده شماست رو بفرستید 🎵');
    
    } else if (userSession.step === UserStep.AWAITING_COVER_PHOTO) {
        userSession.userData.coverPhotoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        userSession.step = UserStep.COMPLETED;

        // پایان مراحل - ارسال اطلاعات برای بررسی
        return finalizeApplication(ctx);
    }
});

// هندلر دریافت آهنگ
bot.on('audio', (ctx) => {
    const userSession = ctx.session;

    if (userSession.step === UserStep.AWAITING_SONG) {
        userSession.userData.audioFileId = ctx.message.audio.file_id;
        userSession.userData.audioTitle = ctx.message.audio.title || 'بدون عنوان';
        userSession.userData.audioPerformer = ctx.message.audio.performer || 'ناشناس';
        userSession.step = UserStep.AWAITING_COVER_PHOTO;

        return ctx.reply('✅ آهنگ دریافت شد.\n+ حالا یک عکس برای کاور آهنگ بفرستید 🎼');
    }
});

// تابع نهایی‌سازی و ارسال درخواست
async function finalizeApplication(ctx) {
    const userSession = ctx.session;
    const user = ctx.from;

    try {
        // ساخت پیام حاوی اطلاعات کاربر
        const userDataMessage = `📬 **درخواست شناسنامه جدید**\n\n👤 **نام کاربر:** ${user.first_name || 'ندارد'} ${user.last_name || ''}\n📱 **آیدی:** @${user.username || 'ندارد'}\n🔢 **آیدی عددی:** ${user.id}\n\n📋 **اطلاعات ارسالی:**\n\`\`\`\n${userSession.userData.formData}\n\`\`\`\n\n🧪 **زیرکلاس:** نامشخص\n\n📥 **ارسال‌شده توسط:** ${user.first_name || 'کاربر'} (${user.id})`;

        // ایجاد دکمه‌های قبول و رد
        const reviewKeyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ قبول', `accept_${user.id}`),
                Markup.button.callback('❌ رد', `reject_${user.id}`)
            ]
        ]);

        // ارسال به گروه بررسی
        await ctx.telegram.sendMessage(
            REVIEW_GROUP_ID, 
            userDataMessage, 
            { 
                ...reviewKeyboard,
                parse_mode: 'Markdown'
            }
        );

        // ارسال فایل‌های رسانه‌ای به گروه بررسی
        if (userSession.userData.stickerFileId) {
            await ctx.telegram.sendSticker(REVIEW_GROUP_ID, userSession.userData.stickerFileId);
        }
        
        if (userSession.userData.tattooPhotoFileId) {
            await ctx.telegram.sendPhoto(REVIEW_GROUP_ID, userSession.userData.tattooPhotoFileId, {
                caption: '🖼 عکس خالکوبی/شاخ/بال'
            });
        }
        
        if (userSession.userData.audioFileId) {
            await ctx.telegram.sendAudio(REVIEW_GROUP_ID, userSession.userData.audioFileId, {
                title: userSession.userData.audioTitle,
                performer: userSession.userData.audioPerformer,
                caption: '🎵 آهنگ انتخابی کاربر'
            });
        }
        
        if (userSession.userData.coverPhotoFileId) {
            await ctx.telegram.sendPhoto(REVIEW_GROUP_ID, userSession.userData.coverPhotoFileId, {
                caption: '🎼 کاور آهنگ'
            });
        }

        // اطلاع به کاربر
        await ctx.reply('✅ اطلاعات شما ثبت شد و به زودی در چنل شناسنامه ثبت خواهد شد ، به اکلیس خوش آمدید');

        // پاک کردن سشن کاربر
        ctx.session = {};

    } catch (error) {
        console.error('خطا در ارسال به گروه بررسی:', error);
        await ctx.reply('❌ متأسفانه مشکلی در ثبت اطلاعات پیش آمد. لطفاً بعداً مجدداً تلاش کنید.');
    }
}

// هندلر تصمیم ادمین - قبول
bot.action(/accept_(\d+)/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const adminUser = ctx.callbackQuery.from;

    try {
        // حذف دکمه‌ها از پیام اصلی
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        
        // اضافه کردن متن تایید به پیام
        const originalText = ctx.callbackQuery.message.text;
        await ctx.editMessageText(originalText + '\n\n--- ✅ **تایید شده توسط ادمین** ---', { 
            parse_mode: 'Markdown' 
        });

        // اطلاع‌رسانی به کاربر
        await ctx.telegram.sendMessage(
            targetUserId, 
            '🎉 **درخواست شناسنامه شما تایید شد!**\n\nبه خانواده اکلیس خوش آمدید. امیدواریم اوقات خوبی را در سرزمین ما سپری کنید.'
        );

        // ارسال پیام تایید به گروه مخصوص کاربران پذیرفته شده
        const acceptedMessage = `🎊 **کاربر جدید تایید شد**\n\n👤 نام: ${adminUser.first_name || 'ندارد'} ${adminUser.last_name || ''}\n🆔 آیدی عددی: ${adminUser.id}\n📧 آیدی کاربری: @${adminUser.username || 'ندارد'}\n\n✅ کاربر با موفقیت به جامعه اکلیس پیوست.`;
        
        await ctx.telegram.sendMessage(ACCEPTED_GROUP_ID, acceptedMessage, {
            parse_mode: 'Markdown'
        });

        await ctx.answerCbQuery('کاربر تایید شد و اطلاع‌رسانی انجام شد.');

    } catch (error) {
        console.error('خطا در پردازش تایید:', error);
        await ctx.answerCbQuery('خطا در پردازش درخواست');
    }
});

// هندلر تصمیم ادمین - رد
bot.action(/reject_(\d+)/, async (ctx) => {
    const targetUserId = ctx.match[1];

    try {
        // حذف دکمه‌ها از پیام اصلی
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        
        // اضافه کردن متن رد به پیام
        const originalText = ctx.callbackQuery.message.text;
        await ctx.editMessageText(originalText + '\n\n--- ❌ **رد شده توسط ادمین** ---', { 
            parse_mode: 'Markdown' 
        });

        // اطلاع‌رسانی به کاربر
        await ctx.telegram.sendMessage(
            targetUserId, 
            '❌ **متاسفانه درخواست شناسنامه شما رد شد.**\n\nدر صورت تمایل به پیگیری دلیل رد درخواست، با پشتیبانی تماس بگیرید.'
        );

        await ctx.answerCbQuery('کاربر رد شد و اطلاع‌رسانی انجام شد.');

    } catch (error) {
        console.error('خطا در پردازش رد:', error);
        await ctx.answerCbQuery('خطا در پردازش درخواست');
    }
});

// هندلر پیام‌های غیرمنتظره
bot.on('message', (ctx) => {
    const userSession = ctx.session;
    
    if (!userSession.step || userSession.step === UserStep.START) {
        return ctx.reply('لطفا از دستور /start برای شروع استفاده کنید.');
    }
    
    // اگر کاربر در مرحله خاصی باشد اما پیام نامربوط بفرستد
    if (userSession.step === UserStep.AWAITING_STICKER && ctx.message.text) {
        return ctx.reply('⚠️ لطفا یک استیکر متحرک ارسال کنید.');
    }
    
    if ((userSession.step === UserStep.AWAITING_TATTOO_PHOTO || userSession.step === UserStep.AWAITING_COVER_PHOTO) && ctx.message.text) {
        return ctx.reply('⚠️ لطفا یک عکس ارسال کنید.');
    }
    
    if (userSession.step === UserStep.AWAITING_SONG && ctx.message.text) {
        return ctx.reply('⚠️ لطفا یک فایل صوتی ارسال کنید.');
    }
});

// هندلر خطاهای全局
bot.catch((err, ctx) => {
    console.error('خطا در ربات:', err);
    ctx.reply('❌ متأسفانه خطایی در سرویس رخ داده است. لطفاً بعداً تلاش کنید.');
});

// راه‌اندازی ربات
bot.launch().then(() => {
    console.log('✅ ربات اکلیس با موفقیت راه‌اندازی شد...');
    console.log('🤖 ربات در حال اجرا است...');
}).catch((err) => {
    console.error('خطا در راه‌اندازی ربات:', err);
});

// مدیریت خاموشی صحیح
process.once('SIGINT', () => {
    console.log('🛑 در حال خاموش کردن ربات...');
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('🛑 در حال خاموش کردن ربات...');
    bot.stop('SIGTERM');
});

