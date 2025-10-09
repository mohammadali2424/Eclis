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
// ایجاد صف ساده برای مدیریت کاربران همزمان
// ===========================
class SimpleQueue {
  constructor(concurrency = 5) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.next();
    });
  }

  next() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { task, resolve, reject } = this.queue.shift();

    task()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        this.running--;
        this.next();
      });
  }

  get size() {
    return this.queue.length;
  }

  get pending() {
    return this.running;
  }
}

const messageQueue = new SimpleQueue(5); // ۵ کاربر همزمان

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
    this.cleanupInterval = setInterval(() => this.cleanup(), 30 * 60 * 1000); // هر ۳۰ دقیقه پاکسازی
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
      data.timestamp = Date.now(); // به روزرسانی timestamp
    }
    return data;
  }

  delete(userId) {
    return this.userData.delete(userId);
  }

  cleanup() {
    const now = Date.now();
    const expiredTime = 60 * 60 * 1000; // ۱ ساعت
    
    for (const [userId, data] of this.userData.entries()) {
      if (now - data.timestamp > expiredTime) {
        this.userData.delete(userId);
        console.log(`Cleaned up expired user data: ${userId}`);
      }
    }
  }
}

const userData = new UserDataManager();

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
      
      // تاخیر برای رعایت rate limit تلگرام
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
      if (!ctx.message.text) {
        await ctx.reply("⚠️ لطفاً فقط متن فرم رو ارسال کنید.");
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
    try {
      if (!ctx.message.photo || ctx.message.photo.length === 0) {
        await ctx.reply("⚠️ لطفاً عکس ارسال کنید.");
        return;
      }
      
      const user = userData.get(ctx.from.id);
      if (!user) {
        await ctx.reply("⚠️ اطلاعات شما یافت نشد. لطفاً از /start شروع کنید.");
        return ctx.scene.leave();
      }
      
      user.cover = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      
      // فرمت‌بندی و ارسال نهایی
      const formatted = formatForm(user.form, ctx.from.username);
      
      // ارسال به گروه با استفاده از صف
      await ctx.reply("⏳ در حال ارسال اطلاعات به گروه...");
      
      // ارسال اطلاعات به گروه با مدیریت صف
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
      
    } catch (error) {
      console.error('Error in final step:', error);
      await ctx.reply("❌ خطایی در ارسال اطلاعات رخ داد. لطفاً دوباره تلاش کنید.");
    } finally {
      // پاک کردن داده‌های کاربر بدون توجه به موفقیت یا شکست
      userData.delete(ctx.from.id);
      return ctx.scene.leave();
    }
  }
);

// ===========================
// هندلر خطاهای全局
// ===========================
bot.catch(async (err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  try {
    await ctx.reply("⚠️ خطای سیستمی پیش اومد. لطفاً دوباره تلاش کنید.");
    userData.delete(ctx.from?.id);
  } catch (e) {
    console.error('Error in error handler:', e);
  }
});

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
    service: 'Eclis Registry Bot v2.0',
    queueSize: messageQueue.size,
    activeUsers: messageQueue.pending,
    totalUsers: userData.userData.size,
    uptime: process.uptime()
  });
});

// مسیر برای بررسی وضعیت صف
expressApp.get('/queue-status', (req, res) => {
  res.json({
    pending: messageQueue.size,
    active: messageQueue.pending,
    usersInQueue: userData.userData.size
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
        console.log(`👥 Queue system ready - Max concurrent users: 5`);
        console.log(`📊 Monitoring available at /queue-status`);
      });
    } else {
      // در محیط توسعه از polling استفاده می‌کنیم
      await bot.launch();
      console.log('🤖 Bot started with polling');
      console.log(`👥 Queue system ready - Max concurrent users: 5`);
    }
    
    console.log('✅ Eclis Registry Bot v2.0 is ready!');
  } catch (error) {
    console.error('❌ Error starting bot:', error);
    process.exit(1);
  }
}

// هندلرهای خروج تمیز
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

// شروع ربات
startBot();
