// Post-processing: bloom, then a grade pass (local lighting, vignette, grain, fades).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export const MAX_LIGHTS = 10;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1.6 },
    uDark: { value: 0.5 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uFade: { value: 0 },
    uFadeCol: { value: new THREE.Vector3(0, 0, 0) },
    uHurt: { value: 0 },
    uLow: { value: 0 },
    uLights: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
    uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(1, 1, 1)) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uAspect, uDark, uFade, uHurt, uLow;
    uniform vec3 uTint, uFadeCol; uniform vec4 uLights[${MAX_LIGHTS}]; uniform vec3 uLightCol[${MAX_LIGHTS}];
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 ca = d * r2 * 0.011;
      vec3 col = vec3(texture2D(tDiffuse, vUv + ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ca).b);
      // local light pools
      float L = 0.0; vec3 warm = vec3(0.0);
      for (int i = 0; i < ${MAX_LIGHTS}; i++) {
        vec4 l = uLights[i];
        if (l.w <= 0.0) continue;
        vec2 pd = (vUv - l.xy) * vec2(uAspect, 1.0);
        float f = 1.0 - smoothstep(0.0, l.z, length(pd));
        f = f * f * l.w;
        L += f; warm += uLightCol[i] * f;
      }
      L = clamp(L, 0.0, 1.0);
      col *= mix(uDark, 1.12, L);
      col += col * warm * 0.35;
      // grade
      col = mix(col, col * uTint, 0.5);
      col = pow(max(col, 0.0), vec3(0.94));
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, 1.08);
      // vignette
      float v = smoothstep(0.28, 0.95, length(d * vec2(1.0, 1.2)));
      col *= 1.0 - v * 0.62;
      // low-health pulse and hurt flash
      float edge = smoothstep(0.25, 0.8, length(d));
      col = mix(col, vec3(lum) * vec3(0.9, 0.25, 0.2), edge * clamp(uHurt + uLow * (0.35 + 0.25 * sin(uTime * 4.0)), 0.0, 1.0));
      col *= 1.0 - uHurt * 0.25;
      col += (hash(vUv * vec2(1733.0, 977.0) + fract(uTime) * 61.0) - 0.5) * 0.014;
      col = mix(col, uFadeCol, uFade);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.7, 0.62);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return { composer, bloom, grade, u: grade.uniforms };
}
