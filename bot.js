const { Telegraf, Scenes: { WizardScene, Stage }, session, Markup } = require('telegraf');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

// ===========================
// Configuration
// ===========================
const config = {
  token: process.env.BOT_TOKEN,
  groupId: process.env.GROUP_ID || -1002511380813,
  port: process.env.PORT || 3000,
  webhookUrl: process.env.WEBHOOK_URL || "https://eclis-registery-bot.onrender.com/webhook",
  maxConcurrentUsers: 3,
  sessionTimeout: 60 * 60 * 1000,
  cleanupInterval: 30 * 60 * 1000
};

if (!config.token) {
  console.error('❌ BOT_TOKEN is required in environment variables!');
  process.exit(1);
}

// ===========================
// Logger Service
// ===========================
class Logger {
  static info(message, data = null) {
    console.log(`ℹ️ ${new Date().toISOString()} - ${message}`, data || '');
  }

  static error(message, error = null) {
    console.error(`❌ ${new Date().toISOString()} - ${message}`, error || '');
  }

  static warn(message, data = null) {
    console.warn(`⚠️ ${new Date().toISOString()} - ${message}`, data || '');
  }

  static success(message, data = null) {
    console.log(`✅ ${new Date().toISOString()} - ${message}`, data || '');
  }
}

// ===========================
// User Data Service
// ===========================
class UserDataService {
  constructor() {
    this.userData = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), config.cleanupInterval);
  }

  set(userId, data) {
    const userData = {
      ...data,
      userId,
      createdAt: data.createdAt || Date.now(),
      updatedAt: Date.now(),
      lastActivity: Date.now()
    };

    this.userData.set(userId, userData);
    return userData;
  }

  get(userId) {
    const data = this.userData.get(userId);
    if (data) {
      data.lastActivity = Date.now();
      this.userData.set(userId, data);
    }
    return data;
  }

  delete(userId) {
    return this.userData.delete(userId);
  }

  exists(userId) {
    return this.userData.has(userId);
  }

  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, data] of this.userData.entries()) {
      if (now - data.lastActivity > config.sessionTimeout) {
        this.userData.delete(userId);
        cleanedCount++;
        Logger.info(`Cleaned up expired user session: ${userId}`);
      }
    }
  }
}

// ===========================
// Form Validation Service - بدون زیرکلاس
// ===========================
class FormService {
  static requiredFields = [
    "اسم و اسم خاندان:",
    "نژاد:",
    "تاریخ تولد به میلادی:",
    "اسم پدر / مادر:"
  ];

  static validate(formText) {
    if (!formText || typeof formText !== 'string') {
      return { isValid: false, error: 'فرم باید متن باشد' };
    }

    const lines = formText.trim().split('\n').filter(line => line.trim());
    
    if (lines.length < 4) {
      return { isValid: false, error: 'فرم باید حداقل ۴ خط داشته باشد' };
    }

    const missingFields = this.requiredFields.filter(field => 
      !formText.includes(field)
    );

    if (missingFields.length > 0) {
      return { 
        isValid: false, 
        error: `فیلدهای زیر وجود ندارند: ${missingFields.join(', ')}` 
      };
    }

    const parsed = this.parse(formText);
    const emptyFields = [];
    
    if (!parsed.name || parsed.name === "نامشخص") emptyFields.push("اسم و اسم خاندان");
    if (!parsed.race || parsed.race === "نامشخص") emptyFields.push("نژاد");
    if (!parsed.birth || parsed.birth === "نامشخص") emptyFields.push("تاریخ تولد");
    if (!parsed.parents || parsed.parents === "نامشخص") emptyFields.push("اسم پدر/مادر");

    if (emptyFields.length > 0) {
      return { 
        isValid: false, 
        error: `فیلدهای زیر پر نشده‌اند: ${emptyFields.join(', ')}` 
      };
    }

    return { isValid: true };
  }

  static parse(formText) {
    const lines = formText.trim().split('\n');
    const result = {
      name: "نامشخص",
      race: "نامشخص",
      birth: "نامشخص",
      parents: "نامشخص",
      rawText: formText
    };
    
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine.includes("اسم و اسم خاندان:")) {
        result.name = trimmedLine.replace("اسم و اسم خاندان:", "").trim();
      } else if (trimmedLine.includes("نژاد:")) {
        result.race = trimmedLine.replace("نژاد:", "").trim();
      } else if (trimmedLine.includes("تاریخ تولد به میلادی:")) {
        result.birth = trimmedLine.replace("تاریخ تولد به میلادی:", "").trim();
      } else if (trimmedLine.includes("اسم پدر / مادر:")) {
        result.parents = trimmedLine.replace("اسم پدر / مادر:", "").trim();
      }
    });
    
    return result;
  }

  static format(parsedData, username) {
    return (
      `👤 نام و خاندان: ${parsedData.name}\n` +
      `🧬 نژاد: ${parsedData.race}\n` +
      `📅 تاریخ تولد: ${parsedData.birth}\n` +
      `👨‍👩‍👧 والدین: ${parsedData.parents}\n\n` +
      `📨 ارسال‌شده توسط: @${username || 'بدون آیدی'}\n` +
      `🌐 کانال: @Eclis_Darkness`
    );
  }
}

// ===========================
// Media Service
// ===========================
class MediaService {
  static extractMediaInfo(ctx) {
    if (ctx.message.sticker) {
      return {
        type: 'sticker',
        fileId: ctx.message.sticker.file_id,
        fileUniqueId: ctx.message.sticker.file_unique_id
      };
    } else if (ctx.message.photo && ctx.message.photo.length > 0) {
      return {
        type: 'photo',
        fileId: ctx.message.photo[ctx.message.photo.length - 1].file_id,
        fileUniqueId: ctx.message.photo[ctx.message.photo.length - 1].file_unique_id
      };
    } else if (ctx.message.audio) {
      return {
        type: 'audio',
        fileId: ctx.message.audio.file_id,
        fileUniqueId: ctx.message.audio.file_unique_id,
        duration: ctx.message.audio.duration,
        title: ctx.message.audio.title,
        performer: ctx.message.audio.performer
      };
    }
    
    return null;
  }

  static async sendMediaToGroup(ctx, mediaInfo, caption = null) {
    try {
      switch (mediaInfo.type) {
        case 'sticker':
          return await ctx.telegram.sendSticker(config.groupId, mediaInfo.fileId);
        case 'photo':
          return await ctx.telegram.sendPhoto(config.groupId, mediaInfo.fileId, {
            caption: caption
          });
        case 'audio':
          return await ctx.telegram.sendAudio(config.groupId, mediaInfo.fileId, {
            caption: caption
          });
        default:
          throw new Error(`نوع مدیا پشتیبانی نمی‌شود: ${mediaInfo.type}`);
      }
    } catch (error) {
      Logger.error('Error sending media to group', error);
      throw error;
    }
  }
}

// ===========================
// Initialize Services
// ===========================
const userDataService = new UserDataService();

// ===========================
// Bot Instance
// ===========================
const bot = new Telegraf(config.token);
const expressApp = express();

// ===========================
// Keyboard Templates
// ===========================
const Keyboards = {
  main: Markup.keyboard([
    ['📄 ساخت شناسنامه'],
    ['ℹ️ راهنما']
  ]).resize(),

  cancel: Markup.keyboard([
    ['❌ انصراف']
  ]).resize(),

  remove: Markup.removeKeyboard()
};

// ===========================
// Message Templates - بدون زیرکلاس
// ===========================
const Messages = {
  welcome: `
✨ خوش اومدین به سرزمین اکلیس!
من درویدم، دستیار شما برای ثبت‌نام شخصیت‌ها.

برای شروع یکی از گزینه‌های زیر رو انتخاب کنید:
  `.trim(),

  help: `
📖 *راهنمای ربات اکلیس*

🔹 *ثبت شناسنامه:*
روی "ساخت شناسنامه" کلیک کنید و مراحل رو دنبال کنید

🔹 *دستورات:*
/start - شروع مجدد
/cancel - لغو عملیات
/help - نمایش این راهنما

🌐 کانال: @Eclis_Darkness
  `.trim(),

  formTemplate: `
🪶 *فرم ثبت شناسنامه*
لطفاً فرم زیر رو کپی کرده و پر کنید:

🪶 اسم و اسم خاندان:
🪶 نژاد:
🪶 تاریخ تولد به میلادی:
🪶 اسم پدر / مادر:
  `.trim(),

  processing: `
⏳ در حال پردازش اطلاعات شما...
لطفاً کمی صبر کنید.
  `.trim(),

  success: `
✅ *عملیات موفق!*
اطلاعات شما با موفقیت ثبت شد.
منتظر تأیید نهایی در کانال @Eclis_Darkness باشید.

🆔 کد پیگیری: ${Math.random().toString(36).substr(2, 8).toUpperCase()}
  `.trim(),

  cancelled: `
❌ *عملیات لغو شد*
شما می‌تونید از منوی اصلی دوباره شروع کنید.
  `.trim()
};

// ===========================
// Registration Wizard Scene - بدون زیرکلاس
// ===========================
const registrationWizard = new WizardScene(
  'registrationWizard',
  
  // Step 1: Receive Form
  async (ctx) => {
    try {
      Logger.info('User entered registration wizard', {
        userId: ctx.from.id,
        username: ctx.from.username
      });

      const user = userDataService.get(ctx.from.id) || {};
      user.currentStep = 'form';
      userDataService.set(ctx.from.id, user);

      await ctx.reply(
        Messages.formTemplate,
        { 
          parse_mode: 'Markdown',
          ...Keyboards.cancel
        }
      );
      
      return ctx.wizard.next();
    } catch (error) {
      Logger.error('Error in form step', error);
      await ctx.reply('❌ خطایی در شروع فرآیند ثبت‌نام پیش آمد.', Keyboards.main);
      return ctx.scene.leave();
    }
  },

  // Step 2: Validate and Store Form
  async (ctx) => {
    try {
      if (ctx.message.text === '❌ انصراف') {
        await ctx.reply(Messages.cancelled, Keyboards.main);
        userDataService.delete(ctx.from.id);
        return ctx.scene.leave();
      }

      if (!ctx.message.text) {
        await ctx.reply('⚠️ لطفاً فقط متن فرم رو ارسال کنید.');
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      const validation = FormService.validate(ctx.message.text);
      if (!validation.isValid) {
        await ctx.reply(`❌ ${validation.error}\n\nلطفاً فرم رو دقیق پر کنید.`);
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      const user = userDataService.get(ctx.from.id) || {};
      user.formData = FormService.parse(ctx.message.text);
      user.rawForm = ctx.message.text;
      userDataService.set(ctx.from.id, user);

      Logger.info('Form received and validated', {
        userId: ctx.from.id,
        characterName: user.formData.name
      });

      await ctx.reply(
        '✅ فرم شما دریافت شد!\n\n🌀 لطفاً استیکر رولتون یا عکس واضح از کرکترتون رو ارسال کنید.',
        Keyboards.cancel
      );

      return ctx.wizard.next();
    } catch (error) {
      Logger.error('Error in form validation step', error);
      await ctx.reply('❌ خطایی در پردازش فرم پیش آمد.', Keyboards.main);
      return ctx.scene.leave();
    }
  },

  // Step 3: Receive Character Media
  async (ctx) => {
    try {
      if (ctx.message.text === '❌ انصراف') {
        await ctx.reply(Messages.cancelled, Keyboards.main);
        userDataService.delete(ctx.from.id);
        return ctx.scene.leave();
      }

      const mediaInfo = MediaService.extractMediaInfo(ctx);
      if (!mediaInfo || (mediaInfo.type !== 'sticker' && mediaInfo.type !== 'photo')) {
        await ctx.reply('⚠️ لطفاً فقط استیکر یا عکس ارسال کنید.');
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      const user = userDataService.get(ctx.from.id);
      user.characterMedia = mediaInfo;
      userDataService.set(ctx.from.id, user);

      Logger.info('Character media received', {
        userId: ctx.from.id,
        mediaType: mediaInfo.type
      });

      await ctx.reply(
        '✅ رسانه دریافت شد!\n\n🎼 لطفاً آهنگ مورد علاقتون رو ارسال کنید.',
        Keyboards.cancel
      );

      return ctx.wizard.next();
    } catch (error) {
      Logger.error('Error in media step', error);
      await ctx.reply('❌ خطایی در پردازش رسانه پیش آمد.', Keyboards.main);
      return ctx.scene.leave();
    }
  },

  // Step 4: Receive Favorite Song
  async (ctx) => {
    try {
      if (ctx.message.text === '❌ انصراف') {
        await ctx.reply(Messages.cancelled, Keyboards.main);
        userDataService.delete(ctx.from.id);
        return ctx.scene.leave();
      }

      const mediaInfo = MediaService.extractMediaInfo(ctx);
      if (!mediaInfo || mediaInfo.type !== 'audio') {
        await ctx.reply('⚠️ لطفاً یک فایل صوتی (آهنگ) ارسال کنید.');
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      const user = userDataService.get(ctx.from.id);
      user.favoriteSong = mediaInfo;
      userDataService.set(ctx.from.id, user);

      Logger.info('Favorite song received', {
        userId: ctx.from.id,
        songTitle: mediaInfo.title
      });

      await ctx.reply(
        '✅ آهنگ دریافت شد!\n\n🎨 لطفاً کاور آهنگ رو ارسال کنید.',
        Keyboards.cancel
      );

      return ctx.wizard.next();
    } catch (error) {
      Logger.error('Error in audio step', error);
      await ctx.reply('❌ خطایی در پردازش آهنگ پیش آمد.', Keyboards.main);
      return ctx.scene.leave();
    }
  },

  // Step 5: Receive Song Cover and Final Submission
  async (ctx) => {
    try {
      if (ctx.message.text === '❌ انصراف') {
        await ctx.reply(Messages.cancelled, Keyboards.main);
        userDataService.delete(ctx.from.id);
        return ctx.scene.leave();
      }

      const mediaInfo = MediaService.extractMediaInfo(ctx);
      if (!mediaInfo || mediaInfo.type !== 'photo') {
        await ctx.reply('⚠️ لطفاً عکس (کاور آهنگ) ارسال کنید.');
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      const user = userDataService.get(ctx.from.id);
      if (!user || !user.formData) {
        await ctx.reply('❌ اطلاعات شما یافت نشد. لطفاً دوباره شروع کنید.', Keyboards.main);
        return ctx.scene.leave();
      }

      user.songCover = mediaInfo;
      userDataService.set(ctx.from.id, user);

      await ctx.reply(Messages.processing);

      try {
        await sendUserDataToGroup(ctx, user);
        
        await ctx.reply(
          Messages.success,
          { 
            parse_mode: 'Markdown',
            ...Keyboards.main 
          }
        );

        Logger.success('Registration completed successfully', {
          userId: ctx.from.id,
          username: ctx.from.username,
          characterName: user.formData.name
        });

      } catch (error) {
        Logger.error('Error sending data to group', error);
        await ctx.reply(
          '❌ خطایی در ارسال اطلاعات به گروه پیش آمد.',
          Keyboards.main
        );
      }

      userDataService.delete(ctx.from.id);
      return ctx.scene.leave();

    } catch (error) {
      Logger.error('Error in final step', error);
      await ctx.reply('❌ خطایی در ارسال نهایی پیش آمد.', Keyboards.main);
      userDataService.delete(ctx.from.id);
      return ctx.scene.leave();
    }
  }
);

// Helper function to send user data to group
async function sendUserDataToGroup(ctx, user) {
  try {
    const formattedForm = FormService.format(user.formData, ctx.from.username);

    await ctx.telegram.sendMessage(config.groupId, `📜 شناسنامه جدید\n\n${formattedForm}`);

    if (user.characterMedia) {
      await MediaService.sendMediaToGroup(ctx, user.characterMedia, '🎭 شخصیت');
    }

    if (user.favoriteSong) {
      await MediaService.sendMediaToGroup(ctx, user.favoriteSong, '🎵 آهنگ مورد علاقه');
    }

    if (user.songCover) {
      await MediaService.sendMediaToGroup(ctx, user.songCover, '🎨 کاور آهنگ');
    }

    Logger.success('User data sent to group successfully', {
      userId: ctx.from.id,
      username: ctx.from.username
    });

  } catch (error) {
    Logger.error('Error sending user data to group', error);
    throw error;
  }
}

// ===========================
// Setup Stage and Middleware - اصلاح شده
// ===========================
const stage = new Stage([registrationWizard]);

bot.use(session());
bot.use(stage.middleware());

// ===========================
// Bot Command Handlers
// ===========================

// Start command
bot.start(async (ctx) => {
  try {
    await ctx.reply(
      Messages.welcome,
      { 
        parse_mode: 'Markdown',
        ...Keyboards.main 
      }
    );
  } catch (error) {
    Logger.error('Error in start command', error);
  }
});

// Help command
bot.help(async (ctx) => {
  try {
    await ctx.reply(
      Messages.help,
      { 
        parse_mode: 'Markdown',
        ...Keyboards.main 
      }
    );
  } catch (error) {
    Logger.error('Error in help command', error);
  }
});

// Cancel command
bot.command('cancel', async (ctx) => {
  try {
    if (ctx.scene?.current) {
      userDataService.delete(ctx.from.id);
      await ctx.reply(Messages.cancelled, Keyboards.main);
      await ctx.scene.leave();
    } else {
      await ctx.reply('⚠️ در حال حاضر در حال ثبت‌نام نیستید.', Keyboards.main);
    }
  } catch (error) {
    Logger.error('Error in cancel command', error);
  }
});

// Handle registration button
bot.hears('📄 ساخت شناسنامه', async (ctx) => {
  try {
    userDataService.delete(ctx.from.id);
    
    userDataService.set(ctx.from.id, {
      startedAt: Date.now(),
      currentStep: 'started'
    });

    await ctx.scene.enter('registrationWizard');
    
    Logger.info('User started registration', {
      userId: ctx.from.id,
      username: ctx.from.username
    });

  } catch (error) {
    Logger.error('Error starting registration', error);
    await ctx.reply('❌ خطایی در شروع ثبت‌نام پیش آمد. لطفاً دوباره تلاش کنید.', Keyboards.main);
  }
});

// Handle help button
bot.hears('ℹ️ راهنما', async (ctx) => {
  try {
    await ctx.reply(
      Messages.help,
      { 
        parse_mode: 'Markdown',
        ...Keyboards.main 
      }
    );
  } catch (error) {
    Logger.error('Error in help button', error);
  }
});

// Handle any other message
bot.on('message', async (ctx) => {
  try {
    if (!ctx.scene?.current) {
      await ctx.reply(
        'لطفاً از منوی زیر یکی از گزینه‌ها رو انتخاب کنید:',
        Keyboards.main
      );
    }
  } catch (error) {
    Logger.error('Error in message handler', error);
  }
});

// Global error handler
bot.catch(async (err, ctx) => {
  Logger.error(`Global error for ${ctx.updateType}`, err);
  
  try {
    await ctx.reply('❌ خطای سیستمی پیش آمد. لطفاً دوباره تلاش کنید.', Keyboards.main);
    
    if (ctx.from?.id) {
      userDataService.delete(ctx.from.id);
      if (ctx.scene?.current) {
        await ctx.scene.leave();
      }
    }
  } catch (e) {
    Logger.error('Error in global error handler', e);
  }
});

// ===========================
// Express Server Setup
// ===========================
expressApp.use(express.json());

// Webhook endpoint
expressApp.post('/webhook', async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (error) {
    Logger.error('Webhook error', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Health check endpoint
expressApp.get('/', (req, res) => {
  res.json({
    status: '✅ Bot is running',
    service: 'Eclis Registry Bot',
    timestamp: new Date().toISOString(),
    version: '3.2.0'
  });
});

// ===========================
// Startup Function
// ===========================
async function startBot() {
  try {
    Logger.info('Starting bot...', {
      environment: process.env.NODE_ENV || 'development',
      port: config.port
    });

    if (process.env.NODE_ENV === 'production') {
      await bot.telegram.setWebhook(config.webhookUrl);
      Logger.success('Webhook set successfully', { url: config.webhookUrl });
      
      expressApp.listen(config.port, () => {
        Logger.success(`Bot server running on port ${config.port}`);
      });
    } else {
      await bot.launch();
      Logger.success('Bot started with polling');
    }

    Logger.success('Eclis Registry Bot v3.2 is ready!');

  } catch (error) {
    Logger.error('Error starting bot', error);
    process.exit(1);
  }
}

// ===========================
// Graceful Shutdown
// ===========================
function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    Logger.info(`Received ${signal}, shutting down gracefully...`);
    
    bot.stop(signal);
    
    if (userDataService.cleanupInterval) {
      clearInterval(userDataService.cleanupInterval);
    }
    
    setTimeout(() => {
      Logger.success('Shutdown completed');
      process.exit(0);
    }, 1000);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

// ===========================
// Start the Application
// ===========================
setupGracefulShutdown();
startBot();
