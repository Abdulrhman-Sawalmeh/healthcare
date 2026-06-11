import { StyleSheet, Text } from "react-native";

export type IconName = string;

const symbolMap: Record<string, string> = {
  "add-circle-outline": "+",
  "attach-outline": "#",
  "call-outline": "☎",
  "arrow-forward-outline": "‹",
  "calendar-outline": "▣",
  "card-outline": "▤",
  "chatbubble-ellipses-outline": "✉",
  "chatbubble-outline": "✉",
  "checkmark-circle-outline": "✓",
  "chevron-down-outline": "⌄",
  "chevron-up-outline": "⌃",
  "clipboard-outline": "▦",
  "cloud-upload-outline": "⇧",
  "document-text-outline": "▤",
  "eye-off-outline": "◌",
  "eye-outline": "◉",
  "close-circle-outline": "x",
  "folder-open-outline": "▥",
  "git-branch-outline": "⤴",
  "grid-outline": "▦",
  "heart-outline": "♡",
  "home-outline": "⌂",
  "log-out-outline": "⇥",
  "medical": "+",
  "medical-outline": "+",
  "medkit-outline": "+",
  "mic-outline": "o",
  "notifications-outline": "!",
  "people-outline": "☷",
  "person-add-outline": "+",
  "person-circle-outline": "◉",
  "person-outline": "○",
  "pulse-outline": "⌁",
  "scan-outline": "⌗",
  "search-outline": "⌕",
  "send-outline": "›",
  "shield-checkmark-outline": "✓",
  "sparkles-outline": "*",
  "stop-circle-outline": "x",
  "sync-outline": "↻",
  "trash-outline": "×"
};

export function AppIcon({ name, size = 20, color = "#16312d" }: { name: IconName; size?: number; color?: string }) {
  return (
    <Text style={[styles.icon, { color, fontSize: size, lineHeight: size + 2 }]}>
      {symbolMap[name] ?? "•"}
    </Text>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontWeight: "900",
    textAlign: "center"
  }
});
