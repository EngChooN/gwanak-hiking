class r{constructor(t,a,e){this.scene=t,this.landscape=a,this.camera=e,t.add(a.group)}get loaded(){return new Map(this.landscape.collisionObjects().map((t,a)=>[a,{mesh:t}]))}update(t,a=2){this.landscape.update(this.camera,a)}}export{r as TerrainStream};
//# sourceMappingURL=terrain-B4TVoQx0.js.map
