"""Repair static named clips in the owner-supplied 32-joint Aurion humanoid.

Geometry, textures, skin weights, sockets and the moving AttackCombo are retained.
The output is a new GLB version for the normal reviewed upload/assignment flow.
No source attachment is modified. Units remain authored units; runtime fits 2 m.
"""
import json
import hashlib
import math
import struct
from pathlib import Path

SOURCE = Path('test/fixtures/aurion-glb/aurion-player-standard.glb')
OUTPUT = Path('assets/characters/aurion-player-standard-animated.glb')


def multiply(a, b):
    x, y, z, w = a
    u, v, s, t = b
    return [w*u+x*t+y*s-z*v, w*v-x*s+y*t+z*u,
            w*s+x*v-y*u+z*t, w*t-x*u-y*v-z*s]


def axis_angle(axis, angle):
    return [*(n * math.sin(angle/2) for n in axis), math.cos(angle/2)]


def rotate(q, vector):
    return multiply(multiply(q, [*vector, 0]), [-q[0], -q[1], -q[2], q[3]])[:3]


def between(a, b):
    cross = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
    q = [*cross, 1 + sum(x*y for x, y in zip(a, b))]
    norm = math.sqrt(sum(x*x for x in q))
    if norm < 1e-8:
        return axis_angle([1, 0, 0], math.pi)
    return [x/norm for x in q]


def repair():
    raw = SOURCE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != '67669ddf21fe0bf68fe193eba00b35207ef28a4c49940061df9dad2b72cd90b8':
        raise ValueError('Source differs from the verified owner-supplied Aurion humanoid')
    size = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20+size])
    binary = bytearray(raw[28+size:28+size+gltf['buffers'][0]['byteLength']])
    nodes = gltf['nodes']
    by_name = {node.get('name'): index for index, node in enumerate(nodes)}
    required = ['Root', 'Hips', 'Spine', 'Chest', 'Head', 'UpperArm_L', 'UpperArm_R',
                'UpperLeg_L', 'UpperLeg_R', 'LowerLeg_L', 'LowerLeg_R']
    if any(name not in by_name for name in required):
        raise ValueError('This repair is only for the supplied Aurion humanoid rig')
    joints = gltf['skins'][0]['joints']
    parents = {child: index for index, node in enumerate(nodes) for child in node.get('children', [])}

    def world_rotation(index):
        local = nodes[index].get('rotation', [0, 0, 0, 1])
        return multiply(world_rotation(parents[index]), local) if index in parents else local

    lowered = {}
    for side, sign in [('L', 1), ('R', -1)]:
        index = by_name['UpperArm_' + side]
        parent = world_rotation(parents[index])
        world = world_rotation(index)
        direction = rotate(world, [0, 1, 0])
        target = [sign * .18, -math.sqrt(1-.18**2), 0]
        new_world = multiply(between(direction, target), world)
        lowered['UpperArm_' + side] = multiply([-parent[0], -parent[1], -parent[2], parent[3]], new_world)

    def accessor(rows, kind):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        flattened = [value for row in rows for value in row]
        binary.extend(struct.pack('<' + 'f'*len(flattened), *flattened))
        view = len(gltf['bufferViews'])
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(flattened)*4})
        result = {'bufferView': view, 'componentType': 5126, 'count': len(rows), 'type': kind}
        if kind == 'SCALAR':
            result.update(min=[min(flattened)], max=[max(flattened)])
        index = len(gltf['accessors'])
        gltf['accessors'].append(result)
        return index

    originals = {clip['name']: clip for clip in gltf['animations']}
    for name, duration in [('Idle', 2.4), ('Walk', 1.05), ('Run', .72), ('Fight', 1.8), ('Jump', 1.16), ('Death', 1.0)]:
        frames = 25
        times = accessor([[duration * frame/(frames-1)] for frame in range(frames)], 'SCALAR')
        clip = {'name': name, 'samplers': [], 'channels': [], 'extras': {'aurionRepair': 'humanoid-motion.v1', 'sourceClipWasStatic': True}}
        for index in joints:
            node = nodes[index]
            bone_name = node.get('name', '')
            translations, rotations, scales = [], [], []
            for frame in range(frames):
                t = frame/(frames-1)
                phase = 2*math.pi*t
                translation = list(node.get('translation', [0, 0, 0]))
                rotation = list(lowered.get(bone_name, node.get('rotation', [0, 0, 0, 1])))
                angle_x = angle_y = angle_z = 0.0
                if name in ['Idle', 'Fight']:
                    if bone_name == 'Chest': angle_x = .016 * math.sin(phase)
                    if bone_name == 'Head': angle_y = .022 * math.sin(phase)
                    if bone_name in lowered: angle_x = .014 * math.sin(phase) + (-.75 if name == 'Fight' else 0)
                elif name in ['Walk', 'Run']:
                    amplitude = .53 if name == 'Walk' else .8
                    for side, sign in [('L', 1), ('R', -1)]:
                        gait = sign * math.sin(phase)
                        if bone_name == 'UpperLeg_' + side: angle_x = amplitude * gait
                        if bone_name == 'LowerLeg_' + side: angle_x = max(0, -gait) * (.8 if name == 'Walk' else 1.15)
                        if bone_name == 'UpperArm_' + side: angle_x = -.55 * gait
                        if bone_name == 'Foot_' + side: angle_x = -.16 * gait
                    if bone_name == 'Chest': angle_y = .045 * math.sin(phase)
                elif name == 'Jump':
                    arc = math.sin(math.pi*t)
                    if bone_name == 'Root': translation[1] += .3 * arc
                    if bone_name.startswith('UpperLeg_'): angle_x = -.55 * arc
                    if bone_name.startswith('LowerLeg_'): angle_x = .9 * arc
                    if bone_name in lowered: angle_x = -.65 * arc
                elif name == 'Death':
                    eased = t*t*(3-2*t)
                    if bone_name == 'Root': angle_z = -math.pi/2 * eased
                    if bone_name in lowered: angle_x = -.2 * eased
                rotation = multiply(axis_angle([0, 0, 1], angle_z), multiply(axis_angle([0, 1, 0], angle_y), multiply(axis_angle([1, 0, 0], angle_x), rotation)))
                translations.append(translation); rotations.append(rotation); scales.append(node.get('scale', [1, 1, 1]))
            for path, rows, kind in [('translation', translations, 'VEC3'), ('rotation', rotations, 'VEC4'), ('scale', scales, 'VEC3')]:
                sampler = len(clip['samplers'])
                clip['samplers'].append({'input': times, 'output': accessor(rows, kind), 'interpolation': 'LINEAR'})
                clip['channels'].append({'sampler': sampler, 'target': {'node': index, 'path': path}})
        originals[name] = clip
    gltf['animations'] = list(originals.values())
    gltf['buffers'][0]['byteLength'] = len(binary)
    encoded = json.dumps(gltf, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    result = struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(binary))
    result += struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
    result += struct.pack('<II', len(binary), 0x004e4942) + binary
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(result)
    print(f'{OUTPUT}: {len(result)} bytes; six static clips repaired; AttackCombo retained')


if __name__ == '__main__':
    repair()
