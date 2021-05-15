/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ImageState } from "../state";
import { BaseElement } from "./base";

export class ImageElement extends BaseElement<ImageState> {
  private src: string;
  private mimeType: string;

  events = {
    load: ({ update }) => {
      update({ isDataLoaded: true });
    },
    error: ({ event, update }) => {
      update({ errors: event.error });
    },
  };

  createHTMLElement() {
    const element = document.createElement("img");
    element.className = "p51-image";
    element.setAttribute("loading", "lazy");
    return element;
  }

  renderSelf({ config: { src, mimeType } }) {
    this.element.setAttribute("src", src);
    this.element.setAttribute("type", mimeType);
    return this.element;
  }
}
