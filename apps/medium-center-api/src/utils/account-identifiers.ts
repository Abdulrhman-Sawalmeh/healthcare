const arabicCenterSizeWords = [
  "الصغير",
  "الصغيرة",
  "صغير",
  "صغيرة",
  "المتوسط",
  "المتوسطة",
  "متوسط",
  "متوسطة"
];

export function removeArabicCenterSizeWords(centerName: string) {
  return arabicCenterSizeWords
    .reduce((name, word) => name.replace(new RegExp(`\\s*${word}\\s*`, "g"), " "), centerName)
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPersonUsername(fullName: string, serial: string | number) {
  const namePart = fullName
    .replace(/^(د\.?|dr\.?)\s*/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();

  return `${namePart || "user"}&${String(serial).padStart(3, "0")}`;
}

export function buildCenterEmailAddress(username: string, centerName: string) {
  const domainName = removeArabicCenterSizeWords(centerName)
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();

  return `${username}@${domainName || "medicalcenter"}.org`;
}
