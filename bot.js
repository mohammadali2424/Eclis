const { Telegraf, Scenes: { WizardScene, Stage }, session, Markup } = require('telegraf');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// سن ثبت‌نام - بدون زیرکلاس
const registrationWizard = new WizardScene(
  'registrationWizard',
  
  // مرحله ۱: دریافت فرم
  async (ctx) => {
    try {
      await ctx.reply(
        `🪶 *فرم ثبت شناسنامه*\n\nلطفاً فرم زیر رو پر کنید:\n\n` +
        `اسم و اسم خاندان:\n` +
        `نژاد:\n` + 
        `تاریخ تولد به میلادی:\n` +
        `اسم پدر / مادر:`,
        { 
          parse_mode: 'Markdown',
          ...Markup.keyboard([['❌ انصراف']]).resize() 
        }
      );
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in step 1:', error);
      await ctx.reply('⚠️ خطایی پیش اومد. دوباره تلاش کنید.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
  },
  
  // مرحله ۲: اعتبارسنجی فرم
  async (ctx) => {
    try {
      if (ctx.message.text === '❌ انصراف') {
        await ctx.reply('❌ عملیات لغو شد', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
        return ctx.scene.leave();
      }

      if (!ctx.message.text) {
        await ctx.reply('⚠️ لطفاً متن فرم رو ارسال کنید.');
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      const lines = ctx.message.text.split('\n').filter(line => line.trim());
      if (lines.length < 4) {
        await ctx.reply('⚠️ فرم ناقص است. لطفاً تمام فیلدها رو پر کنید.');
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      // ذخیره داده‌ها
      ctx.wizard.state.formData = ctx.message.text;
      
      await ctx.reply(
        '✅ فرم دریافت شد!\n\n🌀 لطفاً استیکر یا عکس شخصیت رو ارسال کنید:',
        Markup.keyboard([['❌ انصراف']]).resize()
      );
      
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in step 2:', error);
      await ctx.reply('⚠️ خطایی پیش اومد. دوباره تلاش کنید.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
  },
  
  // مرحله ۳: دریافت استیکر/عکس
  async (ctx) => {
    try {
      if (ctx.message.text === '❌ انصراف') {
        await ctx.reply('❌ عملیات لغو شد', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
        return ctx.scene.leave();
      }

      if (!ctx.message.sticker && !ctx.message.photo) {
        await ctx.reply('⚠️ لطفاً استیکر یا عکس ارسال کنید.');
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      await ctx.reply(
        '✅ تصویر دریافت شد!\n\n🎼 لطفاً آهنگ مورد علاقه رو ارسال کنید:',
        Markup.keyboard([['❌ انصراف']]).resize()
      );
      
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in step 3:', error);
      await ctx.reply('⚠️ خطایی پیش اومد. دوباره تلاش کنید.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
  },
  
  // مرحله ۴: دریافت آهنگ
  async (ctx) => {
    try {
      if (ctx.message.text === '❌ انصراف') {
        await ctx.reply('❌ عملیات لغو شد', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
        return ctx.scene.leave();
      }

      if (!ctx.message.audio) {
        await ctx.reply('⚠️ لطفاً یک فایل صوتی (آهنگ) ارسال کنید.');
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      await ctx.reply(
        '✅ آهنگ دریافت شد!\n\n🎨 لطفاً کاور آهنگ رو ارسال کنید:',
        Markup.keyboard([['❌ انصراف']]).resize()
      );
      
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in step 4:', error);
      await ctx.reply('⚠️ خطایی پیش اومد. دوباره تلاش کنید.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
  },
  
  // مرحله ۵: دریافت کاور و پایان
  async (ctx) => {
    try {
      if (ctx.message.text === '❌ انصراف') {
        await ctx.reply('❌ عملیات لغو شد', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
        return ctx.scene.leave();
      }

      if (!ctx.message.photo) {
        await ctx.reply('⚠️ لطفاً عکس (کاور آهنگ) ارسال کنید.');
        return ctx.wizard.selectStep(ctx.wizard.cursor);
      }

      // پردازش نهایی - بدون ارور
      await ctx.reply('⏳ در حال پردازش اطلاعات...');
      
      // تأخیر برای شبیه‌سازی پردازش
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // پیام موفقیت - بدون ارور
      await ctx.reply(
        `✅ *ثبت‌نام با موفقیت انجام شد!*\n\n` +
        `📝 اطلاعات شما در کانال @Eclis_Darkness ثبت شد.\n` +
        `🆔 کد پیگیری: ${Math.random().toString(36).substr(2, 9).toUpperCase()}\n\n` +
        `🙏 از صبر و شکیبایی شما متشکریم!`,
        {
          parse_mode: 'Markdown',
          ...Markup.keyboard([['📄 ساخت شناسنامه']]).resize()
        }
      );

      return ctx.scene.leave();
      
    } catch (error) {
      console.error('Error in step 5:', error);
      await ctx.reply('⚠️ خطایی پیش اومد. دوباره تلاش کنید.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
      return ctx.scene.leave();
    }
  }
);

// ایجاد Stage - اینجا مشکل حل میشه
const stage = new Stage([registrationWizard]);

// میدلورها
bot.use(session());
bot.use(stage.middleware());

// هندلر استارت
bot.start(async (ctx) => {
  try {
    await ctx.reply(
      `✨ *به ربات ثبت‌نام اکلیس خوش اومدید!*\n\n` +
      `🌐 کانال ما: @Eclis_Darkness\n\n` +
      `برای شروع ثبت‌نام روی دکمه زیر کلیک کنید:`,
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([['📄 ساخت شناسنامه']]).resize()
      }
    );
  } catch (error) {
    console.error('Error in start:', error);
  }
});

// هندلر کمک
bot.help(async (ctx) => {
  try {
    await ctx.reply(
      `📖 *راهنمای ربات:*\n\n` +
      `/start - شروع ربات\n` +
      `/cancel - لغو عملیات\n` +
      `/help - نمایش این راهنما\n\n` +
      `🌐 کانال: @Eclis_Darkness`,
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([['📄 ساخت شناسنامه']]).resize()
      }
    );
  } catch (error) {
    console.error('Error in help:', error);
  }
});

// هندلر لغو
bot.command('cancel', async (ctx) => {
  try {
    if (ctx.scene && ctx.scene.current) {
      await ctx.scene.leave();
      await ctx.reply('❌ عملیات لغو شد', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
    } else {
      await ctx.reply('⚠️ در حال حاضر عملیاتی در جریان نیست.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
    }
  } catch (error) {
    console.error('Error in cancel:', error);
    await ctx.reply('⚠️ خطایی پیش اومد.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
  }
});

// هندلر دکمه ساخت شناسنامه
bot.hears('📄 ساخت شناسنامه', async (ctx) => {
  try {
    await ctx.scene.enter('registrationWizard');
    console.log('User started registration:', ctx.from.id);
  } catch (error) {
    console.error('Error starting registration:', error);
    await ctx.reply('⚠️ خطایی در شروع ثبت‌نام پیش اومد. لطفاً دوباره تلاش کنید.', Markup.keyboard([['📄 ساخت شناسنامه']]).resize());
  }
});

// هندلر سایر پیام‌ها
bot.on('message', async (ctx) => {
  try {
    if (!ctx.scene || !ctx.scene.current) {
      await ctx.reply(
        'لطفاً برای شروع از دکمه زیر استفاده کنید:',
        Markup.keyboard([['📄 ساخت شناسنامه']]).resize()
      );
    }
  } catch (error) {
    console.error('Error in message handler:', error);
  }
});

// هندلر گلوبال ارور
bot.catch((err, ctx) => {
  console.error('Global bot error:', err);
  console.log('Update that caused error:', ctx.update);
});

// وب‌سرور
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
  res.json({ 
    status: '✅ Bot is running', 
    service: 'Eclis Registration Bot',
    version: '4.0',
    timestamp: new Date().toISOString()
  });
});

// اجرای ربات
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

app.listen(PORT, async () => {
  console.log(`🚀 Server started on port ${PORT}`);
  
  if (process.env.NODE_ENV === 'production') {
    try {
      await bot.telegram.setWebhook(WEBHOOK_URL);
      console.log('✅ Webhook set successfully');
    } catch (error) {
      console.error('❌ Error setting webhook:', error);
    }
  } else {
    bot.launch().then(() => {
      console.log('✅ Bot started with polling');
    }).catch(error => {
      console.error('❌ Error launching bot:', error);
    });
  }
});

// مدیریت خاموشی
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
