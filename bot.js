const { Telegraf, Scenes, session, Markup } = require('telegraf');
const express = require('express');

// ✅ تنظیم توکن ربات از متغیر محیطی
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID;

// ✅ بررسی وجود توکن‌های ضروری
if (!BOT_TOKEN) {
  console.error('❌ Error: BOT_TOKEN is not set.');
  process.exit(1);
}

if (!CHANNEL_ID || !ADMIN_GROUP_ID) {
  console.error('❌ Error: CHANNEL_ID or ADMIN_GROUP_ID is not set.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// middleware برای parse کردن JSON
app.use(express.json());

const userSessions = new Map();
const approvedUsers = new Map(); // ذخیره کاربران تایید شده

// ✅ تابع برای تولید شماره شناسنامه
function generateCertificateNumber() {
  return `#${approvedUsers.size + 1}`;
}

// ✅ تابع برای ذخیره کاربر تایید شده
function saveApprovedUser(userId, userData) {
  approvedUsers.set(userId, {
    ...userData,
    certificateNumber: generateCertificateNumber(),
    approvedAt: new Date().toISOString()
  });
}

// ✅ تابع برای بررسی آیا کاربر قبلاً ثبت نام کرده
function isUserRegistered(userId) {
  return approvedUsers.has(userId);
}

// ✅ تعریف صحنه برای جمع‌آوری اطلاعات
const userInfoWizard = new Scenes.WizardScene(
  'user-info-wizard',

  // Step 1: شروع و نمایش پیام خوش آمدگویی
  async (ctx) => {
    try {
      // بررسی آیا کاربر قبلاً ثبت نام کرده
      if (isUserRegistered(ctx.from.id)) {
        const userData = approvedUsers.get(ctx.from.id);
        await ctx.reply(
          `❌ شما قبلاً شناسنامه ساخته‌اید!\n\n` +
          `📋 شماره شناسنامه شما: ${userData.certificateNumber}\n` +
          `✅ تاریخ تایید: ${new Date(userData.approvedAt).toLocaleDateString('fa-IR')}\n\n` +
          `اگر مشکلی وجود دارد با پشتیبانی تماس بگیرید.`
        );
        return ctx.scene.leave();
      }

      const welcomeName = ctx.from.first_name || 'کاربر';
      
      await ctx.reply(
        'با ورودتون از جام بلند میشم و با لبخند گرمی بهتون نگاه میکنم دستامو بهم قفل میکنم *\n' +
        'دست راستم رو خم شده با حالت خدمتکار ها روبه‌روی شکمم نگه میدارم *\n\n' +
        `+ خوش اومدین (${welcomeName})\n` +
        'من درویدم، دستیار شما توی سرزمین اکلیس\n\n' +
        'برای شروع یکی از گزینه‌های زیر رو انتخاب کن:'
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
      await ctx.reply('⚡ خطایی رخ داد. لطفا دوبا��ه تلاش کنید.');
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

      await ctx.reply('+ حالا یک ع��س برای کاور آهنگ بفرستید 🎼');
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
        [
          Markup.button.callback('✅ قبول', `approve_${ctx.from.id}`),
          Markup.button.callback('❌ رد', `reject_${ctx.from.id}`)
        ]
      ]);

      // ذخیره داده کاربر در session برای استفاده در callback
      userSessions.set(ctx.from.id, userData);

      await ctx.telegram.sendMessage(ADMIN_GROUP_ID, adminMessage, approveButtons);

      // ارسال فایل‌های رسانه‌ای
      if (userData.stickerFileId) {
        await ctx.telegram.sendSticker(ADMIN_GROUP_ID, userData.stickerFileId);
      }
      if (userData.tattooPhotoId) {
        await ctx.telegram.sendPhoto(ADMIN_GROUP_ID, userData.tattooPhotoId);
      }
      if (userData.songFileId) {
        await ctx.telegram.sendAudio(ADMIN_GROUP_ID, userData.songFileId);
      }
      if (userData.coverPhotoId && userData.coverPhotoId.file_id) {
        await ctx.telegram.sendPhoto(ADMIN_GROUP_ID, userData.coverPhotoId.file_id);
      }

      await ctx.reply(
        '✅ اطلاعات شما ثبت شد و به زودی در چنل شناسنامه ثبت خواهد شد ، به اکلیس خوش آمدید',
        Markup.removeKeyboard()
      );

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
bot.action(/approve_(\d+)/, async (ctx) => {
  try {
    const userId = ctx.match[1];
    const userData = userSessions.get(parseInt(userId));
    
    if (!userData) {
      await ctx.answerCbQuery('❌ اطلاعات کاربر یافت نشد');
      return;
    }

    await ctx.answerCbQuery('کاربر تایید شد ✅');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    
    // تولید شماره شناسنامه و ذخیره کاربر
    const certificateNumber = generateCertificateNumber();
    saveApprovedUser(parseInt(userId), userData);
    
    // ارسال به چنل با هشتگ
    const channelMessage = 
      `${certificateNumber}\n\n` +
      `👤 نام: 🪶 ${userData.firstName}\n` +
      `🆔 آیدی: @${userData.username}\n` +
      `📊 آیدی عددی: ${userData.userId}\n\n` +
      `📋 اطلاعات شناسنامه:\n${userData.profileText}\n\n` +
      `📅 تاریخ ثبت: ${userData.submitDate}\n` +
      `🏷️ شماره شناسنامه: ${certificateNumber}`;

    // ارسال پیام به چنل
    await ctx.telegram.sendMessage(CHANNEL_ID, channelMessage);
    
    // ارسال رسانه‌ها به چنل
    if (userData.stickerFileId) {
      await ctx.telegram.sendSticker(CHANNEL_ID, userData.stickerFileId);
    }
    if (userData.tattooPhotoId) {
      await ctx.telegram.sendPhoto(CHANNEL_ID, userData.tattooPhotoId);
    }
    if (userData.songFileId) {
      await ctx.telegram.sendAudio(CHANNEL_ID, userData.songFileId);
    }
    if (userData.coverPhotoId && userData.coverPhotoId.file_id) {
      await ctx.telegram.sendPhoto(CHANNEL_ID, userData.coverPhotoId.file_id);
    }

    // پیام موفقیت به ادمین
    const successMessage = 
      `✅ کاربر با موفقیت تایید شد!\n\n` +
      `👤 نام: ${userData.firstName}\n` +
      `🆔 آیدی: @${userData.username}\n` +
      `🏷️ شماره شناسنامه: ${certificateNumber}`;
    
    await ctx.reply(successMessage);
    
    // پاک کردن session کاربر
    userSessions.delete(parseInt(userId));
    
  } catch (error) {
    console.error('Error approving user:', error);
    await ctx.answerCbQuery('خطا در تایید کاربر');
  }
});

bot.action(/reject_(\d+)/, async (ctx) => {
  try {
    const userId = ctx.match[1];
    const userData = userSessions.get(parseInt(userId));
    
    await ctx.answerCbQuery('کاربر رد شد ❌');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    
    const rejectMessage = 
      `❌ درخواست کاربر رد شد\n\n` +
      `👤 نام: ${userData?.firstName || 'نامشخص'}\n` +
      `🆔 آیدی عددی: ${userId}`;
    
    await ctx.telegram.sendMessage(ADMIN_GROUP_ID, rejectMessage);
    
    // پاک کردن session کاربر
    userSessions.delete(parseInt(userId));
    
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

// ✅ هندلر وضعیت
bot.command('status', async (ctx) => {
  if (isUserRegistered(ctx.from.id)) {
    const userData = approvedUsers.get(ctx.from.id);
    await ctx.reply(
      `✅ شما قبلاً شناسنامه دارید!\n\n` +
      `🏷️ شماره شناسنامه: ${userData.certificateNumber}\n` +
      `📅 تاریخ تایید: ${new Date(userData.approvedAt).toLocaleDateString('fa-IR')}`
    );
  } else {
    await ctx.reply('❌ شما هنوز شناسنامه ندارید. از /start استفاده کنید.');
  }
});

// ✅ هندلر کمک
bot.help((ctx) => 
  ctx.reply(
    'دستورات موجود:\n' +
    '/start - شروع ثبت نام\n' +
    '/status - بررسی وضعیت شناسنامه\n' +
    '/help - راهنمایی'
  )
);

// ✅ راه‌اندازی ربات برای Render
const startBot = async () => {
  try {
    const PORT = process.env.PORT || 3000;
    
    if (process.env.RENDER) {
      // حالت Production - استفاده از Webhook
      console.log('🚀 Starting bot in webhook mode...');
      
      const WEBHOOK_DOMAIN = process.env.RENDER_EXTERNAL_URL;
      if (!WEBHOOK_DOMAIN) {
        throw new Error('RENDER_EXTERNAL_URL is not set');
      }
      
      const WEBHOOK_PATH = `/webhook`;
      const WEBHOOK_URL = `${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;
      
      // تنظیم webhook
      await bot.telegram.setWebhook(WEBHOOK_URL);
      console.log(`✅ Webhook set to: ${WEBHOOK_URL}`);
      
      // تنظیم middleware برای Telegraf
      app.use(bot.webhookCallback(WEBHOOK_PATH));
      
      // Route اصلی برای سلامت سرویس
      app.get('/', (req, res) => {
        res.json({ 
          status: 'Bot is running!', 
          approvedUsers: approvedUsers.size,
          timestamp: new Date().toISOString() 
        });
      });
      
      // راه‌اندازی سرور
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server is running on port ${PORT}`);
        console.log(`✅ Bot is running in webhook mode`);
        console.log(`✅ Approved users count: ${approvedUsers.size}`);
      });
      
    } else {
      // حالت Development - استفاده از Polling
      console.log('🔧 Starting bot in polling mode...');
      await bot.launch();
      console.log('✅ Bot is running in polling mode');
    }
  } catch (error) {
    console.error('❌ Error starting bot:', error);
    process.exit(1);
  }
};

// ✅ شروع ربات
startBot();

// ✅ مدیریت graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  bot.stop('SIGTERM');
});
