const { Telegraf, Scenes: { WizardScene }, session, Markup } = require('telegraf');
const express = require('express');
const dotenv = require('dotenv');
const PQueue = require('p-queue'); // import ساده شده

dotenv.config();

// ===========================
// تنظیمات اولیه
// ===========================
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ BOT_TOKEN is required in environment variables!');
  process.exit(1);
}
const GROUP_ID = -1002511380813;
const PORT = process.env.PORT || 3000;

// ===========================
// ایجاد صف برای مدیریت کاربران همزمان
// ===========================
const messageQueue = new PQueue({
  concurrency: 3,
  timeout: 45000,
  throwOnTimeout: false
});

// ===========================
// ایجاد برنامه‌ها
// ===========================
const bot = new Telegraf(TOKEN);
const expressApp = express();

// ===========================
// ذخیره داده‌های کاربران با مدیریت بهتر
// ===========================
class UserDataManager {
  constructor() {
    this.userData = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 30 * 60 * 1000);
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

  exists(userId) {
    return this.userData.has(userId);
  }

  cleanup() {
    const now = Date.now();
    const expiredTime = 60 * 60 * 1000;
    
    for (const [userId, data] of this.userData.entries()) {
      if (now - data.timestamp > expiredTime) {
        this.userData.delete(userId);
        console.log(`Cleaned up expired user data: ${userId}`);
      }
    }
  }

  get size() {
    return this.userData.size;
  }
}

const userData = new UserDataManager();

// ===========================
// توابع کمکی
// ===========================
function validateForm(formText) {
  const requiredFields = [
    "اسم و اسم خاندان:",
    "نژاد:",
    "تاریخ تولد به میلادی:",
    "اسم پدر / مادر:",
    "زیر کلاس:"
  ];
  
  return requiredFields.every(field => formText.includes(field));
}

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

// تابع برای ارسال ایمن به گروه با صف
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

// هندلر دکمه "ورود به بانک"
bot.hears('🏦 ورود به بانک', async (ctx) => {
  await ctx.reply("🚧 این بخش به زودی فعال خواهد شد!");
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
  await ctx.scene.enter('registrationWizard');
});

// ===========================
// صحنه ویزارد برای ثبت‌نام
// ===========================
const registrationWizard = new WizardScene(
  'registrationWizard',
  
  // مرحله ۱: دریافت فرم
  async (ctx) => {
    try {
      await ctx.reply("📝 لطفاً فرم پر شده رو ارسال کنید:");
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in form step:', error);
      await ctx.reply("⚠️ خطایی پیش اومد. لطفاً /start رو بزنین و دوباره تلاش کنید.");
      return ctx.scene.leave();
    }
  },
  
  // مرحله ۲: ذخیره فرم و دریافت استیکر/عکس
  async (ctx) => {
    try {
      if (!ctx.message || !ctx.message.text) {
        await ctx.reply("⚠️ لطفاً فقط متن فرم رو ارسال کنید.");
        return;
      }

      if (!validateForm(ctx.message.text)) {
        await ctx.reply("❌ فرم ارسالی ناقص است. لطفاً همه فیلدهای لازم رو پر کنید و دوباره تلاش کنید.");
        return;
      }
      
      const user = userData.get(ctx.from.id) || {};
      user.form = ctx.message.text;
      userData.set(ctx.from.id, user);
      
      await ctx.reply("🌀 لطفاً استیکر رولتون یا عکس واضح از کرکترتون رو ارسال کنید.");
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error saving form:', error);
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
      
      const user = userData.get(ctx.from.id) || {};
      user.sticker = fileId;
      user.mediaType = mediaType;
      userData.set(ctx.from.id, user);
      
      await ctx.reply("🎼 لطفاً آهنگ مورد علاقتون رو ارسال کنید.");
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error processing media:', error);
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
      
      const user = userData.get(ctx.from.id) || {};
      user.song = ctx.message.audio.file_id;
      userData.set(ctx.from.id, user);
      
      await ctx.reply("🎨 لطفاً کاور آهنگ رو ارسال کنید.");
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error processing audio:', error);
      await ctx.reply("⚠️ خطایی در پردازش آهنگ پیش اومد. لطفاً دوباره تلاش کنید.");
      return ctx.scene.leave();
    }
  },
  
  // مرحله ۵: دریافت کاور و ارسال نهایی
  async (ctx) => {
    let user;
    try {
      if (!ctx.message.photo || ctx.message.photo.length === 0) {
        await ctx.reply("⚠️ لطفاً عکس ارسال کنید.");
        return;
      }
      
      user = userData.get(ctx.from.id);
      if (!user) {
        await ctx.reply("⚠️ اطلاعات شما یافت نشد. لطفاً از /start شروع کنید.");
        return ctx.scene.leave();
      }
      
      user.cover = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      
      const formatted = formatForm(user.form, ctx.from.username);
      
      await ctx.reply("⏳ در حال ارسال اطلاعات به گروه...");
      
      try {
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
        
        await ctx.reply("✅ اطلاعات شما با موفقیت ارسال شد! منتظر تأیید باشید.");
        
      } catch (sendError) {
        console.error('Error sending to group:', sendError);
        await ctx.reply("❌ خطایی در ارسال اطلاعات به گروه رخ داد. لطفاً دوباره تلاش کنید.");
        return ctx.scene.leave();
      }
      
    } catch (error) {
      console.error('Error in final step:', error);
      await ctx.reply("❌ خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید.");
    } finally {
      if (ctx.from && ctx.from.id) {
        userData.delete(ctx.from.id);
      }
      return ctx.scene.leave();
    }
  }
);

// هندلر برای پیام‌های خارج از سن‌ها
registrationWizard.on('message', async (ctx) => {
  await ctx.reply("⚠️ لطفاً از دکمه‌ها استفاده کنید یا دستور /start رو بزنید.");
});

// ===========================
// تنظیم سن‌ها و میدلورها
// ===========================
const { Stage } = require('telegraf/scenes');
const stage = new Stage([registrationWizard]);

bot.use(session());
bot.use(stage.middleware());

// ===========================
// هندلر خطاهای全局
// ===========================
bot.catch(async (err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  try {
    await ctx.reply("⚠️ خطای سیستمی پیش اومد. لطفاً دوباره تلاش کنید.");
    if (ctx.from?.id) {
      userData.delete(ctx.from.id);
    }
  } catch (e) {
    console.error('Error in error handler:', e);
  }
});

// ===========================
// راه‌اندازی وب‌سرور و وب‌هوک
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
    concurrentUsers: messageQueue.size,
    activeUsers: userData.size,
    uptime: process.uptime()
  });
});

expressApp.get('/queue-status', (req, res) => {
  res.json({
    pending: messageQueue.size,
    active: messageQueue.pending,
    completed: messageQueue.completed,
    usersInQueue: userData.size
  });
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
        console.log(`👥 Queue system ready - Max concurrent users: 3`);
        console.log(`📊 Monitoring available at /queue-status`);
      });
    } else {
      await bot.launch();
      console.log('🤖 Bot started with polling');
      console.log(`👥 Queue system ready - Max concurrent users: 3`);
    }
    
    console.log('✅ Eclis Registry Bot v2.1 is ready!');
  } catch (error) {
    console.error('❌ Error starting bot:', error);
    process.exit(1);
  }
}

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

startBot();
