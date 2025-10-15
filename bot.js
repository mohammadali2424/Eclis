const { Telegraf, Scenes, session, Markup } = require('telegraf');

// ✅ تنظیم توکن ربات از متغیر محیطی
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const CHANNEL_ID = process.env.CHANNEL_ID || -1001234567890;
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID || -1001234567891;

// ✅ بررسی وجود توکن
if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('❌ Error: BOT_TOKEN is not set.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const userSessions = new Map();

// ✅ تابع تاخیر با قابلیت retry
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ✅ تعریف صحنه برای جمع‌آوری اطلاعات
const userInfoWizard = new Scenes.WizardScene(
  'user-info-wizard',

  // Step 1: شروع و نمایش پیام خوش آمدگویی
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
        `+ خوش اومدین لطفا بشینید و اطلاعاتتون کامل کنید\n` +
        `از توی کشو برگه‌ای رو بیرون میارم و به همراه خودکار جلوتون می‌ذارم\n\n` +
        `+ حتما قبل از نوشتن فرم توضیحات چنل @Eclis_Darkness رو بخونید`,
        Markup.keyboard([['<< ساخت شناسنامه >>']]).resize()
      );
      
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in step 1:', error);
      await ctx.reply('⚡ خطایی رخ داد. لطفا دوباره تلاش کنید.');
      return ctx.scene.leave();
    }
  },

  // Step 2: ایجاد فرم و نمایش قالب
  async (ctx) => {
    if (!ctx.message || !ctx.message.text || !ctx.message.text.includes('ساخت شناسنامه')) {
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

  // Step 3: دریافت اطلاعات فرم کاربر
  async (ctx) => {
    const userText = ctx.message && ctx.message.text;
    if (!userText) {
      await ctx.reply('⚠️ لطفا اطلاعات خواسته شده را به صورت متن ارسال کنید.');
      return;
    }

    try {
      if (!userSessions.has(ctx.from.id)) {
        userSessions.set(ctx.from.id, {});
      }
      const userData = userSessions.get(ctx.from.id);
      userData.profileText = userText;

      await ctx.reply('+ خب لطفا ی استیکر متحرک از رولتون که مربعی باشه ، گوشه‌ هاش تیز باشه و صورت کرکتر کامل معلوم باشه بدین');
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in step 3:', error);
      await ctx.reply('⚡ خطایی رخ داد. لطفا دوباره تلاش کنید.');
      return ctx.scene.leave();
    }
  },

  // Step 4: دریافت استیکر
  async (ctx) => {
    if (!ctx.message || !ctx.message.sticker) {
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

  // Step 5: دریافت عکس خالکوبی
  async (ctx) => {
    if (!ctx.message || !ctx.message.photo) {
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

  // Step 6: دریافت آهنگ
  async (ctx) => {
    if (!ctx.message || !ctx.message.audio) {
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

  // Step 7: دریافت عکس کاور و نهایی‌سازی
  async (ctx) => {
    if (!ctx.message || !ctx.message.photo) {
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

      // ارسال پیام به گروه مدیریت با retry
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          await ctx.telegram.sendMessage(ADMIN_GROUP_ID, adminMessage, {
            ...approveButtons,
            parse_mode: 'HTML'
          });
          break;
        } catch (error) {
          retryCount++;
          if (retryCount === maxRetries) throw error;
          console.log(`Retry ${retryCount} for sending admin message...`);
          await delay(2000);
        }
      }

      // ارسال فایل‌های رسانه‌ای
      const mediaFiles = [
        { type: 'sticker', id: userData.stickerFileId, method: 'sendSticker' },
        { type: 'photo', id: userData.tattooPhotoId, method: 'sendPhoto' },
        { type: 'audio', id: userData.songFileId, method: 'sendAudio' },
        { type: 'photo', id: userData.coverPhotoId.file_id, method: 'sendPhoto' }
      ];

      for (const media of mediaFiles) {
        if (media.id) {
          try {
            await ctx.telegram[media.method](ADMIN_GROUP_ID, media.id);
            await delay(1000); // تاخیر بین ارسال فایل‌ها
          } catch (error) {
            console.error(`Error sending ${media.type}:`, error);
          }
        }
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

// ✅ هندلر دکمه‌های تایید/رد
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
    const userMatch = originalMessage.text.match(/آیدی عددی: (\d+)/);
    const userId = userMatch ? userMatch[1] : 'نامشخص';
    
    const rejectMessage = 
      `❌ درخواست کاربر رد شد\n\n` +
      `آیدی عددی: ${userId}`;
    
    await ctx.telegram.sendMessage(ADMIN_GROUP_ID, rejectMessage);
    
  } catch (error) {
    console.error('Error rejecting user:', error);
    await ctx.answerCbQuery('خطا در رد کاربر');
  }
});

// ✅ هندلر شروع
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

// ✅ تابع راه‌اندازی وب‌هوک با قابلیت retry
const startWebhookWithRetry = async (retryCount = 0) => {
  const maxRetries = 5;
  const baseDelay = 2000; // 2 seconds
  
  try {
    const WEBHOOK_DOMAIN = process.env.RENDER_EXTERNAL_URL;
    if (!WEBHOOK_DOMAIN) {
      throw new Error('RENDER_EXTERNAL_URL is not set');
    }
    
    const WEBHOOK_URL = `${WEBHOOK_DOMAIN}/webhook`;
    
    console.log(`🔄 Setting up webhook (attempt ${retryCount + 1})...`);
    
    // حذف وب‌هوک قبلی برای جلوگیری از تداخل
    await bot.telegram.deleteWebhook();
    await delay(1000);
    
    // تنظیم وب‌هوک جدید
    await bot.telegram.setWebhook(WEBHOOK_URL);
    console.log('✅ Webhook setup successfully:', WEBHOOK_URL);
    
    // راه‌اندازی ربات در حالت وب‌هوک
    await bot.launch({
      webhook: {
        port: process.env.PORT || 3000,
      }
    });
    
    console.log('✅ Bot is running in webhook mode');
  } catch (error) {
    console.error(`❌ Webhook setup failed (attempt ${retryCount + 1}):`, error.message);
    
    if (retryCount < maxRetries - 1) {
      const waitTime = baseDelay * Math.pow(2, retryCount);
      console.log(`⏳ Retrying in ${waitTime/1000} seconds...`);
      await delay(waitTime);
      return startWebhookWithRetry(retryCount + 1);
    } else {
      console.error('❌ All webhook setup attempts failed. Switching to polling mode...');
      
      // در صورت شکست وب‌هوک، به حالت polling سوییچ می‌کنیم
      try {
        await bot.launch();
        console.log('✅ Bot is running in polling mode (fallback)');
      } catch (pollingError) {
        console.error('❌ Polling mode also failed:', pollingError);
        process.exit(1);
      }
    }
  }
};

// ✅ شروع برنامه
if (process.env.RENDER) {
  console.log('🚀 Starting bot in webhook mode for Render...');
  startWebhookWithRetry();
} else {
  console.log('🔧 Starting bot in development mode (polling)...');
  bot.launch().then(() => {
    console.log('✅ Bot is running in development mode (polling)');
  });
}

// ✅ مدیریت graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  bot.stop('SIGTERM');
});

module.exports = bot;
