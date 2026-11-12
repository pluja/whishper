import type { IconName } from "#lib/components/icon-names.ts";

export type AdminSection = {
  href: string;
  label: string;
  icon: IconName;
};

export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/admin/models", label: "Models", icon: "cube" },
  { href: "/admin/transcription", label: "Transcription", icon: "sliders" },
  { href: "/admin/storage", label: "Storage", icon: "hard-drive" },
  { href: "/admin/workers", label: "Workers", icon: "server" },
];
