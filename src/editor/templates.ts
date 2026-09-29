import type { Template } from '../shared/schema';

/** The templates as the editor and the library name them, in the order the editor offers them.
    The browser specs find the toggle's buttons and the library's filter options by these labels. */
export const TEMPLATE_LABEL: Record<Template, string> = {
  activity: 'Activity',
  week: 'This week',
};

/** Own keys only, as isCanvasId: a stored preference may hold anything. */
export function isTemplate(value: unknown): value is Template {
  return typeof value === 'string' && Object.hasOwn(TEMPLATE_LABEL, value);
}
