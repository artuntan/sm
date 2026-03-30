import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, locales, type Locale } from "./config";

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get("locale")?.value;
  const locale: Locale = locales.includes(raw as Locale)
    ? (raw as Locale)
    : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
