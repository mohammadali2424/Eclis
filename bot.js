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
  webhookUrl: process.env.WEBHOOK_URL || "https://eclis-registery-bot.onrender.com/webhook"
};

if (!config.token) {
  console.error('❌ BOT_TOKEN is required in environment variables!');
  process.exit(1);
}

// ===========================
// Database Service (ساده و مؤثر)
// ===========================
class UserDatabase {
  constructor() {
    this.users = new Map();
    this.registrationCount = 0;
  }

  addUser(userData) {
    this.registrationCount++;
    const userRecord = {
      id: this.registrationCount,
      userId: userData.userId,
      username: userData.username,
      characterName: userData.characterName,
      race: userData.race,
      birthDate: userData.birthDate,
      parents: userData.parents,
      registrationDate: new Date().toLocaleString('fa-IR'),
      timestamp: Date.now()
    };
    
    this.users.set(userData.userId, userRecord);
    return userRecord;
  }

  getUser(userId) {
    return this.users.get(userId);
  }

  getAllUsers() {
    return Array.from(this.users.values());
  }

  getStats() {
    return {
      totalRegistrations: this.registrationCount,
      activeUsers: this.users.size,
      lastRegistration: this.registrationCount > 0 ? this.getAllUsers()[this.getAllUsers().length - 1] : null
    };
  }
}

// ===========================
// Initialize Services
// ===========================
const userDB = new UserDatabase();
const bot = new Telegraf(config.token);
const app = express();

// ===========================
// Form Parser
// ===========================
class FormParser {
  static parse(formText) {
    const lines = formText.split('\n');
    const result = {
      name: "نامشخص",
      race: "نامشخص", 
      birth: "نامشخص",
      parents: "نامشخص"
    };
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.includes('اسم و اسم خاندان:')) {
        result.name = trimmed.replace('اسم و اسم خاندان:', '').trim();
      } else if (trimmed.includes('نژاد:')) {
        result.race = trimmed.replace('نژاد:', '').trim();
      } else if (trimmed.includes('تاریخ تولد به میلادی:')) {
        result.birth = trimmed.replace('تاریخ تولد به میلادی:', '').trim();
      } else if (trimmed.includes('اسم پدر / مادر:')) {
        result.parents = trimmed.replace('اسم پدر / مادر:', '').trim();
      }
    });
    
    return result;
  }

  static validate(formText) {
    if (!formText) return { isValid: false, error: 'فرم خالی است' };
    
    const lines = formText.split('\n').filter(line => line.trim());
    if (lines.length < 4) return { isValid: false, error: 'فرم ناقص است' };
    
    const parsed = this.parse(formText);
    if (parsed.name === "نامشخص") return { isValid: false, error: 'نام وارد نشده' };
    if (parsed.race === "نامشخص") return { isValid: false, error: 'نژاد وارد نشده' };
    
    return { isValid: true, data: parsed };
  }
}

// ===========================
// Message Templates
// ===========================
const Messages = {
  welcome: `✨ *به ربات ثبت‌نام اکلیس خوش آمدید!*

🌐 *کانال ما:* @Eclis_Darkness

برای ساخت شناسنامه شخصیت، روی دکمه زیر کلیک کنید:`,

  help: `📖 *راهنمای ربات*

🔹 *دستورات موجود:*
/start - شروع ربات
/status - وضعیت ربات
/cancel - لغو عملیات
/help - نمایش راهنما

🌐 *کانال:* @Eclis_Darkness`,

  formTemplate: `🪶 *فرم ثبت شناسنامه*

لطفاً اطلاعات شخصیت خود را در قالب زیر وارد کنید:

🪶 *اسم و اسم خاندان:*
🪶 *نژاد:*
🪶 *تاریخ تولد به میلادی:*
🪶 *اسم پدر / مادر:*

⚠️ لطفاً تمام خطوط را کپی کرده و پر کنید.`,

  success: (userData, trackingCode) => `✅ *ثبت‌نام با موفقیت انجام شد!*

📝 *اطلاعات ثبت شده:*
👤 نام: ${userData.name}
🧬 نژاد: ${userData.race}
📅 تولد: ${userData.birth}
👨‍👩‍👧 والدین: ${userData.parents}

🆔 *کد پیگیری:* ${trackingCode}
🌐 *کانال:* @Eclis_Darkness

🙏 از همراهی شما متشکریم!`,

  adminReport: (userRecord, formData, telegramUser) => `🎉 *ثبت‌نام جدید - کاربر #${userRecord.id}*

📋 *اطلاعات شخصیت:*
👤 نام: ${formData.name}
🧬 نژاد: ${formData.race} 
📅 تولد: ${formData.birth}
👨‍👩‍👧 والدین: ${formData.parents}

👨‍💼 *اطلاعات کاربر:*
🆔 ایدی عددی: ${telegramUser.id}
📛 نام کاربری: @${telegramUser.username || 'ندارد'}
👤 نام کامل: ${telegramUser.first_name} ${telegramUser.last_name || ''}

⏰ *زمان ثبت:* ${userRecord.registrationDate}
📊 *شماره ثبت:* ${userRecord.id}`
};

// ===========================
// Registration Wizard Scene
// ===========================
const registrationWizard = new WizardScene(
  'registrationWizard',
  
  // Step 1: Receive Form
  async (ctx) => {
    try {
      await ctx.reply(
        Messages.formTemplate,
        { 
          parse_mode: 'Markdown',
          ...Markup.keyboard([['❌ انصراف']]).resize()
        }
      );
      return ctx.wizard.next();
    } catch (error) {
      console.error('Step 1 error:', error);
      await ctx.reply('⚠️ خطایی پیش آمد.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
  },
  
  // Step 2: Validate Form
  async (ctx) => {
    try {
      if (ctx.message.text === '❌ انصراف') {
        await ctx.reply('❌ عملیات لغو شد.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
        return ctx.scene.leave();
      }

      const validation = FormParser.validate(ctx.message.text);
      if (!validation.isValid) {
        await ctx.reply(`❌ ${validation.error}\n\nلطفاً فرم را کامل پر کنید.`);
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      ctx.wizard.state.formData = validation.data;
      
      await ctx.reply(
        '✅ *فرم تأیید شد!*\n\n🌀 لطفاً استیکر یا عکس شخصیت را ارسال کنید:',
        { 
          parse_mode: 'Markdown',
          ...Markup.keyboard([['❌ انصراف']]).resize()
        }
      );
      
      return ctx.wizard.next();
    } catch (error) {
      console.error('Step 2 error:', error);
      await ctx.reply('⚠️ خطایی پیش آمد.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
  },
  
  // Step 3: Receive Character Media
  async (ctx) => {
    try {
      if (ctx.message.text === '❌ انصراف') {
        await ctx.reply('❌ عم��یات لغو شد.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
        return ctx.scene.leave();
      }

      if (!ctx.message.sticker && !ctx.message.photo) {
        await ctx.reply('⚠️ لطفاً استیکر یا عکس ارسال کنید.');
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      await ctx.reply(
        '✅ *تصویر دریافت شد!*\n\n🎼 لطفاً آهنگ مورد علاقه را ارسال کنید:',
        { 
          parse_mode: 'Markdown',
          ...Markup.keyboard([['❌ انصراف']]).resize()
        }
      );
      
      return ctx.wizard.next();
    } catch (error) {
      console.error('Step 3 error:', error);
      await ctx.reply('⚠️ خطایی پیش آمد.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
  },
  
  // Step 4: Receive Favorite Song
  async (ctx) => {
    try {
      if (ctx.message.text === '❌ انصراف') {
        await ctx.reply('❌ عملیات لغو شد.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
        return ctx.scene.leave();
      }

      if (!ctx.message.audio) {
        await ctx.reply('⚠️ لطفاً یک فایل صوتی ارسال کنید.');
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      await ctx.reply(
        '✅ *آهنگ دریافت شد!*\n\n🎨 لطفاً کاور آهنگ را ارسال کنید:',
        { 
          parse_mode: 'Markdown',
          ...Markup.keyboard([['❌ انصراف']]).resize()
        }
      );
      
      return ctx.wizard.next();
    } catch (error) {
      console.error('Step 4 error:', error);
      await ctx.reply('⚠️ خطایی پیش آمد.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
  },
  
  // Step 5: Receive Song Cover and Finalize
  async (ctx) => {
    try {
      if (ctx.message.text === '❌ انصراف') {
        await ctx.reply('❌ عملیات لغو شد.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
        return ctx.scene.leave();
      }

      if (!ctx.message.photo) {
        await ctx.reply('⚠️ لطفاً عکس کاور آهنگ را ارسال کنید.');
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      await ctx.reply('⏳ *در حال پردازش نهایی...*', { parse_mode: 'Markdown' });

      // پردازش نهایی و ذخیره در دیتابیس
      const formData = ctx.wizard.state.formData;
      const trackingCode = Math.random().toString(36).substr(2, 9).toUpperCase();
      
      // ذخیره کاربر در دیتابیس
      const userRecord = userDB.addUser({
        userId: ctx.from.id,
        username: ctx.from.username,
        characterName: formData.name,
        race: formData.race,
        birthDate: formData.birth,
        parents: formData.parents
      });

      // ارسال گزارش به گروه
      try {
        await ctx.telegram.sendMessage(
          config.groupId,
          Messages.adminReport(userRecord, formData, ctx.from),
          { parse_mode: 'Markdown' }
        );
      } catch (groupError) {
        console.error('Error sending to group:', groupError);
      }

      // ارسال مدیاها به گروه
      try {
        // ارسال استیکر/عکس شخصیت
        if (ctx.wizard.state.characterMedia) {
          // اینجا می‌تونی مدیا رو هم ارسال کنی
        }
      } catch (mediaError) {
        console.error('Error sending media:', mediaError);
      }

      // تأخیر برای شبیه‌سازی پردازش
      await new Promise(resolve => setTimeout(resolve, 3000));

      // ارسال پیام موفقیت به کاربر
      await ctx.reply(
        Messages.success(formData, trackingCode),
        {
          parse_mode: 'Markdown',
          ...Markup.keyboard([['📄 ساخت شناسنامه']]).resize()
        }
      );

      console.log(`✅ New registration: User ${ctx.from.id} - ${formData.name}`);
      
      return ctx.scene.leave();
      
    } catch (error) {
      console.error('Step 5 error:', error);
      await ctx.reply('⚠️ خطایی در پردازش نهایی پیش آمد.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
  }
);

// ===========================
// Setup Stage and Middleware
// ===========================
const stage = new Stage([registrationWizard]);
bot.use(session());
bot.use(stage.middleware());

// ===========================
// Command Handlers
// ===========================
bot.start(async (ctx) => {
  await ctx.reply(
    Messages.welcome,
    {
      parse_mode: 'Markdown',
      ...Markup.keyboard([['📄 ساخت شناسنامه']]).resize()
    }
  );
});

bot.help(async (ctx) => {
  await ctx.reply(
    Messages.help,
    {
      parse_mode: 'Markdown',
      ...Markup.keyboard([['📄 ساخت شناسنامه']]).resize()
    }
  );
});

bot.command('status', async (ctx) => {
  const stats = userDB.getStats();
  const statusMessage = `📊 *وضعیت ربات*

👥 *آمار ثبت‌نام:*
• کل ثبت‌نام‌ها: ${stats.totalRegistrations}
• کاربران فعال: ${stats.activeUsers}
${stats.lastRegistration ? `• آخرین ثبت: کاربر #${stats.lastRegistration.id}` : ''}

🟢 *ربات فعال است*
🌐 @Eclis_Darkness`;

  await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
});

bot.command('cancel', async (ctx) => {
  if (ctx.scene?.current) {
    await ctx.scene.leave();
    await ctx.reply('❌ عملیات لغو شد.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
  }
});

bot.hears('📄 ساخت شناسنامه', async (ctx) => {
  await ctx.scene.enter('registrationWizard');
});

// ===========================
// Express Server Setup
// ===========================
app.use(express.json());

app.post('/webhook', async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

app.get('/', (req, res) => {
  const stats = userDB.getStats();
  res.json({
    status: '✅ Bot is running',
    service: 'Eclis Registration Bot',
    version: '4.0',
    registrations: stats.totalRegistrations,
    activeUsers: stats.activeUsers,
    timestamp: new Date().toISOString()
  });
});

app.get('/users', (req, res) => {
  const users = userDB.getAllUsers();
  res.json({
    total: users.length,
    users: users
  });
});

// ===========================
// Startup
// ===========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`🚀 Server started on port ${PORT}`);
  
  if (process.env.NODE_ENV === 'production') {
    try {
      await bot.telegram.setWebhook(config.webhookUrl);
      console.log('✅ Webhook set successfully');
    } catch (error) {
      console.error('❌ Error setting webhook:', error);
    }
  } else {
    bot.launch().then(() => {
      console.log('✅ Bot started with polling');
    });
  }
  
  console.log('📊 Bot ready - Database initialized');
});

// Graceful shutdown
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
