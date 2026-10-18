import { matchesSearch } from "$lib/components/ui/picker";

export type Language = {
  code: string;
  name: string;
  nativeName: string;
  // A flag-icons 4x3 file name, or null when no country fits the language.
  flag: string | null;
  common: boolean;
};

export const DETECT_LANGUAGE = "auto";
export const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

type LanguageRow = [
  code: string,
  name: string,
  nativeName: string,
  flag: string | null,
];

// Whisper's codes, not always ISO 639-1: Javanese is "jw".
const COMMON_ROWS: LanguageRow[] = [
  ["en", "English", "English", "gb"],
  ["es", "Spanish", "Español", "es"],
  ["fr", "French", "Français", "fr"],
  ["de", "German", "Deutsch", "de"],
  ["it", "Italian", "Italiano", "it"],
  ["pt", "Portuguese", "Português", "pt"],
  ["nl", "Dutch", "Nederlands", "nl"],
  ["pl", "Polish", "Polski", "pl"],
  ["uk", "Ukrainian", "Українська", "ua"],
  ["el", "Greek", "Ελληνικά", "gr"],
  ["ar", "Arabic", "العربية", "sa"],
  ["hi", "Hindi", "हिन्दी", "in"],
  ["ja", "Japanese", "日本語", "jp"],
  ["ko", "Korean", "한국어", "kr"],
  ["zh", "Chinese", "中文", "cn"],
];

const OTHER_ROWS_A_TO_Z: LanguageRow[] = [
  ["af", "Afrikaans", "Afrikaans", "za"],
  ["sq", "Albanian", "Shqip", "al"],
  ["am", "Amharic", "አማርኛ", "et"],
  ["hy", "Armenian", "Հայերեն", "am"],
  ["as", "Assamese", "অসমীয়া", "in"],
  ["az", "Azerbaijani", "Azərbaycanca", "az"],
  ["ba", "Bashkir", "Башҡортса", "ru"],
  ["eu", "Basque", "Euskara", "es-pv"],
  ["be", "Belarusian", "Беларуская", "by"],
  ["bn", "Bengali", "বাংলা", "bd"],
  ["bs", "Bosnian", "Bosanski", "ba"],
  ["br", "Breton", "Brezhoneg", "fr"],
  ["bg", "Bulgarian", "Български", "bg"],
  ["my", "Burmese", "မြန်မာ", "mm"],
  ["yue", "Cantonese", "粵語", "hk"],
  ["ca", "Catalan", "Català", "es-ct"],
  ["hr", "Croatian", "Hrvatski", "hr"],
  ["cs", "Czech", "Čeština", "cz"],
  ["da", "Danish", "Dansk", "dk"],
  ["et", "Estonian", "Eesti", "ee"],
  ["fo", "Faroese", "Føroyskt", "fo"],
  ["fi", "Finnish", "Suomi", "fi"],
  ["gl", "Galician", "Galego", "es-ga"],
  ["ka", "Georgian", "ქართული", "ge"],
  ["gu", "Gujarati", "ગુજરાતી", "in"],
  ["ht", "Haitian Creole", "Kreyòl ayisyen", "ht"],
  ["ha", "Hausa", "Hausa", "ng"],
  ["haw", "Hawaiian", "ʻŌlelo Hawaiʻi", "us"],
  ["he", "Hebrew", "עברית", "il"],
  ["hu", "Hungarian", "Magyar", "hu"],
  ["is", "Icelandic", "Íslenska", "is"],
  ["id", "Indonesian", "Bahasa Indonesia", "id"],
  ["jw", "Javanese", "Basa Jawa", "id"],
  ["kn", "Kannada", "ಕನ್ನಡ", "in"],
  ["kk", "Kazakh", "Қазақ тілі", "kz"],
  ["km", "Khmer", "ខ្មែរ", "kh"],
  ["lo", "Lao", "ລາວ", "la"],
  ["la", "Latin", "Latina", null],
  ["lv", "Latvian", "Latviešu", "lv"],
  ["ln", "Lingala", "Lingála", "cd"],
  ["lt", "Lithuanian", "Lietuvių", "lt"],
  ["lb", "Luxembourgish", "Lëtzebuergesch", "lu"],
  ["mk", "Macedonian", "Македонски", "mk"],
  ["mg", "Malagasy", "Malagasy", "mg"],
  ["ms", "Malay", "Bahasa Melayu", "my"],
  ["ml", "Malayalam", "മലയാളം", "in"],
  ["mt", "Maltese", "Malti", "mt"],
  ["mi", "Maori", "Te reo Māori", "nz"],
  ["mr", "Marathi", "मराठी", "in"],
  ["mn", "Mongolian", "Монгол", "mn"],
  ["ne", "Nepali", "नेपाली", "np"],
  ["no", "Norwegian", "Norsk", "no"],
  ["nn", "Norwegian Nynorsk", "Nynorsk", "no"],
  ["oc", "Occitan", "Occitan", "fr"],
  ["ps", "Pashto", "پښتو", "af"],
  ["fa", "Persian", "فارسی", "ir"],
  ["pa", "Punjabi", "ਪੰਜਾਬੀ", "in"],
  ["ro", "Romanian", "Română", "ro"],
  ["ru", "Russian", "Русский", "ru"],
  ["sa", "Sanskrit", "संस्कृतम्", null],
  ["sr", "Serbian", "Српски", "rs"],
  ["sn", "Shona", "chiShona", "zw"],
  ["sd", "Sindhi", "سنڌي", "pk"],
  ["si", "Sinhala", "සිංහල", "lk"],
  ["sk", "Slovak", "Slovenčina", "sk"],
  ["sl", "Slovenian", "Slovenščina", "si"],
  ["so", "Somali", "Soomaali", "so"],
  ["su", "Sundanese", "Basa Sunda", "id"],
  ["sw", "Swahili", "Kiswahili", "tz"],
  ["sv", "Swedish", "Svenska", "se"],
  ["tl", "Tagalog", "Tagalog", "ph"],
  ["tg", "Tajik", "Тоҷикӣ", "tj"],
  ["ta", "Tamil", "தமிழ்", "in"],
  ["tt", "Tatar", "Татарча", "ru"],
  ["te", "Telugu", "తెలుగు", "in"],
  ["th", "Thai", "ไทย", "th"],
  ["bo", "Tibetan", "བོད་སྐད་", null],
  ["tr", "Turkish", "Türkçe", "tr"],
  ["tk", "Turkmen", "Türkmençe", "tm"],
  ["ur", "Urdu", "اردو", "pk"],
  ["uz", "Uzbek", "Oʻzbekcha", "uz"],
  ["vi", "Vietnamese", "Tiếng Việt", "vn"],
  ["cy", "Welsh", "Cymraeg", "gb-wls"],
  ["yi", "Yiddish", "ייִדיש", null],
  ["yo", "Yoruba", "Yorùbá", "ng"],
];

function toLanguages(rows: LanguageRow[], common: boolean): Language[] {
  return rows.map(([code, name, nativeName, flag]) => ({
    code,
    name,
    nativeName,
    flag,
    common,
  }));
}

export const LANGUAGES: Language[] = [
  ...toLanguages(COMMON_ROWS, true),
  ...toLanguages(OTHER_ROWS_A_TO_Z, false),
];

export function matchesLanguage(language: Language, query: string): boolean {
  return matchesSearch(query, [
    language.name,
    language.nativeName,
    language.code,
  ]);
}
