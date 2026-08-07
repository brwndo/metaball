#version 300 es
precision highp float;

in vec2 v_uv;

uniform vec2 u_resolution;
uniform int u_cols;
uniform int u_rows;
uniform float u_minRadius;
uniform float u_maxRadius;
uniform float u_threshold;
uniform float u_softness;
uniform float u_edge;
uniform vec3 u_bgColor;
uniform int u_rampCount;
uniform vec3 u_rampColors[5];
uniform float u_colorRange;
uniform float u_contourBands;
uniform bool u_invert;
uniform bool u_hasImage;
uniform sampler2D u_image;

out vec4 fragColor;

float luminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

vec3 sampleRamp(float t, int count, vec3 colors[5]) {
  t = clamp(t, 0.0, 1.0);
  if (count <= 1) return colors[0];

  float scaled = t * float(count - 1);
  int i = int(floor(scaled));
  float f = fract(scaled);
  i = min(i, count - 2);
  return mix(colors[i], colors[i + 1], f);
}

void main() {
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 pixelPos = (v_uv - 0.5) * aspect;

  float field = 0.0;

  for (int row = 0; row < 80; row++) {
    if (row >= u_rows) break;

    for (int col = 0; col < 80; col++) {
      if (col >= u_cols) break;

      vec2 cellUv = vec2(
        (float(col) + 0.5) / float(u_cols),
        (float(row) + 0.5) / float(u_rows)
      );

      float radius;
      if (u_hasImage) {
        float lum = luminance(texture(u_image, cellUv).rgb);
        float t = u_invert ? lum : 1.0 - lum;
        radius = mix(u_minRadius, u_maxRadius, t);
      } else {
        radius = mix(u_minRadius, u_maxRadius, 0.5);
      }

      vec2 dotCenter = (cellUv - 0.5) * aspect;
      float dist = length(pixelPos - dotCenter);
      field += (radius * radius) / (dist * dist + u_softness);
    }
  }

  float alpha = smoothstep(
    u_threshold - u_edge,
    u_threshold + u_edge,
    field
  );

  float t = clamp((field - u_threshold) / u_colorRange, 0.0, 1.0);

  if (u_contourBands > 1.0) {
    t = floor(t * u_contourBands) / u_contourBands;
  }

  vec3 blobColor = sampleRamp(t, u_rampCount, u_rampColors);
  fragColor = vec4(mix(u_bgColor, blobColor, alpha), 1.0);
}
