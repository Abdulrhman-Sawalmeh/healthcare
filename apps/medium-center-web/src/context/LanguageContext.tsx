import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

type Language = "ar" | "en";

interface LanguageContextValue {
  language: Language;
  direction: "rtl" | "ltr";
  isEnglish: boolean;
  toggleLanguage: () => void;
  t: (arabic: string, english: string) => string;
}

const STORAGE_KEY = "healthcare.medium-center-web.language";
const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
const commonEnglishLabels = new Map<string, string>([
  ["دخول", "Sign in"],
  ["تسجيل الخروج", "Sign out"],
  ["تغيير اللغة", "Change language"],
  ["العربية", "Arabic"],
  ["English", "English"],
  ["الإشعارات", "Notifications"],
  ["المرضى", "Patients"],
  ["الزيارات", "Visits"],
  ["الإحالات", "Referrals"],
  ["التقارير", "Reports"],
  ["الأطباء", "Doctors"],
  ["حجز موعد", "Book appointment"],
  ["السجل الصحي", "Health record"],
  ["المحادثة الطبية", "Medical chat"],
  ["لوحة المتابعة", "Dashboard"],
  ["كلمة المرور", "Password"],
  ["اسم المستخدم", "Username"],
  ["اسم المستخدم أو رقم الهوية أو البريد الإلكتروني", "Username, ID number, or email"],
  ["توجيه الدخول", "Login routing"],
  ["تسجيل دخول موحد وآمن", "One secure sign-in"],
  ["تعبئة بيانات تجريبية", "Fill demo credentials"],
  ["تسجيل الدخول حسب النظام", "System sign-in"],
  ["افتح الواجهة الصحيحة", "Open the correct workspace"],
  ["جاري فتح الواجهة...", "Opening workspace..."],
  ["SECURE-CARD-TOKEN", "SECURE-CARD-TOKEN"],
  ["Subscription plan", "Subscription plan"],
  ["Secure payment token", "Secure payment token"],
  ["Activate subscription by secure payment", "Activate subscription by secure payment"],
  ["Activating...", "Activating..."],
  ["Return to dashboard", "Return to dashboard"],
  ["Loading referrals...", "Loading referrals..."],
  ["No referrals are registered for this center yet. New requests will appear here after submission or central processing.", "No referrals are registered for this center yet. New requests will appear here after submission or central processing."]
]);

function getInitialLanguage(): Language {
  return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ar";
}

function translateText(value: string, language: Language) {
  return language === "en" ? commonEnglishLabels.get(value) ?? value : value;
}

function localizeStaticText(language: Language) {
  document.querySelectorAll<HTMLElement>("body *").forEach((element) => {
    if (element.closest(".language-toggle")) {
      return;
    }

    if (["SCRIPT", "STYLE"].includes(element.tagName)) {
      return;
    }

    localizeAttributes(element, language);

    if (element.children.length > 0 || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)) {
      return;
    }

    const original = element.dataset.originalText ?? element.textContent?.trim();
    if (!original) {
      return;
    }

    const nextText = translateText(original, language);
    element.dataset.originalText = original;
    if (element.textContent !== nextText) {
      element.textContent = nextText;
    }
  });
}

function localizeAttributes(element: HTMLElement, language: Language) {
  for (const attribute of ["placeholder", "title", "aria-label"]) {
    const current = element.getAttribute(attribute);
    if (!current) {
      continue;
    }

    const key = `original${attribute}`;
    const original = element.dataset[key] ?? current;
    element.dataset[key] = original;
    const nextValue = translateText(original, language);
    if (current !== nextValue) {
      element.setAttribute(attribute, nextValue);
    }
  }
}

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const direction = language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    document.documentElement.dataset.language = language;
    document.body.dataset.language = language;
    window.setTimeout(() => localizeStaticText(language), 0);

    const observer = new MutationObserver(() => {
      window.setTimeout(() => localizeStaticText(language), 0);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [direction, language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      direction,
      isEnglish: language === "en",
      toggleLanguage: () => setLanguage((current) => (current === "ar" ? "en" : "ar")),
      t: (arabic, english) => (language === "ar" ? arabic : english)
    }),
    [direction, language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider.");
  }

  return context;
}
