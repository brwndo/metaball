import { DEFAULT_STATE, MAX_RAMP_STOPS, type ControlState } from "../types";
import { createProgram, getUniformLocations } from "./createProgram";
import vertexSource from "../shaders/fullscreen.vert?raw";
import fragmentSource from "../shaders/metaball.frag?raw";

const UNIFORM_NAMES = [
  "u_resolution",
  "u_cols",
  "u_rows",
  "u_minRadius",
  "u_maxRadius",
  "u_threshold",
  "u_softness",
  "u_edge",
  "u_bgColor",
  "u_rampCount",
  "u_colorRange",
  "u_contourBands",
  "u_invert",
  "u_hasImage",
  "u_image",
] as const;

const RAMP_UNIFORM_NAMES = [
  "u_rampColors[0]",
  "u_rampColors[1]",
  "u_rampColors[2]",
  "u_rampColors[3]",
  "u_rampColors[4]",
] as const;

type UniformName = (typeof UNIFORM_NAMES)[number];

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const toHex = (channel: number) =>
    Math.round(channel * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms: Record<UniformName, WebGLUniformLocation | null>;
  private rampUniforms: (WebGLUniformLocation | null)[];
  private imageTexture: WebGLTexture;
  private placeholderTexture: WebGLTexture;
  private vao: WebGLVertexArrayObject;
  private state: ControlState;
  private previewWidth = 1;
  private previewHeight = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      preserveDrawingBuffer: true,
    });

    if (!gl) {
      throw new Error("WebGL2 is not supported in this browser");
    }

    this.gl = gl;
    this.program = createProgram(gl, vertexSource, fragmentSource);
    this.uniforms = getUniformLocations(gl, this.program, UNIFORM_NAMES);
    this.rampUniforms = RAMP_UNIFORM_NAMES.map((name) =>
      gl.getUniformLocation(this.program, name),
    );
    this.imageTexture = this.createTexture();
    this.placeholderTexture = this.createPlaceholderTexture();
    this.vao = gl.createVertexArray()!;
    this.state = structuredClone(DEFAULT_STATE);

    gl.bindVertexArray(this.vao);
    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms.u_image, 0);
  }

  private createTexture(): WebGLTexture {
    const { gl } = this;
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error("Failed to create texture");
    }
    return texture;
  }

  private createPlaceholderTexture(): WebGLTexture {
    const { gl } = this;
    const texture = this.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([128, 128, 128, 255]),
    );
    this.setTextureParams();
    return texture;
  }

  private setTextureParams(): void {
    const { gl } = this;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  setState(state: ControlState): void {
    this.state = state;
  }

  uploadImage(image: HTMLImageElement | ImageBitmap): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.setTextureParams();
  }

  resizePreview(width: number, height: number): void {
    if (width < 1 || height < 1) return;
    this.previewWidth = width;
    this.previewHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  render(): void {
    this.draw(this.previewWidth, this.previewHeight);
  }

  renderToSize(width: number, height: number): ImageData {
    const { gl } = this;
    const framebuffer = gl.createFramebuffer();
    const texture = gl.createTexture();

    if (!framebuffer || !texture) {
      throw new Error("Failed to create export framebuffer");
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw new Error("Export framebuffer is incomplete");
    }

    this.draw(width, height);

    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);

    gl.viewport(0, 0, this.previewWidth, this.previewHeight);
    this.render();

    flipPixelsY(pixels, width, height);
    return new ImageData(new Uint8ClampedArray(pixels.buffer), width, height);
  }

  private draw(width: number, height: number): void {
    const { gl, state, uniforms } = this;

    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(
      gl.TEXTURE_2D,
      state.hasImage ? this.imageTexture : this.placeholderTexture,
    );

    gl.uniform2f(uniforms.u_resolution, width, height);
    gl.uniform1i(uniforms.u_cols, state.cols);
    gl.uniform1i(uniforms.u_rows, state.rows);
    gl.uniform1f(uniforms.u_minRadius, state.minRadius);
    gl.uniform1f(uniforms.u_maxRadius, state.maxRadius);
    gl.uniform1f(uniforms.u_threshold, state.threshold);
    gl.uniform1f(uniforms.u_softness, state.softness);
    gl.uniform1f(uniforms.u_edge, state.edge);
    gl.uniform3fv(uniforms.u_bgColor, state.bgColor);
    gl.uniform1i(uniforms.u_rampCount, state.rampColors.length);
    gl.uniform1f(uniforms.u_colorRange, state.colorRange);
    gl.uniform1f(uniforms.u_contourBands, state.contourBands);
    gl.uniform1i(uniforms.u_invert, state.invert ? 1 : 0);
    gl.uniform1i(uniforms.u_hasImage, state.hasImage ? 1 : 0);

    for (let i = 0; i < MAX_RAMP_STOPS; i++) {
      const location = this.rampUniforms[i];
      if (!location) continue;
      const color = state.rampColors[i] ?? state.rampColors[state.rampColors.length - 1];
      gl.uniform3fv(location, color);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

function flipPixelsY(pixels: Uint8Array, width: number, height: number): void {
  const rowSize = width * 4;
  const temp = new Uint8Array(rowSize);

  for (let y = 0; y < Math.floor(height / 2); y++) {
    const top = y * rowSize;
    const bottom = (height - y - 1) * rowSize;
    temp.set(pixels.subarray(top, top + rowSize));
    pixels.copyWithin(top, bottom, bottom + rowSize);
    pixels.set(temp, bottom);
  }
}

export { hexToRgb };
