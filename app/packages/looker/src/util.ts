/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { mergeWith } from "immutable";

import { MIN_PIXELS, SCALE_FACTOR } from "./constants";
import {
  BaseState,
  BoundingBox,
  BufferRange,
  Buffers,
  Coordinates,
  Dimensions,
  Optional,
} from "./state";

import LookerWorker from "./worker.ts?worker&inline";

/**
 * Shallow data-object comparison for equality
 */
export function compareData(a: object, b: object): boolean {
  for (const p in a) {
    if (a.hasOwnProperty(p) !== b.hasOwnProperty(p)) {
      return false;
    } else if (a[p] != b[p]) {
      return false;
    }
  }
  for (const p in b) {
    if (!(p in a)) {
      return false;
    }
  }
  return true;
}

/**
 * Scales a number from one range to another.
 */
export function rescale(
  n: number,
  oldMin: number,
  oldMax: number,
  newMin: number,
  newMax: number
) {
  const normalized = (n - oldMin) / (oldMax - oldMin);
  return normalized * (newMax - newMin) + newMin;
}

/**
 * Checks whether a point is contained in a rectangle.
 */
export function inRect(
  x: number,
  y: number,
  [rx, ry, rw, rh]: BoundingBox
): boolean {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

/**
 * Calculates the distance between two points.
 */
export function distance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
}

/**
 * Calculates the dot product of two 2D vectors.
 */
export function dot2d(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

/**
 * Projects a point onto a line defined by two other points.
 */
export function project2d(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): [number, number] {
  // line vector - this is relative to (0, 0), so coordinates of p need to be
  // transformed accordingly
  const vx = bx - ax;
  const vy = by - ay;
  const projMagnitude = dot2d(px - ax, py - ay, vx, vy) / dot2d(vx, vy, vx, vy);
  const projX = projMagnitude * vx + ax;
  const projY = projMagnitude * vy + ay;
  return [projX, projY];
}

/**
 * Calculates the distance from a point to a line segment defined by two other
 * points.
 */
export function distanceFromLineSegment(
  [px, py]: Coordinates,
  [ax, ay]: Coordinates,
  [bx, by]: Coordinates
): number {
  const segmentLength = distance(ax, ay, bx, by);
  const [projX, projY] = project2d(px, py, ax, ay, bx, by);
  if (
    distance(ax, ay, projX, projY) < segmentLength &&
    distance(bx, by, projX, projY) < segmentLength
  ) {
    // The projected point is between the two endpoints, so it is on the segment
    // - return the distance from the projected point.
    return distance(px, py, projX, projY);
  } else {
    // The projected point lies outside the segment, so return the distance from
    // the closest endpoint.
    return Math.min(distance(px, py, ax, ay), distance(px, py, bx, by));
  }
}

interface Node {
  childNodes: Node[];
}

/**
 * Recursively map a function to all nodes in a tree
 */
export function recursiveMap(node: Node, fn: (node: Node) => void) {
  node.childNodes.forEach((n) => recursiveMap(n, fn));
  fn(node);
}

/**
 * Get the Bbox dimensions for an array of text and their rendering sizes
 */
export function computeBBoxForTextOverlay(
  context: CanvasRenderingContext2D,
  text: string[],
  textHeight: number,
  padding: number
): {
  width: number;
  height: number;
} {
  const lines = getArrayByLine(text);
  const width = getMaxWidthByLine(context, lines, padding);
  const height = getMaxHeightForText(lines, textHeight, padding);
  return { width, height };
}

/**
 * Get the max height for an array of text lines
 */
export function getMaxHeightForText(
  lines: string[],
  textHeight: number,
  padding: number
): number {
  return lines.length * (textHeight + padding) + padding;
}

/**
 * Get the max width of an array of text lines
 */
export function getMaxWidthByLine(
  context: CanvasRenderingContext2D,
  lines: string[],
  padding: number
): number {
  let maxWidth = 0;
  for (const line of lines) {
    const lineWidth = context.measureText(line).width;
    if (lineWidth > maxWidth) {
      maxWidth = lineWidth;
    }
  }
  return maxWidth + 2 * padding;
}

/**
 * Get text as an array of lines
 */
function getArrayByLine(text: string[] | string): string[] {
  if (Array.isArray(text)) {
    return text;
  }
  return text.split("\n");
}

/**
 * Retrieve the array key corresponding to the smallest element in the array.
 */
export function argMin<T>(array: T[]): number {
  return array
    .map((x, i): [T, number] => [x, i])
    .reduce((r, a) => (a[0] < r[0] ? a : r))[1];
}

export interface Timeouts {
  [key: string]: ReturnType<typeof setTimeout>;
}

/**
 * Rescales coordinates
 */
export const rescaleCoordates = (
  [x, y]: [number, number],
  fromDim: [number, number],
  toDim: [number, number]
): [number, number] => {
  return [
    Math.round(rescale(x, 0, fromDim[0], 0, toDim[0])),
    Math.round(rescale(y, 0, fromDim[1], 0, toDim[1])),
  ];
};

export const ensureCanvasSize = (
  canvas: HTMLCanvasElement,
  dimensions: Dimensions
): void => {
  canvas.width = dimensions[0];
  canvas.height = dimensions[1];
};

/**
 * Get the smallest box that contains all points
 */
export const getContainingBox = (points: Coordinates[]): BoundingBox => {
  let tlx = Math.min(...points.map(([x]) => x));
  let tly = Math.min(...points.map(([_, y]) => y));
  let w = Math.max(...points.map(([x]) => x)) - tlx;
  let h = Math.max(...points.map(([_, y]) => y)) - tly;

  if (w === 0) {
    tlx -= 0.05;
    w = 0.1;
  }

  if (h === 0) {
    tly -= 0.05;
    h += 0.1;
  }

  return [tlx, tly, w, h];
};

export const getFitRect = (
  [mw, mh]: Dimensions,
  [tlx, tly, w, h]: BoundingBox
): BoundingBox => {
  if (mw / mh > w / h) {
    const fitHeight = (w * mh) / mw;
    tly += (h - fitHeight) / 2;
    h += fitHeight - h;
  } else {
    const fitWidth = (h * mw) / mh;
    tlx += (w - fitWidth) / 2;
    w += fitWidth - w;
  }

  return [tlx, tly, w, h];
};

/**
 * Rotates items in an array.
 */
export const rotate = (array: any[], rotation: number): [any[], number] => {
  rotation = Math.min(rotation, array.length - 1);
  return [[...array.slice(rotation), ...array.slice(0, rotation)], rotation];
};

export const getElementBBox = (
  element: HTMLElement | SVGElement
): BoundingBox => {
  const {
    top: tly,
    left: tlx,
    width: w,
    height: h,
  } = element.getBoundingClientRect();
  return [tlx, tly, w, h];
};

export const getRenderedScale = (
  [ww, wh]: Dimensions,
  [iw, ih]: Dimensions
): number => {
  const ar = iw / ih;
  if (ww / wh < ar) {
    return ww / iw;
  }

  return wh / ih;
};

export const snapBox = (
  scale: number,
  pan: Coordinates,
  [ww, wh]: Dimensions,
  [iw, ih]: Dimensions,
  pad = true
): Coordinates => {
  const sww = ww * scale;
  const swh = wh * scale;
  const ar = iw / ih;
  if (ww / wh < ar) {
    iw = sww * (pad ? 1.1 : 1);
    ih = iw / ar;
  } else {
    ih = swh * (pad ? 1.1 : 1);
    iw = ih * ar;
  }

  const tly = (swh - ih) / 2 - Math.max((wh - ih) / 2, 0);
  if (ih > wh) {
    if (pan[1] > -tly) {
      pan[1] = -tly;
    }

    const bry = -tly - ih;
    if (pan[1] - wh < bry) {
      pan[1] -= pan[1] - wh - bry;
    }
  } else {
    pan[1] = -tly;
  }

  const tlx = (sww - iw) / 2 - Math.max((ww - iw) / 2, 0);
  if (iw > ww) {
    if (pan[0] > -tlx) {
      pan[0] = -tlx;
    }

    const brx = -tlx - iw;
    if (pan[0] - ww < brx) {
      pan[0] -= pan[0] - ww - brx;
    }
  } else {
    pan[0] = -tlx;
  }

  return pan;
};

export const clampScale = (
  [ww, wh]: Dimensions,
  [iw, ih]: Dimensions,
  scale: number,
  pad: number
): number => {
  const renderedScale = getRenderedScale([ww, wh], [iw, ih]);

  if ((ww * ww) / (iw * renderedScale * scale) < MIN_PIXELS) {
    scale = (ww * ww) / (iw * renderedScale * MIN_PIXELS);
  }

  if ((wh * wh) / (ih * renderedScale * scale) < MIN_PIXELS) {
    scale = (wh * wh) / (ih * renderedScale * MIN_PIXELS);
  }

  return Math.max(scale, 1 - pad);
};

export const mergeUpdates = <State extends BaseState>(
  state: State,
  updates: Optional<State>
): State => {
  const merger = (o, n) => {
    if (Array.isArray(n)) {
      return n;
    }
    if (n instanceof Function) {
      return n;
    }
    if (typeof n !== "object") {
      return n === undefined ? o : n;
    }
    if (n === null) {
      return n;
    }
    return mergeWith(merger, o, n);
  };
  return mergeWith(merger, state, updates);
};

export const createWorker = (): Worker => {
  return new LookerWorker();
};

export const removeFromBuffers = (
  frameNumber: number,
  buffers: Buffers
): Buffers => {
  return buffers.reduce((acc, cur) => {
    if (cur[0] <= frameNumber && cur[1] >= frameNumber) {
      if (cur[0] === cur[1]) {
        return acc;
      }

      if (cur[0] === frameNumber) {
        return [...acc, [frameNumber + 1, cur[1]]];
      }

      if (cur[1] === frameNumber) {
        return [...acc, [cur[0], frameNumber - 1]];
      }

      return [...acc, [cur[0], frameNumber - 1], [frameNumber + 1, cur[1]]];
    }

    return [...acc, cur];
  }, []);
};

export const addToBuffers = (range: BufferRange, buffers: Buffers): Buffers => {
  buffers = [...buffers];
  buffers.push(range);

  buffers.sort((a, b) => {
    return a[0] - b[0];
  });

  let i = 0;

  while (i < buffers.length - 1) {
    var current = buffers[i],
      next = buffers[i + 1];

    if (current[1] >= next[0] - 1) {
      current[1] = Math.max(current[1], next[1]);
      buffers.splice(i + 1, 1);
    } else {
      i++;
    }
  }

  return buffers;
};
