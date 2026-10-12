import type { Page } from '@playwright/test';
import { expect } from '../browser';
import { newFlyerData } from '../../src/shared/defaults';
import { CANVASES, type CanvasId } from '../../src/shared/layout';
import type { FlyerData, FlyerPayload, FlyerText, Template } from '../../src/shared/schema';

/* A flyer drawn by the render page from a payload a spec hands it. The page takes any payload and never validates
   it, so a spec can draw copy the API would refuse: the drawing is proved whatever the limits are. */

/** A pill at its limits, in capitals, which are what staff type into it: a handle of 18 and a tag of 24. Together
    they are wider than the safe column on both canvases, so the letters shrink, and they fit. */
export const HANDLE_18 = '@NESTSHOSTELSADEJE';
export const TAG_24 = '¡COME JOIN US TONIGHT!!!';

/** A new flyer of a template that was never saved, with these lines of copy changed. */
export function newPayload(template: Template, text: Partial<FlyerText> = {}, change: (data: FlyerData) => void = () => {}): FlyerPayload {
  const data = newFlyerData(template);
  Object.assign(data.text, text);
  change(data);
  const stamp = '2026-10-12T00:00:00.000Z';
  return { flyer: { id: 1, hostel: null, template, title: 'Drawn', data, photoId: null, createdAt: stamp, updatedAt: stamp }, hostel: null, photo: null };
}

/** Draws the payload on a canvas, at the canvas's size, and waits for its fonts, its images and the fit. */
export async function drawPayload(page: Page, payload: FlyerPayload, canvas: CanvasId) {
  await page.setViewportSize({ width: CANVASES[canvas].width, height: CANVASES[canvas].height });
  await page.addInitScript((value) => ((window as unknown as { __FLYER_PAYLOAD: unknown }).__FLYER_PAYLOAD = value), payload);
  await page.goto(`/render.html?canvas=${canvas}`);
  await page.waitForFunction(() => {
    const w = window as unknown as { __FLYER_READY?: boolean; __FLYER_ERROR?: string };
    return w.__FLYER_READY || w.__FLYER_ERROR;
  });
  expect(await page.evaluate(() => (window as unknown as { __FLYER_ERROR?: string }).__FLYER_ERROR)).toBeUndefined();
}
