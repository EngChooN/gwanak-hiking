// 실제 DEM 지형 로더의 앱 어댑터. 합성 띠·원뿔 나무·다면체 바위를 생성하지 않는다.
export class TerrainStream{
 constructor(scene,landscape,camera){this.scene=scene;this.landscape=landscape;this.camera=camera;scene.add(landscape.group);}
 get loaded(){return new Map(this.landscape.collisionObjects().map((mesh,i)=>[i,{mesh}]));}
 async update(){this.landscape.update(this.camera);}
}
