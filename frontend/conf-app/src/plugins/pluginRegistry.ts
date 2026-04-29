export type PluginName = "csvImport" | "notifications" | "auditLog";

export type PluginDefinition = {
  name: PluginName;
  label: string;
  description: string;
};

export const pluginRegistry: Record<PluginName, PluginDefinition> = {
  csvImport: {
    name: "csvImport",
    label: "CSV Import",
    description: "Allows users to upload, map, validate, and import CSV data.",
  },

  notifications: {
    name: "notifications",
    label: "Notifications",
    description: "Shows user-specific notifications for app actions.",
  },

  auditLog: {
    name: "auditLog",
    label: "Audit Log",
    description: "Tracks user actions such as create and bulk import.",
  },
};

export function isValidPlugin(pluginName: string): pluginName is PluginName {
  return pluginName in pluginRegistry;
}