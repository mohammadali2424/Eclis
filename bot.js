const { Telegraf, Scenes: { WizardScene }, session, Markup } = require('telegraf');
const { Stage } = require('telegraf/scenes');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

// ===========================
// Configuration
// ===========================
const config = {
  token: process.env.BOT_TOKEN,
  groupId: -1002511380813,
  port: process.env.PORT || 3000,
  webhookUrl: process.env.WEBHOOK_URL || "https://eclis-registery-bot.onrender.com/webhook",
  maxConcurrentUsers: 3,
  sessionTimeout: 60 * 60 * 1000, // 1 hour
  cleanupInterval: 30 * 60 * 1000 // 30 minutes
};

if (!config.token) {
  console.error('❌ BOT_TOKEN is required in environment variables!');
  process.exit(1);
}

// ===========================
// Event Emitter for better event handling
// ===========================
const EventEmitter = require('events');
class BotEventEmitter extends EventEmitter {}
const botEvents = new BotEventEmitter();

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
// Queue Service
// ===========================
class MessageQueue {
  constructor(concurrency = 3) {
    this.concurrency = concurrency;
    this.active = 0;
    this.queue = [];
    this.stats = {
      processed: 0,
      failed: 0,
      total: 0
    };
  }

  async add(task, description = 'task') {
    this.stats.total++;
    
    return new Promise((resolve, reject) => {
      this.queue.push({ 
        task, 
        resolve, 
        reject, 
        description,
        timestamp: Date.now()
      });
      this._next();
    });
  }

  _next() {
    if (this.active >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.active++;
    const { task, resolve, reject, description } = this.queue.shift();

    const next = () => {
      this.active--;
      this._next();
    };

    Promise.resolve(task())
      .then((result) => {
        this.stats.processed++;
        botEvents.emit('queue:success', { description });
        resolve(result);
        next();
      })
      .catch((error) => {
        this.stats.failed++;
        botEvents.emit('queue:error', { description, error });
        reject(error);
        next();
      });
  }

  getStats() {
    return {
      pending: this.queue.length,
      active: this.active,
      ...this.stats
    };
  }

  clear() {
    this.queue = [];
    this.active = 0;
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
    botEvents.emit('user:updated', { userId, data: userData });
    
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
    const existed = this.userData.has(userId);
    if (existed) {
      botEvents.emit('user:deleted', { userId });
    }
    return this.userData.delete(userId);
  }

  exists(userId) {
    return this.userData.has(userId);
  }

  getAll() {
    return Array.from(this.userData.entries());
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

    if (cleanedCount > 0) {
      botEvents.emit('cleanup:completed', { cleanedCount });
    }
  }

  getStats() {
    return {
      totalUsers: this.userData.size,
      activeUsers: Array.from(this.userData.values()).filter(user => 
        Date.now() - user.lastActivity < config.sessionTimeout
      ).length
    };
  }
}

// ===========================
// Form Validation Service
// ===========================
class FormService {
  static requiredFields = [
    "اسم و اسم خاندان:",
    "نژاد:",
    "تاریخ تولد به میلادی:",
    "اسم پدر / مادر:",
    "زیر کلاس:"
  ];

  static validate(formText) {
    if (!formText || typeof formText !== 'string') {
      return { isValid: false, error: 'فرم باید متن باشد' };
    }

    const lines = formText.trim().split('\n').filter(line => line.trim());
    
    if (lines.length < 5) {
      return { isValid: false, error: 'فرم باید حداقل ۵ خط داشته باشد' };
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

    return { isValid: true };
  }

  static parse(formText) {
    const lines = formText.trim().split('\n');
    
    const extractValue = (index, fieldName) => {
      return lines[index]?.replace(fieldName, "").trim() || "نامشخص";
    };

    return {
      name: extractValue(0, "اسم و اسم خاندان:"),
      race: extractValue(1, "نژاد:"),
      birth: extractValue(2, "تاریخ تولد به میلادی:"),
      parents: extractValue(3, "اسم پدر / مادر:"),
      subclass: extractValue(4, "زیر کلاس:"),
      rawText: formText
    };
  }

  static format(parsedData, username) {
    return (
      `👤 نام و خاندان: ${parsedData.name}\n` +
      `🧬 نژاد: ${parsedData.race}\n` +
      `📅 تاریخ تولد: ${parsedData.birth}\n` +
      `👨‍👩‍👧 والدین: ${parsedData.parents}\n` +
      `⚗️ زیرکلاس: ${parsedData.subclass}\n\n` +
      `📨 ارسال‌شده توسط: @${username || 'بدون آیدی'}`
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
const messageQueue = new MessageQueue(config.maxConcurrentUsers);
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
    ['🏦 ورود به بانک', 'ℹ️ راهنما']
  ]).resize(),

  cancel: Markup.keyboard([
    ['❌ انصراف']
  ]).resize(),

  remove: Markup.removeKeyboard()
};

// ===========================
// Message Templates
// ===========================
const Messages = {
  welcome: `
✨ خوش اومدین به سرزمین اکلیس!
من درویدم، دستیار شما برای ثبت‌نام شخصیت‌ها.

🔸 *امکانات ربات:*
• ثبت شناسنامه شخصیت
• مدیریت اطلاعات بازی
• سیستم بانکی (به زودی)

برای شروع یکی از گزینه‌های زیر رو انتخاب کنید:
  `.trim(),

  help: `
📖 *راهنمای ربات اکلیس*

🔹 *ثبت شناسنامه:*
1️⃣ روی "ساخت شناسنامه" کلیک کنید
2️⃣ فرم رو پر کنید و ارسال کنید
3️⃣ استیکر یا عکس شخصیت رو بفرستید
4️⃣ آهنگ مورد علاقه رو ارسال کنید
5️⃣ کاور آهنگ رو ارسال کنید

🔹 *دستورات:*
/start - شروع مجدد
/cancel - لغو عملیات
/help - نمایش این راهنما
/status - وضعیت ربات

📞 پشتیبانی: @EclisSupport
  `.trim(),

  formTemplate: `
🪶 *فرم ثبت شناسنامه*
لطفاً فرم زیر رو کپی کرده و پر کنید:

🪶 اسم و اسم خاندان:
🪶 نژاد:
🪶 تاریخ تولد به میلادی:
🪶 اسم پدر / مادر:
🪶 زیر کلاس:
  `.trim(),

  processing: `
⏳ در حال پردازش اطلاعات شما...
لطفاً کمی صبر کنید.
  `.trim(),

  success: `
✅ *عملیات موفق!*
اطلاعات شما با موفقیت ثبت شد.
منتظر تأیید نهایی باشید.

🆔 کد پیگیری: ${Math.random().toString(36).substr(2, 8).toUpperCase()}
  `.trim(),

  cancelled: `
❌ *عملیات لغو شد*
شما می‌تونید از منوی اصلی دوباره شروع کنید.
  `.trim()
};

// ===========================
// Registration Wizard Scene
// ===========================
const registrationWizard = new WizardScene(
  'registrationWizard',
  
  // Step 1: Receive Form
  async (ctx) => {
    try {
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
      await ctx.reply('❌ خطایی در شروع فرآیند ثبت‌نام پیش آمد.');
      return ctx.scene.leave();
    }
  },

  // Step 2: Validate and Store Form
  async (ctx) => {
    try {
      // Handle cancellation
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

      // Store form data
      const user = userDataService.get(ctx.from.id) || {};
      user.formData = FormService.parse(ctx.message.text);
      user.rawForm = ctx.message.text;
      userDataService.set(ctx.from.id, user);

      await ctx.reply(
        '✅ فرم شما دریافت شد!\n\n🌀 لطفاً استیکر رولتون یا عکس واضح از کرکترتون رو ارسال کنید.',
        Keyboards.cancel
      );

      return ctx.wizard.next();
    } catch (error) {
      Logger.error('Error in form validation step', error);
      await ctx.reply('❌ خطایی در پردازش فرم پیش آمد.');
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

      await ctx.reply(
        '✅ رسانه دریافت شد!\n\n🎼 لطفاً آهنگ مورد علاقتون رو ارسال کنید.',
        Keyboards.cancel
      );

      return ctx.wizard.next();
    } catch (error) {
      Logger.error('Error in media step', error);
      await ctx.reply('❌ خطایی در پردازش رسانه پیش آمد.');
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

      await ctx.reply(
        '✅ آهنگ دریافت شد!\n\n🎨 لطفاً کاور آهنگ رو ارسال کنید.',
        Keyboards.cancel
      );

      return ctx.wizard.next();
    } catch (error) {
      Logger.error('Error in audio step', error);
      await ctx.reply('❌ خطایی در پردازش آهنگ پیش آمد.');
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
        await ctx.reply('❌ اطلاعات شما یافت نشد. لطفاً دوباره شروع کنی��.');
        return ctx.scene.leave();
      }

      user.songCover = mediaInfo;
      userDataService.set(ctx.from.id, user);

      await ctx.reply(Messages.processing);

      // Send all data to group
      await sendUserDataToGroup(ctx, user);

      await ctx.reply(
        Messages.success,
        { 
          parse_mode: 'Markdown',
          ...Keyboards.main 
        }
      );

      // Log successful registration
      botEvents.emit('registration:success', {
        userId: ctx.from.id,
        username: ctx.from.username,
        characterName: user.formData.name
      });

      userDataService.delete(ctx.from.id);
      return ctx.scene.leave();

    } catch (error) {
      Logger.error('Error in final step', error);
      await ctx.reply('❌ خطایی در ارسال نهایی پیش آمد.');
      userDataService.delete(ctx.from.id);
      return ctx.scene.leave();
    }
  }
);

// Helper function to send user data to group
async function sendUserDataToGroup(ctx, user) {
  try {
    const formattedForm = FormService.format(user.formData, ctx.from.username);

    // Send form data
    await messageQueue.add(
      () => ctx.telegram.sendMessage(config.groupId, `📜 شناسنامه جدید\n\n${formattedForm}`),
      'send_form_data'
    );

    // Send character media
    if (user.characterMedia) {
      await messageQueue.add(
        () => MediaService.sendMediaToGroup(ctx, user.characterMedia, '🎭 شخصیت'),
        'send_character_media'
      );
    }

    // Send favorite song
    if (user.favoriteSong) {
      await messageQueue.add(
        () => MediaService.sendMediaToGroup(ctx, user.favoriteSong, '🎵 آهنگ مورد علاقه'),
        'send_favorite_song'
      );
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
// Event Handlers
// ===========================
botEvents.on('user:updated', ({ userId, data }) => {
  Logger.info(`User data updated: ${userId}`, {
    step: data.currentStep,
    hasForm: !!data.formData,
    hasMedia: !!data.characterMedia
  });
});

botEvents.on('registration:success', ({ userId, username, characterName }) => {
  Logger.success(`New registration completed`, {
    userId,
    username,
    characterName
  });
});

botEvents.on('queue:success', ({ description }) => {
  Logger.info(`Queue task completed: ${description}`);
});

botEvents.on('queue:error', ({ description, error }) => {
  Logger.error(`Queue task failed: ${description}`, error);
});

// ===========================
// Bot Command Handlers
// ===========================

// Start command
bot.start(async (ctx) => {
  await ctx.reply(
    Messages.welcome,
    { 
      parse_mode: 'Markdown',
      ...Keyboards.main 
    }
  );
});

// Help command
bot.help(async (ctx) => {
  await ctx.reply(
    Messages.help,
    { 
      parse_mode: 'Markdown',
      ...Keyboards.main 
    }
  );
});

// Status command
bot.command('status', async (ctx) => {
  const queueStats = messageQueue.getStats();
  const userStats = userDataService.getStats();
  
  const statusMessage = `
📊 *وضعیت ربات*

👥 *کاربران:*
• فعال: ${userStats.activeUsers}
• کل: ${userStats.totalUsers}

📨 *صف ارسال:*
• در حال پردازش: ${queueStats.active}
• در انتظار: ${queueStats.pending}
• موفق: ${queueStats.processed}
• ناموفق: ${queueStats.failed}

⏱ *آپتایم: ${Math.floor(process.uptime())} ثانیه*
  `.trim();

  await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
});

// Cancel command
bot.command('cancel', async (ctx) => {
  if (ctx.scene?.current) {
    userDataService.delete(ctx.from.id);
    await ctx.reply(Messages.cancelled, Keyboards.main);
    await ctx.scene.leave();
  } else {
    await ctx.reply('⚠️ در حال حاضر در حال ثبت‌نام نیستید.', Keyboards.main);
  }
});

// Handle registration button
bot.hears('📄 ساخت شناسنامه', async (ctx) => {
  try {
    // Clear any existing user data
    userDataService.delete(ctx.from.id);
    
    // Initialize new user session
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

// Handle bank button
bot.hears('🏦 ورود به بانک', async (ctx) => {
  await ctx.reply('🚧 سیستم بانکی به زودی راه‌اندازی خواهد شد.', Keyboards.main);
});

// Handle help button
bot.hears('ℹ️ راهنما', async (ctx) => {
  await ctx.reply(
    Messages.help,
    { 
      parse_mode: 'Markdown',
      ...Keyboards.main 
    }
  );
});

// ===========================
// Setup Stage and Middleware
// ===========================
const stage = new Stage([registrationWizard]);

bot.use(session());
bot.use(stage.middleware());

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
  const stats = {
    status: '✅ Bot is running',
    service: 'Eclis Registry Bot - Modern Architecture',
    timestamp: new Date().toISOString(),
    version: '3.0.0',
    queue: messageQueue.getStats(),
    users: userDataService.getStats(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };

  res.json(stats);
});

// Queue status endpoint
expressApp.get('/queue', (req, res) => {
  res.json(messageQueue.getStats());
});

// Users status endpoint
expressApp.get('/users', (req, res) => {
  res.json(userDataService.getStats());
});

// ===========================
// Startup Function
// ===========================
async function startBot() {
  try {
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

    Logger.success('Eclis Registry Bot v3.0 is ready!', {
      maxConcurrentUsers: config.maxConcurrentUsers,
      environment: process.env.NODE_ENV || 'development'
    });

    // Log initial stats
    Logger.info('Initial system status', {
      queue: messageQueue.getStats(),
      users: userDataService.getStats()
    });

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
    
    // Stop receiving new updates
    bot.stop(signal);
    
    // Clear intervals
    if (userDataService.cleanupInterval) {
      clearInterval(userDataService.cleanupInterval);
    }
    
    // Log final stats
    Logger.info('Final statistics', {
      queue: messageQueue.getStats(),
      users: userDataService.getStats()
    });
    
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
