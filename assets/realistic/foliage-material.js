// 원본 소나무 twig JPG는 검은 여백을 갖지만 alphaMode가 없다.
// 잎 카드의 검은 여백을 마스크로 잘라낸다. 불투명 줄기에는 적용하지 않는다.
export function twigCutout(material, name = material.name) {
  if (!name?.endsWith('_twig')) return material;
  material.alphaTest = .4;
  material.transparent = false;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
      float needleMask = smoothstep(.006, .025, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));
      diffuseColor.a *= needleMask;
      #include <alphatest_fragment>
      // 좁은 바늘잎이 축소될 때 검은 매트로 합쳐지지 않도록 잎 색의
      // 저조도 바닥을 둔다. 줄기·바위·장면 노출에는 적용하지 않는다.
      diffuseColor.rgb = max(diffuseColor.rgb, vec3(.08, .16, .04));
    `);
  };
  material.customProgramCacheKey = () => 'pine-twig-black-cutout-v2';
  return material;
}
