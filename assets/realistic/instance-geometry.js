import * as THREE from 'three';

// KHR_mesh_quantization 속성을 정수 배열에 둔 채 변환하면 좌표가 넘쳐
// 상자/철망으로 접힌다. 정규화 값을 먼저 Float32로 복원한다.
export function instanceGeometry(source, matrix) {
  const geometry = source.clone();
  for (const name of ['position', 'normal', 'tangent']) {
    const attribute = source.getAttribute(name);
    if (!attribute) continue;
    const values = new Float32Array(attribute.count * attribute.itemSize);
    for (let i = 0; i < attribute.count; i++) {
      for (let j = 0; j < attribute.itemSize; j++) {
        values[i * attribute.itemSize + j] = attribute.getComponent(i, j);
      }
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
  }
  return geometry.applyMatrix4(matrix);
}
