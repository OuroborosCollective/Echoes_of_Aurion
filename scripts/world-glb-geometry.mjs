import { createHash } from 'node:crypto';
import { Matrix4, Vector3, Quaternion, Box3 } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const meshoptReady = MeshoptDecoder.ready;
const sha=b=>createHash('sha256').update(b).digest('hex');

/** Hierarchy-aware, bounded measurement of the active glTF scene. */
export async function audit(bytes, ceiling, options={}){
 await meshoptReady;
 const {requireMeshopt=true,includeVertices=true,maxMeasuredVertices=2_000_000}=options;
 if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB');
 const jsonSize=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonSize)),bin=bytes.subarray(28+jsonSize);
 const views=new Map();
 const view=index=>{if(views.has(index))return views.get(index);const v=doc.bufferViews[index],e=v.extensions?.EXT_meshopt_compression;let out;
  if(e){out=new Uint8Array(e.count*e.byteStride);MeshoptDecoder.decodeGltfBuffer(out,e.count,e.byteStride,bin.subarray(e.byteOffset||0,(e.byteOffset||0)+e.byteLength),e.mode,e.filter);}
  else out=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
  views.set(index,out);return out;};
 const bounds=new Box3(),vertices=includeVertices?[]:undefined;let triangles=0,measuredVertices=0;
 const walk=(index,parent)=>{const n=doc.nodes[index],matrix=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation||[0,0,0])),new Quaternion(...(n.rotation||[0,0,0,1])),new Vector3(...(n.scale||[1,1,1])));matrix.premultiply(parent);
  for(const primitive of doc.meshes?.[n.mesh]?.primitives||[]){if((primitive.mode??4)!==4)throw Error('Only triangle meshes supported');const a=doc.accessors[primitive.attributes.POSITION];triangles+=(doc.accessors[primitive.indices]?.count??a.count)/3;
   if(!Number.isInteger(triangles)||triangles>ceiling)throw Error(`Triangle budget failed: ${triangles}/${ceiling}`);
   const data=view(a.bufferView),dv=new DataView(data.buffer,data.byteOffset,data.byteLength),component=a.componentType,bytesPer={5120:1,5121:1,5122:2,5123:2,5126:4}[component];if(!bytesPer)throw Error('Position component invalid');const stride=doc.bufferViews[a.bufferView].byteStride||bytesPer*3;
   const number=offset=>{let value=component===5120?dv.getInt8(offset):component===5121?dv.getUint8(offset):component===5122?dv.getInt16(offset,true):component===5123?dv.getUint16(offset,true):dv.getFloat32(offset,true);if(a.normalized)value=Math.max(component===5120||component===5122?-1:0,value/({5120:127,5121:255,5122:32767,5123:65535}[component]));if(!Number.isFinite(value))throw Error('Non-finite POSITION');return value;};
   for(let i=0;i<a.count;i++){if(++measuredVertices>maxMeasuredVertices)throw Error('Measured vertex budget exceeded');const offset=(a.byteOffset||0)+i*stride;const point=new Vector3(number(offset),number(offset+bytesPer),number(offset+2*bytesPer)).applyMatrix4(matrix);if(![point.x,point.y,point.z].every(Number.isFinite))throw Error('Non-finite transformed POSITION');bounds.expandByPoint(point);if(vertices)vertices.push(point.toArray());}}
  for(const child of n.children||[])walk(child,matrix);};
 for(const root of doc.scenes[doc.scene||0].nodes)walk(root,new Matrix4());
 if(!Number.isInteger(triangles)||triangles<1||triangles>ceiling||bounds.isEmpty())throw Error(`Asset budget/bounds failed: ${triangles}/${ceiling}`);
 if(requireMeshopt&&!(doc.extensionsUsed||[]).includes('EXT_meshopt_compression'))throw Error('Meshopt missing');
 return {vertices,textureHashes:(doc.images||[]).map(image=>sha(view(image.bufferView))),triangles,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},lights:doc.extensions?.KHR_lights_punctual?.lights?.length||0};
}
