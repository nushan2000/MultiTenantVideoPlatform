import { classicGrid } from "./classic-grid";
import { darkCompact } from "./dark-compact";
import type { Template } from "./types";

const templates: Record<string, Template> = {
  [classicGrid.id]: classicGrid,
  [darkCompact.id]: darkCompact,
  // [myNewTemplate.id]: myNewTemplate,
};

export const DEFAULT_TEMPLATE = classicGrid.id;
export const listTemplates = () => Object.values(templates).map((t) => ({ id: t.id, name: t.name, description: t.description, defaults: t.defaults }));
export const getTemplate = (id: string): Template => templates[id] ?? templates[DEFAULT_TEMPLATE];
export const isTemplateId = (id: string) => id in templates;
