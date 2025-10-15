const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { message } = require('telegraf/filters');

// ✅ تنظیم توکن ربات از متغیر محیطی (برای امنیت بیشتر)
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const CHANNEL_ID = process.env.CHANNEL_ID || -1001234567890; // آیدی عددی کانال/گروه مقصد
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID || -1001234567891; // آیدی عددی گروه مدیریت

// ✅ بررسی وجود توکن
if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('❌ خطا: BOT_TOKEN تنظیم نشده است.');
  process.exit(1);
}

// ✅ ایجاد نمونه ربات
const bot = new Telegraf(BOT_TOKEN);

// ✅ ذخیره سازی موقت داده‌ها (در محیط تولید از دیتابیس استفاده کنید)
const userSessions = new Map();

// ✅ تعریف "صحنه" (Scene) برای جمع آوری اطلاعات کاربر
const userInfoWizard = new Scenes.WizardScene(
  'user-info-wizard',

  // گام اول: نمایش پیام خوش آمدگویی و درخواست ساخت شناسنامه
  async (ctx) => {
    try {
      const welcomeName = ctx.from.first_name || 'کاربر';
      await ctx.reply(
        `با ورودتون از جام بلند میشم و با لبخند گرمی بهتون نگاه میکنم دستامو بهم قفل میکنم *\n` +
        `دست راستم رو خم شده با حالت خدمتکار ها روبه‌روی شکمم نگه میدارم *\n\n` +
        `+ خوش اومدین (${welcomeName})\n` +
        `من درویدم، دستیار شما توی سرزمین اکلیس\n\n` +
        `برای شروع یکی از گزینه‌های زیر رو انتخاب کن:`
      );

      await ctx.reply(
        '+ خوش اومدین لطفا بشینید و اطلاعاتتون کامل کنید\n' +
        'از توی کشو برگه‌ای رو بیرون میارم و به همراه خودکار جلوتون می‌ذارم\n\n' +
        '+ حتما قبل از نوشتن فرم توضیحات چنل @Eclis_Darkness رو بخونید',
        Markup.keyboard([['<< ساخت شناسنامه >>']]).resize()
      );
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in step 1:', error);
      await ctx.reply('⚡ خطایی رخ داد. لطفا دوباره تلاش کنید.');
      return ctx.scene.leave();
    }
  },

  // گام دوم: دریافت درخواست ساخت شناسنامه و ارسال قالب فرم
  async (ctx) => {
    if (!ctx.message?.text || !ctx.message.text.includes('ساخت شناسنامه')) {
      await ctx.reply('⚠️ لطفا فقط از دکمه "ساخت شناسنامه" استفاده کنید.');
      return;
    }

    try {
      const formTemplate = 
        '🪶اسم و اسم خاندان:\n' +
        '🪶نژاد:\n' +
        '🪶تاریخ تولد به میلادی:\n' +
        '🪶اسم پدر / مادر:';

      await ctx.reply(
        'بعد از اینکه فرمو پر کردین برگه رو ازتون میگیرم *',
        Markup.removeKeyboard()
      );

      await ctx.reply(formTemplate);
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in step 2:', error);
      await ctx.reply('⚡ خطایی رخ داد. لطفا دوباره تلاش کنید.');
      return ctx.scene.leave();
    }
  },

  // گام سوم: دریافت اطلاعات تکمیلی کاربر
  async (ctx) => {
    const userText = ctx.message?.text;
    if (!userText) {
      await ctx.reply('⚠️ لطفا اطلاعات خواسته شده را به صورت متن ارسال کنید.');
      return;
    }

    try {
      // ذخیره موقت داده‌ها
      if (!userSessions.has(ctx.from.id)) {
        userSessions.set(ctx.from.id, {});
      }
      const userData = userSessions.get(ctx.from.id);
      userData.profileText = userText;

      await ctx.reply(
        '+ خب لطفا ی استیکر متحرک از رولتون که مربعی باشه ، گوشه‌ هاش تیز باشه و صورت کرکتر کامل معلوم باشه بدین'
      );
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in step 3:', error);
      await ctx.reply('⚡ خطایی رخ داد. لطفا دوباره تلاش کنید.');
      return ctx.scene.leave();
    }
  },

  // گام چهارم: دریافت استیکر
  async (ctx) => {
    if (!ctx.message?.sticker) {
      await ctx.reply('⚠️ لطفا فقط استیکر ارسال کنید.');
      return;
    }

    try {
      const userData = userSessions.get(ctx.from.id);
      userData.stickerFileId = ctx.message.sticker.file_id;

      await ctx.reply('+ حالا عکس خالکوبی/شاخ/بال یا اژدهای رولتون رو بفرستید 📸');
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in step 4:', error);
      await ctx.reply('⚡ خطایی رخ داد. لطفا دوباره تلاش کنید.');
      return ctx.scene.leave();
    }
  },

  // گام پنجم: دریافت عکس اول
  async (ctx) => {
    if (!ctx.message?.photo) {
      await ctx.reply('⚠️ لطفا فقط عکس ارسال کنید.');
      return;
    }

    try {
      const userData = userSessions.get(ctx.from.id);
      userData.tattooPhotoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

      await ctx.reply('+ آهنگی که توصیف‌کننده شماست رو بفرستید 🎵');
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in step 5:', error);
      await ctx.reply('⚡ خطایی رخ داد. لطفا دوباره تلاش کنید.');
      return ctx.scene.leave();
    }
  },

  // گام ششم: دریافت آهنگ
  async (ctx) => {
    if (!ctx.message?.audio) {
      await ctx.reply('⚠️ لطفا فقط فایل آهنگ ارسال کنید.');
      return;
    }

    try {
      const userData = userSessions.get(ctx.from.id);
      userData.songFileId = ctx.message.audio.file_id;

      await ctx.reply('+ حالا یک عکس برای کاور آهنگ بفرستید 🎼');
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in step 6:', error);
      await ctx.reply('⚡ خطایی رخ داد. لطفا دوباره تلاش کنید.');
      return ctx.scene.leave();
    }
  },

  // گام هفتم: دریافت عکس دوم و نهایی‌سازی
  async (ctx) => {
    if (!ctx.message?.photo) {
      await ctx.reply('⚠️ لطفا فقط عکس ارسال کنید.');
      return;
    }

    try {
      const userData = userSessions.get(ctx.from.id);
      userData.coverPhotoId = ctx.message.photo[ctx.message.photo.length - 1];
      userData.userId = ctx.from.id;
      userData.username = ctx.from.username || 'ندارد';
      userData.firstName = ctx.from.first_name || 'ندارد';
      userData.submitDate = new Date().toLocaleDateString('fa-IR');

      // ارسال اطلاعات به گروه مدیریت
      const adminMessage = 
        `👤 نام: 🪶 ${userData.firstName}\n` +
        `🆔 آیدی: @${userData.username}\n` +
        `📊 آیدی عددی: ${userData.userId}\n\n` +
        `📋 اطلاعات ارسالی:\n${userData.profileText}\n\n` +
        `📅 تاریخ ارسال: ${userData.submitDate}`;

      const approveButtons = Markup.inlineKeyboard([
        [Markup.button.callback('✅ قبول', 'approve_user')],
        [Markup.button.callback('❌ رد', 'reject_user')]
      ]);

      await ctx.telegram.sendMessage(ADMIN_GROUP_ID, adminMessage, {
        ...approveButtons,
        parse_mode: 'HTML'
      });

      // ارسال فایل‌های رسانه‌ای به گروه مدیریت
      if (userData.stickerFileId) {
        await ctx.telegram.sendSticker(ADMIN_GROUP_ID, userData.stickerFileId);
      }
      if (userData.tattooPhotoId) {
        await ctx.telegram.sendPhoto(ADMIN_GROUP_ID, userData.tattooPhotoId);
      }
      if (userData.songFileId) {
        await ctx.telegram.sendAudio(ADMIN_GROUP_ID, userData.songFileId);
      }
      if (userData.coverPhotoId) {
        await ctx.telegram.sendPhoto(ADMIN_GROUP_ID, userData.coverPhotoId.file_id);
      }

      await ctx.reply(
        '✅ اطلاعات شما ثبت شد و به زودی در چنل شناسنامه ثبت خواهد شد ، به اکلیس خوش آمدید',
        Markup.removeKeyboard()
      );

      userSessions.delete(ctx.from.id);
      return ctx.scene.leave();
    } catch (error) {
      console.error('Error in step 7:', error);
      await ctx.reply('⚡ خطایی در ثبت نهایی اطلاعات رخ داد. لطفا با پشتیبانی تماس بگیرید.');
      return ctx.scene.leave();
    }
  }
);

// ✅ تنظیم stage برای مدیریت صحنه‌ها
const stage = new Scenes.Stage([userInfoWizard]);
bot.use(session());
bot.use(stage.middleware());

// ✅ هندلر دکمه‌های تایید/رد در گروه مدیریت
bot.action('approve_user', async (ctx) => {
  try {
    await ctx.answerCbQuery('کاربر تایید شد ✅');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    
    const originalMessage = ctx.update.callback_query.message;
    const successMessage = 
      `🎉 کاربر جدید تایید شد!\n\n` +
      `${originalMessage.text}\n\n` +
      `وضعیت: ✅ تایید شده`;
    
    await ctx.telegram.sendMessage(CHANNEL_ID, successMessage);
    
  } catch (error) {
    console.error('Error approving user:', error);
    await ctx.answerCbQuery('خطا در تایید کاربر');
  }
});

bot.action('reject_user', async (ctx) => {
  try {
    await ctx.answerCbQuery('کاربر رد شد ❌');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    
    const originalMessage = ctx.update.callback_query.message;
    const rejectMessage = 
      `❌ درخواست کاربر رد شد\n\n` +
      `آیدی عددی: ${originalMessage.text.match(/آیدی عددی: (\d+)/)?.[1] || 'نامشخص'}`;
    
    await ctx.telegram.sendMessage(ADMIN_GROUP_ID, rejectMessage);
    
  } catch (error) {
    console.error('Error rejecting user:', error);
    await ctx.answerCbQuery('خطا در رد کاربر');
  }
});

// ✅ هندلر شروع ربات
bot.start(async (ctx) => {
  try {
    await ctx.scene.enter('user-info-wizard');
  } catch (error) {
    console.error('Error starting bot:', error);
    await ctx.reply('⚡ خطایی در شروع ربات رخ داد. لطفا دوباره تلاش کنید.');
  }
});

// ✅ هندلر کمک
bot.help((ctx) => ctx.reply('برای شروع دوباره از دستور /start استفاده کنید.'));

// ✅ راه‌اندازی ربات با وب‌هوک (مخصوص Render)
const startWebhook = async () => {
  try {
    const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL + '/webhook';
    await bot.telegram.setWebhook(WEBHOOK_URL);
    console.log('✅ Webhook setup successfully:', WEBHOOK_URL);
    
    // شروع ربات در حالت وب‌هوک
    await bot.launch({
      webhook: {
        domain: WEBHOOK_URL,
        port: process.env.PORT || 3000,
      }
    });
    console.log('✅ Bot is running in webhook mode');
  } catch (error) {
    console.error('❌ Error setting up webhook:', error);
    process.exit(1);
  }
};

// ✅ شروع برنامه
if (process.env.RENDER) {
  startWebhook();
} else {
  // حالت توسعه (polling)
  bot.launch().then(() => {
    console.log('✅ Bot is running in development mode (polling)');
  });
}

// ✅ مدیریت خروج تمیز
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot;
