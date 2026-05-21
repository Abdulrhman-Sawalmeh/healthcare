import { createContext, PropsWithChildren, useContext, useEffect, useMemo } from "react";

type Language = "ar";

interface LanguageContextValue {
  language: Language;
  direction: "rtl";
  t: (arabic: string, english: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language: "ar",
      direction: "rtl",
      t: (arabic) => arabic
    }),
    []
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
