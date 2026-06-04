// @ts-nocheck
import "dotenv/config";
import express from "express";
import crypto from "crypto";
import { promises as fs } from "fs";
import { Markup, Telegraf } from "telegraf";

type Item = { title: string; price?: number; description?: string; category?: string; stock?: number; active: boolean };
type CartLine = { itemIndex: number; title: string; price?: number; qty: number };
type ShopOrder = {
  id: string;
  chatId: number;
  username?: string;
  lines: CartLine[];
  total: number;
  status: "NEW" | "CONFIRMED" | "PREPARING" | "SENT" | "DONE" | "CANCELED";
  createdAt: string;
  note?: string;
};
type MediaItem = {
  id: string;
  type: "photo" | "video" | "document";
  fileId: string;
  title?: string;
  caption?: string;
  category?: string;
  tags?: string[];
  uploadedBy?: number;
  createdAt: string;
  active: boolean;
  views?: number;
  downloads?: number;
};
type PaymentOrder = {
  id: string;
  chatId: number;
  username?: string;
  title: string;
  amount: number;
  authority?: string;
  refId?: string;
  status: "PENDING" | "PAID" | "FAILED" | "CANCELED";
  createdAt: string;
  paidAt?: string;
};
type FormResponse = {
  id: string;
  chatId: number;
  username?: string;
  questions: string[];
  answers: string[];
  status: "NEW" | "REVIEWED" | "ARCHIVED";
  createdAt: string;
  reviewedAt?: string;
};
type SupportTicket = {
  id: string;
  chatId: number;
  username?: string;
  topic: string;
  message: string;
  status: "OPEN" | "ANSWERED" | "CLOSED";
  createdAt: string;
  updatedAt?: string;
  adminReply?: string;
};
type ReservationBooking = {
  id: string;
  chatId: number;
  username?: string;
  service: string;
  requestedTime: string;
  contact: string;
  status: "NEW" | "CONFIRMED" | "REJECTED" | "DONE" | "CANCELED";
  createdAt: string;
};
type VipSubscription = {
  id: string;
  chatId: number;
  username?: string;
  plan: string;
  status: "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELED";
  createdAt: string;
  expiresAt?: string;
};
type InstagramSettings = {
  username: string;
  pageType: string;
  metaConnection: string;
  dmWelcome: string;
  dmKeywords: string[];
  commentKeywords: string[];
  leadQuestions: string[];
  bookingServices: string[];
  notes: string;
  pageAccessToken: string;
  instagramAccountId: string;
  webhookVerifyToken: string;
  graphApiVersion: string;
};

type InstagramLead = {
  id: string;
  source: "DM" | "COMMENT";
  externalUserId?: string;
  text: string;
  matchedKeyword?: string;
  status: "NEW" | "REPLIED" | "FAILED" | "ARCHIVED";
  createdAt: string;
  raw?: any;
};

type Settings = {
  businessName: string;
  welcomeMessage: string;
  supportContact: string;
  aboutText: string;
  items: Item[];
  mediaItems: MediaItem[];
  mediaCategories: string[];
  forceJoinEnabled: boolean;
  forceJoinChannel: string;
  autoDeleteSeconds: number;
  formQuestions: string[];
  formResponses: FormResponse[];
  payment: {
    paymentLink: string;
    cardNumber: string;
    cardHolder: string;
    zarinpalMerchantId: string;
    zarinpalSandbox: boolean;
    note: string;
  };
  instagram: InstagramSettings;
  instagramLeads: InstagramLead[];
  admins: number[];
  orders: PaymentOrder[];
  shopOrders: ShopOrder[];
  supportTickets: SupportTicket[];
  supportTopics: string[];
  quickReplies: string[];
  reservations: ReservationBooking[];
  vipSubscriptions: VipSubscription[];
  newsletterUsers: number[];
  quizResponses: FormResponse[];
};

type UserSession = {
  mode: "form" | "support" | "reservation" | "service" | "shop" | "course" | "media" | "quiz" | "vip" | "newsletter";
  step: number;
  answers: string[];
  meta?: Record<string, string>;
};

type AdminState =
  | { action: "ADD_ITEM" }
  | { action: "EDIT_ITEM"; index: number }
  | { action: "EDIT_FIELD"; field: "businessName" | "welcomeMessage" | "supportContact" | "aboutText" }
  | { action: "EDIT_FORM_QUESTIONS" }
  | { action: "SET_MEDIA_CATEGORIES" }
  | { action: "SET_FORCE_JOIN" }
  | { action: "SET_AUTO_DELETE" }
  | { action: "SET_SUPPORT_TOPICS" }
  | { action: "SET_QUICK_REPLIES" }
  | { action: "SET_IG_PROFILE" }
  | { action: "SET_IG_ACCESS_TOKEN" }
  | { action: "SET_IG_ACCOUNT_ID" }
  | { action: "SET_IG_VERIFY_TOKEN" }
  | { action: "SET_IG_DM_KEYWORDS" }
  | { action: "SET_IG_COMMENT_KEYWORDS" }
  | { action: "SET_IG_LEAD_QUESTIONS" }
  | { action: "SET_IG_BOOKING_SERVICES" }
  | { action: "SET_IG_NOTES" }
  | { action: "SET_RESERVATION_SERVICES" }
  | { action: "SET_COURSE_ITEMS" }
  | { action: "SET_VIP_PLANS" }
  | { action: "SET_QUIZ_QUESTIONS" }
  | { action: "REPLY_SUPPORT_TICKET"; ticketId: string }
  | { action: "SET_CARD" }
  | { action: "SET_PAYMENT_LINK" }
  | { action: "SET_ZARINPAL" }
  | { action: "TOGGLE_ZARINPAL_SANDBOX" }
  | { action: "ADD_ADMIN" }
  | { action: "BROADCAST" };

const token = process.env.CUSTOMER_BOT_TOKEN;
const primaryAdminId = Number(process.env.CUSTOMER_ADMIN_ID || "0");
const baseUrl = (process.env.BASE_URL || "").replace(/\/$/, "");
const dataPath = process.env.SETTINGS_FILE || "./data/settings.json";
const testExpiresAt = Number(process.env.TEST_EXPIRES_AT || "0");

const bot = new Telegraf(token || "missing");
const app = express();
app.use(express.json({
  limit: "5mb",
  verify: (req: any, _res, buf) => { req.rawBody = buf.toString("utf8"); }
}));

const status = { ready: false, startedAt: new Date().toISOString(), error: null as string | null };

const TEMPLATE_CODE: string = "IG_DM_AUTO_REPLY";
const TEMPLATE_TITLE = "پاسخگوی دایرکت اینستاگرام";
const FEATURES = [
  "اتوماسیون دایرکت اینستاگرام",
  "پاسخ بر اساس کلمه کلیدی",
  "چند ادمین",
  "گزارش‌گیری"
];
const FEATURE_CODES = [
  "INSTAGRAM_DM",
  "KEYWORD_AUTOMATION",
  "MULTI_ADMIN",
  "REPORTS"
];
const HAS_PAYMENT_GATEWAY = false;
const HAS_CARD_TO_CARD = false;
const HAS_ADMIN_PANEL = true;
const DETAILS_RAW = "{\n  \"mode\": \"options\",\n  \"template\": \"IG_DM_AUTO_REPLY\",\n  \"platform\": \"INSTAGRAM\",\n  \"flags\": [\n    \"welcomeDm\",\n    \"keywordReplies\",\n    \"leadCapture\",\n    \"reportToAdmin\",\n    \"connectionGuide\",\n    \"fallbackReply\"\n  ],\n  \"flagTitles\": [\n    \"👋 پیام خوش‌آمد دایرکت\",\n    \"🔑 پاسخ بر اساس کلمه کلیدی\",\n    \"🧾 دریافت نام و شماره مشتری\",\n    \"📩 ارسال گزارش لیدها برای ادمین\",\n    \"💬 پاسخ پیش‌فرض وقتی کلمه پیدا نشد\",\n    \"🔌 راهنمای اتصال رسمی Meta/API\"\n  ],\n  \"categories\": [],\n  \"contentModel\": \"FREE\",\n  \"autoDeleteSeconds\": 0,\n  \"raw\": \"قالب: پاسخگوی دایرکت اینستاگرام\\nپلتفرم: 📸 ربات اینستاگرام\\nامکانات انتخاب‌شده: 👋 پیام خوش‌آمد دایرکت، 🔑 پاسخ بر اساس کلمه کلیدی، 🧾 دریافت نام و شماره مشتری، 📩 ارسال گزارش لیدها برای ادمین، 💬 پاسخ پیش‌فرض وقتی کلمه پیدا نشد، 🔌 راهنمای اتصال رسمی Meta/API\"\n}";
const DETAIL_LINES = [
  "{",
  "\"mode\": \"options\",",
  "\"template\": \"IG_DM_AUTO_REPLY\",",
  "\"platform\": \"INSTAGRAM\",",
  "\"flags\": [",
  "\"welcomeDm\",",
  "\"keywordReplies\",",
  "\"leadCapture\",",
  "\"reportToAdmin\",",
  "\"connectionGuide\",",
  "\"fallbackReply\"",
  "],",
  "\"flagTitles\": [",
  "\"👋 پیام خوش‌آمد دایرکت\",",
  "\"🔑 پاسخ بر اساس کلمه کلیدی\",",
  "\"🧾 دریافت نام و شماره مشتری\",",
  "\"📩 ارسال گزارش لیدها برای ادمین\",",
  "\"💬 پاسخ پیش‌فرض وقتی کلمه پیدا نشد\",",
  "\"🔌 راهنمای اتصال رسمی Meta/API\"",
  "],",
  "\"categories\": [],",
  "\"contentModel\": \"FREE\",",
  "\"autoDeleteSeconds\": 0,",
  "\"raw\": \"قالب: پاسخگوی دایرکت اینستاگرام\\nپلتفرم: 📸 ربات اینستاگرام\\nامکانات انتخاب‌شده: 👋 پیام خوش‌آمد دایرکت، 🔑 پاسخ بر اساس کلمه کلیدی، 🧾 دریافت نام و شماره مشتری، 📩 ارسال گزارش لیدها برای ادمین، 💬 پاسخ پیش‌فرض وقتی کلمه پیدا نشد، 🔌 راهنمای اتصال رسمی Meta/API\"",
  "}"
];
const DETAIL_SPEC: any = {
  "mode": "options",
  "template": "IG_DM_AUTO_REPLY",
  "platform": "INSTAGRAM",
  "flags": [
    "welcomeDm",
    "keywordReplies",
    "leadCapture",
    "reportToAdmin",
    "connectionGuide",
    "fallbackReply"
  ],
  "flagTitles": [
    "👋 پیام خوش‌آمد دایرکت",
    "🔑 پاسخ بر اساس کلمه کلیدی",
    "🧾 دریافت نام و شماره مشتری",
    "📩 ارسال گزارش لیدها برای ادمین",
    "💬 پاسخ پیش‌فرض وقتی کلمه پیدا نشد",
    "🔌 راهنمای اتصال رسمی Meta/API"
  ],
  "categories": [],
  "contentModel": "FREE",
  "autoDeleteSeconds": 0,
  "raw": "قالب: پاسخگوی دایرکت اینستاگرام\nپلتفرم: 📸 ربات اینستاگرام\nامکانات انتخاب‌شده: 👋 پیام خوش‌آمد دایرکت، 🔑 پاسخ بر اساس کلمه کلیدی، 🧾 دریافت نام و شماره مشتری، 📩 ارسال گزارش لیدها برای ادمین، 💬 پاسخ پیش‌فرض وقتی کلمه پیدا نشد، 🔌 راهنمای اتصال رسمی Meta/API"
};
const IS_INSTAGRAM_TEMPLATE = TEMPLATE_CODE.startsWith("IG_");

const sessions = new Map<number, UserSession>();
const adminStates = new Map<number, AdminState>();
const knownUsers = new Set<number>();
const carts = new Map<number, CartLine[]>();
let cachedSettings: Settings | null = null;

function parsePrice(input: string): number | undefined {
  const normalized = input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^0-9]/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function formatToman(amount?: number) {
  if (!amount || amount <= 0) return "قیمت ثبت نشده";
  return new Intl.NumberFormat("fa-IR").format(amount) + " تومان";
}

function parseItemLine(line: string): Item {
  const parts = line.split(/\s*[|]\s*/).map((p) => p.trim()).filter(Boolean);
  const title = parts[0] || line.trim() || "آیتم بدون نام";
  const price = parsePrice(parts[1] || "");
  if (TEMPLATE_CODE === "SHOP") {
    const category = parts[2] || "عمومی";
    const stock = parsePrice(parts[3] || "");
    const description = parts.slice(stock ? 4 : 3).join(" - ") || undefined;
    return { title, price, category, stock, description, active: true };
  }
  const description = parts.slice(price ? 2 : 1).join(" - ") || undefined;
  return { title, price, description, active: true };
}

function uniqueTexts(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items || []) {
    const value = String(raw || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function defaultMediaCategories() {
  if (TEMPLATE_CODE === "MEDIA_GALLERY" && Array.isArray(DETAIL_SPEC?.categories) && DETAIL_SPEC.categories.length) {
    return uniqueTexts(DETAIL_SPEC.categories.map((x: unknown) => String(x)));
  }
  if (TEMPLATE_CODE === "MEDIA_GALLERY") {
    return ["فیلم ایرانی", "فیلم خارجی", "سریال ایرانی", "سریال خارجی", "انیمیشن", "مستند", "آموزشی", "عکس", "کلیپ", "سایر"];
  }
  return [];
}

function normalizeMediaCategories(value: unknown) {
  const parsed = Array.isArray(value) ? value.map((x) => String(x)) : [];
  const defaults = defaultMediaCategories();
  const merged = uniqueTexts([...defaults, ...parsed]);
  return merged.length ? merged : defaults;
}

function defaultItems() {
  if (Array.isArray(DETAIL_SPEC?.items) && DETAIL_SPEC.items.length) {
    return DETAIL_SPEC.items.map(parseItemLine);
  }
  if (TEMPLATE_CODE === "MEDIA_GALLERY" && Array.isArray(DETAIL_SPEC?.categories) && DETAIL_SPEC.categories.length) {
    return DETAIL_SPEC.categories.map((category: string) => ({ title: String(category), description: "دسته رسانه", active: true }));
  }
  const fallback: Record<string, string[]> = {
    SHOP: ["کرم نمونه | 250000 | مراقبت پوست | 10 | توضیحات محصول", "شامپو نمونه | 180000 | مو و زیبایی | 20 | توضیحات محصول", "ست هدیه | 500000 | پیشنهاد ویژه | 5 | توضیحات محصول"],
    RESERVATION: ["مشاوره | 300000 | نوبت ۳۰ دقیقه‌ای", "ویزیت | 400000 | نوبت حضوری"],
    SERVICE_ORDER: ["خدمت اول | 500000 | توضیحات خدمت", "مشاوره | 300000 | بررسی اولیه"],
    COURSE_FILE: ["دوره مقدماتی | 600000 | فایل/ویدیو آموزشی", "فایل آموزشی ویژه | 250000 | تحویل پس از پرداخت"],
    VIP_MEMBERSHIP: ["اشتراک یک‌ماهه | 199000 | دسترسی ۳۰ روزه", "اشتراک سه‌ماهه | 499000 | دسترسی ۹۰ روزه", "اشتراک ویژه سالانه | 1499000 | دسترسی ۱۲ ماهه"],
    FORCE_JOIN_CONTENT: ["محتوای ویژه | 0 | بعد از عضویت در کانال نمایش داده می‌شود", "لینک دانلود ویژه | 0 | دسترسی پس از تایید عضویت"],
    NEWSLETTER: ["اخبار و اطلاع‌رسانی", "تخفیف‌ها و کمپین‌ها", "آموزش‌ها و نکات"],
    SUPPORT: ["سوالات عمومی", "مشکل سفارش", "ارتباط با پشتیبانی"],
    MEDIA_GALLERY: ["فیلم‌های ایرانی", "سریال‌های خارجی", "انیمیشن", "عکس‌های آموزشی"],
    TEST_BOT: ["آیتم تست | 0 | نمونه رایگان ۵ دقیقه‌ای"],
    FORM: ["نام و نام خانوادگی", "شماره تماس", "توضیحات"]
  };
  const lines = DETAIL_LINES.length ? DETAIL_LINES : (fallback[TEMPLATE_CODE] || fallback.SERVICE_ORDER);
  if (TEMPLATE_CODE === "FORM") return [];
  return lines.map(parseItemLine);
}

function defaultFormQuestions() {
  if (TEMPLATE_CODE === "QUIZ_SURVEY") {
    return DETAIL_LINES.length ? DETAIL_LINES : ["نام و نام خانوادگی", "شماره تماس", "سوال اول یا نظر شما"];
  }
  if (TEMPLATE_CODE === "FORM") {
    return DETAIL_LINES.length ? DETAIL_LINES : ["نام و نام خانوادگی", "شماره تماس", "توضیحات یا درخواست شما"];
  }
  return ["نام و نام خانوادگی", "شماره تماس", "توضیحات"];
}

function defaultSupportTopics() {
  if (TEMPLATE_CODE !== "SUPPORT") return [];
  if (Array.isArray(DETAIL_SPEC?.topics) && DETAIL_SPEC.topics.length) return uniqueTexts(DETAIL_SPEC.topics.map((x: unknown) => String(x)));
  return ["سوال قبل از خرید", "مشکل سفارش", "مشکل پرداخت", "پیگیری ارسال", "پشتیبانی فنی", "سایر موارد"];
}

function defaultInstagramSettings(): InstagramSettings {
  const raw = String(DETAILS_RAW || "");
  const usernameMatch = raw.match(/@([A-Za-z0-9._]+)/);
  const flags = Array.isArray(DETAIL_SPEC?.flags) ? DETAIL_SPEC.flags : [];
  return {
    username: process.env.INSTAGRAM_USERNAME
      ? "@" + process.env.INSTAGRAM_USERNAME.replace(/^@/, "")
      : "@sibkart.ir" || (usernameMatch ? "@" + usernameMatch[1] : "ثبت نشده"),
    pageType: raw.includes("Business") ? "Business" : raw.includes("Creator") ? "Creator" : "ثبت نشده",
    metaConnection: flags.includes("connectionGuide") ? "سرویس آماده است؛ برای فعال شدن باید اتصال رسمی Meta تکمیل شود." : "سرویس آماده است؛ اتصال رسمی Meta هنوز انجام نشده.",
    dmWelcome: "سلام! خوش آمدید. لطفاً موضوع درخواستتان را ارسال کنید.",
    dmKeywords: ["قیمت | برای دریافت قیمت، نام محصول یا خدمت را ارسال کنید.", "خرید | لطفاً محصول موردنظر و شماره تماس را بفرستید."],
    commentKeywords: ["قیمت | برای شما اطلاعات قیمت در دایرکت ارسال می‌شود.", "خرید | لطفاً برای ثبت سفارش دایرکت بدهید."],
    leadQuestions: DETAIL_LINES.length ? DETAIL_LINES : ["نام و نام خانوادگی", "شماره تماس", "موضوع درخواست"],
    bookingServices: ["مشاوره", "رزرو وقت", "پیگیری سفارش"],
    notes: "تا وقتی Professional Account، Page Access Token، Instagram Account ID و Webhook در Meta تنظیم نشود، داخل پیج اتفاقی نمی‌افتد.",
    pageAccessToken: process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || "",
    instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID || "",
    webhookVerifyToken: process.env.INSTAGRAM_VERIFY_TOKEN || "igv_37",
    graphApiVersion: process.env.INSTAGRAM_GRAPH_VERSION || "v20.0"
  };
}

function defaultSettings(): Settings {
  return {
    businessName: "Bsbsbsbsb",
    welcomeMessage: "Nsbsbsbsbsn",
    supportContact: "Nsnsnsnsb",
    aboutText: "این ربات به صورت خودکار ساخته شده و اطلاعات آن توسط مدیر ربات قابل ویرایش است.",
    items: defaultItems(),
    mediaItems: [],
    mediaCategories: defaultMediaCategories(),
    forceJoinEnabled: Array.isArray(DETAIL_SPEC?.flags) ? DETAIL_SPEC.flags.includes("forceJoin") : false,
    forceJoinChannel: "",
    autoDeleteSeconds: Number.isFinite(Number(DETAIL_SPEC?.autoDeleteSeconds)) ? Number(DETAIL_SPEC.autoDeleteSeconds) : 0,
    formQuestions: defaultFormQuestions(),
    formResponses: [],
    payment: {
      paymentLink: process.env.PAYMENT_LINK || "",
      cardNumber: process.env.CARD_NUMBER || "",
      cardHolder: process.env.CARD_HOLDER || "",
      zarinpalMerchantId: process.env.ZARINPAL_MERCHANT_ID || "",
      zarinpalSandbox: process.env.ZARINPAL_SANDBOX === "true",
      note: "بعد از پرداخت، رسید یا اطلاعات پرداخت را برای پشتیبانی ارسال کنید."
    },
    instagram: defaultInstagramSettings(),
    instagramLeads: [],
    admins: primaryAdminId ? [primaryAdminId] : [],
    orders: [],
    shopOrders: [],
    supportTickets: [],
    supportTopics: defaultSupportTopics(),
    quickReplies: ["سلام، درخواست شما بررسی شد. لطفاً جزئیات بیشتری ارسال کنید.", "درخواست شما دریافت شد و در حال بررسی است.", "مشکل شما برطرف شد. اگر سوال دیگری دارید تیکت جدید ثبت کنید."],
    reservations: [],
    vipSubscriptions: [],
    newsletterUsers: [],
    quizResponses: []
  };
}

async function ensureDir() {
  const dir = dataPath.split("/").slice(0, -1).join("/");
  if (dir) await fs.mkdir(dir, { recursive: true });
}

async function loadSettings(): Promise<Settings> {
  if (cachedSettings) return cachedSettings;
  try {
    const raw = await fs.readFile(dataPath, "utf8");
    const parsed = JSON.parse(raw) as Settings;
    const base = defaultSettings();
    cachedSettings = {
      ...base,
      ...parsed,
      payment: { ...base.payment, ...(parsed.payment || {}) },
      instagram: { ...base.instagram, ...(((parsed as any).instagram) || {}) },
      instagramLeads: Array.isArray((parsed as any).instagramLeads) ? (parsed as any).instagramLeads : [],
      orders: Array.isArray((parsed as any).orders) ? (parsed as any).orders : [],
      shopOrders: Array.isArray((parsed as any).shopOrders) ? (parsed as any).shopOrders : [],
      supportTickets: Array.isArray((parsed as any).supportTickets) ? (parsed as any).supportTickets : [],
      formResponses: Array.isArray((parsed as any).formResponses) ? (parsed as any).formResponses : [],
      reservations: Array.isArray((parsed as any).reservations) ? (parsed as any).reservations : [],
      vipSubscriptions: Array.isArray((parsed as any).vipSubscriptions) ? (parsed as any).vipSubscriptions : [],
      newsletterUsers: Array.isArray((parsed as any).newsletterUsers) ? (parsed as any).newsletterUsers : [],
      quizResponses: Array.isArray((parsed as any).quizResponses) ? (parsed as any).quizResponses : [],
      supportTopics: Array.isArray((parsed as any).supportTopics) && (parsed as any).supportTopics.length ? (parsed as any).supportTopics : base.supportTopics,
      quickReplies: Array.isArray((parsed as any).quickReplies) && (parsed as any).quickReplies.length ? (parsed as any).quickReplies : base.quickReplies,
      mediaItems: Array.isArray((parsed as any).mediaItems) ? (parsed as any).mediaItems : [],
      mediaCategories: normalizeMediaCategories((parsed as any).mediaCategories),
      forceJoinEnabled: typeof (parsed as any).forceJoinEnabled === "boolean" ? (parsed as any).forceJoinEnabled : base.forceJoinEnabled,
      forceJoinChannel: typeof (parsed as any).forceJoinChannel === "string" ? (parsed as any).forceJoinChannel : base.forceJoinChannel,
      autoDeleteSeconds: Number.isFinite(Number((parsed as any).autoDeleteSeconds)) ? Number((parsed as any).autoDeleteSeconds) : base.autoDeleteSeconds
    };
    if (TEMPLATE_CODE === "MEDIA_GALLERY" || TEMPLATE_CODE === "SUPPORT") {
      await saveSettings(cachedSettings);
    }
  } catch {
    cachedSettings = defaultSettings();
    await saveSettings(cachedSettings);
  }
  return cachedSettings;
}

async function saveSettings(settings: Settings) {
  cachedSettings = settings;
  await ensureDir();
  await fs.writeFile(dataPath, JSON.stringify(settings, null, 2), "utf8");
}

function isAdminId(chatId?: number) {
  if (!chatId) return false;
  const settings = cachedSettings;
  return chatId === primaryAdminId || !!settings?.admins.includes(chatId);
}

async function isAdmin(chatId?: number) {
  if (!chatId) return false;
  const settings = await loadSettings();
  return chatId === primaryAdminId || settings.admins.includes(chatId);
}

function userLabel(ctx: any) {
  return ctx.from?.username ? "@" + ctx.from.username : String(ctx.chat?.id || "unknown");
}

function userMenu(settings: Settings, showAdminButton = false) {
  const rows: string[][] = [];
  if (IS_INSTAGRAM_TEMPLATE) {
    if (TEMPLATE_CODE === "IG_DM_SHOP") rows.push(["🛍 محصولات اینستاگرام", "🧾 ثبت سفارش"]);
    else if (TEMPLATE_CODE === "IG_LEAD_FORM") rows.push(["📝 شروع فرم لید", "🔢 پیگیری درخواست"]);
    else if (TEMPLATE_CODE === "IG_RESERVATION") rows.push(["📅 درخواست رزرو", "📌 پیگیری رزرو"]);
    else if (TEMPLATE_CODE === "IG_COMMENT_AUTO_REPLY") rows.push(["💬 سناریوی کامنت", "🔑 کلمات کلیدی"]);
    else if (TEMPLATE_CODE === "IG_MEDIA_GALLERY") rows.push(["🎬 سناریوهای محتوا", "🔍 جستجوی سناریو"]);
    else rows.push(["📩 سناریوهای دایرکت", "🔑 کلمات کلیدی"]);
    rows.push(["📝 ارسال درخواست", "ℹ️ راهنمای اتصال"]);
  }
  else if (TEMPLATE_CODE === "MEDIA_GALLERY") {
    rows.push(["📂 دسته‌بندی‌ها", "🔍 جستجو"]);
    rows.push(["🆕 جدیدترین‌ها", "🔥 پربازدیدترین‌ها"]);
    rows.push(["📩 درخواست محتوا"]);
  }
  else if (TEMPLATE_CODE === "TEST_BOT") rows.push(["🧪 تست ربات", "📝 شروع فرم"]);
  else if (TEMPLATE_CODE === "SHOP") {
    rows.push(["🛍 دسته‌بندی محصولات", "🔍 جستجوی محصول"]);
    rows.push(["🛒 سبد خرید", "📦 سفارش‌های من"]);
  }
  else if (TEMPLATE_CODE === "SUPPORT") {
    rows.push(["🎫 ثبت تیکت", "📌 پیگیری تیکت"]);
    rows.push(["❓ سوالات متداول"]);
  }
  else if (TEMPLATE_CODE === "RESERVATION") {
    rows.push(["📅 رزرو نوبت", "📋 خدمات"]);
    rows.push(["📌 نوبت‌های من"]);
  }
  else if (TEMPLATE_CODE === "COURSE_FILE") {
    rows.push(["🎓 دوره‌ها / فایل‌ها", "🧾 خریدهای من"]);
  }
  else if (TEMPLATE_CODE === "VIP_MEMBERSHIP") {
    rows.push(["💎 پلن‌های VIP", "👤 وضعیت اشتراک"]);
  }
  else if (TEMPLATE_CODE === "FORCE_JOIN_CONTENT") {
    rows.push(["🔒 محتوای قفل‌شده", "📋 محتواها"]);
  }
  else if (TEMPLATE_CODE === "NEWSLETTER") {
    rows.push(["📣 عضویت در خبرنامه", "🔕 لغو عضویت"]);
  }
  else if (TEMPLATE_CODE === "QUIZ_SURVEY") {
    rows.push(["📝 شرکت در آزمون/نظرسنجی", "📊 نتیجه‌های من"]);
  }
  else if (TEMPLATE_CODE === "FORM") rows.push(["📝 شروع فرم", "ℹ️ راهنما"]);
  else rows.push(["📝 ثبت سفارش خدمات", "📋 خدمات"]);
  rows.push(["💳 پرداخت", "☎️ پشتیبانی"]);
  rows.push(["ℹ️ درباره ما"]);
  if (showAdminButton) rows.push(["🧰 پنل مدیریت"]);
  void settings;
  return Markup.keyboard(rows).resize();
}

async function menuFor(chatId: number | undefined, settings: Settings) {
  return userMenu(settings, await isAdmin(chatId));
}

function adminMenu() {
  const rows: string[][] = [
    ["🧰 پنل مدیریت"],
    ["📦 مدیریت آیتم‌ها", "✏️ ویرایش متن‌ها"],
  ];
  if (TEMPLATE_CODE === "SHOP") {
    rows.push(["🛍 مدیریت فروشگاه", "📦 سفارش‌های فروشگاه"]);
  }
  if (TEMPLATE_CODE === "MEDIA_GALLERY") {
    rows.push(["🎬 مدیریت رسانه", "📋 لیست رسانه‌ها"]);
    rows.push(["📂 مدیریت دسته‌ها", "🔒 قفل عضویت"]);
    rows.push(["⏱ حذف خودکار فایل"]);
  }
  if (TEMPLATE_CODE === "SUPPORT") {
    rows.push(["🎫 مدیریت تیکت‌ها", "⚡ پاسخ‌های آماده"]);
    rows.push(["🧩 موضوعات تیکت", "❓ مدیریت سوالات متداول"]);
  }
  if (TEMPLATE_CODE === "QUIZ_SURVEY") {
    return DETAIL_LINES.length ? DETAIL_LINES : ["نام و نام خانوادگی", "شماره تماس", "سوال اول یا نظر شما"];
  }
  if (TEMPLATE_CODE === "FORM") {
    rows.push(["📝 مدیریت فرم", "📄 پاسخ‌های فرم"]);
    rows.push(["📊 آمار فرم"]);
  }
  if (TEMPLATE_CODE === "RESERVATION") {
    rows.push(["📅 مدیریت رزروها", "🧩 خدمات رزرو"]);
  }
  if (TEMPLATE_CODE === "COURSE_FILE") {
    rows.push(["🎓 مدیریت دوره‌ها", "👥 خریداران دوره"]);
  }
  if (TEMPLATE_CODE === "VIP_MEMBERSHIP") {
    rows.push(["💎 مدیریت پلن‌های VIP", "👥 اعضای VIP"]);
  }
  if (TEMPLATE_CODE === "FORCE_JOIN_CONTENT") {
    rows.push(["🔒 تنظیم قفل عضویت", "📂 مدیریت محتوای قفل‌شده"]);
  }
  if (TEMPLATE_CODE === "NEWSLETTER") {
    rows.push(["📣 مدیریت خبرنامه", "👥 اعضای خبرنامه"]);
  }
  if (TEMPLATE_CODE === "QUIZ_SURVEY") {
    rows.push(["📝 مدیریت آزمون/نظرسنجی", "📊 پاسخ‌های آزمون"]);
  }
  if (IS_INSTAGRAM_TEMPLATE) {
    rows.push(["📸 مدیریت اینستاگرام", "🔑 کلمات کلیدی"]);
    rows.push(["🧾 لیدها / سفارش‌ها", "🔌 راهنمای اتصال Meta"]);
  }
  rows.push(["💳 تنظیم پرداخت", "📊 گزارش‌ها"]);
  rows.push(["📣 پیام همگانی", "👥 مدیریت ادمین‌ها"]);
  rows.push(["🔙 منوی کاربر"]);
  return Markup.keyboard(rows).resize();
}

function itemListText(settings: Settings) {
  if (!settings.items.length) return "هنوز آیتمی ثبت نشده است.";
  return settings.items
    .map((item, i) => String(i + 1) + ". " + (item.active ? "✅" : "⛔️") + " " + item.title + "\nقیمت: " + formatToman(item.price) + (item.description ? "\n" + item.description : ""))
    .join("\n\n");
}

function itemsInline(settings: Settings) {
  const rows = settings.items.slice(0, 20).flatMap((item, i) => [
    [Markup.button.callback("✏️ ویرایش " + String(i + 1), "ADM_ITEM_EDIT_" + String(i)), Markup.button.callback("🗑 حذف " + String(i + 1), "ADM_ITEM_DEL_" + String(i))]
  ]);
  rows.push([Markup.button.callback("➕ افزودن آیتم", "ADM_ITEM_ADD")]);
  return Markup.inlineKeyboard(rows);
}

function userItemsInline(settings: Settings, prefix: string) {
  const rows = settings.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.active)
    .slice(0, 30)
    .map(({ item, index }) => [Markup.button.callback("🔹 " + item.title.slice(0, 42), prefix + "_" + String(index))]);
  if (!rows.length) rows.push([Markup.button.callback("هنوز موردی ثبت نشده", "NOOP")]);
  return Markup.inlineKeyboard(rows);
}

function simpleUserOrdersText(settings: Settings, chatId: number) {
  const orders = settings.orders.filter((o) => !chatId || o.chatId === chatId).slice(-10).reverse();
  if (!orders.length) return "هنوز خریدی ثبت نشده است.";
  return orders.map((o) => "#" + o.id + " | " + o.title + " | " + formatToman(o.amount) + " | " + o.status).join("\\n");
}

function reservationText(item: Item) {
  return "📅 " + item.title + "\\n" +
    "هزینه/بیعانه: " + formatToman(item.price) +
    (item.description ? "\\n\\n" + item.description : "");
}

function courseText(item: Item) {
  return "🎓 " + item.title + "\\n" +
    "قیمت: " + formatToman(item.price) +
    (item.description ? "\\n\\n" + item.description : "");
}

function vipText(item: Item) {
  return "💎 " + item.title + "\\n" +
    "قیمت: " + formatToman(item.price) +
    (item.description ? "\\n\\n" + item.description : "");
}

function reservationsText(settings: Settings, chatId?: number) {
  const list = settings.reservations.filter((r) => !chatId || r.chatId === chatId).slice(-20).reverse();
  if (!list.length) return "رزروی ثبت نشده است.";
  return list.map((r) => "#" + r.id + " | " + r.status + "\\nخدمت: " + r.service + "\\nزمان پیشنهادی: " + r.requestedTime + "\\nتماس: " + r.contact).join("\\n\\n");
}

function subscriptionsText(settings: Settings, chatId?: number) {
  const list = settings.vipSubscriptions.filter((s) => !chatId || s.chatId === chatId).slice(-20).reverse();
  if (!list.length) return "اشتراکی ثبت نشده است.";
  return list.map((s) => "#" + s.id + " | " + s.status + "\\nپلن: " + s.plan + (s.expiresAt ? "\\nانقضا: " + s.expiresAt : "")).join("\\n\\n");
}

function shopActiveEntries(settings: Settings) {
  return settings.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.active);
}

function shopCategories(settings: Settings) {
  const set = new Set<string>();
  for (const item of settings.items) if (item.active) set.add((item.category || "عمومی").trim() || "عمومی");
  return Array.from(set).sort((a, b) => a.localeCompare(b, "fa"));
}

function shopCategoryInline(settings: Settings) {
  const cats = shopCategories(settings);
  const rows = cats.map((cat, index) => [Markup.button.callback("📁 " + cat.slice(0, 40), "SHOP_CAT_IDX_" + String(index))]);
  if (!rows.length) rows.push([Markup.button.callback("محصولی ثبت نشده", "NOOP")]);
  rows.push([Markup.button.callback("🔍 جستجوی محصول", "SHOP_SEARCH")]);
  rows.push([Markup.button.callback("🛒 مشاهده سبد خرید", "SHOP_CART")]);
  return Markup.inlineKeyboard(rows);
}

function shopProductInline(entries: { item: Item; index: number }[]) {
  const rows = entries.slice(0, 30).map(({ item, index }) => [Markup.button.callback("🛍 " + item.title.slice(0, 42), "SHOP_VIEW_" + String(index))]);
  if (!rows.length) rows.push([Markup.button.callback("موردی پیدا نشد", "NOOP")]);
  rows.push([Markup.button.callback("🛒 مشاهده سبد خرید", "SHOP_CART")]);
  return Markup.inlineKeyboard(rows);
}

function shopProductText(item: Item) {
  return "🛍 " + item.title + "\n\n" +
    "قیمت: " + formatToman(item.price) + "\n" +
    "دسته: " + (item.category || "عمومی") + "\n" +
    "موجودی: " + (Number.isFinite(Number(item.stock)) ? String(item.stock) : "ثبت نشده") +
    (item.description ? "\n\n" + item.description : "");
}

function shopProductActions(index: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("➕ افزودن به سبد خرید", "SHOP_ADD_" + String(index))],
    [Markup.button.callback("🛒 مشاهده سبد خرید", "SHOP_CART")],
  ]);
}

function cartTotal(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + (Number(line.price || 0) * line.qty), 0);
}

function cartText(lines: CartLine[]) {
  if (!lines.length) return "سبد خرید شما خالی است.";
  return lines.map((line, i) => String(i + 1) + ". " + line.title + " × " + line.qty + " — " + formatToman(Number(line.price || 0) * line.qty)).join("\n") +
    "\n\nمبلغ کل: " + formatToman(cartTotal(lines));
}

function cartInline() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ ثبت سفارش سبد خرید", "SHOP_CHECKOUT")],
    [Markup.button.callback("🗑 خالی کردن سبد", "SHOP_CLEAR_CART")],
  ]);
}

function shopOrdersText(settings: Settings, chatId?: number) {
  const list = settings.shopOrders.filter((o) => !chatId || o.chatId === chatId).slice(-20).reverse();
  if (!list.length) return "سفارشی ثبت نشده است.";
  return list.map((o) =>
    "#" + o.id + " | " + shopStatusTitle(o.status) + "\n" +
    "مبلغ: " + formatToman(o.total) + "\n" +
    "آیتم‌ها: " + o.lines.map((l) => l.title + "×" + l.qty).join("، ")
  ).join("\n\n");
}

function shopStatusTitle(status: ShopOrder["status"]) {
  const map: Record<ShopOrder["status"], string> = {
    NEW: "جدید",
    CONFIRMED: "تایید شده",
    PREPARING: "در حال آماده‌سازی",
    SENT: "ارسال شده",
    DONE: "تکمیل شده",
    CANCELED: "لغو شده"
  };
  return map[status] || status;
}

function shopAdminOrdersInline(settings: Settings) {
  const rows = settings.shopOrders.slice(-15).reverse().flatMap((order) => [
    [Markup.button.callback("#" + order.id + " | " + shopStatusTitle(order.status) + " | " + formatToman(order.total), "ADM_SHOP_ORDER_" + order.id)],
  ]);
  if (!rows.length) rows.push([Markup.button.callback("سفارشی ثبت نشده", "NOOP")]);
  return Markup.inlineKeyboard(rows);
}

function shopOrderStatusInline(orderId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ تایید", "ADM_SHOP_STATUS_" + orderId + "_CONFIRMED")],
    [Markup.button.callback("📦 آماده‌سازی", "ADM_SHOP_STATUS_" + orderId + "_PREPARING")],
    [Markup.button.callback("🚚 ارسال شد", "ADM_SHOP_STATUS_" + orderId + "_SENT")],
    [Markup.button.callback("🏁 تکمیل", "ADM_SHOP_STATUS_" + orderId + "_DONE")],
    [Markup.button.callback("❌ لغو", "ADM_SHOP_STATUS_" + orderId + "_CANCELED")],
  ]);
}

function findShopOrder(settings: Settings, orderId: string) {
  return settings.shopOrders.find((o) => o.id === orderId);
}

function createShopOrder(settings: Settings, chatId: number, username: string | undefined, lines: CartLine[]): ShopOrder {
  const order: ShopOrder = {
    id: Date.now().toString(36).toUpperCase(),
    chatId,
    username,
    lines,
    total: cartTotal(lines),
    status: "NEW",
    createdAt: new Date().toISOString(),
  };
  settings.shopOrders.push(order);
  return order;
}


function ticketStatusTitle(status: SupportTicket["status"]) {
  const map: Record<SupportTicket["status"], string> = { OPEN: "باز", ANSWERED: "پاسخ داده‌شده", CLOSED: "بسته" };
  return map[status] || status;
}

function supportTopicInline(settings: Settings) {
  const topics = settings.supportTopics.length ? settings.supportTopics : defaultSupportTopics();
  const rows = topics.slice(0, 20).map((topic, index) => [Markup.button.callback("🎫 " + topic.slice(0, 42), "SUPPORT_TOPIC_" + String(index))]);
  rows.push([Markup.button.callback("✍️ موضوع دیگر", "SUPPORT_TOPIC_OTHER")]);
  return Markup.inlineKeyboard(rows);
}

function createSupportTicket(settings: Settings, chatId: number, username: string | undefined, topic: string, message: string): SupportTicket {
  const ticket: SupportTicket = {
    id: Date.now().toString(36).toUpperCase(),
    chatId,
    username,
    topic,
    message,
    status: "OPEN",
    createdAt: new Date().toISOString(),
  };
  settings.supportTickets.push(ticket);
  return ticket;
}

function supportTicketText(ticket: SupportTicket) {
  return "🎫 تیکت #" + ticket.id + "\n" +
    "وضعیت: " + ticketStatusTitle(ticket.status) + "\n" +
    "موضوع: " + ticket.topic + "\n" +
    "کاربر: " + (ticket.username ? "@" + ticket.username : String(ticket.chatId)) + "\n" +
    "زمان: " + new Date(ticket.createdAt).toLocaleString("fa-IR") + "\n\n" +
    "پیام کاربر:\n" + ticket.message +
    (ticket.adminReply ? "\n\nآخرین پاسخ مدیر:\n" + ticket.adminReply : "");
}

function supportTicketActions(ticketId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✍️ پاسخ به تیکت", "ADM_SUPPORT_REPLY_" + ticketId)],
    [Markup.button.callback("✅ بستن تیکت", "ADM_SUPPORT_CLOSE_" + ticketId), Markup.button.callback("🔓 باز کردن", "ADM_SUPPORT_OPEN_" + ticketId)],
  ]);
}

function supportAdminTicketsInline(settings: Settings) {
  const list = settings.supportTickets.slice(-20).reverse();
  const rows = list.map((t) => [Markup.button.callback("#" + t.id + " | " + ticketStatusTitle(t.status) + " | " + t.topic.slice(0, 24), "ADM_SUPPORT_VIEW_" + t.id)]);
  if (!rows.length) rows.push([Markup.button.callback("تیکتی ثبت نشده", "NOOP")]);
  return Markup.inlineKeyboard(rows);
}

function userTicketsInline(settings: Settings, chatId: number) {
  const list = settings.supportTickets.filter((t) => t.chatId === chatId).slice(-15).reverse();
  const rows = list.map((t) => [Markup.button.callback("#" + t.id + " | " + ticketStatusTitle(t.status) + " | " + t.topic.slice(0, 30), "SUPPORT_VIEW_" + t.id)]);
  if (!rows.length) rows.push([Markup.button.callback("تیکتی ثبت نشده", "NOOP")]);
  return Markup.inlineKeyboard(rows);
}

function quickRepliesInline(settings: Settings, ticketId: string) {
  const rows = settings.quickReplies.slice(0, 10).map((reply, index) => [Markup.button.callback("⚡ " + reply.slice(0, 45), "ADM_SUPPORT_QR_" + ticketId + "_" + String(index))]);
  rows.push([Markup.button.callback("✍️ پاسخ دستی", "ADM_SUPPORT_REPLY_" + ticketId)]);
  return Markup.inlineKeyboard(rows);
}

function normalizeQuery(text: string) {
  return text.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").trim();
}

function mediaCategories(settings: Settings) {
  const set = new Set<string>();
  for (const c of settings.mediaCategories || []) if (c.trim()) set.add(c.trim());
  for (const m of settings.mediaItems || []) if (m.active && m.category) set.add(m.category.trim());
  return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, "fa"));
}

function mediaCategoryInline(settings: Settings) {
  const cats = mediaCategories(settings);
  const effectiveCats = cats.length ? cats : ["عمومی"];
  const rows = effectiveCats.map((cat, index) => [
    Markup.button.callback("📁 " + cat.slice(0, 40), "MEDIA_CAT_IDX_" + String(index)),
  ]);
  rows.push([Markup.button.callback("🆕 جدیدترین‌ها", "MEDIA_LATEST")]);
  return Markup.inlineKeyboard(rows);
}

function mediaIcon(item: MediaItem) {
  return item.type === "photo" ? "🖼 " : item.type === "video" ? "🎬 " : "📎 ";
}

function mediaTitle(item: MediaItem) {
  return (item.title || item.caption || "رسانه").replace(/\s+/g, " ").trim() || "رسانه";
}

function mediaListInline(items: MediaItem[], page = 0) {
  const perPage = 8;
  const start = page * perPage;
  const selected = items.slice(start, start + perPage);
  const rows = selected.map((item) => [Markup.button.callback(mediaIcon(item) + mediaTitle(item).slice(0, 45), "MEDIA_VIEW_ID_" + item.id)]);
  if (!rows.length) rows.push([Markup.button.callback("موردی پیدا نشد", "NOOP")]);
  return Markup.inlineKeyboard(rows);
}

function mediaAdminInline(settings: Settings) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📋 لیست و مدیریت رسانه‌ها", "ADM_MEDIA_LIST")],
    [Markup.button.callback("📂 ویرایش دسته‌بندی‌ها", "ADM_MEDIA_CATS")],
    [Markup.button.callback("🔒 تنظیم قفل عضویت", "ADM_MEDIA_FORCE_JOIN")],
    [Markup.button.callback("⏱ تنظیم حذف خودکار", "ADM_MEDIA_AUTO_DELETE")],
    [Markup.button.callback("📊 آمار رسانه", "ADM_MEDIA_STATS")]
  ]);
}

function mediaAdminListInline(settings: Settings, page = 0) {
  const perPage = 8;
  const start = page * perPage;
  const selected = settings.mediaItems.slice().reverse().slice(start, start + perPage);
  const rows = selected.flatMap((item) => [
    [Markup.button.callback((item.active ? "✅ " : "⛔️ ") + mediaIcon(item) + mediaTitle(item).slice(0, 35), "ADM_MEDIA_PREVIEW_" + item.id)],
    [Markup.button.callback(item.active ? "⛔️ غیرفعال" : "✅ فعال", "ADM_MEDIA_TOGGLE_" + item.id), Markup.button.callback("🗑 حذف", "ADM_MEDIA_DELETE_" + item.id)]
  ]);
  if (!rows.length) rows.push([Markup.button.callback("رسانه‌ای ثبت نشده", "NOOP")]);
  return Markup.inlineKeyboard(rows);
}

function findMedia(settings: Settings, id: string) {
  return settings.mediaItems.find((item) => item.id === id);
}

function parseMediaCaption(caption: string) {
  const parts = caption.split("|").map((p) => p.trim()).filter(Boolean);
  const result: { title?: string; category?: string; tags?: string[]; caption?: string } = { caption };
  for (const part of parts) {
    const m = part.match(/^(?:دسته|category)\s*[:：]\s*(.+)$/i);
    if (m) { result.category = m[1].trim(); continue; }
    const t = part.match(/^(?:عنوان|title)\s*[:：]\s*(.+)$/i);
    if (t) { result.title = t[1].trim(); continue; }
    const tags = part.match(/^(?:تگ|tags?)\s*[:：]\s*(.+)$/i);
    if (tags) { result.tags = tags[1].split(/[،,]/).map((x) => x.trim()).filter(Boolean); continue; }
  }
  if (!result.title) result.title = parts.find((p) => !/^(?:دسته|category|عنوان|title|تگ|tags?)\s*[:：]/i.test(p)) || caption || "رسانه بدون عنوان";
  return result;
}

async function checkForceJoin(ctx: any, settings: Settings) {
  if (!settings.forceJoinEnabled || !settings.forceJoinChannel) return true;
  try {
    const member = await ctx.telegram.getChatMember(settings.forceJoinChannel, ctx.from.id);
    return !["left", "kicked"].includes(member.status);
  } catch (error) {
    console.error("force join check failed:", error);
    return false;
  }
}

async function requireForceJoin(ctx: any, settings: Settings) {
  if (await checkForceJoin(ctx, settings)) return true;
  await ctx.reply(
    "🔒 برای دریافت محتوا ابتدا باید عضو کانال شوید.\n\n" +
      "کانال: " + settings.forceJoinChannel + "\n\n" +
      "بعد از عضویت دوباره روی محتوا بزنید.",
    Markup.inlineKeyboard([[Markup.button.url("عضویت در کانال", "https://t.me/" + settings.forceJoinChannel.replace(/^@/, ""))]])
  );
  return false;
}

async function sendMediaItem(ctx: any, item: MediaItem, settings: Settings) {
  if (!(await requireForceJoin(ctx, settings))) return;
  const caption = (item.title ? item.title + "\n" : "") + (item.caption || "") + "\n\nدسته: " + (item.category || "عمومی");
  let sent: any;
  if (item.type === "photo") sent = await ctx.replyWithPhoto(item.fileId, { caption });
  else if (item.type === "video") sent = await ctx.replyWithVideo(item.fileId, { caption });
  else sent = await ctx.replyWithDocument(item.fileId, { caption });
  item.downloads = (item.downloads || 0) + 1;
  await saveSettings(settings);
  const seconds = Number(settings.autoDeleteSeconds || 0);
  if (seconds > 0 && sent?.message_id) {
    setTimeout(() => {
      ctx.telegram.deleteMessage(ctx.chat.id, sent.message_id).catch(() => undefined);
    }, seconds * 1000);
    await ctx.reply("⏱ این فایل بعد از " + seconds + " ثانیه از صفحه ربات حذف می‌شود. می‌توانید آن را برای خودتان ذخیره یا فوروارد کنید.");
  }
}


function formResponseTitle(response: FormResponse) {
  return "#" + response.id + " | " + (response.username || response.chatId) + " | " + new Date(response.createdAt).toLocaleString("fa-IR");
}

function formResponsesInline(settings: Settings) {
  const list = settings.formResponses.slice(-20).reverse();
  const rows = list.map((response) => [Markup.button.callback("📄 " + formResponseTitle(response).slice(0, 55), "ADM_FORM_RESP_" + response.id)]);
  if (!rows.length) rows.push([Markup.button.callback("پاسخی ثبت نشده", "NOOP")]);
  rows.push([Markup.button.callback("🗑 پاکسازی همه پاسخ‌ها", "ADM_FORM_RESP_CLEAR_CONFIRM")]);
  return Markup.inlineKeyboard(rows);
}

function formResponseFullText(response: FormResponse) {
  const lines = response.questions.map((q, i) => String(i + 1) + ") " + q + ":\n" + (response.answers[i] || "-"));
  return "📄 پاسخ فرم " + response.id + "\n" +
    "کاربر: " + (response.username || response.chatId) + "\n" +
    "تاریخ: " + new Date(response.createdAt).toLocaleString("fa-IR") + "\n" +
    "وضعیت: " + (response.status === "REVIEWED" ? "بررسی شده" : response.status === "ARCHIVED" ? "آرشیو شده" : "جدید") +
    "\n\n" + lines.join("\n\n");
}

function maskToken(value: string) {
  if (!value) return "ثبت نشده";
  return value.length > 12 ? value.slice(0, 6) + "..." + value.slice(-4) : "ثبت شده";
}

function instagramStatusText(settings: Settings) {
  const callbackUrl = baseUrl ? baseUrl + "/instagram/webhook" : "BASE_URL تنظیم نشده";
  return "📸 مدیریت اینستاگرام\n\n" +
    "پیج: " + settings.instagram.username + "\n" +
    "نوع پیج: " + settings.instagram.pageType + "\n" +
    "اتصال: " + settings.instagram.metaConnection + "\n" +
    "Instagram ID: " + (settings.instagram.instagramAccountId || "ثبت نشده") + "\n" +
    "Page Access Token: " + maskToken(settings.instagram.pageAccessToken) + "\n" +
    "Verify Token: " + settings.instagram.webhookVerifyToken + "\n" +
    "Callback URL:\n" + callbackUrl + "\n\n" +
    "کلمات کلیدی دایرکت: " + settings.instagram.dmKeywords.length + " مورد\n" +
    "کلمات کلیدی کامنت: " + settings.instagram.commentKeywords.length + " مورد\n" +
    "لیدهای دریافتی از وبهوک: " + settings.instagramLeads.length + " مورد";
}

function instagramAdminInline() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("👤 تنظیمات پیج", "ADM_IG_PROFILE")],
    [Markup.button.callback("🔑 Page Access Token", "ADM_IG_ACCESS_TOKEN")],
    [Markup.button.callback("🧩 Instagram Account ID", "ADM_IG_ACCOUNT_ID")],
    [Markup.button.callback("🔐 Verify Token", "ADM_IG_VERIFY_TOKEN")],
    [Markup.button.callback("📩 کلمات کلیدی دایرکت", "ADM_IG_DM_KEYWORDS")],
    [Markup.button.callback("💬 کلمات کلیدی کامنت", "ADM_IG_COMMENT_KEYWORDS")],
    [Markup.button.callback("📝 سوال‌های لید", "ADM_IG_LEAD_QUESTIONS")],
    [Markup.button.callback("📅 خدمات رزرو", "ADM_IG_BOOKING_SERVICES")],
    [Markup.button.callback("📥 لیدها / رویدادهای اینستاگرام", "ADM_IG_LEADS")],
    [Markup.button.callback("🔌 راهنمای اتصال Meta", "ADM_IG_CONNECT_GUIDE")],
  ]);
}

function instagramKeywordText(items: string[]) {
  if (!items.length) return "موردی ثبت نشده است.";
  return items.map((x, i) => String(i + 1) + ". " + x).join("\n");
}

function instagramGuideText(settings: Settings) {
  const callbackUrl = baseUrl ? baseUrl + "/instagram/webhook" : "BASE_URL تنظیم نشده";
  return "🔌 راهنمای اتصال واقعی اینستاگرام / Meta\n\n" +
    "این سرویس بعد از ساخته شدن، Webhook و پنل راهنما را آماده می‌کند؛ اما تا وقتی پیج در Meta وصل نشود، داخل خود اینستاگرام تغییری دیده نمی‌شود.\n\n" +
    "شرایط پیج:\n" +
    "1) پیج باید Professional باشد: Business یا Creator.\n" +
    "2) پیج خصوصی قابل استفاده نیست. حساب Professional عمومی است.\n" +
    "3) برای این نسخه باید پیج به Facebook Page و Meta Developer App وصل شود.\n" +
    "4) برای دریافت و پاسخ دایرکت، Page Access Token و Instagram Account ID لازم است.\n\n" +
    "آدرس‌های این سفارش:\n" +
    "Callback URL:\n" + callbackUrl + "\n\n" +
    "Verify Token:\n" + settings.instagram.webhookVerifyToken + "\n\n" +
    "مراحل استفاده مشتری:\n" +
    "1) پیج را از حالت Personal/Private خارج و Professional کنید.\n" +
    "2) Facebook Page متصل به همان پیج را مشخص کنید.\n" +
    "3) در Meta Developer App وبهوک Instagram/Messenger را با Callback و Verify Token بالا ثبت کنید.\n" +
    "4) مقدارهای INSTAGRAM_PAGE_ACCESS_TOKEN، INSTAGRAM_ACCOUNT_ID و META_APP_SECRET را داخل همان ربات‌ساز تلگرام ارسال کنید.\n" +
    "5) ربات‌ساز این مقدارها را خودکار ثبت می‌کند و فعال‌سازی سرور را انجام می‌دهد.\n" +
    "6) با یک اکانت دیگر به پیج دایرکت تست بفرستید.\n\n" +
    "مدیریت:\n" +
    "- لیدها و رویدادهای دریافتی از مسیر /instagram/webhook ذخیره می‌شوند.\n" +
    "- اگر برای این سرویس CUSTOMER_BOT_TOKEN و CUSTOMER_ADMIN_ID هم ثبت شود، پنل مدیریت تلگرامی فعال می‌شود و می‌توان کلمات کلیدی، لیدها و تنظیمات را داخل تلگرام مدیریت کرد.\n" +
    "- بدون اتصال Meta، این سرویس فقط آماده است و هیچ پیام/کامنتی از پیج دریافت نمی‌کند.";
}

function htmlEscape(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");\n}\n\nfunction instagramSetupGuideHtml(settings: Settings) {\n  const callbackUrl = baseUrl ? baseUrl + "/instagram/webhook" : "BASE_URL تنظیم نشده";\n  const setupText = instagramGuideText(settings);\n  return "<!doctype html><html lang=\"fa\" dir=\"rtl\"><head>" +
    "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>راهنمای اتصال اینستاگرام</title>" +
    "<style>body{font-family:Tahoma,Arial,sans-serif;background:#f7f7f7;color:#222;line-height:1.9;margin:0;padding:24px}.card{max-width:920px;margin:auto;background:#fff;border-radius:18px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.08)}code,pre{direction:ltr;text-align:left;background:#f0f0f0;border-radius:10px;padding:10px;display:block;white-space:pre-wrap;overflow:auto}.ok{color:#0a7a35}.warn{color:#a65a00}.grid{display:grid;gap:12px}.box{border:1px solid #eee;border-radius:14px;padding:14px;background:#fafafa}h1,h2{margin-top:0}</style>" +
    "</head><body><main class=\"card\">" +
    "<h1>راهنمای استفاده از اتوماسیون اینستاگرام</h1>" +
    "<p class=\"warn\"><b>مهم:</b> ساخته شدن سرویس یعنی Webhook و سرور آماده است؛ داخل خود پیج اینستاگرام تا قبل از اتصال رسمی Meta تغییری دیده نمی‌شود.</p>" +
    "<div class=\"grid\">" +
    "<div class=\"box\"><h2>اطلاعات این سفارش</h2>" +
    "<p><b>پیج:</b> " + htmlEscape(settings.instagram.username) + "</p>" +
    "<p><b>وضعیت اتصال:</b> " + htmlEscape(settings.instagram.metaConnection) + "</p>" +
    "<p><b>Instagram Account ID:</b> " + htmlEscape(settings.instagram.instagramAccountId || "ثبت نشده") + "</p>" +
    "<p><b>Page Access Token:</b> " + htmlEscape(maskToken(settings.instagram.pageAccessToken)) + "</p>" +
    "</div>" +
    "<div class=\"box\"><h2>Callback URL</h2><pre>" + htmlEscape(callbackUrl) + "</pre></div>" +
    "<div class=\"box\"><h2>Verify Token</h2><pre>" + htmlEscape(settings.instagram.webhookVerifyToken) + "</pre></div>" +
    "<div class=\"box\"><h2>مقادیر لازم برای فعال‌سازی</h2><p>این مقادیر را داخل ربات‌ساز تلگرام ارسال کنید؛ ربات‌ساز خودش فعال‌سازی سرور را انجام می‌دهد.</p><pre>INSTAGRAM_PAGE_ACCESS_TOKEN=...\nINSTAGRAM_ACCOUNT_ID=...\nMETA_APP_SECRET=...\nINSTAGRAM_VERIFY_TOKEN=" + htmlEscape(settings.instagram.webhookVerifyToken) + "</pre></div>" +
    "<div class=\"box\"><h2>متن راهنما</h2><pre>" + htmlEscape(setupText) + "</pre></div>" +
    "</div>" +
    "</main></body></html>";
}

function parseKeywordRule(rule: string) {
  const parts = rule.split(/\s*[|]\s*/);
  const keyword = (parts[0] || "").trim();
  const reply = (parts.slice(1).join(" | ") || "").trim();
  return { keyword, reply };
}

function findInstagramReply(text: string, rules: string[], fallback: string) {
  const lower = text.toLowerCase();
  for (const rule of rules) {
    const parsed = parseKeywordRule(rule);
    if (parsed.keyword && lower.includes(parsed.keyword.toLowerCase())) {
      return { matchedKeyword: parsed.keyword, reply: parsed.reply || fallback };
    }
  }
  return { matchedKeyword: undefined, reply: fallback };
}

function graphBase(settings: Settings) {
  const version = settings.instagram.graphApiVersion || "v20.0";
  return "https://graph.facebook.com/" + version;
}

async function metaPost(settings: Settings, path: string, body: any) {
  if (!settings.instagram.pageAccessToken) throw new Error("Page Access Token ثبت نشده است.");
  const url = graphBase(settings) + path + (path.includes("?") ? "&" : "?") + "access_token=" + encodeURIComponent(settings.instagram.pageAccessToken);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Meta API error " + response.status + ": " + JSON.stringify(data));
  return data;
}

async function sendInstagramDm(settings: Settings, recipientId: string, text: string) {
  return metaPost(settings, "/me/messages", { recipient: { id: recipientId }, message: { text } });
}

async function sendInstagramPrivateReply(settings: Settings, commentId: string, text: string) {
  return metaPost(settings, "/" + encodeURIComponent(commentId) + "/private_replies", { message: text });
}

function verifyMetaSignature(req: any) {
  const secret = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || "";
  if (!secret) return true;
  const signature = String(req.headers["x-hub-signature-256"] || "");
  if (!signature.startsWith("sha256=")) return false;
  const raw = typeof req.rawBody === "string" ? req.rawBody : JSON.stringify(req.body || {});
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function recordInstagramLead(settings: Settings, lead: InstagramLead) {
  settings.instagramLeads.unshift(lead);
  settings.instagramLeads = settings.instagramLeads.slice(0, 500);
  await saveSettings(settings);
}

async function notifyInstagramAdmins(settings: Settings, text: string) {
  for (const id of settings.admins) {
    try { await bot.telegram.sendMessage(id, text); } catch (error) { console.error("instagram admin notify failed", error); }
  }
}

function instagramLeadsText(settings: Settings) {
  if (!settings.instagramLeads.length) return "هنوز لید یا رویدادی از اینستاگرام ثبت نشده است.";
  return settings.instagramLeads.slice(0, 20).map((lead, i) =>
    String(i + 1) + ". " + (lead.source === "DM" ? "دایرکت" : "کامنت") +
    " | " + new Date(lead.createdAt).toLocaleString("fa-IR") +
    " | " + lead.status +
    "\n" + lead.text.slice(0, 160)
  ).join("\n\n");
}

function textSettingsInline() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🏷 نام کسب‌وکار", "ADM_EDIT_businessName")],
    [Markup.button.callback("👋 متن خوش‌آمد", "ADM_EDIT_welcomeMessage")],
    [Markup.button.callback("☎️ پشتیبانی", "ADM_EDIT_supportContact")],
    [Markup.button.callback("ℹ️ درباره ما", "ADM_EDIT_aboutText")],
    [Markup.button.callback("📝 سوال‌های فرم", "ADM_EDIT_FORM_QUESTIONS")]
  ]);
}

function paymentInline() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💳 کارت‌به‌کارت", "ADM_SET_CARD")],
    [Markup.button.callback("🔗 لینک پرداخت", "ADM_SET_PAYMENT_LINK")],
    [Markup.button.callback("🟣 مرچنت زرین‌پال/API", "ADM_SET_ZARINPAL")],
    [Markup.button.callback("🧪 تغییر حالت تست زرین‌پال", "ADM_TOGGLE_ZARINPAL_SANDBOX")]
  ]);
}

async function notifyAdmin(title: string, ctx: any, body: string) {
  const settings = await loadSettings();
  const text =
    title + "\n\n" +
    "کسب‌وکار: " + settings.businessName + "\n" +
    "نوع ربات: " + TEMPLATE_TITLE + "\n" +
    "کاربر: " + userLabel(ctx) + "\n\n" +
    body;
  for (const id of settings.admins) {
    try { await ctx.telegram.sendMessage(id, text); } catch (error) { console.error("notify admin failed", id, error); }
  }
}

function startSession(chatId: number, mode: UserSession["mode"], firstQuestion: string) {
  sessions.set(chatId, { mode, step: 0, answers: [], meta: {} });
  return firstQuestion;
}

async function finishFormLike(ctx: any, session: UserSession, title: string, questions: string[]) {
  const settings = await loadSettings();
  const responseId = String(Date.now()).slice(-8);
  const summary = questions.map((q, i) => String(i + 1) + ") " + q + ":\\n" + (session.answers[i] || "-")).join("\\n\\n");
  if (session.mode === "form") {
    settings.formResponses.push({
      id: responseId,
      chatId: ctx.chat.id,
      username: ctx.from?.username ? "@" + ctx.from.username : undefined,
      questions,
      answers: [...session.answers],
      status: "NEW",
      createdAt: new Date().toISOString()
    });
    await saveSettings(settings);
  }
  sessions.delete(ctx.chat.id);
  await notifyAdmin(title + (session.mode === "form" ? "\\nکد پاسخ: #" + responseId : ""), ctx, summary);
  await ctx.reply("اطلاعات شما ثبت شد ✅\\n" + (session.mode === "form" ? "کد پیگیری شما: #" + responseId + "\\n" : "") + "مدیر به‌زودی بررسی می‌کند.", await menuFor(ctx.chat.id, settings));
}
function describePayment(settings: Settings) {
  let text = "روش‌های پرداخت:\n";
  if (HAS_PAYMENT_GATEWAY) {
    if (settings.payment.paymentLink) text += "\n🔗 لینک پرداخت عمومی:\n" + settings.payment.paymentLink + "\n";
    if (settings.payment.zarinpalMerchantId) {
      text += "\n🟣 پرداخت آنلاین زرین‌پال فعال است.";
      text += "\nحالت: " + (settings.payment.zarinpalSandbox ? "تست/Sandbox" : "واقعی/Production") + "\n";
    }
    if (!settings.payment.paymentLink && !settings.payment.zarinpalMerchantId) text += "\nدرگاه آنلاین هنوز توسط مدیر تکمیل نشده است.\n";
  }
  if (HAS_CARD_TO_CARD || settings.payment.cardNumber) {
    if (settings.payment.cardNumber) text += "\n💳 کارت‌به‌کارت:\n" + settings.payment.cardNumber + "\nبه نام: " + (settings.payment.cardHolder || "-") + "\n";
    else text += "\nکارت‌به‌کارت هنوز توسط مدیر تکمیل نشده است.\n";
  }
  text += "\n" + settings.payment.note;
  return text;
}

function zarinpalApiBase(settings: Settings) {
  return settings.payment.zarinpalSandbox ? "https://sandbox.zarinpal.com/pg/v4/payment" : "https://payment.zarinpal.com/pg/v4/payment";
}

function zarinpalStartPayBase(settings: Settings) {
  return settings.payment.zarinpalSandbox ? "https://sandbox.zarinpal.com/pg/StartPay/" : "https://payment.zarinpal.com/pg/StartPay/";
}

function publicPaymentCallbackUrl(orderId: string) {
  if (!baseUrl) throw new Error("BASE_URL تنظیم نشده است");
  return baseUrl + "/payment/zarinpal/callback?orderId=" + encodeURIComponent(orderId);
}

function findOrder(settings: Settings, orderId?: string, authority?: string) {
  return settings.orders.find((o) => (orderId && o.id === orderId) || (authority && o.authority === authority));
}

async function zarinpalRequest(settings: Settings, order: PaymentOrder) {
  if (!settings.payment.zarinpalMerchantId) throw new Error("مرچنت زرین‌پال تنظیم نشده است");
  const response = await fetch(zarinpalApiBase(settings) + "/request.json", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      merchant_id: settings.payment.zarinpalMerchantId,
      amount: order.amount,
      currency: "IRT",
      callback_url: publicPaymentCallbackUrl(order.id),
      description: "پرداخت " + order.title,
      metadata: {}
    })
  });
  const data: any = await response.json().catch(() => ({}));
  const code = data?.data?.code;
  const authority = data?.data?.authority;
  if (!response.ok || code !== 100 || !authority) {
    throw new Error("خطا در ساخت لینک پرداخت زرین‌پال: " + JSON.stringify(data));
  }
  order.authority = authority;
  return zarinpalStartPayBase(settings) + authority;
}

async function zarinpalVerify(settings: Settings, order: PaymentOrder, authority: string) {
  const response = await fetch(zarinpalApiBase(settings) + "/verify.json", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      merchant_id: settings.payment.zarinpalMerchantId,
      amount: order.amount,
      authority
    })
  });
  const data: any = await response.json().catch(() => ({}));
  const code = Number(data?.data?.code);
  if (!response.ok || (code !== 100 && code !== 101)) {
    throw new Error("تایید پرداخت زرین‌پال ناموفق بود: " + JSON.stringify(data));
  }
  return { code, refId: String(data?.data?.ref_id || "") };
}

async function createPaymentForItem(ctx: any, item: Item) {
  const settings = await loadSettings();
  const amount = item.price || 0;
  if (!amount) {
    await ctx.reply("برای این آیتم قیمت ثبت نشده است. لطفاً با پشتیبانی تماس بگیرید.", await menuFor(ctx.chat.id, settings));
    return;
  }
  const order: PaymentOrder = {
    id: "ord_" + Date.now().toString(36) + "_" + String(ctx.chat.id),
    chatId: ctx.chat.id,
    username: ctx.from?.username,
    title: item.title,
    amount,
    status: "PENDING",
    createdAt: new Date().toISOString()
  };
  settings.orders.push(order);
  await saveSettings(settings);

  try {
    const paymentUrl = await zarinpalRequest(settings, order);
    await saveSettings(settings);
    await ctx.reply(
      "لینک پرداخت آنلاین ساخته شد ✅\n\n" +
        "آیتم: " + item.title + "\n" +
        "مبلغ: " + formatToman(amount) + "\n\n" +
        "بعد از پرداخت، نتیجه به صورت خودکار در ربات ثبت می‌شود.",
      Markup.inlineKeyboard([[Markup.button.url("💳 پرداخت آنلاین", paymentUrl)]])
    );
  } catch (error) {
    order.status = "FAILED";
    await saveSettings(settings);
    await ctx.reply(
      "ساخت لینک پرداخت آنلاین ناموفق بود ⚠️\n" +
        (error instanceof Error ? error.message : String(error)) +
        "\n\nمی‌توانید از کارت‌به‌کارت یا پشتیبانی استفاده کنید.",
      await menuFor(ctx.chat.id, settings)
    );
  }
}

function isTestExpired() {
  return !!testExpiresAt && Date.now() > testExpiresAt;
}

bot.use(async (ctx, next) => {
  if (isTestExpired()) {
    await ctx.reply("⏳ زمان ربات تست رایگان تمام شده است. این ربات فقط ۵ دقیقه فعال بود. برای ساخت نسخه کامل، از ربات‌ساز سفارش ثبت کنید.");
    return;
  }
  return next();
});

bot.start(async (ctx) => {
  knownUsers.add(ctx.chat.id);
  const settings = await loadSettings();
  if (await isAdmin(ctx.chat.id)) {
    await ctx.reply("سلام مدیر 👋\nاز منوی مدیریت می‌توانی محصولات، متن‌ها، قیمت‌ها و پرداخت را تغییر بدهی.", adminMenu());
  } else {
    await ctx.reply(settings.welcomeMessage, await menuFor(ctx.chat.id, settings));
  }
});



bot.hears("📂 دسته‌بندی‌ها", async (ctx) => {
  const settings = await loadSettings();
  if (TEMPLATE_CODE !== "MEDIA_GALLERY") return;
  await ctx.reply("یکی از دسته‌بندی‌ها را انتخاب کنید:", mediaCategoryInline(settings));
});

bot.hears("🆕 جدیدترین‌ها", async (ctx) => {
  const settings = await loadSettings();
  if (TEMPLATE_CODE !== "MEDIA_GALLERY") return;
  const items = settings.mediaItems.filter((x) => x.active).slice(-20).reverse();
  await ctx.reply("جدیدترین رسانه‌ها:", mediaListInline(items));
});

bot.hears("🔥 پربازدیدترین‌ها", async (ctx) => {
  const settings = await loadSettings();
  if (TEMPLATE_CODE !== "MEDIA_GALLERY") return;
  const items = settings.mediaItems
    .filter((x) => x.active)
    .sort((a, b) => ((b.views || 0) + (b.downloads || 0)) - ((a.views || 0) + (a.downloads || 0)))
    .slice(0, 20);
  await ctx.reply(items.length ? "پربازدیدترین رسانه‌ها:" : "هنوز آمار بازدیدی ثبت نشده است.", mediaListInline(items));
});

bot.hears("🔍 جستجو", async (ctx) => {
  if (TEMPLATE_CODE !== "MEDIA_GALLERY") return;
  sessions.set(ctx.chat.id, { mode: "media", step: 0, answers: [], meta: { action: "search" } });
  await ctx.reply("نام فیلم، سریال، عکس یا کلمه موردنظر را بفرست تا جستجو کنم.");
});

bot.hears("📩 درخواست محتوا", async (ctx) => {
  if (TEMPLATE_CODE !== "MEDIA_GALLERY") return;
  sessions.set(ctx.chat.id, { mode: "media", step: 0, answers: [], meta: { action: "request" } });
  await ctx.reply("اسم فیلم، سریال، عکس یا محتوایی که می‌خواهی را بفرست. درخواستت برای مدیر ارسال می‌شود.");
});

bot.action(/MEDIA_CAT_IDX_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const cats = mediaCategories(settings);
  const effectiveCats = cats.length ? cats : ["عمومی"];
  const category = effectiveCats[Number(ctx.match[1])] || "عمومی";
  const items = settings.mediaItems
    .filter((m) => m.active && (m.category || "عمومی") === category)
    .slice(-30)
    .reverse();
  await ctx.reply(
    items.length
      ? "محتوای دسته «" + category + "»:"
      : "هنوز محتوایی در دسته «" + category + "» ثبت نشده است. مدیر ربات می‌تواند از پنل مدیریت، رسانه اضافه کند.",
    mediaListInline(items),
  );
});

bot.action(/MEDIA_CAT_(.+)/, async (ctx) => {
  // سازگاری با نسخه‌های قبلی callback
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const category = decodeURIComponent(ctx.match[1]);
  const items = settings.mediaItems.filter((m) => m.active && (m.category || "عمومی") === category).slice(-30).reverse();
  await ctx.reply(
    items.length ? "محتوای دسته «" + category + "»:" : "هنوز محتوایی در دسته «" + category + "» ثبت نشده است.",
    mediaListInline(items),
  );
});

bot.action("MEDIA_LATEST", async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const items = settings.mediaItems.filter((m) => m.active).slice(-30).reverse();
  await ctx.reply("جدیدترین رسانه‌ها:", mediaListInline(items));
});

bot.action(/MEDIA_VIEW_ID_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const item = findMedia(settings, String(ctx.match[1]));
  if (!item || !item.active) { await ctx.reply("این رسانه پیدا نشد یا غیرفعال شده است."); return; }
  item.views = (item.views || 0) + 1;
  await saveSettings(settings);
  await ctx.reply(
    "🎬 اطلاعات محتوا\n\n" +
      "عنوان: " + (item.title || "بدون عنوان") + "\n" +
      "دسته: " + (item.category || "عمومی") + "\n" +
      "تگ‌ها: " + ((item.tags || []).join("، ") || "-") + "\n" +
      "توضیح: " + (item.caption || "-") + "\n" +
      "بازدید: " + (item.views || 0) + "\n" +
      "دانلود/ارسال: " + (item.downloads || 0),
    Markup.inlineKeyboard([[Markup.button.callback("📥 دریافت فایل", "MEDIA_SEND_ID_" + item.id)]])
  );
});

bot.action(/MEDIA_SEND_ID_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const item = findMedia(settings, String(ctx.match[1]));
  if (!item || !item.active) { await ctx.reply("این رسانه پیدا نشد یا غیرفعال شده است."); return; }
  await sendMediaItem(ctx, item, settings);
});

bot.action(/MEDIA_VIEW_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const items = settings.mediaItems.filter((m) => m.active).slice(-30).reverse();
  const item = items[Number(ctx.match[1])];
  if (!item) { await ctx.reply("این رسانه پیدا نشد."); return; }
  item.views = (item.views || 0) + 1;
  await saveSettings(settings);
  await ctx.reply(
    "🎬 اطلاعات محتوا\n\n" +
      "عنوان: " + (item.title || "بدون عنوان") + "\n" +
      "دسته: " + (item.category || "عمومی") + "\n" +
      "توضیح: " + (item.caption || "-") + "\n" +
      "بازدید: " + (item.views || 0) + "\n" +
      "دانلود/ارسال: " + (item.downloads || 0),
    Markup.inlineKeyboard([[Markup.button.callback("📥 دریافت فایل", "MEDIA_SEND_" + String(Number(ctx.match[1])))]])
  );
});

bot.action(/MEDIA_SEND_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const items = settings.mediaItems.filter((m) => m.active).slice(-30).reverse();
  const item = items[Number(ctx.match[1])];
  if (!item) { await ctx.reply("این رسانه پیدا نشد."); return; }
  await sendMediaItem(ctx, item, settings);
});


bot.hears("🛍 مدیریت فروشگاه", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply(
    "🛍 مدیریت فروشگاه\n\n" +
      "تعداد محصول/خدمت: " + settings.items.length + "\n" +
      "دسته‌ها: " + (shopCategories(settings).join("، ") || "ثبت نشده") + "\n\n" +
      "برای افزودن محصول از «📦 مدیریت آیتم‌ها» استفاده کن.\n" +
      "فرمت پیشنهادی محصول:\n" +
      "عنوان | قیمت | دسته | موجودی | توضیحات",
    adminMenu(),
  );
});

bot.hears("📦 سفارش‌های فروشگاه", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply("📦 سفارش‌های فروشگاه\n\n" + shopOrdersText(settings), shopAdminOrdersInline(settings));
});

bot.action(/ADM_SHOP_ORDER_(.+)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const order = findShopOrder(settings, String(ctx.match[1]));
  if (!order) { await ctx.reply("سفارش پیدا نشد."); return; }
  await ctx.reply(
    "📦 سفارش فروشگاهی #" + order.id + "\n\n" +
      "کاربر: " + (order.username ? "@" + order.username : order.chatId) + "\n" +
      "وضعیت: " + shopStatusTitle(order.status) + "\n" +
      "مبلغ: " + formatToman(order.total) + "\n" +
      "تاریخ: " + order.createdAt + "\n\n" +
      "آیتم‌ها:\n" + order.lines.map((l) => "• " + l.title + " × " + l.qty + " — " + formatToman(Number(l.price || 0) * l.qty)).join("\n"),
    shopOrderStatusInline(order.id),
  );
});

bot.action(/ADM_SHOP_STATUS_(.+)_(NEW|CONFIRMED|PREPARING|SENT|DONE|CANCELED)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const orderId = String(ctx.match[1]);
  const status = ctx.match[2] as ShopOrder["status"];
  const order = findShopOrder(settings, orderId);
  if (!order) { await ctx.reply("سفارش پیدا نشد."); return; }
  order.status = status;
  await saveSettings(settings);
  await ctx.reply("وضعیت سفارش #" + order.id + " تغییر کرد ✅\nوضعیت جدید: " + shopStatusTitle(order.status), shopAdminOrdersInline(settings));
  try { await ctx.telegram.sendMessage(order.chatId, "وضعیت سفارش شما تغییر کرد ✅\nکد سفارش: #" + order.id + "\nوضعیت جدید: " + shopStatusTitle(order.status)); } catch {}
});

bot.hears("🎬 مدیریت رسانه", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply(
    "🎬 مدیریت رسانه\n\n" +
      "تعداد رسانه‌ها: " + settings.mediaItems.length + "\n" +
      "دسته‌ها: " + (mediaCategories(settings).join("، ") || "ثبت نشده") + "\n" +
      "قفل عضویت: " + (settings.forceJoinEnabled ? "فعال " + settings.forceJoinChannel : "خاموش") + "\n" +
      "حذف خودکار: " + (settings.autoDeleteSeconds ? settings.autoDeleteSeconds + " ثانیه" : "خاموش") + "\n\n" +
      "برای افزودن محتوا، فیلم/عکس/فایل را همینجا بفرست. کپشن پیشنهادی:\n" +
      "عنوان: نام فیلم | دسته: انیمیشن | تگ: اکشن، 2024 | توضیح کوتاه",
    adminMenu(),
  );
});

bot.action("ADM_MEDIA_LIST", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  await ctx.reply("📋 لیست رسانه‌ها", mediaAdminListInline(settings));
});

bot.action("ADM_MEDIA_CATS", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  adminStates.set(ctx.chat!.id, { action: "SET_MEDIA_CATEGORIES" });
  await ctx.reply(
    "دسته‌بندی‌های فعلی:\n" +
      (mediaCategories(settings).join("\n") || "ثبت نشده") +
      "\n\nلیست کامل دسته‌ها را خط‌به‌خط بفرست. مثال:\nفیلم ایرانی\nسریال خارجی\nانیمیشن\nعکس آموزشی"
  );
});

bot.action("ADM_MEDIA_FORCE_JOIN", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  adminStates.set(ctx.chat!.id, { action: "SET_FORCE_JOIN" });
  await ctx.reply("آیدی کانال عضویت اجباری را بفرست، مثل @channel.\nبرای خاموش کردن بنویس: OFF\n\nنکته: ربات باید در آن کانال ادمین باشد.");
});

bot.action("ADM_MEDIA_AUTO_DELETE", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  adminStates.set(ctx.chat!.id, { action: "SET_AUTO_DELETE" });
  await ctx.reply("مدت حذف خودکار فایل را به ثانیه بفرست. مثال: 60\nبرای خاموش کردن بنویس: 0 یا OFF");
});

bot.action("ADM_MEDIA_STATS", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const totalViews = settings.mediaItems.reduce((s, x) => s + (x.views || 0), 0);
  const totalDownloads = settings.mediaItems.reduce((s, x) => s + (x.downloads || 0), 0);
  const activeCount = settings.mediaItems.filter((x) => x.active).length;
  await ctx.reply("📊 آمار رسانه\n\nتعداد کل: " + settings.mediaItems.length + "\nفعال: " + activeCount + "\nبازدید: " + totalViews + "\nارسال/دانلود: " + totalDownloads, adminMenu());
});

bot.action(/ADM_MEDIA_PREVIEW_(.+)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const item = findMedia(settings, String(ctx.match[1]));
  if (!item) { await ctx.reply("رسانه پیدا نشد."); return; }
  await ctx.reply(
    "🎬 رسانه\n\n" +
      "عنوان: " + (item.title || "-") + "\n" +
      "دسته: " + (item.category || "عمومی") + "\n" +
      "وضعیت: " + (item.active ? "فعال" : "غیرفعال") + "\n" +
      "بازدید: " + (item.views || 0) + "\n" +
      "ارسال/دانلود: " + (item.downloads || 0) + "\n" +
      "تگ‌ها: " + ((item.tags || []).join("، ") || "-")
  );
});

bot.action(/ADM_MEDIA_TOGGLE_(.+)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const item = findMedia(settings, String(ctx.match[1]));
  if (!item) { await ctx.reply("رسانه پیدا نشد."); return; }
  item.active = !item.active;
  await saveSettings(settings);
  await ctx.reply("وضعیت رسانه تغییر کرد ✅", mediaAdminListInline(settings));
});

bot.action(/ADM_MEDIA_DELETE_(.+)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const before = settings.mediaItems.length;
  settings.mediaItems = settings.mediaItems.filter((item) => item.id !== String(ctx.match[1]));
  await saveSettings(settings);
  await ctx.reply(before === settings.mediaItems.length ? "رسانه پیدا نشد." : "رسانه حذف شد ✅", mediaAdminListInline(settings));
});

bot.hears("📂 مدیریت دسته‌ها", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  adminStates.set(ctx.chat.id, { action: "SET_MEDIA_CATEGORIES" });
  await ctx.reply(
    "دسته‌بندی‌های فعلی:\n" +
      (mediaCategories(settings).join("\n") || "ثبت نشده") +
      "\n\nبرای ویرایش، لیست کامل دسته‌بندی‌ها را خط‌به‌خط بفرست. مثال:\nفیلم ایرانی\nسریال خارجی\nانیمیشن\nعکس آموزشی",
  );
});

bot.hears("🔒 قفل عضویت", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  adminStates.set(ctx.chat.id, { action: "SET_FORCE_JOIN" });
  await ctx.reply("اگر می‌خواهی قفل عضویت فعال شود، آیدی کانال را بفرست مثل @channel.\nبرای خاموش کردن بنویس: OFF\n\nنکته: ربات باید در آن کانال ادمین باشد تا عضویت را بررسی کند.");
});

bot.hears("⏱ حذف خودکار فایل", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  adminStates.set(ctx.chat.id, { action: "SET_AUTO_DELETE" });
  await ctx.reply("مدت حذف خودکار فایل را به ثانیه بفرست. مثال: 60\nبرای خاموش کردن بنویس: 0 یا OFF");
});

bot.on(["photo", "video", "document"], async (ctx, next) => {
  if (TEMPLATE_CODE !== "MEDIA_GALLERY") return next();
  if (!(await isAdmin(ctx.chat?.id))) {
    await ctx.reply("ارسال رسانه فقط برای ادمین فعال است. برای درخواست محتوا از دکمه 📩 درخواست محتوا استفاده کنید.");
    return;
  }
  const settings = await loadSettings();
  const message: any = ctx.message;
  const caption = String(message.caption || "");
  let type: MediaItem["type"] = "document";
  let fileId = "";
  if (message.photo?.length) { type = "photo"; fileId = message.photo[message.photo.length - 1].file_id; }
  else if (message.video) { type = "video"; fileId = message.video.file_id; }
  else if (message.document) { type = "document"; fileId = message.document.file_id; }
  if (!fileId) return next();
  const parsed = parseMediaCaption(caption);
  const item: MediaItem = {
    id: String(Date.now()) + "_" + String(settings.mediaItems.length + 1),
    type,
    fileId,
    title: parsed.title,
    caption: parsed.caption,
    category: parsed.category || settings.mediaCategories[0] || "عمومی",
    tags: parsed.tags || [],
    uploadedBy: ctx.chat.id,
    createdAt: new Date().toISOString(),
    active: true,
    views: 0,
    downloads: 0,
  };
  settings.mediaItems.push(item);
  if (item.category && !settings.mediaCategories.includes(item.category)) settings.mediaCategories.push(item.category);
  await saveSettings(settings);
  await ctx.reply("رسانه ثبت شد ✅\nعنوان: " + (item.title || "-") + "\nدسته: " + item.category, adminMenu());
  await notifyAdmin("رسانه جدید آپلود شد 📂", ctx, "نوع: " + type + "\nدسته: " + item.category + "\nعنوان: " + (item.title || "-") + "\nکپشن: " + (caption || "-"));
});


bot.hears("🎫 مدیریت تیکت‌ها", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply("تیکت‌های اخیر:", supportAdminTicketsInline(settings));
});

bot.hears("🧩 موضوعات تیکت", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  adminStates.set(ctx.chat.id, { action: "SET_SUPPORT_TOPICS" });
  await ctx.reply("موضوعات فعلی تیکت:\n" + ((settings.supportTopics || []).join("\n") || "ثبت نشده") + "\n\nلیست جدید را خط‌به‌خط بفرست. مثال:\nسوال قبل از خرید\nمشکل پرداخت\nپیگیری سفارش\nپشتیبانی فنی");
});

bot.hears("⚡ پاسخ‌های آماده", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  adminStates.set(ctx.chat.id, { action: "SET_QUICK_REPLIES" });
  await ctx.reply("پاسخ‌های آماده فعلی:\n" + ((settings.quickReplies || []).join("\n---\n") || "ثبت نشده") + "\n\nپاسخ‌های آماده جدید را خط‌به‌خط بفرست.");
});

bot.hears("❓ مدیریت سوالات متداول", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply("سوالات متداول/آیتم‌های فعلی:\n\n" + itemListText(settings) + "\n\nبرای افزودن یا ویرایش از دکمه‌ها استفاده کن.", itemsInline(settings));
});

bot.action(/ADM_SUPPORT_VIEW_(.+)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const ticket = settings.supportTickets.find((t) => t.id === String(ctx.match[1]));
  if (!ticket) { await ctx.reply("تیکت پیدا نشد."); return; }
  await ctx.reply(supportTicketText(ticket), supportTicketActions(ticket.id));
});

bot.action(/ADM_SUPPORT_REPLY_(.+)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const ticket = settings.supportTickets.find((t) => t.id === String(ctx.match[1]));
  if (!ticket) { await ctx.reply("تیکت پیدا نشد."); return; }
  adminStates.set(ctx.chat!.id, { action: "REPLY_SUPPORT_TICKET", ticketId: ticket.id });
  await ctx.reply("پاسخ خودت به تیکت #" + ticket.id + " را بفرست یا یکی از پاسخ‌های آماده را انتخاب کن:", quickRepliesInline(settings, ticket.id));
});

bot.action(/ADM_SUPPORT_QR_(.+)_(\d+)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const ticket = settings.supportTickets.find((t) => t.id === String(ctx.match[1]));
  const reply = settings.quickReplies[Number(ctx.match[2])];
  if (!ticket || !reply) { await ctx.reply("تیکت یا پاسخ آماده پیدا نشد."); return; }
  ticket.adminReply = reply;
  ticket.status = "ANSWERED";
  ticket.updatedAt = new Date().toISOString();
  await saveSettings(settings);
  try { await ctx.telegram.sendMessage(ticket.chatId, "پاسخ تیکت #" + ticket.id + " ✅\n\n" + reply); } catch {}
  await ctx.reply("پاسخ ارسال شد ✅", supportAdminTicketsInline(settings));
});

bot.action(/ADM_SUPPORT_CLOSE_(.+)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const ticket = settings.supportTickets.find((t) => t.id === String(ctx.match[1]));
  if (!ticket) { await ctx.reply("تیکت پیدا نشد."); return; }
  ticket.status = "CLOSED";
  ticket.updatedAt = new Date().toISOString();
  await saveSettings(settings);
  try { await ctx.telegram.sendMessage(ticket.chatId, "تیکت #" + ticket.id + " بسته شد ✅"); } catch {}
  await ctx.reply("تیکت بسته شد ✅", supportAdminTicketsInline(settings));
});

bot.action(/ADM_SUPPORT_OPEN_(.+)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const ticket = settings.supportTickets.find((t) => t.id === String(ctx.match[1]));
  if (!ticket) { await ctx.reply("تیکت پیدا نشد."); return; }
  ticket.status = "OPEN";
  ticket.updatedAt = new Date().toISOString();
  await saveSettings(settings);
  await ctx.reply("تیکت دوباره باز شد ✅", supportAdminTicketsInline(settings));
});



bot.hears("📅 مدیریت رزروها", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply("📅 رزروهای اخیر:\n\n" + reservationsText(settings), adminMenu());
});

bot.hears("🧩 خدمات رزرو", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  adminStates.set(ctx.chat.id, { action: "SET_RESERVATION_SERVICES" });
  await ctx.reply("خدمات رزرو را خط‌به‌خط با فرمت زیر بفرست:\nعنوان | بیعانه/قیمت | توضیح\n\nمثال:\nمشاوره | 300000 | نوبت ۳۰ دقیقه‌ای");
});

bot.hears("🎓 مدیریت دوره‌ها", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  adminStates.set(ctx.chat.id, { action: "SET_COURSE_ITEMS" });
  await ctx.reply("دوره‌ها/فایل‌ها را خط‌به‌خط با فرمت زیر بفرست:\nعنوان | قیمت | توضیح یا لینک/راهنما");
});

bot.hears("👥 خریداران دوره", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply("👥 خریدهای ثبت‌شده:\n\n" + simpleUserOrdersText(settings, 0).replace("هنوز خریدی ثبت نشده است.", settings.orders.slice(-20).reverse().map((o) => "#" + o.id + " | " + (o.username || o.chatId) + " | " + o.title + " | " + o.status).join("\n") || "خریدی ثبت نشده است."), adminMenu());
});

bot.hears("💎 مدیریت پلن‌های VIP", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  adminStates.set(ctx.chat.id, { action: "SET_VIP_PLANS" });
  await ctx.reply("پلن‌های VIP را خط‌به‌خط با فرمت زیر بفرست:\nعنوان | قیمت | توضیح\n\nمثال:\nاشتراک یک‌ماهه | 199000 | دسترسی ۳۰ روزه");
});

bot.hears("👥 اعضای VIP", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply("👥 اعضای VIP:\n\n" + subscriptionsText(settings), adminMenu());
});

bot.hears("📂 مدیریت محتوای قفل‌شده", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  adminStates.set(ctx.chat.id, { action: "SET_COURSE_ITEMS" });
  await ctx.reply("محتواهای قفل‌شده را خط‌به‌خط بفرست:\nعنوان | قیمت اختیاری | توضیح/لینک/متن محتوا");
});

bot.hears("📣 مدیریت خبرنامه", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply("📣 خبرنامه\n\nتعداد اعضا: " + settings.newsletterUsers.length + "\nبرای ارسال پیام از گزینه «📣 پیام همگانی» استفاده کن.", adminMenu());
});

bot.hears("👥 اعضای خبرنامه", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply("اعضای خبرنامه:\n" + (settings.newsletterUsers.join("\n") || "عضوی ثبت نشده است."), adminMenu());
});

bot.hears("📝 مدیریت آزمون/نظرسنجی", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  adminStates.set(ctx.chat.id, { action: "SET_QUIZ_QUESTIONS" });
  await ctx.reply("سوال‌های آزمون/نظرسنجی را خط‌به‌خط بفرست.");
});

bot.hears("📊 پاسخ‌های آزمون", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply("📊 پاسخ‌های آزمون/نظرسنجی:\n\n" + (settings.quizResponses.slice(-20).reverse().map(formResponseFullText).join("\n\n---\n\n") || "پاسخی ثبت نشده است."), adminMenu());
});

bot.hears("🧰 پنل مدیریت", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  await ctx.reply("پنل مدیریت ربات مشتری:\nهر چیزی که لازم داری از همینجا قابل تغییر است.", adminMenu());
});

bot.hears("📦 مدیریت آیتم‌ها", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply("آیتم‌های فعلی:\n\n" + itemListText(settings), itemsInline(settings));
});

bot.hears("✏️ ویرایش متن‌ها", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  await ctx.reply("کدام متن را می‌خواهی تغییر بدهی؟", textSettingsInline());
});

bot.hears("💳 تنظیم پرداخت", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply("وضعیت فعلی پرداخت:\n\n" + describePayment(settings), paymentInline());
});

bot.hears("📊 گزارش‌ها", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  await ctx.reply("گزارش ساده:\nکاربران دیده‌شده از زمان روشن شدن ربات: " + knownUsers.size + "\nتعداد آیتم‌ها: " + (await loadSettings()).items.length, adminMenu());
});

bot.hears("📣 پیام همگانی", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  adminStates.set(ctx.chat.id, { action: "BROADCAST" });
  await ctx.reply("متن پیام همگانی را بفرست.\nفعلاً پیام به کاربرانی ارسال می‌شود که از زمان روشن شدن ربات /start زده‌اند.");
});

bot.hears("👥 مدیریت ادمین‌ها", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply("ادمین‌های فعلی:\n" + settings.admins.join("\n") + "\n\nبرای افزودن ادمین جدید، آیدی عددی را بفرست.");
  adminStates.set(ctx.chat.id, { action: "ADD_ADMIN" });
});

bot.hears("🔙 منوی کاربر", async (ctx) => {
  const settings = await loadSettings();
  await ctx.reply("منوی کاربر:", await menuFor(ctx.chat.id, settings));
});

bot.action("ADM_ITEM_ADD", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  adminStates.set(ctx.chat!.id, { action: "ADD_ITEM" });
  await ctx.reply("آیتم جدید را با این فرمت بفرست:\nعنوان | قیمت | توضیح\n\nمثال:\nمحصول تست | 250000 | توضیحات محصول");
});

bot.action(/ADM_ITEM_EDIT_(\d+)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  adminStates.set(ctx.chat!.id, { action: "EDIT_ITEM", index: Number(ctx.match[1]) });
  await ctx.reply("مقدار جدید را با این فرمت بفرست:\nعنوان | قیمت | توضیح");
});

bot.action(/ADM_ITEM_DEL_(\d+)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const index = Number(ctx.match[1]);
  if (settings.items[index]) settings.items.splice(index, 1);
  await saveSettings(settings);
  await ctx.reply("حذف شد ✅\n\n" + itemListText(settings), itemsInline(settings));
});

bot.action(/ADM_EDIT_(businessName|welcomeMessage|supportContact|aboutText)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  adminStates.set(ctx.chat!.id, { action: "EDIT_FIELD", field: ctx.match[1] as any });
  await ctx.reply("متن جدید را بفرست.");
});

bot.action("ADM_EDIT_FORM_QUESTIONS", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  adminStates.set(ctx.chat!.id, { action: "EDIT_FORM_QUESTIONS" });
  await ctx.reply("سوال‌های فرم را خط به خط بفرست.");
});

bot.action("ADM_SET_CARD", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  adminStates.set(ctx.chat!.id, { action: "SET_CARD" });
  await ctx.reply("شماره کارت و نام صاحب کارت را با این فرمت بفرست:\nشماره کارت | نام صاحب کارت");
});

bot.action("ADM_SET_PAYMENT_LINK", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  adminStates.set(ctx.chat!.id, { action: "SET_PAYMENT_LINK" });
  await ctx.reply("لینک پرداخت را بفرست. مثال:\nhttps://...");
});

bot.action("ADM_SET_ZARINPAL", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  adminStates.set(ctx.chat!.id, { action: "SET_ZARINPAL" });
  await ctx.reply("مرچنت زرین‌پال را بفرست.\nاگر می‌خواهی حالت تست فعال باشد، بعد از مرچنت بنویس: | sandbox\n\nمثال:\nxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx | sandbox");
});

bot.action("ADM_TOGGLE_ZARINPAL_SANDBOX", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  settings.payment.zarinpalSandbox = !settings.payment.zarinpalSandbox;
  await saveSettings(settings);
  await ctx.reply("حالت زرین‌پال تغییر کرد ✅\nحالت فعلی: " + (settings.payment.zarinpalSandbox ? "تست/Sandbox" : "واقعی/Production"), adminMenu());
});

bot.hears("ℹ️ درباره ما", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  const settings = await loadSettings();
  const features = FEATURES.map((f) => "• " + f).join("\n") || "ثبت نشده";
  await ctx.reply(settings.businessName + "\n\n" + settings.aboutText + "\n\nنوع ربات: " + TEMPLATE_TITLE + "\n\nامکانات فعال:\n" + features, await menuFor(ctx.chat.id, settings));
});

bot.hears("☎️ پشتیبانی", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  const settings = await loadSettings();
  if (settings.supportContact && settings.supportContact !== "ثبت نشده") {
    await ctx.reply("راه ارتباطی پشتیبانی:\n" + settings.supportContact, await menuFor(ctx.chat.id, settings));
  } else {
    sessions.set(ctx.chat.id, { mode: "support", step: 0, answers: [], meta: {} });
    await ctx.reply("پیام پشتیبانی خود را بنویسید تا برای مدیر ارسال شود.");
  }
});

bot.hears("💳 پرداخت", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  const settings = await loadSettings();
  await ctx.reply(describePayment(settings), await menuFor(ctx.chat.id, settings));
});



bot.hears("📅 رزرو نوبت", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "RESERVATION") return;
  const settings = await loadSettings();
  await ctx.reply("📅 خدمت موردنظرت را انتخاب کن:", userItemsInline(settings, "RESERVE_ITEM"));
});

bot.hears("📌 نوبت‌های من", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "RESERVATION") return;
  const settings = await loadSettings();
  await ctx.reply("📌 نوبت‌های شما:\n\n" + reservationsText(settings, ctx.chat.id), await menuFor(ctx.chat.id, settings));
});

bot.action(/RESERVE_ITEM_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const item = settings.items[Number(ctx.match[1])];
  if (!item || !item.active) { await ctx.reply("این خدمت پیدا نشد یا غیرفعال است."); return; }
  sessions.set(ctx.chat!.id, { mode: "reservation", step: 0, answers: [], meta: { item: item.title, price: String(item.price || 0) } });
  await ctx.reply(reservationText(item) + "\n\nلطفاً تاریخ و ساعت پیشنهادی را بفرست. مثال: سه‌شنبه ساعت ۱۸");
});

bot.hears("🎓 دوره‌ها / فایل‌ها", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "COURSE_FILE") return;
  const settings = await loadSettings();
  await ctx.reply("🎓 دوره یا فایل موردنظرت را انتخاب کن:", userItemsInline(settings, "COURSE_ITEM"));
});

bot.hears("🧾 خریدهای من", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "COURSE_FILE") return;
  const settings = await loadSettings();
  await ctx.reply("🧾 خریدهای شما:\n\n" + simpleUserOrdersText(settings, ctx.chat.id), await menuFor(ctx.chat.id, settings));
});

bot.action(/COURSE_ITEM_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const item = settings.items[Number(ctx.match[1])];
  if (!item || !item.active) { await ctx.reply("این مورد پیدا نشد یا غیرفعال است."); return; }
  const rows = [[Markup.button.callback("🧾 درخواست خرید", "COURSE_REQUEST_" + String(Number(ctx.match[1])) )]];
  if (HAS_PAYMENT_GATEWAY && settings.payment.zarinpalMerchantId && item.price) rows.unshift([Markup.button.callback("💳 پرداخت آنلاین", "COURSE_PAY_" + String(Number(ctx.match[1]))) ]);
  await ctx.reply(courseText(item), Markup.inlineKeyboard(rows));
});

bot.action(/COURSE_PAY_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const item = settings.items[Number(ctx.match[1])];
  if (!item) { await ctx.reply("مورد پیدا نشد."); return; }
  await createPaymentForItem(ctx, item);
});

bot.action(/COURSE_REQUEST_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const item = settings.items[Number(ctx.match[1])];
  if (!item) { await ctx.reply("مورد پیدا نشد."); return; }
  await notifyAdmin("درخواست خرید دوره/فایل 🎓", ctx, "عنوان: " + item.title + "\nقیمت: " + formatToman(item.price));
  await ctx.reply("درخواست خرید برای مدیر ارسال شد ✅", await menuFor(ctx.chat!.id, settings));
});

bot.hears("💎 پلن‌های VIP", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "VIP_MEMBERSHIP") return;
  const settings = await loadSettings();
  await ctx.reply("💎 پلن موردنظرت را انتخاب کن:", userItemsInline(settings, "VIP_ITEM"));
});

bot.hears("👤 وضعیت اشتراک", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "VIP_MEMBERSHIP") return;
  const settings = await loadSettings();
  await ctx.reply("👤 وضعیت اشتراک شما:\n\n" + subscriptionsText(settings, ctx.chat.id), await menuFor(ctx.chat.id, settings));
});

bot.action(/VIP_ITEM_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const item = settings.items[Number(ctx.match[1])];
  if (!item || !item.active) { await ctx.reply("این پلن پیدا نشد یا غیرفعال است."); return; }
  await ctx.reply(vipText(item), Markup.inlineKeyboard([[Markup.button.callback("💎 درخواست/خرید این پلن", "VIP_REQUEST_" + String(Number(ctx.match[1])) )]]));
});

bot.action(/VIP_REQUEST_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const item = settings.items[Number(ctx.match[1])];
  if (!item) { await ctx.reply("پلن پیدا نشد."); return; }
  settings.vipSubscriptions.push({ id: Date.now().toString(36).toUpperCase(), chatId: ctx.chat!.id, username: ctx.from?.username, plan: item.title, status: "PENDING", createdAt: new Date().toISOString() });
  await saveSettings(settings);
  await notifyAdmin("درخواست عضویت VIP 💎", ctx, "پلن: " + item.title + "\nقیمت: " + formatToman(item.price));
  await ctx.reply("درخواست عضویت ویژه ثبت شد ✅\nمدیر بعد از بررسی/پرداخت، دسترسی شما را فعال می‌کند.", await menuFor(ctx.chat!.id, settings));
});

bot.hears("🔒 محتوای قفل‌شده", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "FORCE_JOIN_CONTENT") return;
  const settings = await loadSettings();
  if (!(await requireForceJoin(ctx, settings))) return;
  await ctx.reply("🔒 محتواهای قابل مشاهده:", userItemsInline(settings, "LOCKED_ITEM"));
});

bot.hears("📋 محتواها", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "FORCE_JOIN_CONTENT") return;
  const settings = await loadSettings();
  await ctx.reply("📋 محتواها:", userItemsInline(settings, "LOCKED_ITEM"));
});

bot.action(/LOCKED_ITEM_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  if (!(await requireForceJoin(ctx, settings))) return;
  const item = settings.items[Number(ctx.match[1])];
  if (!item || !item.active) { await ctx.reply("محتوا پیدا نشد یا غیرفعال است."); return; }
  await ctx.reply("🔓 " + item.title + "\n\n" + (item.description || "این محتوا بعد از تایید عضویت برای شما نمایش داده شد."), await menuFor(ctx.chat!.id, settings));
});

bot.hears("📣 عضویت در خبرنامه", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "NEWSLETTER") return;
  const settings = await loadSettings();
  if (!settings.newsletterUsers.includes(ctx.chat.id)) settings.newsletterUsers.push(ctx.chat.id);
  await saveSettings(settings);
  await ctx.reply("عضویت شما در خبرنامه ثبت شد ✅", await menuFor(ctx.chat.id, settings));
});

bot.hears("🔕 لغو عضویت", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "NEWSLETTER") return;
  const settings = await loadSettings();
  settings.newsletterUsers = settings.newsletterUsers.filter((id) => id !== ctx.chat.id);
  await saveSettings(settings);
  await ctx.reply("عضویت شما در خبرنامه لغو شد.", await menuFor(ctx.chat.id, settings));
});

bot.hears("📝 شرکت در آزمون/نظرسنجی", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "QUIZ_SURVEY") return;
  const settings = await loadSettings();
  const questions = settings.formQuestions.length ? settings.formQuestions : ["نام و نام خانوادگی", "شماره تماس", "نظر شما"];
  sessions.set(ctx.chat.id, { mode: "quiz", step: 0, answers: [], meta: {} });
  await ctx.reply("📝 آزمون/نظرسنجی شروع شد.\n\n" + questions[0]);
});

bot.hears("📊 نتیجه‌های من", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "QUIZ_SURVEY") return;
  const settings = await loadSettings();
  const list = settings.quizResponses.filter((r) => r.chatId === ctx.chat.id).slice(-10).reverse();
  await ctx.reply(list.length ? list.map((r) => "#" + r.id + " | " + new Date(r.createdAt).toLocaleString("fa-IR")).join("\n") : "هنوز پاسخی ثبت نشده است.", await menuFor(ctx.chat.id, settings));
});

bot.hears(["📋 خدمات", "❓ سوالات متداول", "🎓 دوره‌ها / فایل‌ها"], async (ctx) => {
  knownUsers.add(ctx.chat.id);
  const settings = await loadSettings();
  const active = settings.items.filter((item) => item.active);
  await ctx.reply(active.length ? itemListText({ ...settings, items: active }) : "اطلاعات هنوز توسط مدیر تکمیل نشده است.", await menuFor(ctx.chat.id, settings));
});


bot.hears(["🛍 محصولات", "🛍 دسته‌بندی محصولات"], async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "SHOP") return;
  const settings = await loadSettings();
  await ctx.reply(
    "🛍 فروشگاه\n\nاز دسته‌بندی‌ها محصول موردنظرت را انتخاب کن، یا با جستجو سریع‌تر پیدایش کن.",
    shopCategoryInline(settings),
  );
});

bot.hears("🔍 جستجوی محصول", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "SHOP") return;
  sessions.set(ctx.chat.id, { mode: "shop", step: 0, answers: [], meta: { action: "search" } });
  await ctx.reply("نام محصول یا بخشی از توضیحات را بفرست تا جستجو کنم.");
});

bot.hears("🛒 سبد خرید", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "SHOP") return;
  const lines = carts.get(ctx.chat.id) || [];
  await ctx.reply("🛒 سبد خرید\n\n" + cartText(lines), cartInline());
});

bot.hears("📦 سفارش‌های من", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  if (TEMPLATE_CODE !== "SHOP") return;
  const settings = await loadSettings();
  await ctx.reply("📦 سفارش‌های شما\n\n" + shopOrdersText(settings, ctx.chat.id), await menuFor(ctx.chat.id, settings));
});

bot.action("SHOP_SEARCH", async (ctx) => {
  await ctx.answerCbQuery();
  sessions.set(ctx.chat!.id, { mode: "shop", step: 0, answers: [], meta: { action: "search" } });
  await ctx.reply("نام محصول یا بخشی از توضیحات را بفرست تا جستجو کنم.");
});

bot.action(/SHOP_CAT_IDX_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const cats = shopCategories(settings);
  const category = cats[Number(ctx.match[1])] || "عمومی";
  const entries = shopActiveEntries(settings).filter(({ item }) => (item.category || "عمومی") === category);
  await ctx.reply(entries.length ? "محصولات دسته «" + category + "»:" : "در این دسته هنوز محصولی ثبت نشده است.", shopProductInline(entries));
});

bot.action(/SHOP_VIEW_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const index = Number(ctx.match[1]);
  const item = settings.items[index];
  if (!item || !item.active) { await ctx.reply("این محصول پیدا نشد یا غیرفعال است."); return; }
  await ctx.reply(shopProductText(item), shopProductActions(index));
});

bot.action(/SHOP_ADD_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const index = Number(ctx.match[1]);
  const item = settings.items[index];
  if (!item || !item.active) { await ctx.reply("این محصول پیدا نشد یا غیرفعال است."); return; }
  const lines = carts.get(ctx.chat!.id) || [];
  const existing = lines.find((line) => line.itemIndex === index);
  if (existing) existing.qty += 1;
  else lines.push({ itemIndex: index, title: item.title, price: item.price, qty: 1 });
  carts.set(ctx.chat!.id, lines);
  await ctx.reply("به سبد خرید اضافه شد ✅\n\n" + cartText(lines), cartInline());
});

bot.action("SHOP_CART", async (ctx) => {
  await ctx.answerCbQuery();
  const lines = carts.get(ctx.chat!.id) || [];
  await ctx.reply("🛒 سبد خرید\n\n" + cartText(lines), cartInline());
});

bot.action("SHOP_CLEAR_CART", async (ctx) => {
  await ctx.answerCbQuery();
  carts.delete(ctx.chat!.id);
  await ctx.reply("سبد خرید خالی شد ✅");
});

bot.action("SHOP_CHECKOUT", async (ctx) => {
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const lines = carts.get(ctx.chat!.id) || [];
  if (!lines.length) { await ctx.reply("سبد خرید خالی است.", await menuFor(ctx.chat!.id, settings)); return; }
  const order = createShopOrder(settings, ctx.chat!.id, ctx.from?.username, lines);
  await saveSettings(settings);
  carts.delete(ctx.chat!.id);
  await notifyAdmin("سفارش فروشگاهی جدید 🛍", ctx, "کد سفارش: #" + order.id + "\n" + cartText(order.lines) + "\n\nوضعیت: " + shopStatusTitle(order.status));
  await ctx.reply(
    "سفارش شما ثبت شد ✅\n\n" +
      "کد سفارش: #" + order.id + "\n" +
      "مبلغ کل: " + formatToman(order.total) + "\n\n" +
      "برای پرداخت از بخش 💳 پرداخت استفاده کنید یا با پشتیبانی هماهنگ کنید.",
    await menuFor(ctx.chat!.id, settings),
  );
});

bot.hears("🧾 ثبت سفارش", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  sessions.set(ctx.chat.id, { mode: "shop", step: 0, answers: [], meta: {} });
  await ctx.reply("لطفاً نام محصول/خدمت، تعداد، شماره تماس و توضیحات را ارسال کنید.");
});

bot.hears("🎫 ثبت تیکت", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  const settings = await loadSettings();
  await ctx.reply("موضوع تیکت را انتخاب کنید:", supportTopicInline(settings));
});

bot.hears("📌 پیگیری تیکت", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  const settings = await loadSettings();
  await ctx.reply("تیکت‌های شما:", userTicketsInline(settings, ctx.chat.id));
});

bot.hears("❓ سوالات متداول", async (ctx) => {
  const settings = await loadSettings();
  const faqs = settings.items.filter((item) => item.active);
  if (!faqs.length) { await ctx.reply("هنوز سوال متداولی ثبت نشده است.", await menuFor(ctx.chat.id, settings)); return; }
  await ctx.reply("سوالات متداول:\n\n" + faqs.map((item, i) => String(i + 1) + ". " + item.title + (item.description ? "\n" + item.description : "")).join("\n\n"), await menuFor(ctx.chat.id, settings));
});


bot.hears("📝 مدیریت فرم", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply(
    "📝 مدیریت فرم\n\n" +
    "سوال‌های فعلی:\n" +
    (settings.formQuestions.length ? settings.formQuestions.map((q, i) => String(i + 1) + ". " + q).join("\n") : "سوالی ثبت نشده") +
    "\n\nبرای تغییر سوال‌ها، روی دکمه زیر بزن و سوال‌ها را خط‌به‌خط ارسال کن.",
    Markup.inlineKeyboard([[Markup.button.callback("📝 ویرایش سوال‌های فرم", "ADM_EDIT_FORM_QUESTIONS")]])
  );
});

bot.hears("📄 پاسخ‌های فرم", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  await ctx.reply("📄 پاسخ‌های ثبت‌شده فرم:", formResponsesInline(settings));
});

bot.hears("📊 آمار فرم", async (ctx) => {
  if (!(await isAdmin(ctx.chat.id))) return;
  const settings = await loadSettings();
  const total = settings.formResponses.length;
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = settings.formResponses.filter((r) => r.createdAt.slice(0, 10) === today).length;
  await ctx.reply("📊 آمار فرم\n\nکل پاسخ‌ها: " + total + "\nپاسخ‌های امروز: " + todayCount, adminMenu());
});

bot.action(/ADM_FORM_RESP_(.+)/, async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  const response = settings.formResponses.find((r) => r.id === ctx.match[1]);
  if (!response) return ctx.reply("این پاسخ پیدا نشد.", formResponsesInline(settings));
  await ctx.reply(formResponseFullText(response));
});

bot.action("ADM_FORM_RESP_CLEAR_CONFIRM", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  await ctx.reply("⚠️ مطمئنی می‌خواهی همه پاسخ‌های فرم پاک شوند؟", Markup.inlineKeyboard([
    [Markup.button.callback("🗑 بله، پاک کن", "ADM_FORM_RESP_CLEAR_DO")],
    [Markup.button.callback("🔙 انصراف", "ADM_FORM_RESP_CANCEL")]
  ]));
});

bot.action("ADM_FORM_RESP_CANCEL", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  await ctx.reply("لغو شد.", formResponsesInline(settings));
});

bot.action("ADM_FORM_RESP_CLEAR_DO", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  settings.formResponses = [];
  await saveSettings(settings);
  await ctx.reply("همه پاسخ‌های فرم پاک شدند ✅", adminMenu());
});

bot.hears("📅 رزرو نوبت", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  const settings = await loadSettings();
  const question = startSession(ctx.chat.id, "reservation", "نام خدمت موردنظر، روز/ساعت پیشنهادی، نام و شماره تماس را ارسال کنید.");
  await ctx.reply(question + "\n\nخدمات:\n" + itemListText(settings));
});

bot.hears("📝 ثبت سفارش خدمات", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  sessions.set(ctx.chat.id, { mode: "service", step: 0, answers: [], meta: {} });
  await ctx.reply("لطفاً نوع خدمت، توضیحات کامل، زمان موردنظر و شماره تماس را ارسال کنید.");
});

bot.hears("🧾 درخواست خرید", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  sessions.set(ctx.chat.id, { mode: "course", step: 0, answers: [], meta: {} });
  await ctx.reply("نام دوره/فایل موردنظر و شماره تماس خود را ارسال کنید.");
});

bot.hears("📝 شروع فرم", async (ctx) => {
  knownUsers.add(ctx.chat.id);
  const settings = await loadSettings();
  const questions = settings.formQuestions.length ? settings.formQuestions : ["نام و نام خانوادگی", "شماره تماس", "توضیحات"];
  sessions.set(ctx.chat.id, { mode: "form", step: 0, answers: [], meta: {} });
  await ctx.reply("فرم شروع شد ✅\n\n" + questions[0]);
});

bot.hears("ℹ️ راهنما", async (ctx) => {
  const settings = await loadSettings();
  await ctx.reply("برای ثبت اطلاعات روی «📝 شروع فرم» بزنید و سوال‌ها را مرحله‌به‌مرحله پاسخ دهید.", await menuFor(ctx.chat.id, settings));
});



bot.action("ADM_IG_ACCESS_TOKEN", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  adminStates.set(ctx.chat!.id, { action: "SET_IG_ACCESS_TOKEN" });
  await ctx.reply("Page Access Token را ارسال کن. برای حذف مقدار، OFF بفرست.");
});

bot.action("ADM_IG_ACCOUNT_ID", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  adminStates.set(ctx.chat!.id, { action: "SET_IG_ACCOUNT_ID" });
  await ctx.reply("Instagram Business/Professional Account ID را ارسال کن. اگر نمی‌دانی، بعداً خالی بگذار.");
});

bot.action("ADM_IG_VERIFY_TOKEN", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  adminStates.set(ctx.chat!.id, { action: "SET_IG_VERIFY_TOKEN" });
  await ctx.reply("Verify Token دلخواه برای Meta Webhook را ارسال کن. این مقدار باید دقیقاً همان چیزی باشد که در Meta وارد می‌کنی.");
});

bot.action("ADM_IG_LEADS", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  await ctx.reply("📥 لیدها / رویدادهای اینستاگرام\n\n" + instagramLeadsText(settings), adminMenu());
});

bot.action("ADM_IG_CONNECT_GUIDE", async (ctx) => {
  if (!(await isAdmin(ctx.chat?.id))) return;
  await ctx.answerCbQuery();
  const settings = await loadSettings();
  await ctx.reply(instagramGuideText(settings), instagramAdminInline());
});

async function handleAdminText(ctx: any, text: string) {
  const state = adminStates.get(ctx.chat.id);
  if (!state || !(await isAdmin(ctx.chat.id))) return false;
  const settings = await loadSettings();

  if (state.action === "ADD_ITEM") {
    settings.items.push(parseItemLine(text));
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("آیتم اضافه شد ✅\n\n" + itemListText(settings), itemsInline(settings));
    return true;
  }

  if (state.action === "EDIT_ITEM") {
    if (!settings.items[state.index]) {
      adminStates.delete(ctx.chat.id);
      await ctx.reply("این آیتم پیدا نشد.", adminMenu());
      return true;
    }
    settings.items[state.index] = parseItemLine(text);
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("آیتم ویرایش شد ✅\n\n" + itemListText(settings), itemsInline(settings));
    return true;
  }

  if (state.action === "EDIT_FIELD") {
    settings[state.field] = text;
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("ذخیره شد ✅", adminMenu());
    return true;
  }

  if (state.action === "EDIT_FORM_QUESTIONS") {
    settings.formQuestions = text.split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean).slice(0, 30);
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("سوال‌های فرم ذخیره شد ✅", adminMenu());
    return true;
  }

  if (state.action === "SET_MEDIA_CATEGORIES") {
    settings.mediaCategories = text.split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean).slice(0, 80);
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("دسته‌بندی‌ها ذخیره شد ✅\n" + settings.mediaCategories.join("\n"), adminMenu());
    return true;
  }

  if (state.action === "SET_FORCE_JOIN") {
    if (/^(off|خاموش|0)$/i.test(text.trim())) {
      settings.forceJoinEnabled = false;
      settings.forceJoinChannel = "";
    } else {
      settings.forceJoinEnabled = true;
      settings.forceJoinChannel = text.trim();
    }
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("تنظیم قفل عضویت ذخیره شد ✅\nوضعیت: " + (settings.forceJoinEnabled ? "فعال " + settings.forceJoinChannel : "خاموش"), adminMenu());
    return true;
  }

  if (state.action === "SET_AUTO_DELETE") {
    settings.autoDeleteSeconds = /^(off|خاموش)$/i.test(text.trim()) ? 0 : Math.max(0, Number(text.replace(/[^0-9]/g, "")) || 0);
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("حذف خودکار ذخیره شد ✅\nوضعیت: " + (settings.autoDeleteSeconds ? settings.autoDeleteSeconds + " ثانیه" : "خاموش"), adminMenu());
    return true;
  }


  if (state.action === "SET_IG_PROFILE") {
    const parts = text.split("|").map((x: string) => x.trim());
    settings.instagram.username = parts[0] || text.trim();
    settings.instagram.pageType = parts[1] || settings.instagram.pageType;
    settings.instagram.metaConnection = parts[2] || settings.instagram.metaConnection;
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("تنظیمات پیج اینستاگرام ذخیره شد ✅", adminMenu());
    return true;
  }

  if (state.action === "SET_IG_ACCESS_TOKEN") {
    settings.instagram.pageAccessToken = /^(off|خاموش|0)$/i.test(text.trim()) ? "" : text.trim();
    settings.instagram.metaConnection = settings.instagram.pageAccessToken ? "Page Access Token ثبت شده؛ Webhook را در Meta فعال کن." : "توکن حذف شد";
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("Page Access Token ذخیره شد ✅", instagramAdminInline());
    return true;
  }

  if (state.action === "SET_IG_ACCOUNT_ID") {
    settings.instagram.instagramAccountId = text.trim();
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("Instagram Account ID ذخیره شد ✅", instagramAdminInline());
    return true;
  }

  if (state.action === "SET_IG_VERIFY_TOKEN") {
    settings.instagram.webhookVerifyToken = text.trim() || settings.instagram.webhookVerifyToken;
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("Verify Token ذخیره شد ✅\n" + instagramGuideText(settings), instagramAdminInline());
    return true;
  }

  if (state.action === "SET_IG_DM_KEYWORDS") {
    settings.instagram.dmKeywords = text.split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean).slice(0, 80);
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("کلمات کلیدی دایرکت ذخیره شد ✅", adminMenu());
    return true;
  }

  if (state.action === "SET_IG_COMMENT_KEYWORDS") {
    settings.instagram.commentKeywords = text.split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean).slice(0, 80);
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("کلمات کلیدی کامنت ذخیره شد ✅", adminMenu());
    return true;
  }

  if (state.action === "SET_IG_LEAD_QUESTIONS") {
    settings.instagram.leadQuestions = text.split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean).slice(0, 30);
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("سوال‌های لید ذخیره شد ✅", adminMenu());
    return true;
  }

  if (state.action === "SET_IG_BOOKING_SERVICES") {
    settings.instagram.bookingServices = text.split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean).slice(0, 50);
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("خدمات رزرو اینستاگرام ذخیره شد ✅", adminMenu());
    return true;
  }

  if (state.action === "SET_IG_NOTES") {
    settings.instagram.notes = text.trim();
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("توضیحات اینستاگرام ذخیره شد ✅", adminMenu());
    return true;
  }

  if (state.action === "SET_RESERVATION_SERVICES" || state.action === "SET_COURSE_ITEMS" || state.action === "SET_VIP_PLANS") {
    settings.items = text.split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean).slice(0, 80).map(parseItemLine);
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    const label = state.action === "SET_RESERVATION_SERVICES" ? "خدمات رزرو" : state.action === "SET_COURSE_ITEMS" ? "دوره‌ها/محتواها" : "پلن‌های VIP";
    await ctx.reply(label + " ذخیره شد ✅\n\n" + itemListText(settings), adminMenu());
    return true;
  }

  if (state.action === "SET_QUIZ_QUESTIONS") {
    settings.formQuestions = text.split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean).slice(0, 60);
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("سوال‌های آزمون/نظرسنجی ذخیره شد ✅", adminMenu());
    return true;
  }

  if (state.action === "SET_SUPPORT_TOPICS") {
    settings.supportTopics = text.split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean).slice(0, 30);
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("موضوعات تیکت ذخیره شد ✅\n" + settings.supportTopics.join("\n"), adminMenu());
    return true;
  }

  if (state.action === "SET_QUICK_REPLIES") {
    settings.quickReplies = text.split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean).slice(0, 20);
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("پاسخ‌های آماده ذخیره شد ✅", adminMenu());
    return true;
  }

  if (state.action === "REPLY_SUPPORT_TICKET") {
    const ticket = settings.supportTickets.find((t) => t.id === state.ticketId);
    if (!ticket) {
      adminStates.delete(ctx.chat.id);
      await ctx.reply("تیکت پیدا نشد.", adminMenu());
      return true;
    }
    ticket.adminReply = text;
    ticket.status = "ANSWERED";
    ticket.updatedAt = new Date().toISOString();
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    try { await ctx.telegram.sendMessage(ticket.chatId, "پاسخ تیکت #" + ticket.id + " ✅\n\n" + text); } catch {}
    await ctx.reply("پاسخ ارسال شد ✅", supportAdminTicketsInline(settings));
    return true;
  }

  if (state.action === "SET_CARD") {
    const parts = text.split("|").map((x: string) => x.trim());
    settings.payment.cardNumber = parts[0] || text.trim();
    settings.payment.cardHolder = parts[1] || "";
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("اطلاعات کارت ذخیره شد ✅", adminMenu());
    return true;
  }

  if (state.action === "SET_PAYMENT_LINK") {
    settings.payment.paymentLink = text.trim();
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("لینک پرداخت ذخیره شد ✅", adminMenu());
    return true;
  }

  if (state.action === "SET_ZARINPAL") {
    const parts = text.split("|").map((x: string) => x.trim()).filter(Boolean);
    settings.payment.zarinpalMerchantId = parts[0] || text.trim();
    if (parts.some((p: string) => /sandbox|test|تست/i.test(p))) settings.payment.zarinpalSandbox = true;
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("مرچنت زرین‌پال ذخیره شد ✅\nCallback خودکار فعال است.\nحالت فعلی: " + (settings.payment.zarinpalSandbox ? "تست/Sandbox" : "واقعی/Production"), adminMenu());
    return true;
  }

  if (state.action === "ADD_ADMIN") {
    const id = Number(text.replace(/[^0-9]/g, ""));
    if (!id) {
      await ctx.reply("آیدی عددی درست نیست. دوباره بفرست.");
      return true;
    }
    if (!settings.admins.includes(id)) settings.admins.push(id);
    await saveSettings(settings);
    adminStates.delete(ctx.chat.id);
    await ctx.reply("ادمین اضافه شد ✅", adminMenu());
    return true;
  }

  if (state.action === "BROADCAST") {
    let sent = 0;
    for (const id of knownUsers) {
      try { await ctx.telegram.sendMessage(id, text); sent++; } catch {}
    }
    adminStates.delete(ctx.chat.id);
    await ctx.reply("پیام ارسال شد ✅\nتعداد ارسال: " + sent, adminMenu());
    return true;
  }

  return false;
}

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  knownUsers.add(ctx.chat.id);
  if (await handleAdminText(ctx, text)) return;
  if (text.startsWith("/")) return;

  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);
  const settings = await loadSettings();
  if (!session) {
    await ctx.reply("از منوی پایین یک گزینه را انتخاب کنید.", (await isAdmin(chatId)) ? adminMenu() : await menuFor(ctx.chat.id, settings));
    return;
  }


  if (session.mode === "reservation") {
    session.answers.push(text);
    session.step += 1;
    if (session.step === 1) {
      sessions.set(chatId, session);
      await ctx.reply("نام و شماره تماس خود را بفرست تا رزرو ثبت شود.");
      return;
    }
    const booking: ReservationBooking = {
      id: Date.now().toString(36).toUpperCase(),
      chatId,
      username: ctx.from?.username,
      service: session.meta?.item || "خدمت",
      requestedTime: session.answers[0] || "-",
      contact: session.answers[1] || "-",
      status: "NEW",
      createdAt: new Date().toISOString()
    };
    settings.reservations.push(booking);
    await saveSettings(settings);
    sessions.delete(chatId);
    await notifyAdmin("درخواست رزرو جدید 📅", ctx, "کد رزرو: #" + booking.id + "\nخدمت: " + booking.service + "\nزمان پیشنهادی: " + booking.requestedTime + "\nتماس: " + booking.contact);
    await ctx.reply("درخواست رزرو ثبت شد ✅\nکد رزرو: #" + booking.id + "\nمدیر به‌زودی بررسی می‌کند.", await menuFor(ctx.chat.id, settings));
    return;
  }

  if (session.mode === "quiz") {
    const questions = settings.formQuestions.length ? settings.formQuestions : ["نام و نام خانوادگی", "شماره تماس", "نظر شما"];
    session.answers.push(text);
    session.step += 1;
    if (session.step >= questions.length) {
      const responseId = String(Date.now()).slice(-8);
      const response: FormResponse = {
        id: responseId,
        chatId,
        username: ctx.from?.username ? "@" + ctx.from.username : undefined,
        questions,
        answers: [...session.answers],
        status: "NEW",
        createdAt: new Date().toISOString()
      };
      settings.quizResponses.push(response);
      await saveSettings(settings);
      sessions.delete(chatId);
      await notifyAdmin("پاسخ آزمون/نظرسنجی جدید 📝", ctx, formResponseFullText(response));
      await ctx.reply("پاسخ شما ثبت شد ✅\nکد پیگیری: #" + responseId, await menuFor(ctx.chat.id, settings));
      return;
    }
    sessions.set(chatId, session);
    await ctx.reply(questions[session.step]);
    return;
  }

  if (session.mode === "reservation") {
    session.answers.push(text);
    session.step += 1;
    if (session.step === 1) {
      sessions.set(chatId, session);
      await ctx.reply("نام و شماره تماس خود را بفرست تا رزرو ثبت شود.");
      return;
    }
    const booking: ReservationBooking = {
      id: Date.now().toString(36).toUpperCase(),
      chatId,
      username: ctx.from?.username,
      service: session.meta?.item || "خدمت",
      requestedTime: session.answers[0] || "-",
      contact: session.answers[1] || "-",
      status: "NEW",
      createdAt: new Date().toISOString()
    };
    settings.reservations.push(booking);
    await saveSettings(settings);
    sessions.delete(chatId);
    await notifyAdmin("درخواست رزرو جدید 📅", ctx, "کد رزرو: #" + booking.id + "\\nخدمت: " + booking.service + "\\nزمان پیشنهادی: " + booking.requestedTime + "\\nتماس: " + booking.contact);
    await ctx.reply("درخواست رزرو ثبت شد ✅\\nکد رزرو: #" + booking.id + "\\nمدیر به‌زودی بررسی می‌کند.", await menuFor(ctx.chat.id, settings));
    return;
  }

  if (session.mode === "quiz") {
    const questions = settings.formQuestions.length ? settings.formQuestions : ["نام و نام خانوادگی", "شماره تماس", "نظر شما"];
    session.answers.push(text);
    session.step += 1;
    if (session.step >= questions.length) {
      const responseId = String(Date.now()).slice(-8);
      const response: FormResponse = {
        id: responseId,
        chatId,
        username: ctx.from?.username ? "@" + ctx.from.username : undefined,
        questions,
        answers: [...session.answers],
        status: "NEW",
        createdAt: new Date().toISOString()
      };
      settings.quizResponses.push(response);
      await saveSettings(settings);
      sessions.delete(chatId);
      await notifyAdmin("پاسخ آزمون/نظرسنجی جدید 📝", ctx, formResponseFullText(response));
      await ctx.reply("پاسخ شما ثبت شد ✅\\nکد پیگیری: #" + responseId, await menuFor(ctx.chat.id, settings));
      return;
    }
    sessions.set(chatId, session);
    await ctx.reply(questions[session.step]);
    return;
  }

  if (session.mode === "form") {
    const questions = settings.formQuestions.length ? settings.formQuestions : ["نام و نام خانوادگی", "شماره تماس", "توضیحات"];
    session.answers.push(text);
    session.step += 1;
    if (session.step >= questions.length) {
      await finishFormLike(ctx, session, "فرم جدید ثبت شد 📝", questions);
      return;
    }
    sessions.set(chatId, session);
    await ctx.reply(questions[session.step]);
    return;
  }

  if (session.mode === "shop" && session.meta?.action === "search") {
    const q = normalizeQuery(text);
    const entries = shopActiveEntries(settings).filter(({ item }) => {
      const hay = normalizeQuery([item.title, item.description, item.category].filter(Boolean).join(" "));
      return hay.includes(q);
    });
    sessions.delete(chatId);
    await ctx.reply(entries.length ? "نتیجه جستجو برای «" + text + "»:" : "محصولی برای «" + text + "» پیدا نشد.", shopProductInline(entries));
    return;
  }

  if (session.mode === "media" && session.meta?.action === "search") {
    const q = normalizeQuery(text);
    const items = settings.mediaItems.filter((m) => {
      const hay = normalizeQuery([m.title, m.caption, m.category, ...(m.tags || [])].filter(Boolean).join(" "));
      return m.active && hay.includes(q);
    }).slice(-30).reverse();
    sessions.delete(chatId);
    await ctx.reply(items.length ? "نتیجه جستجو برای «" + text + "»: " : "موردی برای «" + text + "» پیدا نشد.", mediaListInline(items));
    return;
  }

  if (session.mode === "media" && session.meta?.action === "request") {
    sessions.delete(chatId);
    await notifyAdmin("درخواست محتوای جدید 📩", ctx, text);
    await ctx.reply("درخواست شما برای مدیر ارسال شد ✅", await menuFor(ctx.chat.id, settings));
    return;
  }

  if (session.mode === "support") {
    const topic = session.meta?.topic || "سایر موارد";
    const ticket = createSupportTicket(settings, chatId, ctx.from?.username, topic, text);
    await saveSettings(settings);
    sessions.delete(chatId);
    await notifyAdmin("تیکت پشتیبانی جدید 🎫", ctx, supportTicketText(ticket));
    await ctx.reply("تیکت شما ثبت شد ✅\nکد پیگیری: #" + ticket.id + "\nاز بخش «📌 پیگیری تیکت» می‌توانید وضعیت و پاسخ مدیر را ببینید.", await menuFor(ctx.chat.id, settings));
    return;
  }

  const titles: Record<string, string> = {
    support: "تیکت پشتیبانی جدید 🎫",
    reservation: "درخواست رزرو جدید 📅",
    service: "سفارش خدمات جدید 📝",
    shop: "سفارش فروشگاهی جدید 🛍",
    course: "درخواست خرید دوره/فایل 🎓",
    media: "درخواست رسانه جدید 📂"
  };

  const selectedItem = session.meta?.item ? "آیتم انتخاب‌شده: " + session.meta.item + "\nقیمت: " + formatToman(parsePrice(session.meta.price || "")) + "\n\n" : "";
  sessions.delete(chatId);
  await notifyAdmin(titles[session.mode] || "پیام جدید", ctx, selectedItem + text);
  await ctx.reply("درخواست شما ثبت و برای مدیر ارسال شد ✅", await menuFor(ctx.chat.id, settings));
});

app.get("/payment/zarinpal/callback", async (req, res) => {
  const orderId = String(req.query.orderId || "");
  const authority = String(req.query.Authority || "");
  const statusQuery = String(req.query.Status || "");
  const settings = await loadSettings();
  const order = findOrder(settings, orderId, authority);

  function page(title: string, body: string) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send("<!doctype html><html lang='fa' dir='rtl'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>" + title + "</title><style>body{font-family:tahoma,sans-serif;background:#f6f7fb;padding:24px}.card{max-width:560px;margin:40px auto;background:white;border-radius:16px;padding:24px;box-shadow:0 8px 30px #0001;line-height:1.9}</style></head><body><div class='card'><h2>" + title + "</h2><p>" + body + "</p></div></body></html>");
  }

  if (!order) {
    page("پرداخت پیدا نشد", "سفارش پرداختی پیدا نشد. لطفاً با پشتیبانی تماس بگیرید.");
    return;
  }

  if (order.status === "PAID") {
    page("پرداخت قبلاً تایید شده", "این پرداخت قبلاً با موفقیت ثبت شده است. کد پیگیری: " + (order.refId || "-"));
    return;
  }

  if (statusQuery !== "OK") {
    order.status = statusQuery === "NOK" ? "CANCELED" : "FAILED";
    await saveSettings(settings);
    try { await bot.telegram.sendMessage(order.chatId, "پرداخت ناموفق یا لغو شد ❌\nسفارش: " + order.title); } catch {}
    page("پرداخت ناموفق", "پرداخت ناموفق بود یا توسط شما لغو شد.");
    return;
  }

  try {
    const result = await zarinpalVerify(settings, order, authority);
    order.status = "PAID";
    order.authority = authority;
    order.refId = result.refId;
    order.paidAt = new Date().toISOString();
    await saveSettings(settings);
    try { await bot.telegram.sendMessage(order.chatId, "پرداخت شما با موفقیت ثبت شد ✅\nسفارش: " + order.title + "\nمبلغ: " + formatToman(order.amount) + "\nکد پیگیری: " + (order.refId || "-")); } catch {}
    for (const id of settings.admins) {
      try { await bot.telegram.sendMessage(id, "پرداخت آنلاین موفق ✅\nسفارش: " + order.title + "\nکاربر: " + (order.username ? "@" + order.username : order.chatId) + "\nمبلغ: " + formatToman(order.amount) + "\nکد پیگیری: " + (order.refId || "-")); } catch {}
    }
    page("پرداخت موفق", "پرداخت شما با موفقیت تایید شد. کد پیگیری: " + (order.refId || "-"));
  } catch (error) {
    order.status = "FAILED";
    await saveSettings(settings);
    page("خطا در تایید پرداخت", error instanceof Error ? error.message : String(error));
  }
});


app.get("/instagram/webhook", async (req, res) => {
  const settings = await loadSettings();
  const mode = String(req.query["hub.mode"] || "");
  const tokenQuery = String(req.query["hub.verify_token"] || "");
  const challenge = String(req.query["hub.challenge"] || "");
  if (mode === "subscribe" && tokenQuery === settings.instagram.webhookVerifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

app.post("/instagram/webhook", async (req: any, res) => {
  if (!verifyMetaSignature(req)) {
    res.sendStatus(403);
    return;
  }
  res.sendStatus(200);
  try {
    const settings = await loadSettings();
    const body = req.body || {};
    const entries = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
      for (const event of messaging) {
        const senderId = String(event?.sender?.id || "");
        const text = String(event?.message?.text || event?.postback?.title || "").trim();
        if (!senderId || !text) continue;
        const match = findInstagramReply(text, settings.instagram.dmKeywords, settings.instagram.dmWelcome);
        const lead: InstagramLead = { id: String(Date.now()) + "_dm", source: "DM", externalUserId: senderId, text, matchedKeyword: match.matchedKeyword, status: "NEW", createdAt: new Date().toISOString(), raw: event };
        try {
          if (settings.instagram.pageAccessToken) {
            await sendInstagramDm(settings, senderId, match.reply);
            lead.status = "REPLIED";
          }
        } catch (error) {
          lead.status = "FAILED";
          lead.raw = { event, replyError: error instanceof Error ? error.message : String(error) };
        }
        await recordInstagramLead(settings, lead);
        await notifyInstagramAdmins(settings, "📩 دایرکت جدید اینستاگرام\n\nکاربر خارجی: " + senderId + "\nمتن:\n" + text + "\n\nپاسخ: " + lead.status);
      }

      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const field = String(change?.field || "");
        const commentId = String(value.id || value.comment_id || "");
        const fromId = String(value.from?.id || value.user?.id || "");
        const text = String(value.text || value.message || "").trim();
        if (!text || !(field.includes("comment") || commentId)) continue;
        const match = findInstagramReply(text, settings.instagram.commentKeywords, "سلام، پیام شما دریافت شد. لطفاً برای پیگیری دایرکت بدهید.");
        const lead: InstagramLead = { id: String(Date.now()) + "_comment", source: "COMMENT", externalUserId: fromId, text, matchedKeyword: match.matchedKeyword, status: "NEW", createdAt: new Date().toISOString(), raw: change };
        try {
          if (settings.instagram.pageAccessToken && commentId && match.matchedKeyword) {
            await sendInstagramPrivateReply(settings, commentId, match.reply);
            lead.status = "REPLIED";
          }
        } catch (error) {
          lead.status = "FAILED";
          lead.raw = { change, replyError: error instanceof Error ? error.message : String(error) };
        }
        await recordInstagramLead(settings, lead);
        await notifyInstagramAdmins(settings, "💬 کامنت جدید اینستاگرام\n\nمتن:\n" + text + "\n\nپاسخ: " + lead.status);
      }
    }
  } catch (error) {
    console.error("instagram webhook error", error);
  }
});

app.get("/health", (_req, res) => res.status(200).send("ok"));
app.get("/", async (_req, res) => {
  if (IS_INSTAGRAM_TEMPLATE) {
    const settings = await loadSettings();
    res.type("html").send(instagramSetupGuideHtml(settings));
    return;
  }
  res.json(status);
});

app.get("/instagram/setup", async (_req, res) => {
  const settings = await loadSettings();
  res.type("html").send(instagramSetupGuideHtml(settings));
});

app.get("/instagram/guide", async (_req, res) => {
  const settings = await loadSettings();
  res.type("text/plain").send(instagramGuideText(settings));
});

const port = Number(process.env.PORT || 10000);
app.listen(port, "0.0.0.0", async () => {
  console.log("Listening on " + port);
  try {
    if (!baseUrl) throw new Error("BASE_URL is missing");
    await loadSettings();

    if (token) {
      const path = "/webhook/" + token.split(":")[0];
      app.post(path, async (req, res) => {
        try {
          await bot.handleUpdate(req.body);
          res.sendStatus(200);
        } catch (error) {
          console.error(error);
          res.sendStatus(200);
        }
      });
      await bot.telegram.setWebhook(baseUrl + path, { drop_pending_updates: true });
    } else if (!IS_INSTAGRAM_TEMPLATE) {
      throw new Error("CUSTOMER_BOT_TOKEN is missing");
    } else {
      console.log("Instagram template started without Telegram customer token. Instagram webhook is available.");
    }

    status.ready = true;
    status.error = null;
    console.log("Customer bot ready");
  } catch (error) {
    status.ready = false;
    status.error = error instanceof Error ? error.message : String(error);
    console.error(error);
  }
});
