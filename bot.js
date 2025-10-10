const { Telegraf, Scenes: { WizardScene }, session, Markup } = require('telegraf');
const { Stage } = require('telegraf/scenes');
const express = require('express');
const dotenv = require('dotenv');

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
// ایجاد صف ساده و پایدار برای مدیریت کاربران همزمان
// ===========================
class SimpleQueue {
  constructor(concurrency = 3) {
    this.concurrency = concurrency;
    this.active = 0;
    this.queue = [];
  }

  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this._next();
    });
  }

  _next() {
    if (this.active >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.active++;
    const { task, resolve, reject } = this.queue.shift();

    const next = () => {
      this.active--;
      this._next();
    };

    Promise.resolve(task())
      .then((result) => {
        resolve(result);
        next();
      })
      .catch((error) => {
        reject(error);
        next();
      });
  }

  get size() {
    return this.queue.length;
  }

  get pending() {
    return this.active;
  }

  get completed() {
    return 0;
  }
}

const messageQueue = new SimpleQueue(3);

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
  const lines = formText.trim().split('\n').filter(line => line.trim());
  
  const requiredFields = [
    "اسم و اسم خاندان:",
    "نژاد:",
    "تاریخ تولد به میلادی:",
    "اسم پدر / مادر:",
    "زیر کلاس:"
  ];
  
  return lines.length >= 5 && requiredFields.every(field => 
    formText.includes(field)
  );
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
    `👤 نام و خاندان: ${values['name']}\n` +
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
          thumb: media.thumb ? { source: media.thumb } : undefined
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
// تعریف WizardScene برای ثبت‌نام
// ===========================
const registrationWizard = new WizardScene(
  'registrationWizard',
  
  // مرحله ۱: دریافت فرم
  async (ctx) => {
    try {
      // بررسی کنید که آیا کاربر از دکمه منو آمده یا مستقیما پیا�� فرستاده
      if (ctx.message && ctx.message.text === '📄 ساخت شناسنامه') {
        // اگر کاربر دوباره دکمه را زد، اطلاعات قبلی را پاک کنید
        if (ctx.from?.id) {
          userData.delete(ctx.from.id);
        }
        
        await ctx.reply(
          "🪶 لطفاً فرم زیر رو کپی کرده و پر کنید:\n\n" +
          "🪶 اسم و اسم خاندان:\n" +
          "🪶 نژاد:\n" +
          "🪶 تاریخ تولد به میلادی:\n" +
          "🪶 اسم پدر / مادر:\n" +
          "🪶 زیر کلاس:"
        );
      }
      
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
      // اگر کاربر پیام متنی نفرستاده باشد
      if (!ctx.message || !ctx.message.text) {
        await ctx.reply("⚠️ لطفاً فقط متن فرم رو ارسال کنید.");
        return ctx.wizard.selectStep(ctx.wizard.cursor); // در همین مرحله بماند
      }

      const formText = ctx.message.text;
      
      if (!validateForm(formText)) {
        await ctx.reply("❌ فرم ارسالی ناقص است. لطفاً همه فیلدهای لازم رو پر کنید و دوباره تلاش کنید.\n\nفرم باید شامل این فیلدها باشد:\n- اسم و اسم خاندان\n- نژاد\n- تاریخ تولد به میلادی\n- اسم پدر / مادر\n- زیر کلاس");
        return ctx.wizard.selectStep(ctx.wizard.cursor); // در همین مرحله بماند
      }
      
      // ذخیره فرم
      const user = userData.get(ctx.from.id) || {};
      user.form = formText;
      userData.set(ctx.from.id, user);
      
      await ctx.reply("✅ فرم شما دریافت شد!\n\n🌀 لطفاً استیکر رولتون یا عکس واضح از کرکترتون رو ارسال کنید.");
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
        await ctx.reply("⚠️ لطفاً فقط استیکر یا عکس ارسال کنید.");
        return ctx.wizard.selectStep(ctx.wizard.cursor); // در همین مرحله بماند
      }
      
      const user = userData.get(ctx.from.id) || {};
      user.sticker = fileId;
      user.mediaType = mediaType;
      userData.set(ctx.from.id, user);
      
      await ctx.reply("✅ رسانه دریافت شد!\n\n🎼 لطفاً آهنگ مورد علاقتون رو ارسال کنید.");
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
        await ctx.reply("⚠️ لطفاً یک فایل صوتی (آهنگ) ارسال کنید.");
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }
      
      const user = userData.get(ctx.from.id) || {};
      user.song = ctx.message.audio.file_id;
      userData.set(ctx.from.id, user);
      
      await ctx.reply("✅ آهنگ دریافت شد!\n\n🎨 لطفاً کاور ��هنگ رو ارسال کنید.");
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
        await ctx.reply("⚠️ لطفاً عکس (کاور آهنگ) ارسال کنید.");
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }
      
      user = userData.get(ctx.from.id);
      if (!user || !user.form) {
        await ctx.reply("⚠️ اطلاعات شما یافت نشد. لطفاً از /start شروع کنید.");
        return ctx.scene.leave();
      }
      
      user.cover = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      userData.set(ctx.from.id, user);
      
      const formatted = formatForm(user.form, ctx.from.username);
      
      await ctx.reply("⏳ در حال ارسال اطلاعات به گروه... لطفاً صبر کنید.");
      
      // ارسال اطلاعات به گروه
      try {
        await safeSendToGroup(ctx, "��� شناسنامه جدید ارسال شد:");
        await safeSendToGroup(ctx, formatted);
        
        if (user.sticker) {
          await safeSendToGroup(ctx, null, {
            type: user.mediaType,
            fileId: user.sticker
          });
        }
        
        if (user.song) {
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
      }
      
    } catch (error) {
      console.error('Error in final step:', error);
      await ctx.reply("❌ خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید.");
    } finally {
      // پاک کردن داده‌های کاربر در هر صورت
      if (ctx.from && ctx.from.id) {
        userData.delete(ctx.from.id);
      }
      return ctx.scene.leave();
    }
  }
);

// هندلر برای پیام‌های خارج از سن‌ها در WizardScene
registrationWizard.use(async (ctx, next) => {
  try {
    // اگر کاربر در حالتی که انتظار داریم پیام خاصی بفرستد، پیام نامربوط فرستاد
    if (ctx.message && ctx.message.text && 
        (ctx.message.text === '📄 ساخت شناسنامه' || ctx.message.text === '🏦 ورود به بانک')) {
      await ctx.reply("⚠️ در حال حاضر در حال ثبت شناسنامه هستید. لطفاً مراحل رو تکمیل کنید یا /cancel رو بزنین.");
      return;
    }
    return next();
  } catch (error) {
    console.error('Error in wizard middleware:', error);
  }
});

// ===========================
// تنظیم سن‌ها و میدلورها
// ===========================
const stage = new Stage([registrationWizard]);

bot.use(session());
bot.use(stage.middleware());

// ===========================
// هندلرهای اصلی
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

// هندلر دکمه "ساخت شناسنامه" - اینجا مشکل اصلی حل شده
bot.hears('📄 ساخت شناسنامه', async (ctx) => {
  try {
    // ابتدا کاربر را به صحنه ویزارد منتقل می‌کنیم
    await ctx.scene.enter('registrationWizard');
    
    // سپس پیام راهنما را ارسال می‌کنیم
    await ctx.reply(
      "🪶 لطفاً فرم زیر رو کپی کرده و پر کنید:\n\n" +
      "🪶 اسم و اسم خاندان:\n" +
      "🪶 نژاد:\n" +
      "🪶 تاریخ تولد به میلادی:\n" +
      "🪶 اسم پدر / مادر:\n" +
      "🪶 زیر کلاس:"
    );
    
    // ذخیره داده کاربر
    userData.set(ctx.from.id, {});
    
  } catch (error) {
    console.error('Error entering scene:', error);
    await ctx.reply("⚠️ خطایی در شروع فرآیند ثبت‌نام پیش اومد. لطفاً دوباره تلاش کنید.");
  }
});

// دستور cancel برای خروج از صحنه
bot.command('cancel', async (ctx) => {
  if (ctx.scene?.current) {
    if (ctx.from?.id) {
      userData.delete(ctx.from.id);
    }
    await ctx.reply("❌ فرآیند ثبت‌نام لغو شد.");
    return ctx.scene.leave();
  } else {
    await ctx.reply("❌ در حال حاضر در حال ثبت‌نام نیستید.");
  }
});

// ===========================
// هندلر خطاهای全局
// ===========================
bot.catch(async (err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  try {
    await ctx.reply("⚠️ خطای سیستمی پیش اومد. لطفاً دوباره تلاش کنید.");
    if (ctx.from?.id) {
      userData.delete(ctx.from.id);
      if (ctx.scene?.current) {
        await ctx.scene.leave();
      }
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
    service: 'Eclis Registry Bot v2.3',
    queueStatus: {
      pending: messageQueue.size,
      active: messageQueue.pending,
      usersInQueue: userData.size
    },
    uptime: process.uptime()
  });
});

expressApp.get('/queue-status', (req, res) => {
  res.json({
    pending: messageQueue.size,
    active: messageQueue.pending,
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
        console.log(`👥 Custom queue system ready - Max concurrent users: 3`);
        console.log(`📊 Monitoring available at /queue-status`);
      });
    } else {
      await bot.launch();
      console.log('🤖 Bot started with polling');
      console.log(`👥 Custom queue system ready - Max concurrent users: 3`);
    }
    
    console.log('✅ Eclis Registry Bot v2.3 is ready!');
    console.log('✅ Fixed: WizardScene issues and message handling');
  } catch (error) {
    console.error('❌ Error starting bot:', error);
    process.exit(1);
  }
}

// مدیریت graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  if (userData.cleanupInterval) {
    clearInterval(userData.cleanupInterval);
  }
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  if (userData.cleanupInterval) {
    clearInterval(userData.cleanupInterval);
  }
  bot.stop('SIGTERM');
  process.exit(0);
});

startBot();
