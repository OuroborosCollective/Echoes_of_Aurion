import * as THREE from 'three';

export const GroundFlowVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const GroundFlowFragmentShader = `
  uniform float uTime;
  uniform float uScrollZ;
  uniform vec3 uGridColor;
  uniform vec3 uGroundColor;
  uniform vec3 uRuneGlowColor;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
  void main() {
    vec2 worldXZ = vWorldPosition.xz;
    worldXZ.y += uScrollZ;
    vec2 grid1 = abs(fract(worldXZ * 0.5 - 0.5) - 0.5) / fwidth(worldXZ * 0.5);
    float line1 = 1.0 - min(min(grid1.x, grid1.y), 1.0);
    vec2 grid2 = abs(fract(worldXZ * 0.1 - 0.5) - 0.5) / fwidth(worldXZ * 0.1);
    float line2 = 1.0 - min(min(grid2.x, grid2.y), 1.0);
    float flowWave = pow(sin(worldXZ.x * 0.3 + worldXZ.y * 0.4 - uTime * 2.0) * 0.5 + 0.5, 4.0);
    vec2 tileFrac = fract(worldXZ * 0.25) - 0.5;
    float runeCircle = smoothstep(0.04, 0.0, abs(length(tileFrac) - 0.35));
    float depthFade = 1.0 - smoothstep(15.0, 42.0, length(vWorldPosition.xyz));
    vec3 col = uGroundColor;
    col += uGridColor * (line1 * 0.35 + line2 * 0.7);
    col += uRuneGlowColor * (flowWave * 0.6 + runeCircle * 0.8);
    col *= (0.8 + 0.2 * sin(uTime + worldXZ.x));
    gl_FragColor = vec4(col, depthFade);
  }
`;

export function createGroundFlowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: GroundFlowVertexShader,
    fragmentShader: GroundFlowFragmentShader,
    uniforms: {
      uTime: { value: 0.0 }, uScrollZ: { value: 0.0 },
      uGroundColor: { value: new THREE.Color(0x0f172a) },
      uGridColor: { value: new THREE.Color(0x1e3a8a) },
      uRuneGlowColor: { value: new THREE.Color(0x06b6d4) },
    },
    transparent: true,
    depthWrite: true,
  });
}
