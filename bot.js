const { Telegraf, Scenes: { WizardScene, Stage }, session, Markup } = require('telegraf');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// سن ثبت‌نام
const registrationWizard = new WizardScene(
  'registrationWizard',
  
  // مرحله ۱
  async (ctx) => {
    await ctx.reply(
      '🪶 فرم ثبت شناسنامه:\n\nاسم و اسم خاندان:\nنژاد:\nتاریخ تولد به میلادی:\nاسم پدر / مادر:',
      Markup.keyboard([['❌ انصراف']]).resize()
    );
    return ctx.wizard.next();
  },
  
  // مرحله ۲
  async (ctx) => {
    if (ctx.message.text === '❌ انصراف') {
      await ctx.reply('❌ لغو شد', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
    
    // ذخیره داده‌ها
    ctx.wizard.state.formData = ctx.message.text;
    await ctx.reply('✅ فرم دریافت شد! استیکر یا عکس بفرستید.');
    return ctx.wizard.next();
  },
  
  // مرحله ۳
  async (ctx) => {
    if (ctx.message.text === '❌ انصراف') {
      await ctx.reply('❌ لغو شد', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
    
    if (ctx.message.sticker || ctx.message.photo) {
      await ctx.reply('✅ مدیا دریافت شد! آهنگ بفرستید.');
      return ctx.wizard.next();
    } else {
      await ctx.reply('⚠️ لطفاً استیکر یا عکس بفرستید.');
    }
  },
  
  // مرحله ۴
  async (ctx) => {
    if (ctx.message.text === '❌ انصراف') {
      await ctx.reply('❌ لغو شد', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
    
    if (ctx.message.audio) {
      await ctx.reply('✅ آهنگ دریافت شد! کاور آهنگ رو بفرستید.');
      return ctx.wizard.next();
    } else {
      await ctx.reply('⚠️ لطفاً آهنگ بفرستید.');
    }
  },
  
  // مرحله ۵
  async (ctx) => {
    if (ctx.message.text === '❌ انصراف') {
      await ctx.reply('❌ لغو شد', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
    
    if (ctx.message.photo) {
      await ctx.reply('⏳ در حال پردازش...');
      
      // شبیه‌سازی تأخیر
      setTimeout(() => {
        ctx.reply(
          `✅ ثبت‌نام کامل شد!\nکانال: @Eclis_Darkness\nکد: ${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
          Markup.keyboard([['📄 ساخت شناسنامه']]).resize()
        );
      }, 2000);
      
      return ctx.scene.leave();
    } else {
      await ctx.reply('⚠️ لطفاً عکس کاور رو بفرستید.');
    }
  }
);

// Stage ایجاد - اینجا مشکل حل میشه
const stage = new Stage([registrationWizard]);

// میدلورها
bot.use(session());
bot.use(stage.middleware());

// دستورات
bot.start((ctx) => {
  ctx.reply(
    '✨ به ربات اکلیس خوش اومدی!',
    Markup.keyboard([['📄 ساخت شناسنامه']]).resize()
  );
});

bot.help((ctx) => {
  ctx.reply('📞 کانال: @Eclis_Darkness');
});

bot.command('cancel', (ctx) => {
  if (ctx.scene.current) {
    ctx.scene.leave();
    ctx.reply('❌ لغو شد', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
  }
});

bot.hears('📄 ساخت شناسنامه', (ctx) => {
  ctx.scene.enter('registrationWizard');
});

// وب‌سرور
app.use(express.json());
app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.json({ status: '✅ Bot is running', version: '3.0' });
});

// اجرا
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 Bot server started on port', PORT);
  
  if (process.env.NODE_ENV === 'production') {
    bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}`);
    console.log('✅ Webhook set');
  } else {
    bot.launch();
    console.log('✅ Bot started with polling');
  }
});

// مدیریت خاموشی
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
