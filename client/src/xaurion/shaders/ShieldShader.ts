import * as THREE from 'three';

export const ShieldVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const ShieldFragmentShader = `
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform vec3 uGlowColor;
  uniform float uShieldIntensity;
  uniform float uSteamTurbulence;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);
  }
  void main() {
    if (uShieldIntensity <= 0.01) discard;
    vec3 normal=normalize(vNormal); vec3 viewDir=normalize(vViewPosition);
    float fresnel=pow(1.0-max(dot(viewDir,normal),0.0),2.5);
    float steamNoise=(noise(vUv*6.0+vec2(uTime*.4,uTime*.2))+noise(vUv*10.0-vec2(uTime*.3,uTime*.5)))*.5;
    float pulse=sin(vWorldPosition.y*5.0-uTime*6.0)*.5+.5;
    float rings=sin(length(vWorldPosition.xz)*8.0-uTime*4.0)*.5+.5;
    vec2 gridUv=fract(vUv*16.0)-.5;
    float grid=step(.42,max(abs(gridUv.x),abs(gridUv.y)));
    vec3 color=mix(uBaseColor,uGlowColor,fresnel*1.5+steamNoise*.4);
    color+=uGlowColor*pulse*.3+vec3(.1,.8,.6)*rings*.25+vec3(.9,.7,.2)*grid*.2;
    float alpha=(fresnel*.85+steamNoise*.25+grid*.15+pulse*.1)*uShieldIntensity;
    gl_FragColor=vec4(color,clamp(alpha,0.0,.95));
  }
`;

export function createShieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: ShieldVertexShader,
    fragmentShader: ShieldFragmentShader,
    uniforms: {
      uTime: { value: 0.0 },
      uBaseColor: { value: new THREE.Color(0x00e5ff) },
      uGlowColor: { value: new THREE.Color(0x10b981) },
      uShieldIntensity: { value: 0.0 },
      uSteamTurbulence: { value: 1.0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
